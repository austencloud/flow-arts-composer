<!--
  PlaySequenceStep - Step 3 of the create tutorial

  Autoplays the user's sequence in AnimatorCanvas (tap to pause/resume, thin
  progress line, no transport scrubber). "Back to card" flips to the static
  ChoreoCard; "Play" returns to the animation. Continue is always available.
-->
<script lang="ts">

import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount, onDestroy } from "svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { createTutorialState } from "../../../state/create-tutorial-state.svelte";
  import {
    createSequenceData,
    type SequenceData,
  } from "$lib/shared/foundation/domain/models/sequence-data";
  import { pictographDataToStepData } from "$lib/shared/pictograph/shared/domain/utils/step-pictograph-conversion";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import {
    createAnimationPanelState,
    type AnimationStateKey,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";

  interface Props {
    onAdvance: () => void;
  }

  const { onAdvance }: Props = $props();

  const isDarkMode = $derived(getSettings().darkMode ?? false);

  // Haptic
  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  // Playback state
  let isPlaying = $state(false);
  let showCard = $state(false);
  let currentStep = $state(0);
  let playbackController: AnimationPlaybackController | null = null;
  const animationState = createAnimationPanelState();
  let stateUnsubscribe: (() => void) | undefined;

  // Build a real SequenceData from the tutorial selections
  function buildTutorialSequence(): SequenceData | null {
    const startPicto = createTutorialState.startPlacement;
    const steps = createTutorialState.steps;
    if (!startPicto || steps.length === 0) return null;

    const startPlacement: StartPlacementData = {
      ...startPicto,
      isStartPlacement: true as const,
    };

    const sequenceSteps = steps.map((step, i) =>
      pictographDataToStepData(step, step.id ?? `tutorial-step-${i}`),
    );

    const word = steps.map((b) => b.letter ?? "").join("");

    return createSequenceData({
      name: "Tutorial",
      word,
      startPlacement,
      steps: sequenceSteps,
      gridMode: createTutorialState.gridMode,
    });
  }

  const tutorialSequence = $derived(buildTutorialSequence());

  // Derive current step data and letter for glyph overlay
  const currentStepData = $derived.by(() => {
    const seq = animationState.sequenceData;
    if (!seq) return null;
    if (currentStep < 1 && seq.startPlacement) return seq.startPlacement;
    if (seq.steps?.length > 0) {
      const idx = Math.min(
        Math.max(0, Math.floor(currentStep) - 1),
        seq.steps.length - 1,
      );
      return seq.steps[idx] || null;
    }
    return null;
  });

  const currentLetter = $derived(currentStepData?.letter || null);

  // Initialize + start playback. Used on mount (autoplay) and when returning
  // from the card view.
  function startPlayback() {
    if (!playbackController || !tutorialSequence) return;
    animationState.setShouldLoop(true);
    const ok = playbackController.initialize(tutorialSequence, animationState);
    if (ok) {
      animationState.setSequenceData(tutorialSequence);
      if (!isPlaying) playbackController.togglePlayback();
    }
  }

  // Tap the canvas to toggle play/pause (thin progress line, no transport).
  function handleToggle() {
    hapticService?.trigger("selection");
    playbackController?.togglePlayback();
  }

  function backToCard() {
    hapticService?.trigger("selection");
    playbackController?.stop();
    currentStep = 0;
    showCard = true;
  }

  function playFromCard() {
    hapticService?.trigger("selection");
    showCard = false;
    startPlayback();
  }

  onMount(() => {
    try {
      playbackController = getAnimationPlaybackController();
    } catch {
      console.warn("Animation playback controller not available");
    }

    // Subscribe to animation state changes
    stateUnsubscribe = animationState.subscribe(
      (key: AnimationStateKey, value: unknown) => {
        if (key === "isPlaying") {
          isPlaying = value as boolean;
        } else if (key === "currentStep") {
          currentStep = value as number;
        }
      },
    );

    // Autoplay on entry.
    startPlayback();
  });

  onDestroy(() => {
    stateUnsubscribe?.();
    playbackController?.dispose(animationState);
    animationState.dispose();
  });
</script>

<div class="tutorial-step">
  <div class="step-header">
    <h1 id="tutorial-step-title" class="title">Your sequence</h1>
    <p class="subtitle">
      {#if showCard}
        Tap Play to watch it.
      {:else if isPlaying}
        Tap to pause.
      {:else}
        Tap to play.
      {/if}
    </p>
  </div>

  <div class="viewer-container">
    {#if !tutorialSequence}
      <p class="loading">Building sequence...</p>
    {:else if showCard}
      <div class="card-pane">
        <!-- Force the start placement into its own left column (not the top row),
             independent of the user's saved layout preference. -->
        <ChoreoCard
          sequence={tutorialSequence}
          darkMode={isDarkMode}
          startPlacementLayoutOverride="column"
        />
      </div>
    {:else}
      <div class="animation-pane">
        <AnimatorCanvas
          sequenceData={animationState.sequenceData}
          currentStep={currentStep}
          isPlaying={isPlaying}
          leftProp={animationState.leftPropState}
          rightProp={animationState.rightPropState}
          gridMode={tutorialSequence.gridMode}
          letter={currentLetter}
          stepData={currentStepData}
          word={tutorialSequence.word}
          focused={true}
          tapToToggle={true}
          progressLine={true}
          onPlaybackToggle={handleToggle}
        />
      </div>
    {/if}
  </div>

  <div class="button-row">
    {#if showCard}
      <button class="ghost-button" onclick={playFromCard}>
        <i class="fas fa-play" aria-hidden="true"></i> Play
      </button>
    {:else}
      <button class="ghost-button" onclick={backToCard}>
        <i class="fas fa-table-cells-large" aria-hidden="true"></i> Back to card
      </button>
    {/if}
    <button class="continue-button" onclick={onAdvance}>
      Continue <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .tutorial-step {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 780px;
    width: 100%;
    text-align: center;
    padding: 20px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .subtitle {
    font-size: 0.95rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
    line-height: 1.5;
  }

  .viewer-container {
    width: 100%;
    height: clamp(300px, 45vh, 550px);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  }

  .animation-pane,
  .card-pane {
    width: 100%;
    height: 100%;
  }

  .animation-pane {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 12px;
  }

  .loading {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.9rem;
    padding: 40px 0;
  }

  .button-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 4px;
  }

  .ghost-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out);
  }

  .ghost-button:hover {
    background: var(--theme-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .ghost-button:focus-visible {
    outline: 2px solid var(--theme-accent-strong, #8b5cf6);
    outline-offset: 2px;
  }

  .continue-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 32px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 40%,
      transparent
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 60%, transparent);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out);
  }

  .continue-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 50%,
      transparent
    );
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 30%, transparent);
  }

  .continue-button:active {
    transform: scale(0.97);
  }

  .continue-button:focus-visible {
    outline: 2px solid var(--theme-accent-strong, #8b5cf6);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .tutorial-step {
      padding: 16px;
      gap: 10px;
    }
    .title {
      font-size: 1.25rem;
    }
    .continue-button {
      padding: 12px 24px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tutorial-step,
    .ghost-button,
    .continue-button {
      transition: none;
    }
    .continue-button:active {
      transform: none;
    }
  }
</style>
