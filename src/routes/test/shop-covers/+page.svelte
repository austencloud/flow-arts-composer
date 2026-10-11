<!--
  /test/shop-covers — keen-eye surface (NOT shipped) for the shop deck cover
  treatment. Renders the REAL ChoreoCard (portrait 5:7, printed/light, word +
  info column) in a fan / stack. Auto-picks 6 sufficiently-different loops per
  deck; you can swap. Each tile also carries the color-coded LOOP icon(s) for
  its flavor. Switch style, tweak, copy the selection back to Claude.
-->
<script lang="ts">
  import { COVER_CANDIDATES } from "./candidates";
  import ChoreoCard from "#lib/features/choreo-card/components/ChoreoCard.svelte";
  import { LOOP_COMPONENT_MAP } from "#lib/shared/browse/domain/constants/loop-constants.js";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

  type Style = "fan" | "stack" | "smallfan";
  let style = $state<Style>("fan");

  const decks = Object.entries(COVER_CANDIDATES);

  // deckId -> ordered LOOP components (composites show every operation).
  const DECK_COMPONENTS: Record<string, LOOPComponent[]> = {
    "l1-quartered-rotated-8beat-c54": [LOOPComponent.ROTATED],
    "l1-halved-inverted-8beat-c54": [LOOPComponent.INVERTED],
    "l1-halved-swapped-8beat-c54": [LOOPComponent.SWAPPED],
    "l1-halved-mirrored-8beat-c54": [LOOPComponent.MIRRORED],
    "l1-halved-mirrored-inverted-8beat-c54": [LOOPComponent.MIRRORED, LOOPComponent.INVERTED],
    "l1-halved-mirrored-swapped-8beat-c54": [LOOPComponent.MIRRORED, LOOPComponent.SWAPPED],
    "l1-halved-mirrored-swapped-inverted-8beat-c54": [
      LOOPComponent.MIRRORED,
      LOOPComponent.SWAPPED,
      LOOPComponent.INVERTED,
    ],
  };
  const loopInfos = (deckId: string) =>
    (DECK_COMPONENTS[deckId] ?? [])
      .map((c) => LOOP_COMPONENT_MAP.get(c))
      .filter(Boolean) as { icon: string; color: string; shortLabel: string }[];

  // Per-deck kept ids — seeded with the auto-picked distinct 6.
  let selected = $state<Record<string, string[]>>(
    Object.fromEntries(decks.map(([id, d]) => [id, [...d.defaultPick]])),
  );
  function toggle(deckId: string, id: string) {
    const cur = selected[deckId] ?? [];
    selected[deckId] = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }
  const isSel = (deckId: string, id: string) => (selected[deckId] ?? []).includes(id);
  function chosen(deckId: string) {
    const pool = COVER_CANDIDATES[deckId]?.sequences ?? [];
    return (selected[deckId] ?? [])
      .map((id) => pool.find((s) => s.id === id))
      .filter(Boolean) as any[];
  }

  // Cards shown scales with tile width — "3-6 depending on component size".
  function countFor(w: number) {
    if (w < 340) return 3;
    if (w < 430) return 4;
    if (w < 520) return 5;
    return 6;
  }
  let coverW = $state(480);
  const shownCount = $derived(countFor(coverW));

  function tilt(i: number, n: number) {
    return n <= 1 ? 0 : -12 + (24 * i) / (n - 1);
  }

  const exportJson = $derived(JSON.stringify(selected, null, 2));
  let copied = $state(false);
  async function copyJson() {
    try {
      await navigator.clipboard.writeText(exportJson);
      copied = true;
      setTimeout(() => (copied = false), 1200);
    } catch {}
  }
</script>

<div class="page">
  <header class="top">
    <div>
      <h1>Shop deck covers — keen-eye pick</h1>
      <p>Real ChoreoCards (printed 5:7). Auto-picked 6 distinct per deck. Pick a style, swap cards, copy JSON back.</p>
    </div>
    <div class="style-switch" role="group" aria-label="Cover style">
      <button class:on={style === "fan"} onclick={() => (style = "fan")}>Fanned hand</button>
      <button class:on={style === "stack"} onclick={() => (style = "stack")}>Stacked pile</button>
      <button class:on={style === "smallfan"} onclick={() => (style = "smallfan")}>Small fan</button>
    </div>
  </header>

  <div class="decks">
    {#each decks as [deckId, deck] (deckId)}
      {@const heroes = chosen(deckId).slice(0, shownCount)}
      {@const cardW = style === "smallfan" ? 92 : 122}
      <section class="deck">
        <div class="tile">
          <div class="cover" bind:clientWidth={coverW}>
            {#if heroes.length === 0}
              <span class="empty">pick some cards →</span>
            {:else if style === "stack"}
              <div class="stack">
                {#each heroes as seq, i (seq.id)}
                  <div class="stack-card" style:--i={i} style:z-index={i}>
                    <div class="card-box" style:width="128px">
                      <ChoreoCard sequence={seq} cardMode showQRCodes={false} customNotesText="" />
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="fan" class:small={style === "smallfan"}>
                {#each heroes as seq, i (seq.id)}
                  <div class="fan-slot">
                    <div class="fan-tilt" style:transform="rotate({tilt(i, heroes.length)}deg)">
                      <div class="card-box" style:width="{cardW}px">
                        <ChoreoCard sequence={seq} cardMode showQRCodes={false} customNotesText="" />
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          <div class="tile-info">
            <div class="tile-titles">
              <span class="tile-name">{deck.label} LOOP Deck</span>
              <span class="loop-icons">
                {#each loopInfos(deckId) as info (info.icon)}
                  <span class="loop-chip" style:--c={info.color}>
                    <i class="fas fa-{info.icon}" aria-hidden="true"></i>
                    <span>{info.shortLabel}</span>
                  </span>
                {/each}
              </span>
            </div>
            <span class="tile-price">$25</span>
          </div>
        </div>

        <div class="pool">
          <div class="pool-head">
            <span>{deck.label} — candidates ({shownCount} on tile)</span>
            <span class="kept">{(selected[deckId] ?? []).length} kept</span>
          </div>
          <div class="pool-grid">
            {#each deck.sequences as seq, i (seq.id)}
              <div class="cand" class:sel={isSel(deckId, seq.id)} title={seq.word}>
                <div class="card-box" style:width="104px">
                  <ChoreoCard
                    sequence={seq}
                    cardMode
                    showQRCodes={false}
                    customNotesText=""
                    onSelect={() => toggle(deckId, seq.id)}
                  />
                </div>
                <span class="cand-badge">{i + 1}</span>
                {#if isSel(deckId, seq.id)}
                  <span class="cand-check"><i class="fas fa-check"></i></span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/each}
  </div>

  <footer class="export">
    <div class="export-head">
      <span>Selection (paste back to me)</span>
      <button onclick={copyJson}>{copied ? "Copied!" : "Copy JSON"}</button>
    </div>
    <textarea readonly rows="8">{exportJson}</textarea>
  </footer>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 24px clamp(16px, 3vw, 48px) 80px;
    background:
      radial-gradient(120% 80% at 78% 12%, rgba(70, 60, 140, 0.35) 0%, transparent 55%),
      radial-gradient(130% 100% at 50% -10%, #181b3d 0%, #0c0e20 48%, #06070f 100%);
    color: #e8edf6;
    font-family: system-ui, sans-serif;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
  }
  .top h1 { margin: 0 0 4px; font-size: 1.5rem; }
  .top p { margin: 0; color: #9aa6b8; font-size: 0.9rem; }
  .style-switch {
    display: flex;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    padding: 4px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .style-switch button {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #9aa6b8;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .style-switch button.on { background: #6366f1; color: #fff; }

  .decks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 32px;
  }
  .deck { display: flex; flex-direction: column; gap: 16px; }

  .tile {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    padding: 12px;
    overflow: hidden;
  }
  .cover {
    display: grid;
    place-items: center;
    min-height: 250px;
    border-radius: 12px;
    background: radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01));
    overflow: hidden;
  }
  .empty { color: #6b7688; font-size: 0.85rem; }

  .tile-info {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 6px 4px;
  }
  .tile-titles { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .tile-name { font-weight: 700; }
  .tile-price { font-weight: 800; color: #8ab4ff; flex: 0 0 auto; }

  /* Color-coded LOOP icon(s) for the flavor — the same coding as the card back
     and the LOOP filter strip. */
  .loop-icons { display: flex; flex-wrap: wrap; gap: 6px; }
  .loop-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    /* AAA: near-white label on a dark tinted chip — readable for EVERY brand
       color, including the dark mirrored purple. Color identity lives in the
       icon + border, not the label text. */
    color: #eef2fb;
    background: color-mix(in srgb, var(--c) 24%, #0c0f1a);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
  }
  .loop-chip i {
    color: color-mix(in srgb, var(--c) 62%, white);
  }

  /* Fan: overlapping tilted cards; group spreads, each lifts on hover. */
  .fan { display: flex; justify-content: center; align-items: flex-end; padding: 24px 0; }
  .fan-slot { transition: margin 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s ease; }
  .fan-slot + .fan-slot { margin-left: -64px; }
  .fan.small .fan-slot + .fan-slot { margin-left: -52px; }
  .fan:hover .fan-slot + .fan-slot { margin-left: -22px; }
  .fan-slot:hover { transform: translateY(-16px) scale(1.04); z-index: 9; position: relative; }
  .fan-tilt { transform-origin: bottom center; }

  /* Stack: a pile with a per-card offset — reads as a physical deck. */
  .stack { position: relative; width: 230px; height: 230px; }
  .stack-card {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) translate(calc(var(--i) * 7px), calc(var(--i) * -5px)) rotate(calc(var(--i) * 2.2deg));
    transition: transform 0.25s ease;
  }
  .stack:hover .stack-card {
    transform: translate(-50%, -50%) translate(calc(var(--i) * 22px), calc(var(--i) * -5px)) rotate(calc(var(--i) * 3deg));
  }

  /* Real card box: portrait poker 5:7. The card keeps its OWN border (no clip),
     and the front render is contained (never stretched — object-fit:fill on the
     wordcard variant was distorting it into the "weird layout"). */
  .card-box {
    aspect-ratio: 5 / 7;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .card-box :global(.prop-thumbnail[data-variant="wordcard"] img) {
    object-fit: contain;
  }

  .pool-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #9aa6b8;
    margin-bottom: 8px;
  }
  .kept { font-variant-numeric: tabular-nums; }
  .pool-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 10px;
    justify-items: center;
  }
  .cand {
    position: relative;
    padding: 3px;
    border-radius: 10px;
    border: 2px solid transparent;
    background: rgba(255, 255, 255, 0.03);
  }
  .cand.sel { border-color: #6366f1; background: rgba(99, 102, 241, 0.15); }
  .cand-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    font-size: 0.7rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border-radius: 6px;
    padding: 1px 5px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .cand-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    background: #6366f1;
    color: #fff;
    border-radius: 50%;
    font-size: 0.7rem;
    pointer-events: none;
  }

  .export {
    margin-top: 40px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
  }
  .export-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.85rem;
    color: #9aa6b8;
  }
  .export-head button {
    padding: 6px 14px;
    border-radius: 8px;
    border: none;
    background: #6366f1;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  }
  .export textarea {
    width: 100%;
    background: #06070f;
    color: #9aa6b8;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    resize: vertical;
  }
</style>
