<!--
  Signup card harness — the festival sample-pack signup card, at print
  resolution. Renders the real canvases the 9-up sheet script consumes,
  with PNG downloads for the print pipeline.
-->
<script lang="ts">
  import { renderSignupCardPair } from "#lib/features/choreo-card/services/PrintCardRenderer.js";

  const THEMES = ["cosmic", "ocean", "ember"] as const;

  let theme = $state<(typeof THEMES)[number]>("cosmic");
  let scale = $state(0.55);
  let pair = $state<{ front: string; back: string } | null>(null);
  let error = $state("");

  $effect(() => {
    const activeTheme = theme;
    let cancelled = false;

    (async () => {
      try {
        const { front, back } = await renderSignupCardPair({
          theme: activeTheme,
          cardSize: "poker",
        });
        if (!cancelled) {
          pair = {
            front: front.toDataURL("image/png"),
            back: back.toDataURL("image/png"),
          };
        }
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      }
    })();

    return () => { cancelled = true; };
  });
</script>

<svelte:head><title>Signup card harness</title></svelte:head>

<div class="harness">
  <header>
    <h1>Festival signup card</h1>
    <p>822 &times; 1122 print canvases. QR encodes tkaflowarts.com/start.</p>
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

  {#if pair}
    <div class="pair">
      <figure>
        <img src={pair.front} alt="front" style="width: {822 * scale}px" />
        <figcaption>
          <a href={pair.front} download="signup-card-front.png">Download front PNG</a>
        </figcaption>
      </figure>
      <figure>
        <img src={pair.back} alt="back" style="width: {822 * scale}px" />
        <figcaption>
          <a href={pair.back} download="signup-card-back.png">Download back PNG</a>
        </figcaption>
      </figure>
    </div>
  {/if}
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
  .pair { display: flex; flex-wrap: wrap; gap: 2rem; margin-top: 1.5rem; }
  figure { margin: 0; }
  img { display: block; height: auto; }
  figcaption { margin-top: 0.5rem; }
  figcaption a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    text-decoration: none;
  }
  figcaption a:hover { background: rgba(255, 255, 255, 0.12); }
  .error { color: #fca5a5; }
</style>
