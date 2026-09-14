<!--
SplitCanvasView.svelte - Blue-only / red-only split-canvas pair for the
                         disassemble transition.

================================================================================
ARCHITECTURAL NOTE
================================================================================

This view renders the two sub-canvases shown during AnimatorCanvas's
disassemble animation: a blue-only canvas and a red-only canvas, side by side,
that expand below the hero canvas.

WHY IT EXISTS:
AnimatorCanvas used to render these two sub-canvases by SELF-IMPORTING
(`import AnimatorCanvasSelf from "./AnimatorCanvas.svelte"`). That self-import -
plus the AnimatorCanvas -> DisassembleCanvasView -> AnimatorCanvas cycle -
crashed Vite HMR (`reading 'default'` + a forced full page reload on every
edit). This view breaks the cycle by rendering the non-recursive leaf
CanvasSurface instead.

HARD RULE: this file MUST import ONLY CanvasSurface for canvas rendering. It must
NEVER import AnimatorCanvas.svelte, DisassembleCanvasView.svelte, or
DisassembleTransition.svelte. Keep it cycle-clean.

WHAT IT OWNS:
1. The two CanvasSurface instances (blue-only / red-only).
2. The split-canvases container element + its max-height/opacity CSS transition.
3. The "expand once both engines are ready" race: it counts onInitialized from
   each child, then expands on the next frame.
4. Surfacing transition-end + readiness back to the parent so the parent's
   disassemble state machine (which owns the engine + viewState) can advance.

WHAT THE PARENT (AnimatorCanvas) OWNS:
- The viewState machine and the hero engine's pauseResize/resumeResize.
- Deciding when to mount/unmount this view and when to collapse it (via the
  `expandRequested` prop).
================================================================================
-->
<script lang="ts">
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { FireOverlayConfig } from "../domain/types/fire-types";
  import type { LedOverlayConfig } from "../domain/types/led-types";
  import type { TrailSettings } from "../domain/types/trail-types";
  import type { TipEffectMap } from "../domain/types/tip-effect-types";
  import type { AnimationVisibilityStateManager } from "../state/animation-visibility-state.svelte";
  import CanvasSurface from "./CanvasSurface.svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { untrack } from "svelte";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  let {
    leftProp,
    rightProp,
    gridVisible = true,
    gridMode = GridMode.DIAMOND,
    backgroundAlpha = 1,
    layout = "stacked",
    letter = null,
    stepData = null,
    sequenceData = null,
    currentStep = 0,
    isPlaying = false,
    fireConfig = undefined,
    ledConfig = undefined,
    trailSettings = undefined,
    leftPropType = null,
    rightPropType = null,
    primaryPropColors,
    fanAppearance = undefined,
    tipEffectMap = undefined,
    visibilityManagerOverride = undefined,
    showNonRadialPoints = true,
    darkModeEnabled = true,
    // When true, the parent wants the split row expanded. When false, it wants
    // it collapsed (reassemble). The actual expand is gated on both child
    // engines reporting ready first.
    expandRequested = false,
    // True while a CSS transition is in flight, so the child engines pause their
    // ResizeObserver and don't clear their canvas buffers mid-animation.
    resizePaused = false,
    // Fires once both sub-canvas engines have initialized + painted a frame.
    onBothReady = () => {},
    // Fires when the expand (open) max-height transition finishes.
    onExpandComplete = () => {},
    // Fires when the collapse (close) max-height transition finishes.
    onCollapseComplete = () => {},
  }: {
    leftProp: PropState | null;
    rightProp: PropState | null;
    gridVisible?: boolean;
    gridMode?: GridMode | null;
    backgroundAlpha?: number;
    layout?: "stacked" | "sidecar";
    letter?: Letter | null;
    stepData?: StartPositionData | StepData | null;
    sequenceData?: SequenceData | null;
    currentStep?: number;
    isPlaying?: boolean;
    fireConfig?: Partial<FireOverlayConfig>;
    ledConfig?: Partial<LedOverlayConfig>;
    trailSettings?: TrailSettings;
    leftPropType?: string | null;
    primaryPropColors?: ViewerCustomColorPair;
    rightPropType?: string | null;
    fanAppearance?: FanAppearance;
    tipEffectMap?: TipEffectMap;
    visibilityManagerOverride?: AnimationVisibilityStateManager;
    showNonRadialPoints?: boolean;
    darkModeEnabled?: boolean;
    expandRequested?: boolean;
    resizePaused?: boolean;
    onBothReady?: () => void;
    onExpandComplete?: () => void;
    onCollapseComplete?: () => void;
  } = $props();

  // Mount collapsed; expand only after both child engines are initialized AND
  // the parent has requested expansion.
  let splitExpanded = $state(false);
  let splitCanvasesEl: HTMLDivElement | undefined = $state();
  let readyCount = $state(0);
  let bothReadyFired = false;

  function handleSplitCanvasReady() {
    readyCount++;
    if (readyCount >= 2 && !bothReadyFired) {
      bothReadyFired = true;
      onBothReady();
    }
  }

  // Expand once both engines are ready AND the parent still wants it expanded.
  // Wait a frame so the browser lays out the collapsed state first, otherwise
  // the max-height CSS transition has nothing to animate from.
  $effect(() => {
    const wantExpand = expandRequested;
    const ready = readyCount >= 2;
    if (wantExpand && ready && !splitExpanded) {
      untrack(() => {
        requestAnimationFrame(() => {
          // Re-check inside the frame in case the parent flipped back to
          // collapse before layout settled.
          if (expandRequested && readyCount >= 2) splitExpanded = true;
        });
      });
    } else if (!wantExpand && splitExpanded) {
      // Parent asked to collapse (reassemble).
      untrack(() => {
        splitExpanded = false;
      });
    }
  });

  function handleSplitTransitionEnd(e: TransitionEvent) {
    // Only react to max-height transitions on the split-canvases element itself.
    if (e.target !== splitCanvasesEl || e.propertyName !== "max-height") return;
    if (splitExpanded) {
      onExpandComplete();
    } else {
      onCollapseComplete();
    }
  }
</script>

<!-- Split canvases: blue-only and red-only, expand below the hero canvas. -->
<div
  class="split-canvases"
  class:expanded={splitExpanded}
  class:sidecar={layout === "sidecar"}
  bind:this={splitCanvasesEl}
  ontransitionend={handleSplitTransitionEnd}
>
  <div class="split-canvas">
    <CanvasSurface
      {primaryPropColors}
      {leftProp}
      rightProp={null}
      {gridVisible}
      {gridMode}
      {backgroundAlpha}
      {darkModeEnabled}
      {letter}
      {stepData}
      {sequenceData}
      {currentStep}
      {isPlaying}
      {fireConfig}
      {ledConfig}
      {trailSettings}
      {leftPropType}
      {rightPropType}
      {fanAppearance}
      {tipEffectMap}
      {visibilityManagerOverride}
      {showNonRadialPoints}
      mandalaVisibleOverride={true}
      hideTkaGlyph={true}
      hideStepNumbers={true}
      {resizePaused}
      onInitialized={handleSplitCanvasReady}
    />
  </div>
  <div class="split-canvas">
    <CanvasSurface
      {primaryPropColors}
      leftProp={null}
      {rightProp}
      {gridVisible}
      {gridMode}
      {backgroundAlpha}
      {darkModeEnabled}
      {letter}
      {stepData}
      {sequenceData}
      {currentStep}
      {isPlaying}
      {fireConfig}
      {ledConfig}
      {trailSettings}
      {leftPropType}
      {rightPropType}
      {fanAppearance}
      {tipEffectMap}
      {visibilityManagerOverride}
      {showNonRadialPoints}
      mandalaVisibleOverride={true}
      hideTkaGlyph={true}
      hideStepNumbers={true}
      {resizePaused}
      onInitialized={handleSplitCanvasReady}
    />
  </div>
</div>

<style>
  /* ===========================================
     SPLIT CANVASES: Blue-only and Red-only
     Expand below hero during disassemble.
     CSS transitions only - no DOM swap.
     =========================================== */

  .split-canvases {
    display: flex;
    width: 100%;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    /* Collapse: fade out quickly, no delay */
    transition:
      max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.2s ease-in;
  }

  .split-canvases.expanded {
    /* Each half-width canvas is square, so row height = 50% of wrapper width */
    max-height: 50cqw;
    opacity: 1;
    /* Expand: delay opacity so engines have time to render before becoming visible */
    transition:
      max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.3s ease-out 0.2s;
  }

  /* Embedded square stages place the split pair beside the hero instead of
     stacking a third square beneath it. Both leaves remain square and share
     the parent's transparent atmospheric surface. */
  .split-canvases.sidecar {
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(0.25rem, 1cqw, 0.75rem);
  }

  .split-canvases.sidecar.expanded {
    max-height: 100cqh;
  }

  .split-canvases.sidecar .split-canvas {
    width: 100%;
    flex: 0 1 auto;
  }

  .split-canvas {
    width: 50%;
    aspect-ratio: 1 / 1;
    position: relative;
    overflow: hidden;
    /* Establish a container-query context on the CELL so the leaf's
       `.canvas-wrapper { height: 100cqw }` squares against this half-width cell
       — NOT against the grandparent .content-wrapper, which would make each
       sub-canvas full-width-tall (2x too tall) and overflow the row. */
    container-type: inline-size;
  }

  /* Split sub-canvases fill their square cell edge-to-edge. */
  .split-canvas :global(.canvas-wrapper) {
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .split-canvases {
      transition: none;
    }
  }
</style>
