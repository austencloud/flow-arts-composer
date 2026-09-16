<!--
  Unified builder surface. Composes AnimatorCanvas (Canvas2D rendering)
  with HitTargetOverlay (click detection) and an optional animation
  overlay layer. Parents construct PropState objects and handle click
  callbacks - this component is a pure pass-through.

  Layer stack:
    z-index  0: Canvas2D (AnimatorCanvas)
    z-index  5: GlyphOverlay (inside AnimatorCanvas)
    z-index  8: Animation overlay (optional, for prop movement SVGs)
    z-index 10: HitTargetOverlay (click circles)
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import HitTargetOverlay from "./components/HitTargetOverlay.svelte";
  import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  interface Props {
    // AnimatorCanvas rendering props
    leftProp: PropState | null;
    rightProp: PropState | null;
    gridMode?: GridMode;
    gridVisible?: boolean;
    stepData?: StartPlacementData | StepData | null;
    backgroundAlpha?: number;
    leftPropType?: string | null;
    rightPropType?: string | null;
    // InteractiveCanvas-specific props
    interactive?: boolean;
    activePhaseHand?: HandSide | null;
    currentPosition?: GridLocation | null;
    disabled?: boolean;
    onPointClick?: (location: GridLocation) => void;
    animationLayer?: Snippet;
    // Pass-through for any other AnimatorCanvas props
    [key: string]: unknown;
  }

  let {
    // AnimatorCanvas props
    leftProp,
    rightProp,
    gridMode = GridMode.DIAMOND,
    gridVisible = true,
    stepData = null,
    backgroundAlpha = 1,
    leftPropType = null,
    rightPropType = null,
    // InteractiveCanvas props
    interactive = true,
    activePhaseHand = null,
    currentPosition = null,
    disabled = false,
    onPointClick = () => {},
    animationLayer,
    // Rest passed to AnimatorCanvas
    ...restProps
  }: Props = $props();
</script>

<div class="interactive-canvas-wrapper">
  <AnimatorCanvas
    {leftProp}
    {rightProp}
    {gridMode}
    {gridVisible}
    {stepData}
    {backgroundAlpha}
    {leftPropType}
    {rightPropType}
    fillContainer={true}
    hideProgressBar={true}
    {...restProps}
  />
  {#if animationLayer}
    <svg
      class="animation-overlay"
      viewBox="0 0 950 950"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {@render animationLayer()}
    </svg>
  {/if}
  {#if interactive}
    <HitTargetOverlay
      {gridMode}
      {activePhaseHand}
      {currentPosition}
      {disabled}
      {onPointClick}
    />
  {/if}
</div>

<style>
  .interactive-canvas-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 20px;
    overflow: hidden;
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .animation-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 8;
    pointer-events: none;
  }

  /* Remove AnimatorCanvas internal border - InteractiveCanvas owns the border.
     This ensures the canvas fills the wrapper edge-to-edge so SVG overlay
     coordinates (950x950 viewBox) align pixel-perfectly with the Canvas2D grid. */
  .interactive-canvas-wrapper :global(.content-wrapper) {
    border: none !important;
    border-radius: 0 !important;
  }

  @media (max-width: 768px) {
    .interactive-canvas-wrapper {
      border-radius: 16px;
    }
  }
</style>
