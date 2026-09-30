<script lang="ts">
  import { untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import type { PostAnimationItem } from "$lib/shared/media-composition/domain/post-project";
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
    displayedBeatNumber: mappedBeatNumber,
    sequencePassIndex = 0,
    animationTimeSeconds,
    breakdownMotion = false,
    labelsPainted = false,
    playing,
    leftPropType,
    rightPropType,
    animationAppearance = null,
  }: {
    sequence: SequenceData;
    sequencePosition: number;
    displayedBeatNumber?: number;
    sequencePassIndex?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    /**
     * The post paints the beat number, letter and element icon over this
     * layer, so the animator's own copies would show twice.
     */
    labelsPainted?: boolean;
    playing: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
  } = $props();

  const itemVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  const inheritedEffects = getEffectsConfigContext();
  const initialEffects = inheritedEffects?.snapshot() ?? DEFAULT_EFFECTS_CONFIG;
  const itemEffects = createEffectsConfigState(initialEffects, {
    persist: false,
  });
  let itemTrailSettings = $state(animationSettings.snapshot().trail);
  $effect(() => {
    const appearance = animationAppearance;
    if (!appearance) return;
    untrack(() => {
      itemVisibility.updateSettings(appearance);
      const trail = appearance.trail;
      const effectConfig = structuredClone(appearance.effects ?? initialEffects);
      if (trail && !appearance.effects) {
        effectConfig.trails = {
          ...effectConfig.trails,
          trackingMode: trail.trackingMode,
          thickness: trail.thickness,
          brightness: trail.brightness,
          leftColor: trail.leftColor,
          rightColor: trail.rightColor,
        };
        effectConfig.activeEffect = trail.enabled ? "trails" : "none";
        effectConfig.tipEffectMap = trail.enabled
          ? { "*": { effect: "trails" } }
          : {};
      }
      if (trail) {
        itemTrailSettings = {
          ...animationSettings.snapshot().trail,
          trackingMode: trail.trackingMode,
          tailLength: trail.tailLength,
        };
      }
      itemEffects.replace(effectConfig);
    });
  });

  const propConfig = $derived.by(() => {
    const inherited = getViewerAnimationPropConfig();
    return {
      leftPropType:
        animationAppearance?.propType ?? leftPropType ?? inherited.leftPropType,
      rightPropType:
        animationAppearance?.propType ??
        rightPropType ??
        inherited.rightPropType,
    };
  });
  const stateManager = new AnimationStateManager();
  const orchestrator = new SequenceAnimationOrchestrator(
    stateManager,
    () => propConfig
  );
  $effect(() => {
    const scoped = !!animationAppearance;
    untrack(() =>
      orchestrator.setVisibilityManager(
        scoped ? itemVisibility : getAnimationVisibilityManager()
      )
    );
  });
  const shared = getViewerStudioSurfaces();
  const owner = {};
  function destination(
    node: HTMLElement,
    appearance: PostAnimationItem["animationAppearance"] | null
  ) {
    const connect = (
      current: PostAnimationItem["animationAppearance"] | null
    ) =>
      breakdownMotion || current
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
            labelsPainted,
          }));
    let release = connect(appearance);
    return {
      update(current: PostAnimationItem["animationAppearance"] | null) {
        release?.();
        release = connect(current);
      },
      destroy() {
        release?.();
      },
    };
  }
  let initializedSequence = $state.raw<SequenceData | null>(null);
  let leftProp = $state<PropState | null>(null);
  let rightProp = $state<PropState | null>(null);

  const showMandala = $derived(breakdownMotion && sequencePassIndex % 2 === 1);
  const beatNumber = $derived(
    clampDisplayedBeatNumber(
      mappedBeatNumber ?? displayedBeatNumber(sequencePosition, false),
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
      : Math.max(0, Math.min(1, sequencePosition - beatNumber))
  );
  // The arrow fades in as the move is made, as in the Construct audition.
  const arrowOpacity = $derived(motionProgress ?? 0);

  $effect(() => {
    const target = sequence;
    initializedSequence = untrack(() =>
      orchestrator.initializeWithDomainData(target) ? target : null
    );
  });

  $effect(() => {
    const config = propConfig;
    if (initializedSequence !== sequence) return;
    untrack(() => {
      orchestrator.updatePropTypes(config.leftPropType, config.rightPropType);
      orchestrator.calculateState(sequencePosition);
      leftProp = stateManager.getLeftPropState();
      rightProp = stateManager.getRightPropState();
    });
  });

  $effect(() => {
    const position = sequencePosition;
    // Recalculate prop motion when this item's effort or path settings change
    // while the preview is paused at the same beat.
    void animationAppearance;
    if (initializedSequence !== sequence) return;
    untrack(() => {
      orchestrator.calculateState(position);
      leftProp = stateManager.getLeftPropState();
      rightProp = stateManager.getRightPropState();
    });
  });
</script>

<div
  class="animation-layer"
  class:light={animationAppearance?.darkMode === false}
  use:destination={animationAppearance}
  data-studio-animation-destination
  data-studio-animation-mode={showMandala ? "mandala" : "pictograph"}
  data-sequence-position={sequencePosition}
  data-sequence-pass-index={sequencePassIndex}
>
  {#if showMandala}
    <PostStudioBreakdownMandala
      {sequence}
      {sequencePosition}
      leftPropType={animationAppearance?.propType ?? leftPropType}
      rightPropType={animationAppearance?.propType ?? rightPropType}
      darkMode={animationAppearance?.darkMode ?? true}
    />
  {:else if breakdownMotion && stepData}
    <div class="pictograph-motion" data-pictograph-motion>
      {#if animationAppearance}
        <AnimatorCanvas
          {leftProp}
          {rightProp}
          gridVisible={animationAppearance.gridMode !== "none"}
          gridMode={sequence.gridMode ?? null}
          letter={stepData.letter ?? null}
          {stepData}
          sequenceData={sequence}
          currentStep={sequencePosition}
          isPlaying={playing}
          leftPropType={animationAppearance.propType ?? leftPropType}
          rightPropType={animationAppearance.propType ?? rightPropType}
          word={sequence.word}
          previewDarkMode={animationAppearance.darkMode ?? true}
          hideProgressBar
          visibilityManagerOverride={itemVisibility}
          effectsConfigState={itemEffects}
          trailSettings={itemTrailSettings}
          fillContainer
          virtualTime={animationTimeSeconds === undefined
            ? undefined
            : animationTimeSeconds * 1000}
        />
      {/if}
      <div class:arrow-overlay={!!animationAppearance}>
      <PictographContainer
        pictographData={stepData}
        motionStartData={startData}
        {motionProgress}
        {arrowOpacity}
        leftPropTypeOverride={animationAppearance?.propType ?? leftPropType}
        rightPropTypeOverride={animationAppearance?.propType ?? rightPropType}
        disableTransitions
        darkMode={animationAppearance?.darkMode ?? true}
        transparentBackground={!!animationAppearance}
        showProps={!animationAppearance}
        showGrid={!animationAppearance}
        showTKA={false}
        showTnD={false}
        showPropTnD={false}
        showPlacements={false}
        showHandColorKey={false}
        showReversals={false}
        showNonRadialPoints={false}
        showHandPoints={false}
        stepNumberOverride={false}
      />
      </div>
    </div>
  {:else if !breakdownMotion && (animationAppearance || !shared?.ownsCanvas(owner))}
    <!-- Prop crossfades use clip time, which stands still while paused. A new
         prop starts with its final artwork without advancing the post. -->
    {#key animationAppearance?.propType}
      <AnimatorCanvas
        {leftProp}
        {rightProp}
        gridVisible={animationAppearance?.gridMode !== "none"}
        gridMode={sequence.gridMode ?? null}
        letter={stepData?.letter ?? null}
        {stepData}
        sequenceData={sequence}
        currentStep={sequencePosition}
        isPlaying={playing}
        leftPropType={animationAppearance?.propType ?? leftPropType}
        rightPropType={animationAppearance?.propType ?? rightPropType}
        word={animationAppearance ? sequence.word : null}
        previewDarkMode={animationAppearance?.darkMode ?? true}
        hideProgressBar
        hideHeader={!animationAppearance}
        hideTkaGlyph={labelsPainted && !animationAppearance}
        hideStepNumbers={labelsPainted && !animationAppearance}
        hideElementalGlyph={labelsPainted && !animationAppearance}
        visibilityManagerOverride={animationAppearance
          ? itemVisibility
          : undefined}
        effectsConfigState={animationAppearance ? itemEffects : undefined}
        trailSettings={animationAppearance ? itemTrailSettings : undefined}
        fillContainer
        virtualTime={animationTimeSeconds === undefined
          ? undefined
          : animationTimeSeconds * 1000}
      />
    {/key}
  {/if}
</div>

<style>
  .animation-layer {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #08080c;
  }

  .animation-layer.light {
    background: #fff;
  }
  .pictograph-motion {
    width: 100%;
    height: 100%;
    position: relative;
  }
  .arrow-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .pictograph-motion > div:not(.arrow-overlay) {
    width: 100%;
    height: 100%;
  }
  .pictograph-motion :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
