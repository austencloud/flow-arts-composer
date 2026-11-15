<!--
HandsStartDrawing.svelte - A small drawing of where the two hands start.
Outer points, the centre and the four hand points are drawn with the hands on
top, blue then red. Proportions follow the grid data (hand points 143 units
out, outer points 300). Box grid turns the whole drawing 45 degrees. Decorative:
the option's word names it, so it is aria-hidden.
-->
<script lang="ts">
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

  type HandsStartKind = "apart" | "together" | "adjacent";

  const { kind, gridMode = GridMode.DIAMOND } = $props<{
    kind: HandsStartKind;
    gridMode?: GridMode;
  }>();

  const OUTER = [
    [20, 3],
    [37, 20],
    [20, 37],
    [3, 20],
  ] as const;
  const HAND_POINTS = [
    [20, 11.9],
    [28.1, 20],
    [20, 28.1],
    [11.9, 20],
  ] as const;
  const HANDS = {
    apart: { blue: [11.9, 20], red: [28.1, 20] },
    together: { blue: [17.3, 11.9], red: [22.7, 11.9] },
    adjacent: { blue: [11.9, 20], red: [20, 11.9] },
  } as const;

  const hands = $derived(HANDS[kind as HandsStartKind]);
  // Indexes into HAND_POINTS that a hand sits on, so they show no dot.
  const OCCUPIED = { apart: [3, 1], together: [0], adjacent: [3, 0] } as const;
  const emptyPoints = $derived(
    HAND_POINTS.filter(
      (_, index) =>
        !(OCCUPIED[kind as HandsStartKind] as readonly number[]).includes(index)
    )
  );
  const turned = $derived(gridMode === GridMode.BOX);
</script>

<svg
  class="hands-start-drawing"
  viewBox="0 0 40 40"
  aria-hidden="true"
  focusable="false"
  data-kind={kind}
>
  <g data-turned={turned} transform={turned ? "rotate(45 20 20)" : undefined}>
    {#each OUTER as [x, y] (`${x}-${y}`)}
      <circle class="outer-point" cx={x} cy={y} r="1.9" />
    {/each}
    <circle class="centre-point" cx="20" cy="20" r="1" />
    {#each emptyPoints as [x, y] (`${x}-${y}`)}
      <circle class="hand-point" cx={x} cy={y} r="0.9" />
    {/each}
    <circle
      class="hand blue"
      cx={hands.blue[0]}
      cy={hands.blue[1]}
      r="4.2"
      data-hand="blue"
    />
    <circle
      class="hand red"
      cx={hands.red[0]}
      cy={hands.red[1]}
      r="4.2"
      data-hand="red"
    />
  </g>
</svg>

<style>
  .hands-start-drawing {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .outer-point {
    fill: color-mix(in srgb, var(--theme-text, white) 50%, transparent);
  }

  .centre-point,
  .hand-point {
    fill: color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .hand.blue {
    fill: var(--dm-motion-blue);
  }

  .hand.red {
    fill: var(--dm-motion-red);
  }
</style>
