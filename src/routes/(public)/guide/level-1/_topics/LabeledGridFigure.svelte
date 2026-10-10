<!--
  The Grid's labeled overview: the two-hand pictograph with callout lines
  naming the center point, a hand point and an outer point. This restores
  the print sheet's annotations on the web. Label words and geometry come
  from the shared topic record.
-->
<script lang="ts">
  import GridHandsArt from "./GridHandsArt.svelte";
  import {
    GRID_OVERVIEW_CALLOUTS,
    calloutLabel,
    calloutLineStart,
    gridTopicText,
  } from "#lib/shared/guide-topics/grid-topic.js";

  let {
    darkMode = false,
    printMode = false,
  }: { darkMode?: boolean; printMode?: boolean } = $props();
</script>

<figure class="labeled-grid">
  <div class="stage">
    <div class="art"><GridHandsArt {darkMode} {printMode} /></div>
    <svg class="callouts" viewBox="0 0 950 950" aria-hidden="true">
      {#each GRID_OVERVIEW_CALLOUTS as callout (callout.id)}
        {@const start = calloutLineStart(callout)}
        <line
          x1={start.x}
          y1={start.y}
          x2={callout.lineEnd.x}
          y2={callout.lineEnd.y}
        />
        <text
          x={callout.labelAt.x}
          y={callout.labelAt.y}
          text-anchor={callout.align}>{calloutLabel(callout)}</text
        >
      {/each}
    </svg>
  </div>
  <figcaption>{gridTopicText("handsCaption")}</figcaption>
</figure>

<style>
  .labeled-grid {
    margin: 0;
    display: grid;
    gap: 0.6rem;
    color: var(--ink, #1a1a1a);
  }
  /* The overlay shares the art's 950-unit square, labels in its corners. */
  .stage {
    position: relative;
    aspect-ratio: 1;
    border-radius: 0.75rem;
    overflow: hidden;
  }
  .art {
    position: absolute;
    inset: 0;
  }
  .callouts {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    /* Above the pictograph, which paints its own background square. */
    z-index: 1;
  }
  .callouts line {
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.55;
  }
  .callouts text {
    fill: currentColor;
    font-size: 50px;
    font-weight: 650;
    font-family: inherit;
  }
  figcaption {
    font-size: 0.85rem;
    color: var(--ink-dim, #555);
    text-align: center;
  }
</style>
