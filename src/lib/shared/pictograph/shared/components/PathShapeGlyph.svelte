<!--
  PathShapeGlyph.svelte

  Accidental glyph for per-step path shape overrides.
  Renders above the grid, horizontally centered.
  Blue icon left of center, red icon right of center.
  Only shows when a motion has a per-step override set.
-->
<script lang="ts">
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { MotionData } from "../domain/models/motion-data";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "../domain/enums/pictograph-enums";

  let {
    leftMotion = undefined,
    rightMotion = undefined,
    darkMode = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
  }: {
    leftMotion?: MotionData | null;
    rightMotion?: MotionData | null;
    darkMode?: boolean;
    leftColorOverride?: string;
    rightColorOverride?: string;
  } = $props();

  const leftShape = $derived(leftMotion?.pathShape);
  const rightShape = $derived(rightMotion?.pathShape);
  const hasAny = $derived(leftShape !== undefined || rightShape !== undefined);

  const leftColor = $derived(leftColorOverride ?? getSettings().primaryPropColors?.left ?? getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"));
  const rightColor = $derived(rightColorOverride ?? getSettings().primaryPropColors?.right ?? getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"));

  const CX = 475;
  const CY = 58;
  const SPACING = 36;
  const R = 14;
</script>

{#if hasAny}
  <g class="path-shape-glyph" opacity="0.7">
    {#if leftShape}
      {@const x = rightShape ? CX - SPACING : CX}
      <g transform="translate({x}, {CY})">
        {#if leftShape === "arc"}
          <circle r={R} fill="none" stroke={leftColor} stroke-width="2.5" />
        {:else if leftShape === "linear"}
          <rect
            x={-R * 0.7} y={-R * 0.7}
            width={R * 1.4} height={R * 1.4}
            fill="none" stroke={leftColor} stroke-width="2.5"
            transform="rotate(45)"
          />
        {:else if leftShape === "concave"}
          <path
            d="M 0 {-R} Q {R*0.2} {-R*0.2} {R} 0 Q {R*0.2} {R*0.2} 0 {R} Q {-R*0.2} {R*0.2} {-R} 0 Q {-R*0.2} {-R*0.2} 0 {-R} Z"
            fill="none" stroke={leftColor} stroke-width="2.5"
          />
        {/if}
      </g>
    {/if}

    {#if rightShape}
      {@const x = leftShape ? CX + SPACING : CX}
      <g transform="translate({x}, {CY})">
        {#if rightShape === "arc"}
          <circle r={R} fill="none" stroke={rightColor} stroke-width="2.5" />
        {:else if rightShape === "linear"}
          <rect
            x={-R * 0.7} y={-R * 0.7}
            width={R * 1.4} height={R * 1.4}
            fill="none" stroke={rightColor} stroke-width="2.5"
            transform="rotate(45)"
          />
        {:else if rightShape === "concave"}
          <path
            d="M 0 {-R} Q {R*0.2} {-R*0.2} {R} 0 Q {R*0.2} {R*0.2} 0 {R} Q {-R*0.2} {R*0.2} {-R} 0 Q {-R*0.2} {-R*0.2} 0 {-R} Z"
            fill="none" stroke={rightColor} stroke-width="2.5"
          />
        {/if}
      </g>
    {/if}
  </g>
{/if}
