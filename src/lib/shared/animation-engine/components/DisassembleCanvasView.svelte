<!--
  DisassembleCanvasView.svelte

  Renders three synchronized CanvasSurface leaves in a seamless vertical layout:
  hero (full width, both hands) + two small (half width each, blue/red) + single progress bar.
  Used by AnimatorCanvas when disassemble mode is active.

  Renders the non-recursive CanvasSurface leaf (NOT AnimatorCanvas) to avoid the
  AnimatorCanvas -> DisassembleCanvasView -> AnimatorCanvas import cycle.
-->
<script lang="ts">
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { FireOverlayConfig } from "../domain/types/fire-types";
  import type { LedOverlayConfig } from "../domain/types/led-types";
  import CanvasSurface from "./CanvasSurface.svelte";
  import SegmentedSequenceProgressBar from "./layers/SegmentedSequenceProgressBar.svelte";

  interface Props {
    leftProp: PropState | null;
    rightProp: PropState | null;
    gridVisible?: boolean;
    gridMode?: GridMode | null;
    backgroundAlpha?: number;
    letter?: Letter | null;
    stepData?: StartPlacementData | StepData | null;
    sequenceData?: SequenceData | null;
    currentStep?: number;
    isPlaying?: boolean;
    word?: string | null;
    fireConfig?: Partial<FireOverlayConfig>;
    ledConfig?: Partial<LedOverlayConfig>;
    onCollapse: () => void;
  }

  let {
    leftProp,
    rightProp,
    gridVisible = true,
    gridMode = null,
    backgroundAlpha = 0,
    letter = null,
    stepData = null,
    sequenceData = null,
    currentStep = 0,
    isPlaying = false,
    word = null,
    fireConfig = undefined,
    ledConfig = undefined,
    onCollapse,
  }: Props = $props();

  // Shared props for all three CanvasSurface leaves.
  // Shell-only props (word/focused/hideProgressBar/fillContainer) live on
  // AnimatorCanvas, not CanvasSurface, so they are intentionally omitted here.
  const shared = $derived({
    gridVisible,
    gridMode,
    backgroundAlpha,
    letter,
    stepData,
    sequenceData,
    currentStep,
    isPlaying,
    fireConfig,
    ledConfig,
  });
</script>

<div class="disassemble-view">
  <div class="disassemble-unit">
    <div class="hero-slot">
      <CanvasSurface
        {leftProp}
        {rightProp}
        {...shared}
      />
    </div>

    <div class="small-slots">
      <div class="small-slot">
        <CanvasSurface
          {leftProp}
          rightProp={null}
          {...shared}
          hideTkaGlyph={true}
          hideStepNumbers={true}
        />
      </div>

      <div class="small-slot">
        <CanvasSurface
          leftProp={null}
          {rightProp}
          {...shared}
          hideTkaGlyph={true}
          hideStepNumbers={true}
        />
      </div>
    </div>

    {#if sequenceData?.steps?.length}
      <div class="progress-slot">
        <SegmentedSequenceProgressBar
          steps={sequenceData.steps}
          {currentStep}
          visible={true}
          variant="gradient"
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .disassemble-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    container-type: size;
  }

  /* The unit: hero (square) + two half-width squares below = 2:3 aspect ratio.
     Size it from whichever dimension is the constraint. */
  /* The canvas portion is 2:3 (hero square + half-height small row).
     The hero has a word header (~50px) and there's a progress bar (~32px).
     Subtract that chrome from available height before computing width. */
  .disassemble-unit {
    --chrome: 50px;
    width: min(100cqw, calc((100cqh - var(--chrome)) * 2 / 3));
    display: flex;
    flex-direction: column;
  }

  .hero-slot {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    z-index: 2;
  }

  .small-slots {
    display: flex;
    width: 100%;
  }

  .small-slot {
    position: relative;
    width: 50%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    z-index: 1;
  }

  .progress-slot {
    width: 100%;
  }

  .progress-slot :global(.segmented-progress-container) {
    padding: 2px 0;
  }

  .progress-slot :global(.segments-track) {
    height: 12px;
  }

  .progress-slot :global(.segment-divider) {
    border-right-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.8)) !important;
  }
</style>
