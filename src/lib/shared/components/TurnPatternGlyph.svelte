<!--
  TurnPatternGlyph - Tiny bar chart showing per-step turn values.
  Period-compressed: shows only the minimum repeating unit.
  Float motions render as hatched bars at a fixed height.

  Long patterns scale horizontally to fit the glyph box (shared geometry
  in render-composition, mirrored by the print rasterizer). Heights
  never scale — bar height encodes the turn value.
-->
<script lang="ts">
  import {
    layoutTurnGlyph,
    turnBarHeightCqi,
    type TurnGlyphEntry,
  } from "@tka/render-composition";

  interface Props {
    entries: readonly TurnGlyphEntry[];
    /** Width of the containing glyph box, cqi. CardBack's box is 10cqi. */
    maxWidthCqi?: number;
    /**
     * Column of the beat playing now. Null leaves every column full, which is
     * how card backs and a header that is not playing should look.
     */
    activeIndex?: number | null;
  }

  const { entries, maxWidthCqi = 10, activeIndex = null }: Props = $props();

  const layout = $derived(layoutTurnGlyph(entries.length, maxWidthCqi));
</script>

<div class="turn-glyph">
  <div
    class="bars-row"
    style="gap: calc(var(--glyph-unit, 1cqi) * {layout.groupGap}); --bar-w: calc(var(--glyph-unit, 1cqi) * {layout.barW}); --intra-gap: calc(var(--glyph-unit, 1cqi) * {layout.intraGap}); --bar-radius: calc(var(--glyph-unit, 1cqi) * {layout.radius}); --hatch-step: calc(var(--glyph-unit, 1cqi) * {0.4 *
      layout.scale});"
  >
    {#each entries as entry, index}
      <div
        class="bar-group"
        class:rest={activeIndex !== null && index !== activeIndex}
        class:active={activeIndex !== null && index === activeIndex}
      >
        <div
          class="bar blue"
          class:float={entry.leftFloat}
          style="height: calc(var(--glyph-unit, 1cqi) * {turnBarHeightCqi(
            entry.left,
            !!entry.leftFloat
          )});"
        ></div>
        <div
          class="bar red"
          class:float={entry.rightFloat}
          style="height: calc(var(--glyph-unit, 1cqi) * {turnBarHeightCqi(
            entry.right,
            !!entry.rightFloat
          )});"
        ></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .turn-glyph {
    display: flex;
    align-items: flex-end;
  }

  .bars-row {
    display: flex;
    align-items: flex-end;
  }

  .bar-group {
    display: flex;
    gap: var(--intra-gap);
    align-items: flex-end;
    /* Opacity only, like the word's letters: the header restyles this column
       on every beat, and a tweened drop-shadow would be a blur convolution per
       frame. The glow snaps in with the opacity ramp instead. */
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  /* Column opacity multiplies the float bars' own 0.7, so a hatched bar still
     reads as float while it rests. */
  .bar-group.rest {
    opacity: var(--glyph-rest-opacity, 0.2);
  }

  .bar-group.active {
    opacity: 1;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.3));
  }

  .bar {
    width: var(--bar-w);
    border-radius: var(--bar-radius) var(--bar-radius) 0 0;
    min-height: calc(var(--glyph-unit, 1cqi) * 0.5);
  }

  .bar.blue {
    background: var(--tka-blue-hand, #3498db);
  }
  .bar.red {
    background: var(--tka-red-hand, #e74c3c);
  }

  .bar.float {
    background: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent var(--hatch-step),
      currentColor var(--hatch-step),
      currentColor calc(var(--hatch-step) * 2)
    );
    opacity: 0.7;
  }

  .bar.float.blue {
    color: var(--tka-blue-hand, #3498db);
  }
  .bar.float.red {
    color: var(--tka-red-hand, #e74c3c);
  }
</style>
