<!--
  AnimationExportView.svelte

  PURE VIEW component for animation preview and export in Export Panel.
  All state is consumed from AnimationExportContext - no props needed.

  Uses the same AnimationControlsPanel as the original animation viewer
  to provide consistent UI and full controls.

  Features:
  - Live animation preview via AnimatorCanvas
  - Full AnimationControlsPanel with transport, BPM, visibility, settings
  - Export progress overlay on canvas during export
-->
<script lang="ts">
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import AnimationControlsPanel from "$lib/shared/animation-engine/components/canvas/AnimationControlsPanel.svelte";
  import { getAnimationExportContext } from "../../context/animation-export-context.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  // Get context object (don't destructure to maintain reactivity)
  const context = getAnimationExportContext();

  // Canvas reference for export
  let canvasElement: HTMLCanvasElement | null = $state(null);

  // Derived values for AnimatorCanvas
  const currentStepData = $derived.by(() => {
    const sequenceData = context.state.sequenceData;
    const currentStep = context.state.currentStep;
    if (!sequenceData) return null;
    if (currentStep < 1 && sequenceData.startPlacement) {
      return sequenceData.startPlacement;
    }
    if (sequenceData.steps?.length > 0) {
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(stepIndex, sequenceData.steps.length - 1);
      return sequenceData.steps[clampedIndex] || null;
    }
    return null;
  });

  const currentLetter = $derived(currentStepData?.letter || null);

  // Export progress helpers
  const progressPercent = $derived(
    context.state.exportProgress
      ? Math.round(context.state.exportProgress.progress * 100)
      : 0
  );
  const progressStage = $derived(
    context.state.exportProgress?.stage === "capturing"
      ? "Capturing frames..."
      : context.state.exportProgress?.stage === "encoding"
        ? "Encoding video..."
        : context.state.exportProgress?.stage === "complete"
          ? "Complete!"
          : context.state.exportProgress?.stage === "error"
            ? "Error"
            : ""
  );

  // Handle canvas ready from AnimatorCanvas
  function handleCanvasReady(canvas: HTMLCanvasElement | null) {
    canvasElement = canvas;
    context.actions.onCanvasReady(canvas);
  }
</script>

<div class="animation-export-view">
  <!-- Preview Canvas -->
  <div class="preview-canvas">
    {#if context.state.loading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>Loading animation...</p>
      </div>
    {:else if !context.state.sequenceData}
      <div class="empty-state">
        <i class="fas fa-video" aria-hidden="true"></i>
        <p>No sequence loaded</p>
      </div>
    {:else if context.state.servicesReady}
      <AnimatorCanvas
        leftProp={context.state.leftPropState}
        rightProp={context.state.rightPropState}
        gridVisible={true}
        gridMode={context.state.sequenceData?.gridMode ?? null}
        letter={currentLetter}
        stepData={currentStepData}
        currentStep={context.state.currentStep}
        sequenceData={context.state.sequenceData}
        onCanvasReady={handleCanvasReady}
      />
    {:else}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>Initializing...</p>
      </div>
    {/if}

    <!-- Export Progress Overlay -->
    {#if context.state.isExporting && context.state.exportProgress}
      <div class="export-overlay">
        <div class="export-progress-card">
          <div class="progress-header">
            <span class="progress-stage">{progressStage}</span>
            {#if context.state.exportProgress.stage !== "complete" && context.state.exportProgress.stage !== "error"}
              <button
                class="cancel-button"
                onclick={() => context.actions.onCancelExport()}
                aria-label="Cancel export"
              >
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            {/if}
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: {progressPercent}%"></div>
          </div>
          <span class="progress-percent">{progressPercent}%</span>
          {#if context.state.exportProgress.currentFrame && context.state.exportProgress.totalFrames}
            <span class="frame-count">
              Frame {context.state.exportProgress.currentFrame} / {context.state
                .exportProgress.totalFrames}
            </span>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Animation Controls Panel -->
  <AnimationControlsPanel
    speed={context.state.speed}
    isPlaying={context.state.isPlaying}
    leftMotionVisible={context.state.leftMotionVisible}
    rightMotionVisible={context.state.rightMotionVisible}
    playbackMode={context.state.playbackMode}
    stepPlaybackPauseMs={context.state.stepPlaybackPauseMs}
    stepPlaybackStepSize={context.state.stepPlaybackStepSize}
    isSideBySideLayout={true}
    isExpanded={true}
    isExporting={context.state.isExporting}
    exportProgress={context.state.exportProgress
      ? {
          progress: context.state.exportProgress.progress,
          stage: context.state.exportProgress.stage,
        }
      : null}
    sequenceData={context.state.sequenceData}
    currentStep={context.state.currentStep}
    isCircular={context.state.isCircular}
    loopCount={context.state.exportLoopCount}
    onSpeedChange={(s) => context.actions.onSpeedChange(s)}
    onPlaybackToggle={() => context.actions.onPlaybackToggle()}
    onPlaybackModeChange={(m) => context.actions.onPlaybackModeChange(m)}
    onStepPlaybackPauseMsChange={(p) =>
      context.actions.onStepPlaybackPauseMsChange(p)}
    onStepPlaybackStepSizeChange={(s) =>
      context.actions.onStepPlaybackStepSizeChange(s)}
    onStepHalfBeatBackward={() => context.actions.onStepHalfBeatBackward()}
    onStepHalfBeatForward={() => context.actions.onStepHalfBeatForward()}
    onStepFullBeatBackward={() => context.actions.onStepFullBeatBackward()}
    onStepFullBeatForward={() => context.actions.onStepFullBeatForward()}
    onToggleLeft={() => context.actions.onToggleLeft()}
    onToggleRight={() => context.actions.onToggleRight()}
    onExportVideo={() => context.actions.onExportVideo()}
    onCancelExport={() => context.actions.onCancelExport()}
    onLoopCountChange={(c) => context.actions.onLoopCountChange(c)}
  />
</div>

<style>
  .animation-export-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 16px;
  }

  .preview-canvas {
    flex: 1;
    min-height: 0;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
    position: relative;
  }

  /* Ensure AnimatorCanvas sizes properly */
  .preview-canvas :global(.canvas-wrapper) {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    max-width: 100%;
    max-height: 100%;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--theme-text-dim);
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.3;
  }

  /* Export Progress Overlay */
  .export-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .export-progress-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 32px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    min-width: 200px;
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    justify-content: space-between;
  }

  .progress-stage {
    font-size: var(--font-size-min);
    color: var(--theme-text);
    font-weight: 500;
  }

  .cancel-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  /* Expand the interactive hit-area to the WCAG 44px floor without
     growing the visible 28px box (keeps the compact progress header layout). */
  .cancel-button::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
  }

  .cancel-button:hover {
    background: var(--semantic-error);
    border-color: var(--semantic-error);
    color: white;
  }

  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: var(--theme-stroke);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--theme-accent);
    transition: width var(--duration-instant) ease;
  }

  .progress-percent {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .frame-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .cancel-button {
      transition: none;
    }

    .progress-bar {
      transition: none;
    }
  }
</style>
