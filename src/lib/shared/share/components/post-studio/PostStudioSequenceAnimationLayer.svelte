<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import SequenceProgressBar from "$lib/shared/animation-engine/components/layers/SequenceProgressBar.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import type {
    PostAnimationItem,
    PostMovesMode,
  } from "$lib/shared/media-composition/domain/post-project";
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
  import {
    copyPostAnimationEffects,
    postAnimationTrailSettings,
  } from "./post-animation-effects.svelte";
  import { sequenceArrowLayers } from "$lib/shared/media-composition/domain/sequence-frame";
  import {
    tunnelHookCopyOpacity,
    type TunnelHook,
  } from "$lib/shared/media-composition/domain/tunnel-hook";
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
  import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { buildTunnelLayers } from "$lib/shared/sequence-viewer/tunnel/tunnel-layer-builder";
  import { sampleTunnelProps } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-sampling";

  let {
    sequence,
    sequencePosition,
    displayedBeatNumber: mappedBeatNumber,
    sequencePassIndex = 0,
    sequenceProgress,
    animationTimeSeconds,
    breakdownMotion = false,
    breakdownMode = "alternate",
    labelsPainted = false,
    playing,
    leftPropType,
    rightPropType,
    animationAppearance = null,
    tunnelHook = null,
    chromeOpacity = 1,
  }: {
    sequence: SequenceData;
    sequencePosition: number;
    displayedBeatNumber?: number;
    sequencePassIndex?: number;
    sequenceProgress?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    breakdownMode?: PostMovesMode;
    /**
     * The post paints the beat number, letter and element icon over this
     * layer, so the animator's own copies would show twice.
     */
    labelsPainted?: boolean;
    playing: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    /** The opening hook: extra performers around the sequence, leaving as it settles. */
    tunnelHook?: { hook: TunnelHook; progress: number } | null;
    /** Grid, glyph, step number and progress strip: 0 during the hook, 1 once they have faded in. */
    chromeOpacity?: number;
  } = $props();

  const inheritedVisibility = getAnimationVisibilityManager();
  let inheritedProgressBar = $state(
    inheritedVisibility.getVisibility("progressBar")
  );
  function syncProgressVisibility(): void {
    inheritedProgressBar = inheritedVisibility.getVisibility("progressBar");
  }
  inheritedVisibility.registerObserver(syncProgressVisibility);
  onDestroy(() =>
    inheritedVisibility.unregisterObserver(syncProgressVisibility)
  );
  const progressVisible = $derived(
    animationAppearance?.progressBar ?? inheritedProgressBar
  );

  const itemVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  if (animationAppearance) {
    itemVisibility.updateSettings({
      ...inheritedVisibility.getSettings(),
      wordHeader: false,
      darkMode: true,
      ...animationAppearance,
    });
  }
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
      itemVisibility.updateSettings({
        ...inheritedVisibility.getSettings(),
        wordHeader: false,
        darkMode: true,
        ...appearance,
      });
      const trail = appearance.trail;
      const effectConfig = copyPostAnimationEffects(
        appearance.effects ?? initialEffects
      );
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
      itemTrailSettings = postAnimationTrailSettings(
        animationSettings.snapshot().trail,
        effectConfig,
        trail
      );
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

  const showMandala = $derived(
    breakdownMotion &&
      (breakdownMode === "mandala" ||
        (breakdownMode === "alternate" && sequencePassIndex % 2 === 1))
  );
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
  const arrowLayers = $derived(
    sequenceArrowLayers(
      {
        phase: beatNumber < 1 ? "opening" : "moving",
        move: beatNumber,
        moveProgress: motionProgress ?? 0,
        pass: sequencePassIndex,
      },
      sequence.steps.length
    )
  );
  const previousArrowData = $derived(
    arrowLayers.previousMove === null
      ? null
      : (sequence.steps[arrowLayers.previousMove - 1] ?? null)
  );

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

  // The hook's extra performers: the sequence under each tunnel arm's
  // transform, built once per sequence and arm layout, then sampled at the
  // layer's own position so they run in lockstep with the red/blue pair.
  /** The hook's extra performers still loading their prop artwork. */
  let hookTexturesPending = $state(false);
  let hookCopies = $state.raw<SequenceData[]>([]);
  $effect(() => {
    const hook = tunnelHook?.hook;
    const target = sequence;
    if (!hook) {
      hookCopies = [];
      hookTexturesPending = false;
      return;
    }
    hookCopies = [];
    hookTexturesPending = true;
    let cancelled = false;
    void buildTunnelLayers(target, {
      ...DEFAULT_CONFIG,
      fold: hook.fold,
      mirror: hook.mirror,
    }).then((built) => {
      if (!cancelled) hookCopies = built;
    });
    return () => {
      cancelled = true;
    };
  });
  const hookLayers = $derived.by((): AdditionalLayerProps[] => {
    if (!tunnelHook || hookCopies.length === 0) return [];
    const progress = tunnelHook.progress;
    return hookCopies.map((copy, index) => {
      const props = sampleTunnelProps(copy, sequencePosition);
      return {
        leftProp: props.left,
        rightProp: props.right,
        opacity: tunnelHookCopyOpacity(progress, index, hookCopies.length),
        leftPropType: propConfig.leftPropType,
        rightPropType: propConfig.rightPropType,
      };
    });
  });
</script>

<div
  class="animation-layer"
  class:light={animationAppearance?.darkMode === false}
  data-studio-animation-destination
  data-studio-animation-mode={showMandala ? "mandala" : "pictograph"}
  data-sequence-position={sequencePosition}
  data-sequence-pass-index={sequencePassIndex}
  data-sequence-progress-visible={progressVisible}
  data-sequence-progress-dark={animationAppearance?.darkMode ?? true}
  data-tunnel-hook-pending={Boolean(tunnelHook) &&
    (hookCopies.length === 0 || hookTexturesPending)}
>
  <div class="animation-stage" use:destination={animationAppearance}>
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
          {#key `${animationAppearance.propType}:${animationAppearance.propLook}`}
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
              propLook={animationAppearance.propLook}
              word={sequence.word}
              previewDarkMode={animationAppearance.darkMode ?? true}
              mandalaStrokeWidthOverride={animationAppearance.mandalaThickness}
              hideProgressBar
              hideHeader={animationAppearance.wordHeader !== true}
              visibilityManagerOverride={itemVisibility}
              effectsConfigState={itemEffects}
              trailSettings={itemTrailSettings}
              fillContainer
              virtualTime={animationTimeSeconds === undefined
                ? undefined
                : animationTimeSeconds * 1000}
            />
          {/key}
        {/if}
        <div class:arrow-overlay={!!animationAppearance}>
          <PictographContainer
            pictographData={stepData}
            motionStartData={startData}
            {motionProgress}
            arrowOpacity={arrowLayers.currentOpacity}
            leftPropTypeOverride={animationAppearance?.propType ?? leftPropType}
            rightPropTypeOverride={animationAppearance?.propType ??
              rightPropType}
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
        <div
          class="outgoing-arrows"
          style:opacity={arrowLayers.previousOpacity}
          data-pictograph-capture-required={arrowLayers.previousOpacity > 0}
          aria-hidden="true"
        >
          <PictographContainer
            pictographData={previousArrowData}
            leftPropTypeOverride={animationAppearance?.propType ?? leftPropType}
            rightPropTypeOverride={animationAppearance?.propType ??
              rightPropType}
            disableTransitions
            darkMode={animationAppearance?.darkMode ?? true}
            transparentBackground
            showProps={false}
            showGrid={false}
            showTKA={false}
            showTnD={false}
            showElemental={false}
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
      {#key `${animationAppearance?.propType}:${animationAppearance?.propLook}`}
        <AnimatorCanvas
          {leftProp}
          {rightProp}
          additionalLayers={hookLayers}
          onAdditionalLayerTextureStatusChange={(status) =>
            (hookTexturesPending =
              Boolean(tunnelHook) &&
              (status.requested === 0 || status.loaded < status.requested))}
          gridVisible={animationAppearance?.gridMode !== "none"}
          {chromeOpacity}
          gridMode={sequence.gridMode ?? null}
          letter={stepData?.letter ?? null}
          {stepData}
          sequenceData={sequence}
          currentStep={sequencePosition}
          isPlaying={playing}
          leftPropType={animationAppearance?.propType ?? leftPropType}
          rightPropType={animationAppearance?.propType ?? rightPropType}
          propLook={animationAppearance?.propLook}
          word={animationAppearance ? sequence.word : null}
          previewDarkMode={animationAppearance?.darkMode ?? true}
          mandalaStrokeWidthOverride={animationAppearance?.mandalaThickness}
          hideProgressBar
          hideHeader={animationAppearance?.wordHeader !== true}
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
  <div
    class="sequence-progress"
    style:opacity={chromeOpacity < 1 ? chromeOpacity : undefined}
  >
    <SequenceProgressBar
      currentStep={sequencePosition}
      totalSteps={sequence.steps.length}
      stepDurations={sequence.steps.map((step) => step.duration ?? 1)}
      normalizedProgress={sequenceProgress}
      visible={progressVisible}
      darkMode={animationAppearance?.darkMode ?? true}
      strip
    />
  </div>
</div>

<style>
  .animation-layer {
    position: relative;
    container-type: size;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #08080c;
  }
  .animation-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  /* The strip owns a full-width row beneath the animation. The stage above
     contracts by exactly its height, keeping notation clear at every size. */
  .sequence-progress {
    flex: none;
    width: 100%;
    z-index: 2;
    pointer-events: none;
  }

  .animation-layer.light {
    background: #fff;
  }
  .pictograph-motion {
    width: 100%;
    height: 100%;
    position: relative;
  }
  .arrow-overlay,
  .outgoing-arrows {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .pictograph-motion > div:not(.arrow-overlay):not(.outgoing-arrows) {
    width: 100%;
    height: 100%;
  }
  .pictograph-motion :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }

  :global(html[data-motion-preference="reduce"]) .outgoing-arrows {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .outgoing-arrows {
      display: none;
    }
  }
</style>
