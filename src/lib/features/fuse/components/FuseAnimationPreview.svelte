<!--
  The one live canvas in Fuse. The shared Fuse clock supplies a continuous
  step, while this component owns the animation engine and in-place path swaps.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import SplitCanvasView from "$lib/shared/animation-engine/components/SplitCanvasView.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { createPlaybackControllerFactory } from "$lib/shared/animation-engine/create-playback-controller-factory";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    FUSE_PREVIEW_TIP_EFFECT_MAP,
    resolveFusePreviewTrackingMode,
  } from "$lib/features/fuse/services/fuse-preview-trail-config";
  import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";

  let {
    sequence,
    currentStep = 0,
    isPlaying = false,
    decomposed = false,
    onError,
    onToggle,
    onToggleDecomposed,
  }: {
    sequence: SequenceData;
    currentStep?: number;
    isPlaying?: boolean;
    /** Mobile Fuse presents both editable ingredients and their result as one
     * synchronized animation object. */
    decomposed?: boolean;
    onError?: (error: Error) => void;
    onToggle?: () => void;
    /** Keeps the dedicated Fuse control and the canvas context action on the
     * same split-view state. */
    onToggleDecomposed?: () => void;
  } = $props();

  // The engine boots with a "staff" default and only consults settings after the
  // first paint, crossfading staff->saved a beat in. Passing the saved prop types
  // as explicit overrides makes the first frame render the correct prop, no fade.
  const settings = getSettings();
  const fuseVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  const sharedVisibility = getAnimationVisibilityManager();

  // Fuse owns a few display choices (such as its elemental glyph), but it must
  // not invent a second motion-path setting. Reads and writes of path shape,
  // By Motion, and effort route to the shared manager, so the canvas menu's
  // Path Shape entries change the one setting every surface uses instead of a
  // private copy the props never consult.
  fuseVisibility.setMotionPolicySource(sharedVisibility);

  // The shared manager notifies its own observers on a policy change; this
  // bridge repaints the Fuse canvases for changes made anywhere else.
  function repaintOnSharedChange(): void {
    fuseVisibility.notifyObservers();
  }
  // A classified pair should identify itself while it moves. The canonical
  // canvas glyph derives the element from each live step, so a four-step VTG
  // relationship stays steady and a genuinely changing relationship changes
  // with the animation.
  fuseVisibility.setVisibility("elementalGlyph", true);
  fuseVisibility.setVisibility("tkaGlyph", true);
  const previewTrailSettings = $derived({
    ...animationSettings.trail,
    // Fuse has no trail controls, so its preview follows the same prop contract
    // as the Choreo Card: unilateral props trace one central tip; bilateral
    // props trace both. The guide and live trail receive this same setting.
    trackingMode: resolveFusePreviewTrackingMode(
      settings.leftPropType,
      settings.rightPropType
    ),
  });

  let controller = $state<AnimationPlaybackController | null>(null);
  const animState = createAnimationPanelState({ ephemeral: true });
  let initialized = $state(false);
  let totalSteps = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let initializationGeneration = 0;
  let destroyed = false;
  let hasLoadedSequence = false;

  const animCurrentStep = $derived(animState.currentStep);
  const leftPropState = $derived(animState.leftPropState);
  const rightPropState = $derived(animState.rightPropState);
  const sequenceData = $derived(animState.sequenceData ?? sequence);

  const stepData = $derived.by(() => {
    const activeSequence = sequenceData;
    if (!activeSequence) return null;
    if (animCurrentStep < 1) return activeSequence.startPlacement ?? null;
    const index = Math.min(
      Math.max(0, Math.floor(animCurrentStep) - 1),
      (activeSequence.steps.length || 1) - 1
    );
    return activeSequence.steps[index] ?? null;
  });

  const gridMode = $derived(sequenceData?.gridMode ?? sequence.gridMode);
  const activeLetter = $derived(stepData?.letter ?? null);

  function failInitialization(message: string, cause: unknown): void {
    const failure = cause instanceof Error ? cause : new Error(String(cause));
    error = message;
    loading = false;
    initialized = false;
    onError?.(failure);
  }

  onMount(() => {
    try {
      controller = createPlaybackControllerFactory(fuseVisibility);
    } catch (cause) {
      failInitialization("Preview unavailable", cause);
    }
  });

  onMount(() => {
    sharedVisibility.registerObserver(repaintOnSharedChange);
    return () => sharedVisibility.unregisterObserver(repaintOnSharedChange);
  });

  onDestroy(() => {
    destroyed = true;
    initializationGeneration += 1;
    controller?.dispose();
    animState.dispose();
  });

  $effect(() => {
    const activeController = controller;
    const inputSequence = sequence;
    if (!activeController) return;

    const generation = ++initializationGeneration;
    let cancelled = false;
    error = null;

    // Only the first sequence owns a loading screen. Later Shuffle and Back
    // requests leave the live canvas mounted while the replacement is prepared.
    if (!hasLoadedSequence) {
      loading = true;
      initialized = false;
      totalSteps = 0;
    }

    void (async () => {
      try {
        const fullSequence = await ensureMotionData(inputSequence);
        if (cancelled || destroyed || generation !== initializationGeneration) {
          return;
        }
        if (!fullSequence) {
          failInitialization(
            "Preview unavailable",
            new Error("Sequence motion data could not be loaded")
          );
          return;
        }

        if (hasLoadedSequence) {
          // The controller's update path keeps its owner and canvas alive. The
          // shared Fuse clock is applied immediately below, so only the newly
          // shuffled prop changes position and the other prop stays on beat.
          activeController.updateSequenceData(fullSequence);
        } else {
          animState.reset();
          animState.setShouldLoop(true);
          if (!activeController.initialize(fullSequence, animState)) {
            failInitialization(
              "Preview unavailable",
              new Error("The animation controller rejected the fused sequence")
            );
            return;
          }
          hasLoadedSequence = true;
        }

        totalSteps = fullSequence.steps.length || 1;
        const beat = untrack(() => currentStep);
        const syncedBeat = (beat % totalSteps) + 1;
        activeController.calculateStateForStep(syncedBeat);
        animState.setCurrentStep(syncedBeat);
        initialized = true;
        loading = false;
      } catch (cause) {
        if (cancelled || destroyed || generation !== initializationGeneration) {
          return;
        }
        failInitialization("Preview unavailable", cause);
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  // calculateStateForStep reads the shared clock without starting a second
  // playback loop. Pausing Fuse therefore pauses every visual beat together.
  $effect(() => {
    const beat = currentStep;
    const activeController = controller;
    if (!initialized || !activeController || totalSteps <= 0) return;

    untrack(() => {
      const wrappedBeat = (beat % totalSteps) + 1;
      activeController.calculateStateForStep(wrappedBeat);
      animState.setCurrentStep(wrappedBeat);
    });
  });
</script>

<div class="fuse-animation-preview" class:decomposed aria-hidden="true">
  {#if loading}
    <div class="state-message">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Preparing preview...</span>
    </div>
  {:else if error}
    <div class="state-message error-message">{error}</div>
  {:else}
    <div class="preview-unit">
      {#if decomposed}
        <SplitCanvasView
          leftProp={leftPropState}
          rightProp={rightPropState}
          leftPropType={settings.leftPropType}
          rightPropType={settings.rightPropType}
          trailSettings={previewTrailSettings}
          tipEffectMap={FUSE_PREVIEW_TIP_EFFECT_MAP}
          visibilityManagerOverride={fuseVisibility}
          gridVisible={true}
          {gridMode}
          letter={activeLetter}
          {stepData}
          {sequenceData}
          currentStep={animCurrentStep}
          {isPlaying}
          expandRequested={true}
          resizePaused={false}
        />
      {/if}

      <div class="canvas-wrap">
        <AnimatorCanvas
          leftProp={leftPropState}
          rightProp={rightPropState}
          leftPropType={settings.leftPropType}
          rightPropType={settings.rightPropType}
          trailSettings={previewTrailSettings}
          tipEffectMap={FUSE_PREVIEW_TIP_EFFECT_MAP}
          gridVisible={true}
          {gridMode}
          letter={activeLetter}
          {stepData}
          {sequenceData}
          currentStep={animCurrentStep}
          {isPlaying}
          visibilityManagerOverride={fuseVisibility}
          word={null}
          hideProgressBar={true}
          hideTkaGlyph={false}
          hideStepNumbers={true}
          progressBarVariant="minimal"
          fillContainer={true}
          tapToToggle={true}
          onPlaybackToggle={() => onToggle?.()}
          externalToggleDisassemble={onToggleDecomposed}
          externalDisassembled={decomposed}
          hoverHint="badge"
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .fuse-animation-preview,
  .preview-unit,
  .canvas-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .fuse-animation-preview {
    container: fuse-decomposed-preview / size;
  }

  .preview-unit {
    flex-direction: column;
  }

  .decomposed .preview-unit {
    flex: 0 1 auto;
    width: min(100cqw, calc(100cqh * 2 / 3));
    height: auto;
  }

  .decomposed .canvas-wrap {
    flex: 0 0 auto;
    height: auto;
    aspect-ratio: 1;
  }

  /* Short landscape screens have room beside the result instead of above it.
     Keep the same synchronized canvases, but arrange Blue, Combined, and Red
     as one balanced triptych so the animation uses the available width. */
  @container fuse-decomposed-preview (min-aspect-ratio: 2 / 1) {
    .decomposed .preview-unit {
      flex-direction: row;
      width: min(100cqw, 320cqh);
      height: auto;
      aspect-ratio: 3.2 / 1;
    }

    .decomposed .preview-unit :global(.split-canvases) {
      position: absolute;
      inset: 0;
      z-index: 0;
      justify-content: space-between;
      width: 100%;
      height: 100%;
      max-height: none;
      overflow: visible;
      opacity: 1;
    }

    .decomposed .preview-unit :global(.split-canvas) {
      flex: 0 0 auto;
      width: auto;
      height: 100%;
      aspect-ratio: 1;
    }

    .decomposed .canvas-wrap {
      z-index: 1;
      width: auto;
      height: 100%;
    }
  }

  .state-message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--settings-spacing-sm, 8px);
    min-height: 180px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  .error-message {
    color: var(--semantic-error, #fca5a5);
  }

  @media (prefers-reduced-motion: reduce) {
    .fa-spin {
      animation: none;
    }
  }
</style>
