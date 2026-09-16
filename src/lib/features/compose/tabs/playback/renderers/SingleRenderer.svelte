<!--
  SingleRenderer.svelte

  Single sequence animation renderer.
  Displays one sequence on a single canvas.
-->
<script lang="ts">

import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { onMount } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import {
    ANIMATION_LOAD_DELAY_MS,
    ANIMATION_AUTO_START_DELAY_MS,
  } from "$lib/shared/animation-engine/domain/constants/timing";
  import CanvasControls from "../components/CanvasControls.svelte";

  let {
    sequence,
    isPlaying = false,
    speed = 1.0,
    shouldLoop = false,
    playbackMode = "continuous",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1,
    visible = true,
    leftVisible = true,
    rightVisible = true,
    onOpenSettings,
  }: {
    sequence: SequenceData | null;
    isPlaying?: boolean;
    speed?: number;
    shouldLoop?: boolean;
    playbackMode?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").PlaybackMode;
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").StepPlaybackStepSize;
    visible?: boolean;
    leftVisible?: boolean;
    rightVisible?: boolean;
    onOpenSettings: (canvasId: string) => void;
  } = $props();

  // Services
  let playbackController: AnimationPlaybackController | null = null;

  // Animation state
  const animationState = createAnimationPanelState();

  let loading = $state(false);
  let error = $state<string | null>(null);

  // Track last loaded sequence ID to prevent unnecessary remounts during prop type changes
  let lastLoadedSequenceId: string | null = null;

  // Auto-start timer id - cleared on unmount so a pending setIsPlaying(true)
  // can't fire after the component is gone
  let autoStartTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Trail settings - derive directly from animationSettings for proper reactivity
  // This ensures changes to trail effect settings are picked up
  let trailSettings = $derived(animationSettings.trail);

  // Resolve grid mode: "8point" overrides to 8-point, "auto" uses sequence's own mode
  const visibilityManager = getAnimationVisibilityManager();
  let effectiveGridMode = $derived.by(() => {
    const visGridMode = visibilityManager.getGridMode();
    if (visGridMode === "8point") return GridMode.EIGHT_POINT;
    return animationState.sequenceData?.gridMode ?? null;
  });

  // Whether sequence loops seamlessly (affects trail clearing behavior)
  let isSeamlesslyLoopable = $derived.by(() => {
    if (!playbackController) return false;
    return playbackController.isSeamlesslyLoopable;
  });

  // Initialize services
  onMount(() => {
    try {
      playbackController = getAnimationPlaybackController();
    } catch (err) {
      console.error("Failed to initialize single renderer:", err);
      error = "Failed to initialize animation services";
    }

    return () => {
      if (autoStartTimeoutId !== null) {
        clearTimeout(autoStartTimeoutId);
        autoStartTimeoutId = null;
      }
      animationState.dispose();
    };
  });

  // Load and start animation when sequence changes
  // Only trigger full loading for truly different sequences (ID changes)
  // Prop type changes within same sequence should not cause remounts - AnimationEngine handles hot-swap
  $effect(() => {
    if (!sequence || !playbackController) return;

    const currentSequenceId =
      sequence.id || sequence.word || sequence.name || "unknown";
    const isSameSequence = currentSequenceId === lastLoadedSequenceId;

    if (isSameSequence) {
      // Same sequence, just prop type or other metadata change
      // Don't trigger loading state - AnimationEngine hot-swap handles prop changes
      return;
    }

    // Different sequence - do full load
    loadAndStartAnimation(currentSequenceId);
  });

  async function loadAndStartAnimation(sequenceId: string) {
    if (!sequence || !playbackController) return;

    try {
      loading = true;
      error = null;

      // Small delay to ensure UI is ready
      await new Promise((resolve) =>
        setTimeout(resolve, ANIMATION_LOAD_DELAY_MS)
      );

      const success = playbackController.initialize(sequence, animationState);

      if (!success) {
        throw new Error("Failed to initialize animation playback");
      }

      // Track the loaded sequence ID
      lastLoadedSequenceId = sequenceId;

      loading = false;

      // Auto-start animation if playing
      if (isPlaying) {
        if (autoStartTimeoutId !== null) clearTimeout(autoStartTimeoutId);
        autoStartTimeoutId = setTimeout(() => {
          autoStartTimeoutId = null;
          animationState.setIsPlaying(true);
        }, ANIMATION_AUTO_START_DELAY_MS);
      }
    } catch (err) {
      console.error("❌ Failed to initialize animation:", err);
      error =
        err instanceof Error ? err.message : "Failed to initialize animation";
      loading = false;
    }
  }

  // Sync isPlaying state
  $effect(() => {
    if (animationState.sequenceData && playbackController) {
      if (isPlaying !== animationState.isPlaying) {
        playbackController.togglePlayback();
      }
    }
  });

  // Sync speed
  $effect(() => {
    if (playbackController && animationState.sequenceData) {
      playbackController.setSpeed(speed);
    }
  });

  // Sync loop + step playback preferences to per-renderer animation state
  $effect(() => {
    if (!animationState.sequenceData) return;
    animationState.setShouldLoop(shouldLoop);
  });

  $effect(() => {
    if (!animationState.sequenceData) return;
    if (animationState.isPlaying) return;
    animationState.setPlaybackMode(playbackMode);
    animationState.setStepPlaybackPauseMs(stepPlaybackPauseMs);
    animationState.setStepPlaybackStepSize(stepPlaybackStepSize);
  });

  // Derived: Current step data (for passing to AnimatorCanvas)
  let currentStepData = $derived.by(() => {
    if (!animationState.sequenceData) return null;

    const currentStep = animationState.currentStep;

    // Handle start position case explicitly
    if (
      currentStep === 0 &&
      !animationState.isPlaying &&
      animationState.sequenceData.startPlacement
    ) {
      return animationState.sequenceData.startPlacement;
    }

    // For steps, use direct indexing with clamping
    if (
      animationState.sequenceData.steps &&
      animationState.sequenceData.steps.length > 0
    ) {
      // Beat indexing: steps[0] = beat 1, steps[1] = beat 2, etc.
      // currentStep semantics: beat N's motion spans from N.0 to (N+1).0
      //
      // In step playback:
      // - Motion for beat 2 goes from currentStep 2.0 to 3.0
      // - After motion completes, pause at currentStep 3.0
      // - During this pause, glyph should show beat 2 (the completed beat)
      //
      // Formula: ceil(currentStep - 1) gives the beat number whose motion is/was playing
      // - At 2.0 to 2.999: ceil(1.0 to 1.999) = 1 or 2, shows beat 1 or 2
      // - At 3.0 (pause after beat 2): ceil(2.0) = 2, shows beat 2
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationState.sequenceData.steps.length - 1
      );
      return animationState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });

  // Derived: Current letter
  let currentLetter = $derived.by(() => {
    return currentStepData?.letter || null;
  });

  // Derived: Word for header display
  let sequenceWord = $derived(
    animationState.sequenceData?.word || sequence?.word || null
  );
</script>

<div class="single-renderer">
  {#if loading}
    <div class="loading-message">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>{t("loading_animation")}</p>
    </div>
  {:else if error}
    <div class="error-message">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>{error}</p>
    </div>
  {:else if sequence}
    <CanvasControls canvasId="single" {onOpenSettings} />
    <AnimatorCanvas
      leftProp={leftVisible && visible ? animationState.leftPropState : null}
      rightProp={rightVisible && visible ? animationState.rightPropState : null}
      gridVisible={true}
      gridMode={effectiveGridMode}
      letter={currentLetter}
      stepData={currentStepData}
      currentStep={animationState.currentStep}
      sequenceData={animationState.sequenceData}
      word={sequenceWord}
      {trailSettings}
      {isSeamlesslyLoopable}
    />
  {:else}
    <div class="empty-message">
      <i class="fas fa-video" aria-hidden="true"></i>
      <p>{t("empty_no_sequence_loaded")}</p>
    </div>
  {/if}
</div>

<style>
  .single-renderer {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-primary, #1a1a1a);
    min-height: 0;
    overflow: hidden;
    container-type: size;
    container-name: single-renderer;
  }

  /* Ensure AnimatorCanvas sizes as the largest square that fits and is centered */
  .single-renderer :global(.canvas-wrapper) {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 1 / 1;
  }

  .loading-message,
  .error-message,
  .empty-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
    color: var(--theme-text-dim);
  }

  .loading-message p,
  .error-message p,
  .empty-message p {
    font-size: 1rem;
    margin: 0;
  }

  .error-message {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
  }

  .error-message i {
    font-size: 3rem;
    opacity: 0.5;
  }

  .empty-message i {
    font-size: 3rem;
    opacity: 0.2;
  }


</style>
