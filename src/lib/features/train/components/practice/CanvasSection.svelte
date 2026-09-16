<!--
  CanvasSection.svelte - AnimatorCanvas wrapper for Practice tab

  Displays the PixiJS-powered sequence animation synchronized with beat timing.
  Uses the same animation pattern as SingleRenderer for consistent behavior.
-->
<script lang="ts">

import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import { onMount } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    sequence: SequenceData | null;
    currentStepIndex?: number;
    isPlaying?: boolean;
    isPerforming?: boolean;
    bpm?: number;
    onBrowseSequences?: () => void;
  }

  let {
    sequence = null,
    currentStepIndex = 0,
    isPlaying = false,
    isPerforming = false,
    bpm = 60,
    onBrowseSequences,
  }: Props = $props();

  // Services - using $state for reactivity with $effect
  let playbackController = $state<AnimationPlaybackController | null>(null);
  let pixiReady = $state(false);

  // Animation state - same pattern as SingleRenderer
  const animationState = createAnimationPanelState();

  let isLoading = $state(true);
  let loadError = $state<string | null>(null);

  // Initialize services
  onMount(() => {
    // Get playback controller (available synchronously via ITI)
    try {
      playbackController = getAnimationPlaybackController();
      pixiReady = true;
      isLoading = false;
    } catch (error) {
      console.error("[CanvasSection] Failed to initialize:", error);
      loadError = "Failed to load animation canvas";
      isLoading = false;
    }

    return () => {
      animationState.dispose();
    };
  });

  // Track last sequence to detect changes
  let lastSequenceId: string | null = null;

  // Initialize animation when sequence changes
  $effect(() => {
    // IMPORTANT: Read all reactive dependencies BEFORE any early returns
    // Otherwise Svelte won't track them and the effect won't re-run when they change
    const currentSequence = sequence;
    const controller = playbackController;
    const isPixiReady = pixiReady;

    if (!currentSequence || !controller || !isPixiReady) return;

    // Only reinitialize if sequence actually changed
    if (currentSequence.id === lastSequenceId) return;
    lastSequenceId = currentSequence.id;

    try {
      // Initialize playback controller with sequence and animation state
      const success = controller.initialize(currentSequence, animationState);
      if (success) {
        // Beat 0 = start position in animation system
        controller.jumpToStep(0);
      }
    } catch (error) {
      console.error("[CanvasSection] Error initializing animation:", error);
      loadError = "Failed to load animation canvas";
    }
  });

  // Track the last target beat to prevent duplicate animation calls
  let lastTargetStep: number | null = null;

  // Sync current beat from external source (TrainModePanel timing or grid selection)
  $effect(() => {
    // IMPORTANT: Read all reactive dependencies BEFORE any early returns
    // Otherwise Svelte won't track them and the effect won't re-run when they change
    const currentIndex = currentStepIndex;
    const performing = isPerforming;
    const currentBpm = bpm;

    if (!playbackController || !animationState.sequenceData) return;

    // Animation beat indexing: 0 = start position, 1+ = sequence steps
    // currentStepIndex: -1 = start position, 0+ = steps (0-indexed)
    // Convert: currentStepIndex + 1
    const targetStep = currentIndex + 1;

    // Only trigger animation if the TARGET beat changes (user clicked a different beat)
    // Don't retrigger just because animationState.currentStep changed during animation
    if (targetStep !== lastTargetStep) {
      lastTargetStep = targetStep;

      // Calculate animation duration based on BPM during performance
      // At 60 BPM = 1000ms per beat, use 80% of beat duration for smooth animation
      // For manual selection, use fixed 300ms
      const beatDurationMs = (60 / currentBpm) * 1000;
      const animationDuration = performing ? beatDurationMs * 0.8 : 300;

      // Use linear interpolation during performance for consistent motion,
      // ease-out for manual selection (feels more responsive)
      playbackController.animateToStep(
        targetStep,
        animationDuration,
        performing
      );
    }
  });

  // Derived: Current step data (handles start position and beat indexing correctly)
  const currentStepData = $derived.by(() => {
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
    // currentStep is 1-based: currentStep 1.0-2.0 = beat 1 (uses steps[0])
    if (
      animationState.sequenceData.steps &&
      animationState.sequenceData.steps.length > 0
    ) {
      const stepIndex = Math.max(0, Math.floor(currentStep) - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationState.sequenceData.steps.length - 1
      );
      return animationState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });
</script>

<div class="canvas-section">
  {#if isLoading}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <span>{t('train_loading_animation')}</span>
    </div>
  {:else if loadError}
    <div class="error-state">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>{loadError}</span>
    </div>
  {:else if sequence && pixiReady}
    <AnimatorCanvas
      leftProp={animationState.leftPropState}
      rightProp={animationState.rightPropState}
      gridVisible={true}
      gridMode={animationState.sequenceData?.gridMode ?? null}
      stepData={currentStepData}
      currentStep={animationState.currentStep}
      sequenceData={animationState.sequenceData}
    />
  {:else}
    <div class="empty-state">
      <div class="empty-icon">
        <i class="fas fa-play-circle" aria-hidden="true"></i>
      </div>
      <p class="empty-text">{t('train_no_sequence_selected')}</p>
      {#if onBrowseSequences}
        <button class="browse-btn" onclick={onBrowseSequences}>
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          {t('train_browse')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .canvas-section {
    position: relative;
    aspect-ratio: 1;
    /* Let the square size itself based on available space */
    max-width: 100%;
    max-height: 100%;
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* On mobile (stacked), limit by height */
  @media (max-width: 767px) {
    .canvas-section {
      width: auto;
      height: 100%;
    }
  }

  /* On desktop (side-by-side), limit by width */
  @media (min-width: 768px) {
    .canvas-section {
      width: 100%;
      height: auto;
    }
  }

  /* Loading State */
  .loading-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: color-mix(in srgb, var(--theme-shadow) 30%, transparent);
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.875rem;
  }

  /* Error State */
  .error-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 10%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 80%,
      transparent
    );
    font-size: 0.875rem;
  }

  .error-state i {
    font-size: 1.5rem;
  }

  /* Empty State */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    background: var(--theme-card-bg);
    border: 1px dashed var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 12px;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 15%,
        transparent
      )
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 25%,
        transparent
      );
    border-radius: 12px;
    color: color-mix(in srgb, var(--theme-accent-strong) 80%, transparent);
    font-size: 1.25rem;
  }

  .empty-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .browse-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 40px;
    padding: 0.5rem 1rem;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 20%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 20%,
        transparent
      )
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 8px;
    color: color-mix(in srgb, var(--theme-accent-strong) 90%, transparent);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .browse-btn:hover {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      )
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 50%,
      transparent
    );
    transform: translateY(-1px);
  }

</style>
