<!--
  Codex Parity - original book artboard vs live render, side by side.

  Lives under (public) so it inherits the bare layout (a /test/* route gets
  redirected to /create/construct by the app-shell module-state). Each row pairs
  the scanned book page (left) with the SAME sheet rendered from CodexSheet
  (right), both pinned to the same on-screen width so any size/spacing drift is
  directly readable. This is the tuning surface for getting the render - and the
  tall poster that reuses it - back to book parity.
-->
<script lang="ts">
  import CodexSheet from "../_components/CodexSheet.svelte";
  import { SHEETS } from "../_data/codex-groups";

  const originals = [
    "/test/codex-original/sheet1.png",
    "/test/codex-original/sheet2.png",
  ];

  // On-screen width for each side. 8.5in sheet scaled to fit the column.
  let colWidth = $state(420); // px
  const scale = $derived(colWidth / (8.5 * 96)); // 8.5in @ 96dpi
</script>

<svelte:head>
  <title>Codex Parity: book vs render</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="root">
  <header>
    <h1>Codex Parity: book artboard (left) vs render (right)</h1>
    <label class="ctl">
      Column width
      <input type="range" min="280" max="640" step="10" bind:value={colWidth} />
      <span>{colWidth}px</span>
    </label>
  </header>

  {#each SHEETS as sheet, i (i)}
    <section class="pair" style:--col="{colWidth}px">
      <div class="col">
        <span class="tag">BOOK · sheet {i + 1}</span>
        <img src={originals[i]} alt="original sheet {i + 1}" style:width="{colWidth}px" />
      </div>
      <div class="col">
        <span class="tag">RENDER · sheet {i + 1}</span>
        <div class="render" style:width="{colWidth}px" style:height="{11 * 96 * scale}px">
          <div class="scaler" style:transform="scale({scale})">
            <CodexSheet {sheet} />
          </div>
        </div>
      </div>
    </section>
  {/each}
</div>

<style>
  .root {
    min-height: 100vh;
    background: #d9dbe0;
    padding: 1rem 1.25rem 4rem;
    font-family: system-ui, sans-serif;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }
  h1 {
    font-size: 1rem;
    margin: 0;
    color: #222;
  }
  .ctl {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font: 0.8rem/1 system-ui;
    color: #333;
  }
  .ctl span {
    font-variant-numeric: tabular-nums;
    min-width: 5ch;
  }

  .pair {
    display: grid;
    grid-template-columns: var(--col) var(--col);
    gap: 1.5rem;
    align-items: start;
    margin: 0 auto 2.5rem;
    width: max-content;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .tag {
    font: 700 0.7rem/1 ui-monospace, monospace;
    letter-spacing: 0.08em;
    color: #444;
  }
  .col img,
  .render {
    background: #fff;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
  }
  /* The render side scales the full 8.5in sheet down to the column width. */
  .render {
    overflow: hidden;
  }
  .scaler {
    transform-origin: top left;
  }
</style>
