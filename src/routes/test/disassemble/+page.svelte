<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";

  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import * as propTypeApplier from "$lib/shared/landing/services/prop-type-applier";
  import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";

  const animationState = createAnimationPanelState();
  const visibilityManager = getAnimationVisibilityManager();

  let playbackController: AnimationPlaybackController | null = null;
  let currentSequence = $state<SequenceData | null>(null);
  let ready = $state(false);
  let error = $state<string | null>(null);

  let derivedStartPlacement = $derived.by(() => {
    if (!animationState.sequenceData) return null;
    return startPlacementDeriver.getOrDeriveStartPlacement(animationState.sequenceData);
  });

  let currentLetter = $derived.by(() => {
    if (!animationState.sequenceData) return null;
    const step = animationState.currentStep;
    if (step < 1) return derivedStartPlacement?.letter || null;
    if (animationState.sequenceData.steps?.length > 0) {
      const idx = Math.max(0, Math.min(Math.floor(step) - 1, animationState.sequenceData.steps.length - 1));
      return animationState.sequenceData.steps[idx]?.letter || null;
    }
    return null;
  });

  let currentStepData = $derived.by(() => {
    if (!animationState.sequenceData) return null;
    const step = animationState.currentStep;
    if (step < 1) return derivedStartPlacement || null;
    if (animationState.sequenceData.steps?.length > 0) {
      const idx = Math.max(0, Math.min(Math.floor(step) - 1, animationState.sequenceData.steps.length - 1));
      return animationState.sequenceData.steps[idx] || null;
    }
    return null;
  });

  let gridMode = $derived(animationState.sequenceData?.gridMode ?? null);

  onMount(async () => {
    try {
      visibilityManager.setDarkMode(true);
      playbackController = getAnimationPlaybackController();
      const browseLoader: PublicSequencesLoader = getBrowseLoader();

      // Load sequence metadata, then pick one and load its full data
      const metadata = await browseLoader.loadSequenceMetadata();
      if (metadata.length === 0) {
        error = "No sequences found in browse gallery";
        return;
      }

      // Pick a random one
      const pick = metadata[Math.floor(Math.random() * metadata.length)]!;
      const fullSeq = await browseLoader.loadFullSequenceData(pick.name ?? pick.word ?? "");
      if (!fullSeq || !fullSeq.steps?.length) {
        error = "Failed to load sequence data";
        return;
      }
      const seq = fullSeq;

      currentSequence = seq;
      const prepared = propTypeApplier.applyToSequence(seq, PropType.STAFF);

      animationState.setShouldLoop(true);
      const success = playbackController.initialize(prepared, animationState);
      if (!success) {
        error = "Failed to initialize playback";
        return;
      }

      ready = true;
      await tick();

      animationState.setPlaybackMode("continuous");
      animationState.setCurrentStep(1);
      playbackController.togglePlayback();
    } catch (err) {
      error = String(err);
    }
  });

  onDestroy(() => {
    playbackController?.dispose();
    animationState.dispose();
  });
</script>

<svelte:head>
  <title>Disassemble Test</title>
</svelte:head>

<div class="page">
  <h1>Disassemble/Reassemble Test</h1>
  <p class="hint">Right-click canvas for context menu with Disassemble option</p>

  <div class="canvas-box">
    {#if ready}
      <AnimatorCanvas
        leftProp={animationState.leftPropState}
        rightProp={animationState.rightPropState}
        gridVisible={true}
        {gridMode}
        letter={currentLetter}
        stepData={currentStepData}
        sequenceData={animationState.sequenceData}
        currentStep={animationState.currentStep}
        isPlaying={animationState.isPlaying}
        leftPropType={PropType.STAFF}
        rightPropType={PropType.STAFF}
        word={currentSequence?.word || "TEST"}
        previewDarkMode={true}
        focused={true}
      />
    {:else if error}
      <div class="error">{error}</div>
    {:else}
      <div class="loading">Loading...</div>
    {/if}
  </div>

  <p class="info">
    Sequence: {currentSequence?.word ?? "..."} ({currentSequence?.steps?.length ?? 0} beats)
  </p>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #fff;
    font-family: system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 1.5rem;
    font-weight: 500;
  }

  .hint {
    margin: 0 0 24px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.875rem;
  }

  .canvas-box {
    width: min(90vw, 600px);
    height: min(80vh, 700px);
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    overflow: hidden;
  }

  .info {
    margin: 16px 0 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.875rem;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #f87171;
    padding: 24px;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.4);
  }
</style>
