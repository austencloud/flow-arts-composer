<!--
  Inline Sequence Player Component

  Renders an animated TKA sequence within a message bubble.
  Uses the real animation engine (AnimatorCanvas) with proper SequenceData.
  Generates the sequence client-side using WordSequenceGenerator.
-->
<script lang="ts">

import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
import { getWordSequenceGenerator } from "$lib/features/create/spell/get-word-sequence-generator";
import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
  import { onMount, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import type { WordSequenceGenerator } from "$lib/features/create/spell/services/word-sequence-generator";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import type { InlineSequencePlayer } from "../types";

  // Props
  let {
    sequence,
  }: {
    sequence: InlineSequencePlayer;
  } = $props();

  // Services (resolved from DI container)
  let controller = $state<AnimationPlaybackController | null>(null);
  let sequenceGenerator = $state<WordSequenceGenerator | null>(null);

  // State
  const animState = createAnimationPanelState();
  let loading = $state(true);
  let error = $state<string | null>(null);
  let generatedSequence = $state<SequenceData | null>(null);
  let lastWord = $state<string | null>(null);

  // Derived state for AnimatorCanvas
  const stepData = $derived.by(() => {
    const seq = animState.sequenceData;
    if (!seq) return null;

    // Beat 0 = start position
    if (animState.currentStep < 1) {
      return seq.startPlacement ?? null;
    }

    // Beat 1+ = steps array (convert 1-based to 0-based index)
    const stepIndex = Math.floor(animState.currentStep) - 1;
    const clamped = Math.min(stepIndex, seq.steps.length - 1);
    return seq.steps[clamped] ?? null;
  });

  const letter = $derived(stepData?.letter ?? null);

  // Initialize services on mount
  onMount(() => {
    try {
      controller = getAnimationPlaybackController();
      sequenceGenerator = getWordSequenceGenerator();
      loading = false;
    } catch (err) {
      console.error("[InlineSequencePlayer] Failed to initialize:", err);
      error = "Failed to load animation services";
      loading = false;
    }

    return () => {
      controller?.dispose();
      animState.dispose();
    };
  });

  // Timer handle for auto-play cleanup
  let autoPlayTimer: number | null = null;

  // Schedule a timeout with automatic cleanup on component destroy
  const _timer = window.setTimeout.bind(window);
  const scheduleTimeout = (fn: () => void, ms: number): number => _timer(fn, ms);

  // Watch word changes and generate sequence
  $effect(() => {
    // Read reactive dependencies
    const currentController = controller;
    const currentGenerator = sequenceGenerator;
    const currentWord = sequence.word;

    if (!currentController || !currentGenerator) return;
    if (currentWord === lastWord) return;

    untrack(async () => {
      lastWord = currentWord;
      animState.reset();
      error = null;
      loading = true;

      // Clear any pending auto-play timer from previous run
      if (autoPlayTimer !== null) {
        window.clearTimeout(autoPlayTimer);
        autoPlayTimer = null;
      }

      try {
        // Generate sequence from word using WordSequenceGenerator
        const result = await currentGenerator!.generateFromWord({
          word: currentWord,
          preferences: {
            targetStepCount: null,
            motionTypeFilter: null,
            maxReversals: null,
            highContinuity: false,
            handPathMode: "smooth",
            makeCircular: false,
            selectedLOOPType: null,
            constraintPreset: "smooth",
          },
        });

        if (!result.success || !result.sequence) {
          error = result.error || "Failed to generate sequence";
          loading = false;
          return;
        }

        generatedSequence = result.sequence;

        // Load motion data (enriches with full motion details)
        const fullSeq = await ensureMotionData(result.sequence);
        if (!fullSeq) {
          error = "Failed to load sequence motion data";
          loading = false;
          return;
        }

        const ok = currentController!.initialize(fullSeq, animState);
        if (!ok) {
          error = "Failed to initialize playback";
          loading = false;
          return;
        }

        loading = false;

        // Auto-play after a brief delay
        autoPlayTimer = scheduleTimeout(() => {
          autoPlayTimer = null;
          currentController?.togglePlayback();
        }, 300);
      } catch (err) {
        console.error("[InlineSequencePlayer] Generation error:", err);
        error = err instanceof Error ? err.message : "Animation error";
        loading = false;
      }
    });

    return () => {
      if (autoPlayTimer !== null) {
        window.clearTimeout(autoPlayTimer);
        autoPlayTimer = null;
      }
    };
  });
</script>

<figure class="inline-sequence-player">
  {#if loading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Generating "{sequence.word}"...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{error}</span>
    </div>
  {:else}
    <div class="animation-wrapper">
      <AnimatorCanvas
        leftProp={animState.leftPropState}
        rightProp={animState.rightPropState}
        gridVisible={true}
        gridMode={generatedSequence?.gridMode}
        {letter}
        {stepData}
        sequenceData={animState.sequenceData}
        currentStep={animState.currentStep}
        isPlaying={animState.isPlaying}
        word={sequence.word}
        progressBarVariant="gradient"
      />
    </div>
  {/if}
</figure>

<style>
  .inline-sequence-player {
    margin: 12px 0;
    padding: 0;
    width: 100%;
  }

  .animation-wrapper {
    width: 100%;
    /* Square aspect ratio for the animation canvas */
    aspect-ratio: 1;
    max-width: 400px;
    margin: 0 auto;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px;
    min-height: 200px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: 14px;
  }

  .loading-state i,
  .error-state i {
    font-size: 24px;
  }

  .error-state {
    color: var(--semantic-error, #ef4444);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .loading-state i {
      animation: none;
    }
  }
</style>
