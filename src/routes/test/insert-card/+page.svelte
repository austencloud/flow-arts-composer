<!--
  Insert card harness — the printed "How to Read" card, at print resolution.

  Renders the real canvases the export pipeline emits. Two deck numbers are
  shown side by side because a shared front cache keyed on theme alone would
  hand the second deck the first deck's card, and that is invisible in any
  single-deck view.
-->
<script lang="ts">
  import { renderInsertCardPair } from "#lib/features/choreo-card/services/PrintCardRenderer.js";

  const THEMES = ["cosmic", "ocean", "ember"] as const;

  let theme = $state<(typeof THEMES)[number]>("cosmic");
  let scale = $state(0.55);
  let cards = $state<{ deckNumber: number; front: string; back: string }[]>([]);
  let error = $state("");

  $effect(() => {
    const activeTheme = theme;
    let cancelled = false;

    (async () => {
      try {
        const built = [];
        for (const deckNumber of [7, 8]) {
          const { front, back } = await renderInsertCardPair({
            theme: activeTheme,
            cardSize: "poker",
            deckNumber,
          });
          built.push({
            deckNumber,
            front: front.toDataURL("image/png"),
            back: back.toDataURL("image/png"),
          });
        }
        if (!cancelled) cards = built;
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      }
    })();

    return () => { cancelled = true; };
  });
</script>

<svelte:head><title>Insert card harness</title></svelte:head>

<div class="harness">
  <header>
    <h1>How to Read insert</h1>
    <p>822 &times; 1122 print canvases, straight from the export pipeline.</p>
    <div class="controls">
      {#each THEMES as t (t)}
        <button class:active={theme === t} onclick={() => (theme = t)}>{t}</button>
      {/each}
      <label>
        scale
        <input type="range" min="0.25" max="1" step="0.05" bind:value={scale} />
        <span class="scale-value">{Math.round(scale * 100)}%</span>
      </label>
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="decks">
    {#each cards as card (card.deckNumber)}
      <section>
        <h2>Deck {String(card.deckNumber).padStart(3, "0")}</h2>
        <div class="pair">
          <img src={card.front} alt="front" style="width: {822 * scale}px" />
          <img src={card.back} alt="back" style="width: {822 * scale}px" />
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .harness {
    min-height: 100vh;
    padding: 2rem;
    background: #0b0f1d;
    color: #e8ecf8;
    font-family: system-ui, sans-serif;
  }
  h1 { margin: 0; font-size: 1.5rem; }
  p { margin: 0.25rem 0 1rem; color: rgba(232, 236, 248, 0.55); }
  .controls { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  button {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    cursor: pointer;
  }
  button.active { background: rgba(129, 140, 248, 0.28); border-color: #818cf8; }
  label { display: flex; gap: 0.5rem; align-items: center; }
  .scale-value { font-variant-numeric: tabular-nums; min-width: 4ch; }
  .decks { display: flex; flex-wrap: wrap; gap: 2.5rem; margin-top: 1.5rem; }
  h2 { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
  .pair { display: flex; gap: 1rem; }
  img { display: block; height: auto; }
  .error { color: #fca5a5; }
</style>
