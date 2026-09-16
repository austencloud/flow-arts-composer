<!--
  TunnelRenderer.svelte

  Dual-sequence animation renderer for Tunnel mode.
  Overlays two sequences with different colors on the same canvas.
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
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/services/trail-capturer";
  import {
    ANIMATION_LOAD_DELAY_MS,
    ANIMATION_AUTO_START_DELAY_MS,
  } from "$lib/shared/animation-engine/domain/constants/timing";
  import CanvasControls from "../components/CanvasControls.svelte";

  // Local type definition for tunnel colors
  type TunnelColors = {
    primary: {
      left: string;
      right: string;
    };
    secondary: {
      left: string;
      right: string;
    };
  };

  let {
    primarySequence,
    secondarySequence,
    tunnelColors,
    isPlaying = false,
    speed = 1.0,
    shouldLoop = false,
    playbackMode = "continuous",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1,
    primaryVisible = true,
    primaryLeftVisible = true,
    primaryRightVisible = true,
    secondaryVisible = true,
    secondaryLeftVisible = true,
    secondaryRightVisible = true,
    onOpenSettings,
  }: {
    primarySequence: SequenceData | null;
    secondarySequence: SequenceData | null;
    tunnelColors: TunnelColors;
    isPlaying?: boolean;
    speed?: number;
    shouldLoop?: boolean;
    playbackMode?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").PlaybackMode;
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").StepPlaybackStepSize;
    primaryVisible?: boolean;
    primaryLeftVisible?: boolean;
    primaryRightVisible?: boolean;
    secondaryVisible?: boolean;
    secondaryLeftVisible?: boolean;
    secondaryRightVisible?: boolean;
    onOpenSettings: (canvasId: string) => void;
  } = $props();

  // Services
  let primaryPlaybackController: AnimationPlaybackController | null = null;
  let secondaryPlaybackController: AnimationPlaybackController | null = null;

  // Animation states (one for each sequence)
  const primaryAnimationState = createAnimationPanelState();
  const secondaryAnimationState = createAnimationPanelState();

  let loading = $state(false);
  let error = $state<string | null>(null);

  // Track last loaded sequence IDs to prevent unnecessary remounts during prop type changes
  let lastLoadedPrimarySequenceId: string | null = null;
  let lastLoadedSecondarySequenceId: string | null = null;

  // Auto-start timer id - cleared on unmount so a pending setIsPlaying(true)
  // can't fire after the component is gone
  let autoStartTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Trail settings - derive directly from animationSettings for proper reactivity
  // This ensures changes to trail effect settings are picked up
  let trailSettings = $derived(animationSettings.trail);

  // Resolve grid mode: "8point" overrides to 8-point, "auto" uses sequence's own mode
  const tunnelVisibilityManager = getAnimationVisibilityManager();
  let effectiveGridMode = $derived.by(() => {
    const visGridMode = tunnelVisibilityManager.getGridMode();
    if (visGridMode === "8point") return GridMode.EIGHT_POINT;
    return primaryAnimationState.sequenceData?.gridMode ?? null;
  });

  // Whether sequence loops seamlessly (affects trail clearing behavior)
  let isSeamlesslyLoopable = $derived.by(() => {
    if (!primaryPlaybackController) return false;
    return primaryPlaybackController.isSeamlesslyLoopable;
  });

  // Initialize services
  onMount(() => {
    try {
      // ITI container for services
      primaryPlaybackController = getAnimationPlaybackController();
      // Create a new instance for secondary controller (tunnel mode needs two)
      secondaryPlaybackController = getAnimationPlaybackController();
    } catch (err) {
      console.error("Failed to initialize tunnel renderer:", err);
      error = "Failed to initialize animation services";
    }

    return () => {
      if (autoStartTimeoutId !== null) {
        clearTimeout(autoStartTimeoutId);
        autoStartTimeoutId = null;
      }
      primaryAnimationState.dispose();
      secondaryAnimationState.dispose();
    };
  });

  // Build additionalLayers prop for AnimatorCanvas
  // Secondary layer textures are loaded automatically by AnimationEngine
  const additionalLayerProps = $derived.by((): AdditionalLayerProps[] => {
    if (!secondaryAnimationState.leftPropState && !secondaryAnimationState.rightPropState) {
      return [];
    }
    return [{
      leftProp: secondaryLeftVisible && secondaryVisible
        ? secondaryAnimationState.leftPropState
        : null,
      rightProp: secondaryRightVisible && secondaryVisible
        ? secondaryAnimationState.rightPropState
        : null,
    }];
  });

  // Load and start animations when sequences change
  // Only trigger full loading for truly different sequences (ID changes)
  // Prop type changes within same sequence should not cause remounts - AnimationEngine handles hot-swap
  $effect(() => {
    if (
      !primarySequence ||
      !secondarySequence ||
      !primaryPlaybackController ||
      !secondaryPlaybackController
    )
      return;

    const currentPrimaryId =
      primarySequence.id ||
      primarySequence.word ||
      primarySequence.name ||
      "unknown-primary";
    const currentSecondaryId =
      secondarySequence.id ||
      secondarySequence.word ||
      secondarySequence.name ||
      "unknown-secondary";
    const isSameSequences =
      currentPrimaryId === lastLoadedPrimarySequenceId &&
      currentSecondaryId === lastLoadedSecondarySequenceId;

    if (isSameSequences) {
      // Same sequences, just prop type or other metadata change
      // Don't trigger loading state - AnimationEngine hot-swap handles prop changes
      return;
    }

    // Different sequences - do full load
    loadAndStartAnimations(currentPrimaryId, currentSecondaryId);
  });

  async function loadAndStartAnimations(
    primaryId: string,
    secondaryId: string
  ) {
    if (
      !primarySequence ||
      !secondarySequence ||
      !primaryPlaybackController ||
      !secondaryPlaybackController
    )
      return;

    try {
      loading = true;
      error = null;

      await new Promise((resolve) =>
        setTimeout(resolve, ANIMATION_LOAD_DELAY_MS)
      );

      // Initialize both playback controllers
      const primarySuccess = primaryPlaybackController.initialize(
        primarySequence,
        primaryAnimationState
      );
      const secondarySuccess = secondaryPlaybackController.initialize(
        secondarySequence,
        secondaryAnimationState
      );

      if (!primarySuccess || !secondarySuccess) {
        throw new Error("Failed to initialize animation playback");
      }

      // Track the loaded sequence IDs
      lastLoadedPrimarySequenceId = primaryId;
      lastLoadedSecondarySequenceId = secondaryId;

      loading = false;

      // Auto-start animations if playing
      if (isPlaying) {
        if (autoStartTimeoutId !== null) clearTimeout(autoStartTimeoutId);
        autoStartTimeoutId = setTimeout(() => {
          autoStartTimeoutId = null;
          primaryAnimationState.setIsPlaying(true);
          secondaryAnimationState.setIsPlaying(true);
        }, ANIMATION_AUTO_START_DELAY_MS);
      }
    } catch (err) {
      console.error("❌ Failed to initialize animations:", err);
      error =
        err instanceof Error ? err.message : "Failed to initialize animations";
      loading = false;
    }
  }

  // Sync isPlaying with both animation states
  $effect(() => {
    if (
      primaryAnimationState.sequenceData &&
      secondaryAnimationState.sequenceData &&
      primaryPlaybackController &&
      secondaryPlaybackController
    ) {
      const primaryNeedsToggle = isPlaying !== primaryAnimationState.isPlaying;
      const secondaryNeedsToggle =
        isPlaying !== secondaryAnimationState.isPlaying;

      if (primaryNeedsToggle) {
        primaryPlaybackController.togglePlayback();
      }
      if (secondaryNeedsToggle) {
        secondaryPlaybackController.togglePlayback();
      }
    }
  });

  // Sync speed with both playback controllers
  $effect(() => {
    if (
      primaryPlaybackController &&
      secondaryPlaybackController &&
      primaryAnimationState.sequenceData &&
      secondaryAnimationState.sequenceData
    ) {
      primaryPlaybackController.setSpeed(speed);
      secondaryPlaybackController.setSpeed(speed);
    }
  });

  // Sync loop + step playback preferences to both per-renderer animation states
  $effect(() => {
    if (
      !primaryAnimationState.sequenceData ||
      !secondaryAnimationState.sequenceData
    )
      return;
    primaryAnimationState.setShouldLoop(shouldLoop);
    secondaryAnimationState.setShouldLoop(shouldLoop);
  });

  $effect(() => {
    if (
      !primaryAnimationState.sequenceData ||
      !secondaryAnimationState.sequenceData
    )
      return;
    if (primaryAnimationState.isPlaying || secondaryAnimationState.isPlaying)
      return;
    primaryAnimationState.setPlaybackMode(playbackMode);
    primaryAnimationState.setStepPlaybackPauseMs(stepPlaybackPauseMs);
    primaryAnimationState.setStepPlaybackStepSize(stepPlaybackStepSize);
    secondaryAnimationState.setPlaybackMode(playbackMode);
    secondaryAnimationState.setStepPlaybackPauseMs(stepPlaybackPauseMs);
    secondaryAnimationState.setStepPlaybackStepSize(stepPlaybackStepSize);
  });

  // Derived: Current step data for primary sequence
  let primaryStepData = $derived.by(() => {
    if (!primaryAnimationState.sequenceData) return null;

    const currentStep = primaryAnimationState.currentStep;

    // Handle start position case explicitly
    if (
      currentStep === 0 &&
      !primaryAnimationState.isPlaying &&
      primaryAnimationState.sequenceData.startPlacement
    ) {
      return primaryAnimationState.sequenceData.startPlacement;
    }

    // For steps, use direct indexing with clamping
    if (
      primaryAnimationState.sequenceData.steps &&
      primaryAnimationState.sequenceData.steps.length > 0
    ) {
      // Beat indexing: steps[0] = beat 1, steps[1] = beat 2, etc.
      // currentStep semantics: beat N's motion spans from N.0 to (N+1).0
      //
      // Formula: ceil(currentStep - 1) gives the beat number whose motion is/was playing
      // - At 3.0 (pause after beat 2): ceil(2.0) = 2, shows beat 2
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(
        stepIndex,
        primaryAnimationState.sequenceData.steps.length - 1
      );
      return primaryAnimationState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });

  // Derived: Current letters for both sequences
  let primaryLetter = $derived.by(() => {
    return primaryStepData?.letter || null;
  });

  let secondaryLetter = $derived.by(() => {
    if (!secondaryAnimationState.sequenceData) return null;

    const currentStep = secondaryAnimationState.currentStep;

    if (
      currentStep === 0 &&
      !secondaryAnimationState.isPlaying &&
      secondaryAnimationState.sequenceData.startPlacement
    ) {
      return secondaryAnimationState.sequenceData.startPlacement.letter || null;
    }

    if (
      secondaryAnimationState.sequenceData.steps &&
      secondaryAnimationState.sequenceData.steps.length > 0
    ) {
      // Beat indexing: steps[0] = beat 1, steps[1] = beat 2, etc.
      // Formula: ceil(currentStep - 1) gives the beat number whose motion is/was playing
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(
        stepIndex,
        secondaryAnimationState.sequenceData.steps.length - 1
      );
      return (
        secondaryAnimationState.sequenceData.steps[clampedIndex]?.letter || null
      );
    }

    return null;
  });

  // Derived: Word for header display (use primary sequence's word)
  let sequenceWord = $derived(
    primaryAnimationState.sequenceData?.word || primarySequence?.word || null
  );
</script>

<div class="tunnel-renderer">
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
  {:else if primarySequence && secondarySequence}
    <CanvasControls canvasId="tunnel" {onOpenSettings} />
    <AnimatorCanvas
      leftProp={primaryLeftVisible && primaryVisible
        ? primaryAnimationState.leftPropState
        : null}
      rightProp={primaryRightVisible && primaryVisible
        ? primaryAnimationState.rightPropState
        : null}
      additionalLayers={additionalLayerProps}
      gridVisible={true}
      gridMode={effectiveGridMode}
      letter={primaryLetter}
      stepData={primaryStepData}
      currentStep={primaryAnimationState.currentStep}
      sequenceData={primaryAnimationState.sequenceData}
      word={sequenceWord}
      {trailSettings}
      {isSeamlesslyLoopable}
    />
  {:else}
    <div class="empty-message">
      <i class="fas fa-video" aria-hidden="true"></i>
      <p>No sequences loaded</p>
    </div>
  {/if}
</div>

<style>
  .tunnel-renderer {
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
    container-name: tunnel-renderer;
  }

  .tunnel-renderer :global(.canvas-wrapper) {
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
