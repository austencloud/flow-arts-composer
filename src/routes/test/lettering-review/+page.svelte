<!--
  Lettering review: a dev-only page for checking skewed-frame letters by eye.

  Every skewed-frame beat in SkewedPictographDataframe.csv, drawn by the
  production PictographContainer from the same rows the app loads. The six
  letter pairs relettered on 2026-09-23 come first; each shows the relettered
  half beside its unchanged partner and a diamond beat with the same letter.
  Every other frame letter follows, one beat each until expanded. Tapping a
  tile flags it, and the flag bar copies the flagged beats as JSON so they can
  be pasted to Claude, or shows them as selected text where the browser blocks
  copying.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import { buildLetteringReview, type LetteringReview } from "./review-groups";

  interface TileEntry {
    readonly pictograph: PictographData;
    readonly label: string;
    readonly previous: string | null;
  }

  // Flags, the expand toggle and the scroll position are kept for this tab.
  // Another session merging into main hot-updates the app's root layout, which
  // remounts this page; without this, a half-finished review would be wiped
  // and scrolled back to the top.
  const SAVED_KEY = "lettering-review";
  const SCROLL_KEY = "lettering-review:scroll";

  function readSaved(): { flagged: string[]; showEveryOther: boolean } {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "null");
      return {
        flagged: Array.isArray(saved?.flagged)
          ? saved.flagged.filter((id: unknown): id is string => typeof id === "string")
          : [],
        showEveryOther: saved?.showEveryOther === true,
      };
    } catch {
      return { flagged: [], showEveryOther: false };
    }
  }

  const saved = readSaved();

  let review = $state.raw<LetteringReview | null>(null);
  let loadError = $state<string | null>(null);
  let flagged = $state<string[]>(saved.flagged);
  let drawn = $state<Record<string, boolean>>({});
  let showEveryOther = $state(saved.showEveryOther);
  let copied = $state(false);
  let copyText = $state<string | null>(null);
  let pageElement = $state<HTMLDivElement>();
  let copyBox = $state<HTMLTextAreaElement>();

  $effect(() => {
    const snapshot = JSON.stringify({ flagged, showEveryOther });
    try {
      sessionStorage.setItem(SAVED_KEY, snapshot);
    } catch {
      // Blocked storage only means flags last until the next remount.
    }
  });

  const tilesById = $derived.by(() => {
    const tiles = new Map<string, TileEntry>();
    if (!review) return tiles;
    for (const family of review.families) {
      if (family.reference) {
        tiles.set(`diamond-${family.letter}`, {
          pictograph: family.reference,
          label: `diamond ${family.letter}`,
          previous: null,
        });
      }
      for (const row of family.rows) {
        for (const item of row.items) {
          tiles.set(item.id, { pictograph: item.pictograph, label: row.label, previous: row.previous });
        }
      }
    }
    for (const section of review.others) {
      for (const row of section.rows) {
        for (const item of row.items) {
          tiles.set(item.id, { pictograph: item.pictograph, label: row.label, previous: null });
        }
      }
    }
    return tiles;
  });

  const checksPass = $derived(
    review !== null &&
      review.checks.retiredLetters.length === 0 &&
      review.checks.disagreements.length === 0 &&
      review.checks.unlabelled === 0
  );

  onMount(async () => {
    try {
      const [skewed, diamond] = await Promise.all([
        letterQueryHandler.getAllPictographVariations(GridMode.SKEWED),
        letterQueryHandler.getAllPictographVariations(GridMode.DIAMOND),
      ]);
      review = buildLetteringReview(skewed, diamond);
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      return;
    }
    await tick();
    try {
      const top = Number(sessionStorage.getItem(SCROLL_KEY));
      if (pageElement && top > 0) pageElement.scrollTop = top;
    } catch {
      // Nothing saved, so the review starts at the top.
    }
  });

  function rememberScroll() {
    if (!pageElement) return;
    try {
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(pageElement.scrollTop)));
    } catch {
      // Blocked storage only means a remount starts at the top.
    }
  }

  // Hundreds of pictographs are too many to draw at once, so a tile draws
  // when it scrolls near the screen and stays drawn after that.
  function drawWhenNear(node: HTMLElement, id: string) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          drawn[id] = true;
          observer.disconnect();
        }
      },
      { root: node.closest(".page"), rootMargin: "800px 0px" }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function toggleFlag(id: string) {
    flagged = flagged.includes(id) ? flagged.filter((f) => f !== id) : [...flagged, id];
    copied = false;
    copyText = null;
  }

  function clearFlags() {
    flagged = [];
    copied = false;
    copyText = null;
  }

  function describeHand(pictograph: PictographData, side: HandSide): string {
    const motion = pictograph.motions[side];
    if (!motion) return "none";
    return `${motion.motionType} ${motion.rotationDirection} ${motion.startLocation}>${motion.endLocation}`;
  }

  async function copyFlagged() {
    const report = {
      page: "/test/lettering-review",
      flagged: flagged.map((id) => {
        const entry = tilesById.get(id);
        if (!entry) return { id };
        const { pictograph, label, previous } = entry;
        return {
          id,
          label,
          previousLetter: previous,
          csvLetter: pictograph.letter,
          start: pictograph.startPlacement,
          end: pictograph.endPlacement,
          blue: describeHand(pictograph, HandSide.LEFT),
          red: describeHand(pictograph, HandSide.RIGHT),
        };
      }),
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      copyText = null;
    } catch {
      // The browser pane in the Claude app refuses clipboard writes, so the
      // details appear as selected text to copy by hand.
      copied = false;
      copyText = text;
      await tick();
      copyBox?.focus();
      copyBox?.select();
    }
  }
</script>

{#snippet tile(id: string, pictograph: PictographData, caption: string, gridMode: GridMode, reference: boolean)}
  <div
    class="tile"
    class:flagged={flagged.includes(id)}
    class:reference
    role="button"
    tabindex="0"
    title="{pictograph.startPlacement} to {pictograph.endPlacement}"
    aria-pressed={flagged.includes(id)}
    aria-label="{caption}. Press to flag it as wrong."
    onclick={() => toggleFlag(id)}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleFlag(id);
      }
    }}
  >
    <div class="picture" use:drawWhenNear={id}>
      {#if drawn[id]}
        <PictographContainer pictographData={pictograph} {gridMode} disableTransitions />
      {/if}
    </div>
    <span class="caption">{caption}</span>
  </div>
{/snippet}

<div class="page" bind:this={pageElement} onscroll={rememberScroll}>
  <header class="intro">
    <h1>Lettering review</h1>
    <p class="lede">
      Every skewed-frame beat, drawn by the app from its live data. Tap any
      pictograph that looks wrong, then copy the list at the bottom and paste
      it to Claude.
    </p>
    <p class="lede">
      Why letters changed: D E F and J K L need the hands to start or end
      exactly together or exactly opposite. In this frame the hands always
      start and end 45° or 135° apart, so those beats now take their letter
      from the moment inside the beat when the hands are opposite (M N O) or
      together (P Q R).
    </p>
    <ul class="legend">
      <li>
        <strong>M N O</strong> hands opposite (α) for a moment inside the beat; the two
        arrows sit on different sides
      </li>
      <li>
        <strong>P Q R</strong> hands together (β) for a moment inside the beat; the two
        arrows sit side by side
      </li>
      <li><strong>M P</strong> both pro · <strong>N Q</strong> both anti · <strong>O R</strong> one of each</li>
      <li><strong>1</strong> hands start 45° apart (η) · <strong>2</strong> start 135° apart (ζ)</li>
    </ul>
    {#if review}
      <p class="checks" class:pass={checksPass} class:fail={!checksPass}>
        {review.checks.frameRows} skewed-frame beats loaded · D E F J K L left in
        the frame: {review.checks.retiredLetters.length > 0
          ? review.checks.retiredLetters.join(" ")
          : "none"} · letters that disagree with the rule: {review.checks.disagreements.length}
        · beats with no letter: {review.checks.unlabelled} · relettered on
        2026-09-23: {review.checks.changedRows}
      </p>
      {#each review.checks.disagreements as disagreement (disagreement)}
        <p class="checks fail">{disagreement}</p>
      {/each}
    {/if}
  </header>

  {#if loadError}
    <p class="status fail">Could not load the pictograph data: {loadError}</p>
  {:else if !review}
    <p class="status">Loading the pictograph data...</p>
  {:else}
    <section>
      <h2>The six letter pairs</h2>
      {#each review.families as family (family.letter)}
        <div class="family">
          <div class="family-head">
            <span class="family-letter">{family.letter}</span>
            {#if family.reference}
              {@render tile(
                `diamond-${family.letter}`,
                family.reference,
                `diamond ${family.letter}`,
                GridMode.DIAMOND,
                true
              )}
            {/if}
          </div>
          <div class="family-rows">
            {#each family.rows as row (row.label)}
              <div class="row">
                <div class="row-head">
                  <span class="label">{row.label}</span>
                  {#if row.previous}
                    <span class="pill changed">was {row.previous}</span>
                  {:else}
                    <span class="pill same">unchanged</span>
                  {/if}
                  <span class="note">{row.note}</span>
                  <span class="count">{row.items.length} beats</span>
                </div>
                <div class="tiles">
                  {#each row.items as item (item.id)}
                    {@render tile(item.id, item.pictograph, item.id, GridMode.SKEWED, false)}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </section>

    <section>
      <div class="section-head">
        <h2>Every other skewed-frame letter (unchanged)</h2>
        <button type="button" class="action" onclick={() => (showEveryOther = !showEveryOther)}>
          {showEveryOther ? "Show one of each" : "Show every beat"}
        </button>
      </div>
      {#each review.others as section (section.title)}
        <h3>{section.title}</h3>
        {#if showEveryOther}
          {#each section.rows as row (row.label)}
            <div class="row">
              <div class="row-head">
                <span class="label">{row.label}</span>
                <span class="count">{row.items.length} beats</span>
              </div>
              <div class="tiles">
                {#each row.items as item (item.id)}
                  {@render tile(item.id, item.pictograph, item.id, GridMode.SKEWED, false)}
                {/each}
              </div>
            </div>
          {/each}
        {:else}
          <div class="tiles">
            {#each section.rows as row (row.label)}
              {#if row.items[0]}
                {@render tile(row.items[0].id, row.items[0].pictograph, row.label, GridMode.SKEWED, false)}
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
    </section>
  {/if}
</div>

<footer class="flag-bar" class:active={flagged.length > 0}>
  {#if flagged.length === 0}
    <span>Nothing flagged. If everything looks right, just say so.</span>
  {:else}
    <span class="flag-list">{flagged.length} flagged: {flagged.join(", ")}</span>
    <button type="button" class="action" onclick={copyFlagged}>
      {copied ? "Copied. Paste it to Claude" : "Copy for Claude"}
    </button>
    <button type="button" class="action quiet" onclick={clearFlags}>Clear</button>
    {#if copyText}
      <div class="copy-fallback">
        <p>
          This browser does not let the page copy. The details below are
          selected: press Ctrl+C and paste them to Claude, or just tell Claude
          the names above.
        </p>
        <textarea bind:this={copyBox} readonly rows="6" value={copyText}></textarea>
      </div>
    {/if}
  {/if}
</footer>

<style>
  .page {
    height: 100dvh;
    overflow-y: auto;
    padding: 24px 24px 96px;
    box-sizing: border-box;
    background: #0f1117;
    color: #e5e7eb;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 1.6rem;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1.15rem;
  }

  h3 {
    margin: 18px 0 8px;
    font-size: 0.95rem;
    color: #9ca3af;
  }

  .lede {
    margin: 0 0 12px;
    color: #9ca3af;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  .legend li {
    padding: 6px 10px;
    border: 1px solid #374151;
    border-radius: 8px;
    font-size: 0.85rem;
  }

  .checks {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }

  .pass {
    color: #22c55e;
  }

  .fail {
    color: #ef4444;
  }

  .status {
    margin-top: 24px;
  }

  section {
    margin-top: 28px;
  }

  .family {
    display: grid;
    grid-template-columns: 132px 1fr;
    gap: 16px;
    padding: 16px 0;
    border-top: 1px solid #374151;
  }

  .family-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .family-letter {
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1;
  }

  .family-rows {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .row + .row {
    margin-top: 10px;
  }

  .row-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }

  .label {
    min-width: 2.5em;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
  }

  .pill.changed {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  .pill.same {
    border: 1px solid #374151;
    color: #9ca3af;
  }

  .note {
    font-size: 0.85rem;
    color: #9ca3af;
  }

  .count {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 2px solid transparent;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
  }

  .tile:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .tile:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  .tile.flagged {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.14);
  }

  .tile.reference {
    width: 120px;
    border-style: dashed;
    border-color: #4b5563;
  }

  .tile.reference.flagged {
    border-color: #ef4444;
  }

  .picture {
    width: 100%;
    aspect-ratio: 1;
  }

  .caption {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #9ca3af;
  }

  .tile.flagged .caption {
    color: #ef4444;
    font-weight: 700;
  }

  .section-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .section-head h2 {
    margin: 0;
  }

  .action {
    padding: 6px 12px;
    border: 1px solid #4b5563;
    border-radius: 8px;
    background: #1f2937;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .action.quiet {
    background: transparent;
  }

  .flag-bar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 24px;
    border-top: 1px solid #374151;
    background: #111827;
    color: #e5e7eb;
    font-family: system-ui, sans-serif;
    font-size: 0.9rem;
  }

  .flag-bar.active {
    border-top-color: #ef4444;
  }

  .flag-list {
    flex: 1 1 240px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .copy-fallback {
    display: flex;
    flex: 1 1 100%;
    flex-direction: column;
    gap: 6px;
  }

  .copy-fallback p {
    margin: 0;
    color: #fbbf24;
  }

  .copy-fallback textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 8px;
    border: 1px solid #4b5563;
    border-radius: 8px;
    background: #0f1117;
    color: inherit;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    resize: vertical;
  }

  @media (max-width: 700px) {
    .page {
      padding: 16px 16px 132px;
    }

    .family {
      grid-template-columns: 1fr;
    }

    .family-head {
      flex-direction: row;
    }

    .tiles {
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    }

    .flag-bar {
      padding: 10px 16px;
    }
  }
</style>
