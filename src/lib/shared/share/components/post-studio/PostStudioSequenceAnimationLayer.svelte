<script lang="ts">
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
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
    playing,
    leftPropType,
    rightPropType,
  }: {
    sequence: SequenceData;
    sequencePosition: number;
    playing: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
  } = $props();

  const stateManager = new AnimationStateManager();
  const shared = getViewerStudioSurfaces();
  const owner = {};
  function destination(node: HTMLElement) {
    return {
      destroy: shared?.requestCanvas(owner, node, () => ({
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
  const orchestrator = new SequenceAnimationOrchestrator(
    stateManager,
    getViewerAnimationPropConfig
  );
  // Create hands Post Studio a reactive sequence proxy. Ordinary `$state`
  // wraps that value again, so an identity check against the prop never
  // matches and the canvas stays at its empty grid. This value is only a
  // readiness marker; keeping the exact reference lets both Create and the
  // Sequence Viewer drive the same animation layer.
  let initializedSequence = $state.raw<SequenceData | null>(null);
  let leftProp = $state<PropState | null>(null);
  let rightProp = $state<PropState | null>(null);

  const beatNumber = $derived(
    clampDisplayedBeatNumber(
      displayedBeatNumber(sequencePosition, false),
      sequence.steps.length
    )
  );
  const stepData = $derived.by(() => {
    if (beatNumber < 1) {
      return (
        sequence.startPlacement ??
        sequence.startingPlacement ??
        (sequence.steps[0]
          ? createStartPlacementFromBeatStart(sequence.steps[0])
          : null)
      );
    }
    return (
      sequence.steps[Math.min(beatNumber - 1, sequence.steps.length - 1)] ??
      null
    );
  });

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
  data-sequence-position={sequencePosition}
>
  {#if !shared?.ownsCanvas(owner)}
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
</style>
