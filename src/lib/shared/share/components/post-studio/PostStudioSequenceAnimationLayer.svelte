<script lang="ts">
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import PostStudioBreakdownMandala from "./PostStudioBreakdownMandala.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    clampDisplayedBeatNumber,
    displayedBeatNumber,
  } from "$lib/shared/animation-engine/services/step-calculator";
  import { createStartPlacementFromBeatStart } from "$lib/shared/create/services/sequence-transforms";

  let {
    sequence,
    sequencePosition,
    sequencePassIndex = 0,
    animationTimeSeconds,
    breakdownMotion = false,
    playing,
    leftPropType,
    rightPropType,
  }: {
    sequence: SequenceData;
    sequencePosition: number;
    sequencePassIndex?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    playing: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
  } = $props();

  const stateManager = new AnimationStateManager();
  const orchestrator = new SequenceAnimationOrchestrator(
    stateManager,
    getViewerAnimationPropConfig
  );
  const shared = getViewerStudioSurfaces();
  const owner = {};
  function destination(node: HTMLElement) {
    return {
      destroy: breakdownMotion
        ? undefined
        : shared?.requestCanvas(owner, node, () => ({
            sequence,
            position: sequencePosition,
            playing,
            left: leftProp,
            right: rightProp,
            step: stepData,
            leftPropType,
            rightPropType,
          })),
    };
  }
  let initializedSequence = $state.raw<SequenceData | null>(null);
  let leftProp = $state<PropState | null>(null);
  let rightProp = $state<PropState | null>(null);

  const showMandala = $derived(breakdownMotion && sequencePassIndex % 2 === 1);
  const beatNumber = $derived(
    clampDisplayedBeatNumber(
      displayedBeatNumber(sequencePosition, false),
      sequence.steps.length
    )
  );
  const openingPose = $derived(
    sequence.startPlacement ??
      sequence.startingPlacement ??
      (sequence.steps[0]
        ? createStartPlacementFromBeatStart(sequence.steps[0])
        : null)
  );
  const stepData = $derived(
    beatNumber < 1
      ? openingPose
      : (sequence.steps[Math.min(beatNumber - 1, sequence.steps.length - 1)] ??
          null)
  );
  const startData = $derived(
    beatNumber <= 1
      ? openingPose
      : (sequence.steps[beatNumber - 2] ?? openingPose)
  );
  const motionProgress = $derived(
    beatNumber < 1
      ? null
      : Math.max(
          0,
          Math.min(1, sequencePosition - Math.floor(sequencePosition))
        )
  );
  const arrowOpacity = $derived(
    motionProgress === null ? 0 : Math.max(0, 1 - motionProgress)
  );

  $effect(() => {
    const target = sequence;
    initializedSequence = orchestrator.initializeWithDomainData(target)
      ? target
      : null;
  });

  $effect(() => {
    const position = sequencePosition;
    if (initializedSequence !== sequence) return;
    orchestrator.calculateState(position);
    leftProp = stateManager.getLeftPropState();
    rightProp = stateManager.getRightPropState();
  });
</script>

<div
  class="animation-layer"
  use:destination
  data-studio-animation-destination
  data-studio-animation-mode={showMandala ? "mandala" : "pictograph"}
  data-sequence-position={sequencePosition}
  data-sequence-pass-index={sequencePassIndex}
>
  {#if showMandala}
    <PostStudioBreakdownMandala
      {sequence}
      {sequencePosition}
      {leftPropType}
      {rightPropType}
    />
  {:else if breakdownMotion && stepData}
    <div class="pictograph-motion" data-pictograph-motion>
      <PictographContainer
        pictographData={stepData}
        motionStartData={startData}
        {motionProgress}
        {arrowOpacity}
        leftPropTypeOverride={leftPropType}
        rightPropTypeOverride={rightPropType}
        disableTransitions
        darkMode
        showTKA={false}
        showHandPoints={false}
        stepNumberOverride={false}
      />
    </div>
  {:else if !breakdownMotion && !shared?.ownsCanvas(owner)}
    <AnimatorCanvas
      {leftProp}
      {rightProp}
      gridVisible
      gridMode={sequence.gridMode ?? null}
      letter={stepData?.letter ?? null}
      {stepData}
      sequenceData={sequence}
      currentStep={sequencePosition}
      isPlaying={playing}
      {leftPropType}
      {rightPropType}
      word={null}
      previewDarkMode
      hideProgressBar
      hideHeader
      fillContainer
      virtualTime={!breakdownMotion || animationTimeSeconds === undefined
        ? undefined
        : animationTimeSeconds * 1000}
    />
  {/if}
</div>

<style>
  .animation-layer {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #08080c;
  }
  .pictograph-motion {
    width: 100%;
    height: 100%;
  }
  .pictograph-motion :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
