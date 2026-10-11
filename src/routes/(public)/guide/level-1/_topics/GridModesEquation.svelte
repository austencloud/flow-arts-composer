<!--
  Diamond + Box = 8-point grid, drawn as an equation the way the print sheet
  does, instead of a toggle that hides two of the three states.
-->
<script lang="ts">
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    gridTopicText,
    type GridTopicUnit,
  } from "#lib/shared/guide-topics/grid-topic.js";

  let { darkMode = false }: { darkMode?: boolean } = $props();

  const terms: {
    mode: "diamond" | "box" | "merged";
    label: GridTopicUnit;
    aria: GridTopicUnit;
  }[] = [
    { mode: "diamond", label: "diamond", aria: "diamondAria" },
    { mode: "box", label: "box", aria: "boxAria" },
    { mode: "merged", label: "eightPoint", aria: "eightPointAria" },
  ];
</script>

<div class="modes-equation">
  {#each terms as term, index (term.mode)}
    {#if index === 1}<span class="op" aria-hidden="true">+</span>{/if}
    {#if index === 2}<span class="op" aria-hidden="true">=</span>{/if}
    <figure class="term">
      <svg
        viewBox="0 0 950 950"
        role="img"
        aria-label={gridTopicText(term.aria)}
      >
        {#if term.mode === "merged"}
          <GridSvg gridMode={GridMode.DIAMOND} {darkMode} />
          <GridSvg gridMode={GridMode.BOX} {darkMode} />
        {:else}
          <GridSvg
            gridMode={term.mode === "box" ? GridMode.BOX : GridMode.DIAMOND}
            {darkMode}
          />
        {/if}
      </svg>
      <figcaption>{gridTopicText(term.label)}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .modes-equation {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: clamp(0.4rem, 1.5vw, 1rem);
    max-width: 40rem;
  }
  .term {
    min-width: 0;
    margin: 0;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }
  .term svg {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
  .op {
    font-size: clamp(1.2rem, 3vw, 1.8rem);
    color: var(--ink-dim, #555);
  }
  figcaption {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink, #1a1a1a);
  }
</style>
