<!--
  HandPathBuilderLab.svelte - Hand Path Builder lab tab

  Tap grid locations to draw spatial hand paths for left and right hands.
  No rotation - pure geometric paths through grid positions.
  Output: HandPathData objects saved to Firestore via HandPathRepository.

  Workflow:
    1. Pick a grid mode (diamond default)
    2. Tap to build the left hand path (min 2 points)
    3. Switch to right, tap to build the right hand path (must match left length)
    4. Complete → save both paths to the library

  Rendering: InteractiveCanvas composes AnimatorCanvas (Canvas2D) with
  HitTargetOverlay for click detection. Path trace lines and animated
  hand SVGs render through the SVG animation overlay layer.
-->
<script lang="ts">
  import { createBuilderState } from "./state/builder-state.svelte";
  import { setBuilderContext } from "./context/builder-context";
  import InteractiveCanvas from "$lib/shared/interactive-canvas/InteractiveCanvas.svelte";
  import { HandPathAnimator, getPathD } from "./services/hand-path-animator";
  import { propSvgLoader } from "$lib/shared/pictograph/prop/services/prop-svg-loader";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PropRenderData } from "$lib/shared/pictograph/prop/domain/models/prop-render-data";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { HandMove } from "./state/builder-state.svelte";
  import { getHitTargets } from "$lib/shared/assemble-lab/services/grid-hit-target-calculator";
  import PathPreview from "./components/PathPreview.svelte";
  import BuilderControls from "./components/BuilderControls.svelte";
  import GridModeSelector from "./components/GridModeSelector.svelte";

  const builder = createBuilderState();
  setBuilderContext(builder);

  const gridHandPoints = $derived(getHitTargets(builder.gridMode));

  const leftAnimator = new HandPathAnimator();
  const rightAnimator = new HandPathAnimator();
  const ANIMATION_DURATION_MS = 350;

  const leftColor = "var(--prop-blue, #2e8bf0)";
  const rightColor = "var(--prop-red, #ed1c24)";

  // Hand SVG render data (loaded on mount)
  let leftHandData = $state<PropRenderData | null>(null);
  let rightHandData = $state<PropRenderData | null>(null);

  // Refs for animated hand SVG elements in the animation overlay
  let activeLeftHandRef = $state<SVGGElement | null>(null);
  let activeRightHandRef = $state<SVGGElement | null>(null);

  // Load hand SVGs on mount
  $effect(() => {
    const leftMotion = createMotionData({
      propType: PropType.HAND,
      hand: HandSide.LEFT,
    });
    propSvgLoader
      .loadPropSvg(
        { positionX: 0, positionY: 0, rotationAngle: 0 },
        leftMotion,
        false
      )
      .then((data) => {
        leftHandData = data;
      })
      .catch(console.error);

    const rightMotion = createMotionData({
      propType: PropType.HAND,
      hand: HandSide.RIGHT,
    });
    propSvgLoader
      .loadPropSvg(
        { positionX: 0, positionY: 0, rotationAngle: 0 },
        rightMotion,
        false
      )
      .then((data) => {
        rightHandData = data;
      })
      .catch(console.error);
  });

  // Register animation callback so builder.addLocation() can animate the hand
  $effect(() => {
    builder.setAnimationCallback(async (move: HandMove) => {
      const handData = builder.phase === "left" ? leftHandData : rightHandData;
      const handRef =
        builder.phase === "left" ? activeLeftHandRef : activeRightHandRef;
      if (!handRef || !handData?.svgData) return;

      const animator = builder.phase === "left" ? leftAnimator : rightAnimator;
      await animator.animate({
        element: handRef,
        startLocation: move.from,
        endLocation: move.to,
        durationMs: ANIMATION_DURATION_MS,
        handCenter: handData.svgData.center,
      });
    });
  });

  // Map builder phase to the hand the HitTargetOverlay should present.
  const activePhaseHand = $derived(
    builder.phase === "left"
      ? HandSide.LEFT
      : builder.phase === "right"
        ? HandSide.RIGHT
        : null
  );

  // Build SVG path "d" strings that follow the actual movement path
  // (arc for shifts, straight line for dashes)
  const leftPathDs = $derived(buildPathDs(builder.leftLocations));
  const rightPathDs = $derived(buildPathDs(builder.rightLocations));

  function buildPathDs(locations: readonly GridLocation[]): string[] {
    const ds: string[] = [];
    for (let i = 0; i < locations.length - 1; i++) {
      ds.push(getPathD(locations[i]!, locations[i + 1]!));
    }
    return ds;
  }
</script>

<div class="hand-path-builder">
  <header class="lab-header">
    <h2 class="lab-title">Hand Path Builder</h2>
    <p class="lab-subtitle">
      Tap grid points to draw spatial paths for each hand.
    </p>
  </header>

  <div class="mode-bar">
    <GridModeSelector />
  </div>

  <div class="grid-area">
    <InteractiveCanvas
      leftProp={null}
      rightProp={null}
      gridMode={builder.gridMode}
      gridVisible={false}
      interactive={builder.phase !== "complete"}
      {activePhaseHand}
      currentPosition={builder.lastLocation}
      disabled={builder.isAnimating}
      onPointClick={(loc) => builder.addLocation(loc)}
    >
      {#snippet animationLayer()}
        <!-- Hand points and center - rendered here instead of Canvas2D grid
             to avoid outer points and layer 2 clutter -->
        <circle
          cx="475"
          cy="475"
          r="6"
          fill="var(--dm-grid-color, #d0d0d0)"
          opacity="0.6"
        />
        {#each gridHandPoints as pt (pt.location)}
          <circle
            cx={pt.x}
            cy={pt.y}
            r="4.7"
            fill="var(--dm-grid-color, #d0d0d0)"
          />
        {/each}

        <!-- Path trace lines following actual movement geometry -->
        {#each leftPathDs as d, i (i)}
          <path
            {d}
            fill="none"
            stroke={leftColor}
            stroke-width="4"
            stroke-linecap="round"
            opacity="0.7"
          />
        {/each}
        {#each rightPathDs as d, i (i)}
          <path
            {d}
            fill="none"
            stroke={rightColor}
            stroke-width="4"
            stroke-linecap="round"
            opacity="0.7"
          />
        {/each}

        <!-- Animated hand SVGs (positioned via HandPathAnimator.animate()) -->
        {#if builder.leftLocations.length > 0 && leftHandData?.svgData}
          <g
            bind:this={activeLeftHandRef}
            class="hand-anim-group"
            aria-hidden="true"
          >
            {@html leftHandData.svgData.svgContent}
          </g>
        {/if}
        {#if builder.rightLocations.length > 0 && rightHandData?.svgData}
          <g
            bind:this={activeRightHandRef}
            class="hand-anim-group"
            aria-hidden="true"
          >
            {@html rightHandData.svgData.svgContent}
          </g>
        {/if}

        <!-- Complete state -->
        {#if builder.phase === "complete"}
          <text
            x="475"
            y="475"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="20"
            fill="rgba(255,255,255,0.45)">Paths complete</text
          >
        {/if}
      {/snippet}
    </InteractiveCanvas>
  </div>

  <div class="preview-area">
    <PathPreview />
  </div>

  <div class="controls-area">
    <BuilderControls />
  </div>
</div>

<style>
  .hand-path-builder {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    padding: 16px;
    gap: 12px;
    overflow-y: auto;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-sizing: border-box;
  }

  .lab-header {
    text-align: center;
    flex-shrink: 0;
  }

  .lab-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin: 0 0 4px;
  }

  .lab-subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.45));
    margin: 0;
  }

  .mode-bar {
    width: 100%;
    max-width: 440px;
    flex-shrink: 0;
  }

  .grid-area {
    width: 100%;
    max-width: 400px;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 20px;
  }

  /* Zoom in on the grid - hands are small so we don't need the prop
     buffer space that the assemble tab requires for staffs/fans */
  .grid-area :global(.interactive-canvas-wrapper) {
    transform: scale(1.85);
    transform-origin: center center;
  }

  .preview-area {
    width: 100%;
    max-width: 440px;
    flex-shrink: 0;
  }

  .controls-area {
    width: 100%;
    max-width: 440px;
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .hand-path-builder {
      padding: 10px;
      gap: 10px;
    }

    .lab-title {
      font-size: 16px;
    }
  }
</style>
