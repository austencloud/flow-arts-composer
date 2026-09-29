<!--
  Profile redesign test variants for the Creators module.

  Design test only; the live profile at /creators/[id] (UserProfilePanel)
  is untouched. Three fully-styled directions for evaluation, switchable up top:
    A — Portfolio-first   (the work leads; identity overlays a featured piece)
    B — Flow identity      (who they are leads; canon prop elevated, then work)
    C — Living / active    (proof-of-activity leads; cadence + recency)

  Real components throughout — PropAwareThumbnail renders real sequence
  thumbnails from real public sequences (read over plain REST, hydrated the same
  way the live gallery does), RobustAvatar, SegmentedControl, the prop display
  registry. No emoji/HTML fakes (per visualization-routing + never-hand-roll).

  Profile identity fields are SAMPLE data for layout evaluation, not assertions
  of fact — see the banner. Only the public-sequence thumbnails are live.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PublicSequenceIndex } from "$lib/shared/foundation/domain/models/public-sequence-index";
  import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

  // ── Sample profile (layout evaluation only; not asserted facts) ──────────────
  const profile = {
    displayName: "Austen Cloud",
    username: "austencloud",
    pronouns: "he/they",
    bio: "Sample bio for layout — flow artist mapping every spin to a letter.",
    instagramUsername: "austencloud",
    sequenceCount: 475,
    collectionCount: 0, // intentionally 0 → show the "hide empty stat" principle
    followerCount: 128,
    followingCount: 73,
    favoriteProp: PropType.BUUGENG,
    propsISpinWith: [PropType.BUUGENG, PropType.STAFF] as PropType[],
    joinedYear: 2024,
    lastActive: "11 seconds ago",
    isActiveNow: true, // lastActiveAt within the live window
    newThisWeek: 3, // count of userSequences published in the last 7 days
    profileColor: "#5b8cff",
  };

  const favInfo = $derived(getPropTypeDisplayInfo(profile.favoriteProp));

  // Activity sparkline (sample cadence — last ~12 weeks of publishing)
  const activity = [1, 0, 2, 3, 1, 4, 2, 5, 3, 6, 4, 7];
  const activityMax = Math.max(...activity);

  // ── Gallery items: real sequence thumbnails from real public sequences ──────
  type GalleryItem = {
    id: string;
    word: string;
    level?: number;
    length?: number;
    starCount: number;
    sequence: SequenceData;
  };

  let items = $state<GalleryItem[]>([]);
  let loaded = $state(false);

  // Firestore REST value decoder (plain fetch — no Firebase SDK, see +page.ts).
  function fromFirestoreValue(v: Record<string, unknown>): unknown {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) {
      const arr = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
      return arr.map(fromFirestoreValue);
    }
    if ("mapValue" in v) {
      return decodeFields((v.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {});
    }
    return undefined;
  }
  function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
    return out;
  }

  onMount(() => {
    (async () => {
      try {
        const res = await fetch(
          "https://firestore.googleapis.com/v1/projects/the-kinetic-alphabet/databases/(default)/documents/publicSequences?pageSize=24"
        );
        if (!res.ok) return;
        const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[] };
        const docs = body.documents ?? [];
        const built: GalleryItem[] = [];

        for (const doc of docs) {
          if (!doc.fields) continue;
          const data = decodeFields(doc.fields) as unknown as PublicSequenceIndex;
          if (!data.leftSoloProp || !data.rightSoloProp || !data.stepPairings) continue;

          const id = doc.name.split("/").pop() ?? data.word ?? `seq-${built.length}`;
          const seq: SequenceData = {
            id,
            name: data.name,
            word: data.word,
            steps: [],
            thumbnails: [...(data.thumbnails ?? [])],
            sequenceLength: data.sequenceLength,
            level: data.level,
            isFavorite: false,
            isCircular: !!data.loopType,
            loopType: (data.loopType as LOOPType) ?? null,
            tags: [...(data.tags ?? [])],
            metadata: {},
            ownerId: data.ownerId,
            leftSoloProp: data.leftSoloProp,
            rightSoloProp: data.rightSoloProp,
            stepPairings: data.stepPairings,
            leftPathHash: data.leftPathHash,
            rightPathHash: data.rightPathHash,
            leftSoloHash: data.leftSoloHash,
            rightSoloHash: data.rightSoloHash,
          };

          const hydrated = hydrate(seq);
          if (!hydrated.steps?.length) continue;

          built.push({
            id,
            word: data.word ?? "Untitled",
            level: data.level,
            length: data.sequenceLength,
            starCount: typeof data.starCount === "number" ? data.starCount : 0,
            sequence: { ...hydrated, sequenceLength: hydrated.steps.length },
          });
          if (built.length >= 9) break;
        }

        items = built;
      } catch (e) {
        console.error("[ProfileRedesign] Failed to load public sequences:", e);
      } finally {
        loaded = true;
      }
    })();
  });

  // Dedupe the repeated cycle (e.g. "Ω-YΩXΩ-YΩXΩ-YΩX…" → "Ω-YΩX"), then truncate
  // anything still long. Same simplifier the thumbnail itself uses.
  function shortWord(word: string): string {
    const simplified = simplifyRepeatedWord(word);
    return simplified.length > 12 ? simplified.slice(0, 12) + "…" : simplified || "Untitled";
  }

  // ── Variant switching ────────────────────────────────────────────────────────
  type Variant = "A" | "B" | "C" | "D";
  let variant = $state<Variant>("D");
  const variantOptions = [
    { value: "D" as Variant, label: "D · Living identity" },
    { value: "C" as Variant, label: "C · Living" },
    { value: "B" as Variant, label: "B · Flow identity" },
    { value: "A" as Variant, label: "A · Portfolio" },
  ];

  const featured = $derived(items.slice(0, 3));
</script>

<!-- ════════════════════════ snippets ════════════════════════ -->

{#snippet tile(item: GalleryItem, big = false)}
  <div class="tile" class:big role="img" aria-label="Sequence {item.word}">
    <div class="tile-picto">
      <PropAwareThumbnail sequence={item.sequence} eager />
    </div>
    <div class="tile-meta">
      <span class="tile-word">{shortWord(item.word)}</span>
      {#if item.level}<span class="tile-sub">L{item.level}</span>{/if}
    </div>
    {#if item.starCount > 0}
      <div class="tile-star"><span>★</span>{item.starCount}</div>
    {/if}
  </div>
{/snippet}

{#snippet propChip(size: "lg" | "md" = "md")}
  <div class="prop-chip" class:lg={size === "lg"} title="Spins with {favInfo.label}">
    <img class="prop-chip-glyph" src={favInfo.image} alt="" aria-hidden="true" />
    <span class="prop-chip-label">{favInfo.label}</span>
    <span class="prop-chip-star" aria-label="Favorite prop">★</span>
    {#if profile.propsISpinWith.length > 1}
      <span class="prop-chip-also">
        +{profile.propsISpinWith.length - 1}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet stat(value: string | number, label: string, clickable = false)}
  <div class="stat" class:clickable>
    <span class="stat-value">{value}</span>
    <span class="stat-label">{label}</span>
  </div>
{/snippet}

{#snippet followBtn()}
  <button class="follow-btn">Follow</button>
{/snippet}

{#snippet gallery(heading: string)}
  <div class="section-head">{heading}</div>
  {#if !loaded}
    <div class="loading">Loading real sequences…</div>
  {:else}
    <div class="grid">
      {#each items as item (item.id)}
        {@render tile(item)}
      {/each}
    </div>
  {/if}
{/snippet}

<!-- ════════════════════════ Variant A — Portfolio-first ════════════════════════ -->
{#snippet variantA()}
  <div class="card variant-a" style:--accent={profile.profileColor}>
    {#if featured[0]}
      <div class="a-hero">
        <div class="a-hero-picto">
          <PropAwareThumbnail sequence={featured[0].sequence} eager />
        </div>
        <div class="a-hero-scrim"></div>
        <div class="a-hero-identity">
          <div class="a-avatar"><RobustAvatar name={profile.displayName} customSize={56} /></div>
          <div class="a-id-text">
            <div class="a-name">{profile.displayName} <span class="a-handle">@{profile.username}</span></div>
            <div class="a-sub">{favInfo.label} · {profile.sequenceCount} sequences</div>
          </div>
          {@render followBtn()}
        </div>
      </div>
    {/if}
    {@render gallery("All work")}
  </div>
{/snippet}

<!-- ════════════════════════ Variant B — Flow identity ════════════════════════ -->
{#snippet variantB()}
  <div class="card variant-b" style:--accent={profile.profileColor}>
    <div class="b-hero">
      <div class="b-ambient"></div>
      <div class="b-avatar"><RobustAvatar name={profile.displayName} customSize={120} /></div>
      <div class="b-info">
        <div class="b-name-row">
          <h1>{profile.displayName}</h1>
          <span class="b-handle">@{profile.username}</span>
          <span class="b-pronouns">{profile.pronouns}</span>
        </div>
        {@render propChip("lg")}
        <p class="b-bio">{profile.bio}</p>
        <a class="ig" href="https://instagram.com/{profile.instagramUsername}" target="_blank" rel="noreferrer">
          <i class="fab fa-instagram" aria-hidden="true"></i> @{profile.instagramUsername}
        </a>
        <div class="stats-row">
          {@render stat(profile.sequenceCount, "Sequences")}
          {@render stat(profile.followerCount, "Followers", true)}
          {@render stat(profile.followingCount, "Following", true)}
          <!-- collectionCount is 0 → intentionally omitted -->
        </div>
      </div>
      <div class="b-actions">{@render followBtn()}</div>
    </div>

    {#if featured.length}
      <div class="section-head">Featured</div>
      <div class="strip">
        {#each featured as item (item.id)}{@render tile(item)}{/each}
      </div>
    {/if}

    {@render gallery("All sequences")}
  </div>
{/snippet}

<!-- ════════════════════════ Variant C — Living / active ════════════════════════ -->
{#snippet variantC()}
  <div class="card variant-c" style:--accent={profile.profileColor}>
    <div class="c-hero">
      <div class="c-top">
        <div class="c-avatar"><RobustAvatar name={profile.displayName} customSize={72} /></div>
        <div class="c-id">
          <div class="c-name-row">
            <h1>{profile.displayName}</h1>
            <span class="c-handle">@{profile.username}</span>
          </div>
          <p class="c-bio">{profile.bio}</p>
        </div>
        <div class="c-actions">
          {@render propChip("md")}
          {@render followBtn()}
        </div>
      </div>

      <div class="c-activity">
        <div class="spark" aria-hidden="true">
          {#each activity as v}
            <span class="spark-bar" style:height="{Math.max(8, (v / activityMax) * 100)}%"></span>
          {/each}
        </div>
        <div class="c-meta">
          <span class="dot"></span> active {profile.lastActive}
          <span class="sep">·</span> {profile.sequenceCount} sequences
          <span class="sep">·</span> joined {profile.joinedYear}
          <span class="sep">·</span> {profile.followerCount} followers
        </div>
      </div>
    </div>

    {#if featured.length}
      <div class="section-head">Pinned</div>
      <div class="strip">
        {#each featured as item (item.id)}{@render tile(item)}{/each}
      </div>
    {/if}

    {@render gallery("Recent")}
  </div>
{/snippet}

<!-- ════════════ Variant D — Living identity (C spine + B prop chip & stats) ════════════ -->
{#snippet variantD()}
  <div class="card variant-d" style:--accent={profile.profileColor}>
    <div class="d-hero">
      <div class="d-ambient"></div>
      <div class="d-top">
        <div class="d-avatar"><RobustAvatar name={profile.displayName} customSize={88} /></div>
        <div class="d-id">
          <div class="d-name-row">
            <h1>{profile.displayName}</h1>
            <span class="d-handle">@{profile.username}</span>
            <span class="d-pronouns">{profile.pronouns}</span>
          </div>
          <p class="d-bio">{profile.bio}</p>
          <a class="ig" href="https://instagram.com/{profile.instagramUsername}" target="_blank" rel="noreferrer">
            <i class="fab fa-instagram" aria-hidden="true"></i> @{profile.instagramUsername}
          </a>
        </div>
        <div class="d-side">
          {@render propChip("lg")}
          {@render followBtn()}
        </div>
      </div>

      <div class="d-foot">
        <div class="d-statbar">
          {@render stat(profile.sequenceCount, "Sequences")}
          {@render stat(profile.followerCount, "Followers", true)}
          {@render stat(profile.followingCount, "Following", true)}
          <div class="d-live">
            <span class="presence" class:now={profile.isActiveNow}>
              <span class="pulse"></span>
              {profile.isActiveNow ? "Active now" : `active ${profile.lastActive}`}
            </span>
            <span class="d-fresh">
              {#if profile.newThisWeek > 0}{profile.newThisWeek} new this week · {/if}joined {profile.joinedYear}
            </span>
          </div>
        </div>
      </div>
    </div>

    {#if featured.length}
      <div class="section-head">Featured</div>
      <div class="strip">
        {#each featured as item (item.id)}{@render tile(item)}{/each}
      </div>
    {/if}

    {@render gallery("All sequences")}
  </div>
{/snippet}

<!-- ════════════════════════ page ════════════════════════ -->
<div class="page">
  <header class="toolbar">
    <div class="toolbar-title">
      Profile redesign · <span class="muted">creator profile</span>
    </div>
    <SegmentedControl options={variantOptions} value={variant} onchange={(v) => (variant = v)} color="accent" />
  </header>

  <p class="banner">
    Live components & real public-sequence thumbnails. Profile identity fields are sample data for layout evaluation.
  </p>

  <div class="stage">
    {#if variant === "A"}{@render variantA()}
    {:else if variant === "B"}{@render variantB()}
    {:else if variant === "C"}{@render variantC()}
    {:else}{@render variantD()}{/if}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: var(--theme-bg, #0b0e16);
    color: var(--theme-text, #fff);
    padding: 20px clamp(12px, 4vw, 48px) 80px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .toolbar-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
  }
  .muted { color: var(--theme-text-dim); font-weight: 500; }

  .banner {
    margin: 0 0 20px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .stage {
    display: flex;
    justify-content: center;
  }

  /* The card emulates the profile panel width */
  .card {
    width: 100%;
    max-width: 960px;
    container-type: inline-size;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 6px;
    scrollbar-width: thin;
  }
  .strip .tile { flex: 0 0 200px; }

  .tile {
    position: relative;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
  .tile:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    transform: translateY(-2px);
  }
  .tile-picto {
    width: 100%;
    /* PropAwareThumbnail computes its own aspect ratio per sequence; let it
       size itself rather than forcing a square/letterbox. */
    background: var(--theme-panel-bg, #11131f);
    container-type: inline-size;
  }
  .tile-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 7px 10px 9px;
  }
  .tile-word {
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile-sub {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }
  .tile-star {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
  }
  .tile-star span { color: #f59e0b; }

  .section-head {
    margin: 22px 0 12px;
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }
  .loading { color: var(--theme-text-dim); padding: 24px 0; font-size: var(--font-size-sm); }

  /* ── prop identity chip (elevated canon prop) ───────────── */
  .prop-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 6px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, rgba(0, 0, 0, 0.25));
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .prop-chip.lg { padding: 9px 16px; gap: 10px; }
  .prop-chip-glyph {
    width: 18px; height: 18px; object-fit: contain;
    filter: brightness(0) invert(1) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
  }
  .prop-chip.lg .prop-chip-glyph { width: 24px; height: 24px; }
  .prop-chip-label {
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .prop-chip.lg .prop-chip-label { font-size: var(--font-size-base); }
  .prop-chip-star { color: #f59e0b; font-size: 0.8em; }
  .prop-chip-also {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    padding-left: 2px;
    border-left: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    padding-inline-start: 8px;
  }

  .stats-row { display: flex; gap: 28px; margin-top: 4px; }
  .stat { display: flex; flex-direction: column; gap: 1px; }
  .stat-value { font-size: var(--font-size-lg); font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-label { font-size: var(--font-size-compact); color: var(--theme-text-dim); }
  .stat.clickable { padding: 4px 10px; border: 1px solid var(--theme-stroke); border-radius: 10px; background: var(--theme-card-bg); cursor: pointer; }

  .follow-btn {
    padding: 10px 28px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    border-radius: 8px;
    font-weight: 700;
    font-size: var(--font-size-sm);
    cursor: pointer;
    white-space: nowrap;
  }
  .follow-btn:hover { filter: brightness(1.1); }

  .a-hero {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .a-hero-picto {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: var(--theme-panel-bg, #11131f);
  }
  .a-hero-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.1) 45%, transparent 70%);
  }
  .a-hero-identity {
    position: absolute; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; gap: 14px;
    padding: 20px;
  }
  .a-avatar :global(.avatar-wrapper), .a-avatar { border-radius: 50%; }
  .a-id-text { flex: 1; min-width: 0; }
  .a-name { font-size: var(--font-size-xl); font-weight: 800; }
  .a-handle { font-size: var(--font-size-base); font-weight: 500; color: rgba(255,255,255,0.7); }
  .a-sub { font-size: var(--font-size-sm); color: rgba(255,255,255,0.8); margin-top: 2px; }

  .b-hero {
    position: relative;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: clamp(20px, 4cqi, 32px);
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .b-ambient {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: radial-gradient(circle 240px at 90px 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%);
  }
  .b-avatar, .b-info, .b-actions { position: relative; z-index: 1; }
  .b-avatar { flex-shrink: 0; }
  .b-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .b-name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .b-name-row h1 { margin: 0; font-size: var(--font-size-3xl); font-weight: 800; }
  .b-handle { color: var(--theme-text-dim); font-size: var(--font-size-base); }
  .b-pronouns { color: var(--theme-text-dim); font-size: var(--font-size-sm); font-style: italic; opacity: 0.7; }
  .b-bio { margin: 0; font-size: var(--font-size-sm); color: var(--theme-text-dim); line-height: 1.6; max-width: 440px; }
  .ig {
    display: inline-flex; align-items: center; gap: 6px; width: fit-content;
    padding: 5px 12px; border-radius: 20px; text-decoration: none;
    font-size: var(--font-size-sm); font-weight: 500; color: #e4405f;
    background: color-mix(in srgb, #e4405f 12%, transparent);
    border: 1px solid color-mix(in srgb, #e4405f 25%, transparent);
  }
  .b-actions { flex-shrink: 0; }

  @container (max-width: 640px) {
    .b-hero { flex-direction: column; text-align: center; }
    .b-name-row, .stats-row { justify-content: center; }
    .prop-chip { margin-inline: auto; }
    .b-bio { margin-inline: auto; }
    .ig { margin-inline: auto; }
  }

  .c-hero {
    padding: clamp(18px, 3.5cqi, 28px);
    border-radius: 16px;
    background: color-mix(in srgb, var(--accent) 6%, var(--theme-card-bg, rgba(255,255,255,0.03)));
    border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
    margin-bottom: 8px;
  }
  .c-top { display: flex; align-items: flex-start; gap: 16px; }
  .c-avatar { flex-shrink: 0; }
  .c-id { flex: 1; min-width: 0; }
  .c-name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .c-name-row h1 { margin: 0; font-size: var(--font-size-2xl); font-weight: 800; }
  .c-handle { color: var(--theme-text-dim); }
  .c-bio { margin: 4px 0 0; font-size: var(--font-size-sm); color: var(--theme-text-dim); }
  .c-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex-shrink: 0; }

  .c-activity { margin-top: 18px; }
  .spark {
    display: flex; align-items: flex-end; gap: 4px;
    height: 44px; margin-bottom: 8px;
  }
  .spark-bar {
    flex: 1;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(to top, color-mix(in srgb, var(--accent) 40%, transparent), var(--accent));
    min-height: 4px;
  }
  .c-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-size: var(--font-size-compact); color: var(--theme-text-dim);
  }
  .c-meta .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #22c55e; box-shadow: 0 0 8px #22c55e;
  }
  .c-meta .sep { opacity: 0.4; }

  @container (max-width: 640px) {
    .c-top { flex-direction: column; }
    .c-actions { flex-direction: row; align-items: center; align-self: stretch; justify-content: space-between; }
  }

  /* ── Variant D — Living identity (C's contained hero + B's prop chip & stats) ─ */
  .variant-d .d-hero {
    position: relative;
    overflow: hidden;
    padding: clamp(20px, 3.5cqi, 30px);
    border-radius: 16px;
    background: color-mix(in srgb, var(--accent) 6%, var(--theme-card-bg, rgba(255, 255, 255, 0.03)));
    border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
    margin-bottom: 8px;
  }
  .d-ambient {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: radial-gradient(circle 260px at 70px 40px, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%);
  }
  .d-top { position: relative; z-index: 1; display: flex; align-items: flex-start; gap: 18px; }
  .d-avatar { flex-shrink: 0; }
  .d-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .d-name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .d-name-row h1 { margin: 0; font-size: var(--font-size-2xl); font-weight: 800; }
  .d-handle { color: var(--theme-text-dim); }
  .d-pronouns { color: var(--theme-text-dim); font-size: var(--font-size-sm); font-style: italic; opacity: 0.7; }
  .d-bio { margin: 0; font-size: var(--font-size-sm); color: var(--theme-text-dim); line-height: 1.55; max-width: 460px; }
  .d-side { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex-shrink: 0; }

  .d-foot { position: relative; z-index: 1; margin-top: 20px; }
  .d-statbar { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }

  /* Live signal: presence pulse + real freshness facts (no abstract chart) */
  .d-live { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .presence {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: var(--font-size-sm); font-weight: 600;
    color: var(--theme-text-dim);
  }
  .presence.now { color: #22c55e; }
  .pulse {
    position: relative; width: 9px; height: 9px; border-radius: 50%;
    background: currentColor; flex-shrink: 0;
  }
  .presence.now .pulse::after {
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    background: #22c55e; animation: pulse-ring 2.2s ease-out infinite;
  }
  @keyframes pulse-ring {
    0% { transform: scale(1); opacity: 0.65; }
    100% { transform: scale(2.8); opacity: 0; }
  }
  .d-fresh { font-size: var(--font-size-compact); color: var(--theme-text-dim); }

  @container (max-width: 640px) {
    .d-top { flex-direction: column; align-items: stretch; }
    .d-side { flex-direction: row; align-items: center; justify-content: space-between; }
    .d-statbar { justify-content: space-between; gap: 16px; }
    .d-live { margin-left: 0; align-items: flex-start; width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .presence.now .pulse::after { animation: none; }
  }
</style>
