<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { createPlaybackControllerFactory } from "$lib/shared/animation-engine/create-playback-controller-factory";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
  import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    DifficultyLevel,
    GenerationMode,
  } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import {
    LOOPType,
    Period,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { InkIntent } from "$lib/shared/effects/domain/effects-config";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";

  interface Props {
    intent: InkIntent;
    candidateName: string;
  }

  const { intent, candidateName }: Props = $props();
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);
  const animationState = createAnimationPanelState({ ephemeral: true });

  let sequence = $state<SequenceData | null>(null);
  let playbackController: AnimationPlaybackController | null = null;
  let status = $state("Building a rotated LOOP…");
  let errorMessage = $state<string | null>(null);
  let generationRequest = 0;

  $effect(() => {
    const next = structuredClone(DEFAULT_EFFECTS_CONFIG);
    next.ink = structuredClone(intent);
    next.activeEffect = "ink";
    next.tipEffectMap = { "*": { effect: "ink" } };
    untrack(() => effectsConfig.replace(next));
  });

  async function generateLoop(): Promise<void> {
    const request = ++generationRequest;
    const resumePlayback = sequence === null || animationState.isPlaying;
    status = "Building a rotated LOOP…";
    errorMessage = null;
    try {
      let generated: SequenceData | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const candidate = await generationOrchestrator.generateSequence({
          mode: GenerationMode.CIRCULAR,
          length: 8,
          gridMode: GridMode.DIAMOND,
          propType: PropType.STAFF,
          difficulty: DifficultyLevel.INTERMEDIATE,
          loopType: LOOPType.ROTATED,
          period: Period.HALVED,
          constraintPreset: "smooth",
        });
        if (isSeamlesslyLoopable(candidate)) {
          generated = candidate;
          break;
        }
      }

      if (request !== generationRequest) return;
      if (!generated) {
        throw new Error("The generator did not return a closed LOOP.");
      }
      if (!playbackController) {
        throw new Error("The animation controller is unavailable.");
      }

      const initialized = playbackController.initialize(
        generated,
        animationState
      );
      if (!initialized) {
        throw new Error("The animation controller rejected the LOOP.");
      }

      animationState.setShouldLoop(true);
      playbackController.setSpeed(1);
      sequence = generated;
      if (resumePlayback) playbackController.togglePlayback();
      status = `Rotated LOOP · ${generated.steps.length} steps · 60 BPM · staff`;
    } catch (error) {
      if (request !== generationRequest) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      errorMessage = failure.message;
      status = "LOOP unavailable";
      getErrorHandler().showUserError({
        message: "The LOOP preview could not be built.",
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "ink-preset-review",
          action: "generateComparisonSequence",
        },
      });
    }
  }

  onMount(() => {
    playbackController = createPlaybackControllerFactory();
    void generateLoop();
    return () => {
      generationRequest++;
      playbackController?.dispose(animationState);
      playbackController = null;
      animationState.dispose();
    };
  });

  function stepForPlayback(): StepData | null {
    if (!sequence?.steps.length) return null;
    if (animationState.currentStep < 1) {
      return (
        sequence.startPlacement ??
        sequence.startingPlacement ??
        sequence.steps[0] ??
        null
      );
    }

    const stepNumber = Math.ceil(animationState.currentStep - 1);
    const stepIndex = Math.min(
      sequence.steps.length - 1,
      Math.max(0, stepNumber - 1)
    );
    return sequence.steps[stepIndex] ?? null;
  }

  const currentStepData = $derived(stepForPlayback());
  const loopVerified = $derived(
    sequence ? isSeamlesslyLoopable(sequence) : false
  );

  function togglePlayback(): void {
    playbackController?.togglePlayback();
  }
</script>

<section class="production-proof" aria-label="Production-context ink preview">
  <header class="proof-header">
    <span>
      <small>PRODUCTION CONTEXT</small>
      <strong>{candidateName}</strong>
    </span>
    <span class="proof-status">{status}</span>
    <div class="proof-actions">
      <button type="button" onclick={togglePlayback}>
        {animationState.isPlaying ? "Pause" : "Play"}
      </button>
      <button type="button" onclick={() => void generateLoop()}>
        New LOOP
      </button>
    </div>
  </header>

  <div class="stage">
    {#if sequence}
      <AnimatorCanvas
        leftProp={animationState.leftPropState}
        rightProp={animationState.rightPropState}
        leftPropType={String(PropType.STAFF)}
        rightPropType={String(PropType.STAFF)}
        sequenceData={sequence}
        stepData={currentStepData}
        currentStep={animationState.currentStep}
        isPlaying={animationState.isPlaying}
        isSeamlesslyLoopable={loopVerified}
        gridMode={sequence.gridMode ?? GridMode.DIAMOND}
        tipEffectMap={effectsConfig.tipEffectMap}
        effectsConfigState={effectsConfig}
        gridVisible={true}
        previewDarkMode={true}
        hideHeader={true}
        disableContextMenu={true}
        fillContainer={true}
      />
    {:else if errorMessage}
      <div class="empty-state" role="alert">
        <strong>Could not build the comparison motion.</strong>
        <span>{errorMessage}</span>
        <button type="button" onclick={() => void generateLoop()}>
          Try again
        </button>
      </div>
    {:else}
      <div class="empty-state" aria-live="polite">{status}</div>
    {/if}
  </div>
</section>

<style>
  .production-proof {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 16px);
    background: var(--theme-card-bg, #080a10);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.34);
  }

  .proof-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 4.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .proof-header > span:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  small {
    color: var(--theme-accent, #70c7ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  strong {
    font-size: 1rem;
  }

  .proof-status {
    margin-left: auto;
    color: var(--theme-text-secondary, #a8b3c7);
    font-size: var(--font-size-min, 0.875rem);
  }

  .proof-actions {
    display: flex;
    gap: 0.5rem;
  }

  button {
    min-height: 2.75rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--theme-card-bg, #10141d) 88%, white 6%);
    color: var(--theme-text, #f4f7fb);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #70c7ff) 62%,
      transparent
    );
  }

  button:focus-visible {
    outline: 3px solid var(--theme-accent, #70c7ff);
    outline-offset: 2px;
  }

  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: #07080d;
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.7rem;
    padding: 2rem;
    color: var(--theme-text-secondary, #a8b3c7);
    text-align: center;
    font-size: var(--font-size-min, 0.875rem);
  }

  .empty-state span {
    max-width: 32rem;
  }

  @media (max-width: 44rem) {
    .proof-header {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .proof-status {
      order: 3;
      width: 100%;
      margin-left: 0;
    }

    .proof-actions {
      margin-left: auto;
    }
  }

  @media (max-width: 32rem) {
    .proof-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.4rem;
      min-height: 3.75rem;
      padding: 0.55rem 0.65rem;
    }

    .proof-status {
      display: none;
    }

    .proof-actions {
      gap: 0.35rem;
      margin-left: 0;
    }

    button {
      padding-inline: 0.65rem;
    }
  }

  @media (max-height: 32rem) and (min-width: 44.01rem) {
    .production-proof {
      grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr);
      grid-template-rows: 1fr;
    }

    .proof-header {
      align-content: center;
      align-items: flex-start;
      flex-direction: column;
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      border-bottom: 0;
    }

    .proof-status,
    .proof-actions {
      width: 100%;
      margin-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
