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
  }

  const { entries, maxWidthCqi = 10 }: Props = $props();

  const layout = $derived(layoutTurnGlyph(entries.length, maxWidthCqi));
</script>

<div class="turn-glyph">
  <div
    class="bars-row"
    style="gap: calc(var(--glyph-unit, 1cqi) * {layout.groupGap}); --bar-w: calc(var(--glyph-unit, 1cqi) * {layout.barW}); --intra-gap: calc(var(--glyph-unit, 1cqi) * {layout.intraGap}); --bar-radius: calc(var(--glyph-unit, 1cqi) * {layout.radius}); --hatch-step: calc(var(--glyph-unit, 1cqi) * {0.4 *
      layout.scale});"
  >
    {#each entries as entry}
      <div class="bar-group">
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
