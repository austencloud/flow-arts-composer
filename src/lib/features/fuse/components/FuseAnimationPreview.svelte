<!--
  The one live canvas in Fuse. The shared Fuse clock supplies a continuous
  step, while this component owns the animation engine and in-place path swaps.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import SplitCanvasView from "#lib/shared/animation-engine/components/SplitCanvasView.svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { createPlaybackControllerFactory } from "#lib/shared/animation-engine/create-playback-controller-factory.js";
  import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
  import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { resolveFusePreviewTrackingMode } from "#lib/features/fuse/services/fuse-preview-trail-config.js";
  import { getFuseDisplay } from "#lib/features/fuse/state/fuse-display.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { ensureMotionData } from "#lib/shared/sequence-viewer/services/sequence-motion-loader.js";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    sequence,
    currentStep = 0,
    isPlaying = false,
    decomposed = false,
    resizing = false,
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
    /** True only while Disassemble or Reassemble is in flight: the hero and
     * its solos travel to their new size instead of jumping. */
    resizing?: boolean;
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
  // What the canvas shows, as Customize sets it. The canonical elemental glyph
  // derives its element from each live step, so a four-step VTG relationship
  // stays steady and a genuinely changing relationship changes with the
  // animation.
  const fuseDisplay = getFuseDisplay();
  // The effects FuseLayout provides: the person's own, which Customize
  // changes. The split solos inherit the same state from context.
  const effectsConfigState = getEffectsConfigContext() ?? undefined;

  const previewTrailSettings = $derived({
    ...animationSettings.trail,
    // The capture point follows the same prop contract as the Choreo Card:
    // unilateral props trace one central tip; bilateral props trace both. The
    // guide and live trail receive this same setting.
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

  // A side panel, the divider or the window can carry the frame across a point
  // where the stylesheet places the solos differently. The hero and its solos
  // glide between the two places from the last size the unit had.
  let unitEl = $state<HTMLElement | null>(null);
  const placementMotion = createLayoutMotion({
    getRoot: () => unitEl,
    groups: [
      { selector: ".canvas-wrap", datasetKey: "hero" },
      { selector: ".split-canvas:first-child", datasetKey: "solo" },
      { selector: ".split-canvas:last-child", datasetKey: "solo" },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
  });

  $effect(() => {
    const unit = unitEl;
    if (!unit || !decomposed || resizing) return;

    const placementNow = () =>
      getComputedStyle(unit).getPropertyValue("--solo-placement").trim();
    let placement = placementNow();
    let gliding = 0;

    const observer = new ResizeObserver(() => {
      const next = placementNow();
      // The phone's Customize moves these boxes with its own view transition.
      const ownMotion = document.documentElement.classList.contains(
        "fuse-customize-motion"
      );
      if (next !== placement) {
        placement = next;
        if (ownMotion || !placementMotion.hasCapture) {
          placementMotion.cancel();
        } else {
          const glide = ++gliding;
          void Promise.allSettled(
            placementMotion.play().map((animation) => animation.finished)
          ).then(() => {
            if (glide !== gliding) return;
            gliding = 0;
            placementMotion.capture();
          });
          return;
        }
      }
      if (gliding === 0 && !ownMotion) placementMotion.capture();
    });
    observer.observe(unit);

    return () => {
      observer.disconnect();
      placementMotion.cancel();
      placementMotion.discard();
    };
  });

  function failInitialization(message: string, cause: unknown): void {
    const failure = cause instanceof Error ? cause : new Error(String(cause));
    error = message;
    loading = false;
    initialized = false;
    onError?.(failure);
  }

  onMount(() => {
    try {
      controller = createPlaybackControllerFactory(fuseDisplay);
    } catch (cause) {
      failInitialization(t("fuse_preview_unavailable"), cause);
    }
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
            t("fuse_preview_unavailable"),
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
              t("fuse_preview_unavailable"),
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
        failInitialization(t("fuse_preview_unavailable"), cause);
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

<div
  class="fuse-animation-preview"
  class:decomposed
  class:resizing
  aria-hidden="true"
>
  {#if loading}
    <div class="state-message">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{t("fuse_preview_preparing")}</span>
    </div>
  {:else if error}
    <div class="state-message error-message">{error}</div>
  {:else}
    <div class="preview-unit" bind:this={unitEl}>
      {#if decomposed}
        <SplitCanvasView
          leftProp={leftPropState}
          rightProp={rightPropState}
          leftPropType={settings.leftPropType}
          rightPropType={settings.rightPropType}
          trailSettings={previewTrailSettings}
          visibilityManagerOverride={fuseDisplay}
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
          {effectsConfigState}
          gridVisible={true}
          {gridMode}
          letter={activeLetter}
          {stepData}
          {sequenceData}
          currentStep={animCurrentStep}
          {isPlaying}
          visibilityManagerOverride={fuseDisplay}
          word={null}
          hideProgressBar={true}
          hideTkaGlyph={false}
          hideStepNumbers={false}
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

  /* Every box below is an explicit length derived from the stage's frame
     track (the `fuse-frame` size container on FusePreviewStage's frame-wrap),
     so Disassemble and Reassemble resize the result instead of swapping one
     arrangement for another. The track, not the frame inside it: the frame
     itself widens during Disassemble, and a hero sized from that moving box
     shrank past its destination and grew back. The frame's 1px border comes
     off both axes. */
  .fuse-animation-preview {
    --solo-gap: var(--settings-spacing-sm, 8px);
    --frame-w: calc(100cqw - 2px);
    --frame-h: calc(100cqh - 2px);
  }

  .preview-unit {
    --solo-placement: flank;
    --hero: min(var(--frame-w), var(--frame-h));
    flex: 0 0 auto;
    width: var(--hero);
    height: var(--hero);
  }

  .canvas-wrap {
    z-index: 1;
    flex: 0 0 auto;
    width: var(--hero);
    height: var(--hero);
  }

  .resizing .preview-unit,
  .resizing .canvas-wrap {
    transition:
      width var(--duration-emphasis) var(--ease-out),
      height var(--duration-emphasis) var(--ease-out);
  }

  /* Disassembled, the combined result stays the hero in the middle and the
     Blue and Red solos flank it. The hero takes the height when the width
     allows a solo of at least 0.3 of it on each side; otherwise the width
     decides (1 / 1.6 of it) and the solos keep that smallest share. Each solo
     then fills its whole flank, up to the hero's own size, so a wide track
     has no empty frame around them. */
  .decomposed .preview-unit {
    --hero: min(
      var(--frame-h),
      calc((var(--frame-w) - 2 * var(--solo-gap)) * 0.625)
    );
    --solo: max(
      0px,
      min(
        var(--hero),
        calc((var(--frame-w) - var(--hero)) / 2 - var(--solo-gap))
      )
    );
    width: calc(var(--hero) + 2 * var(--solo) + 2 * var(--solo-gap));
    height: var(--hero);
  }

  .decomposed .preview-unit :global(.split-canvases) {
    position: absolute;
    inset: 0;
    z-index: 0;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    max-height: none;
  }

  .decomposed .preview-unit :global(.split-canvas) {
    flex: 0 0 auto;
    width: var(--solo);
    height: var(--solo);
  }

  /* A frame less than 1.6 times as wide as it is tall cannot afford a solo on
     each side without shrinking the hero, so the pair stacks in one column
     beside it, Left over Right. One column takes a third of the hero's size
     where two flanks take 0.6 of it: at 954 x 762 the hero is 709 against 586.
     The hero's side of the unit stays its own while the unit widens or narrows
     around it, so it glides to the middle and back. */
  @container fuse-frame (min-aspect-ratio: 1 / 1) and (max-aspect-ratio: 8 / 5) {
    .preview-unit {
      --solo-placement: column;
      justify-content: flex-start;
    }

    .decomposed .preview-unit {
      --hero: min(
        var(--frame-h),
        calc((var(--frame-w) - var(--solo-gap)) * 0.75)
      );
      --solo: max(
        0px,
        min(
          calc((var(--hero) - var(--solo-gap)) / 2),
          calc(var(--frame-w) - var(--hero) - var(--solo-gap))
        )
      );
      width: calc(var(--hero) + var(--solo-gap) + var(--solo));
    }

    .decomposed .preview-unit :global(.split-canvases) {
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: var(--solo-gap);
    }
  }

  /* A frame taller than it is wide (a phone held upright) puts the pair
     beneath the hero: Left under its left half, Right under its right. At 1 / 1
     the two arrangements give the same hero. */
  @container fuse-frame (max-aspect-ratio: 1 / 1) {
    .preview-unit {
      --solo-placement: beneath;
      align-items: flex-start;
    }

    .decomposed .preview-unit {
      --hero: min(
        var(--frame-w),
        calc((var(--frame-h) - var(--solo-gap)) * 0.75)
      );
      --solo: max(
        0px,
        min(
          calc(var(--hero) / 2),
          calc(var(--frame-h) - var(--hero) - var(--solo-gap)),
          calc((var(--frame-w) - var(--solo-gap)) / 2)
        )
      );
      width: var(--hero);
      height: calc(var(--hero) + var(--solo-gap) + var(--solo));
    }

    .decomposed .preview-unit :global(.split-canvases) {
      align-items: flex-end;
      justify-content: center;
      gap: var(--solo-gap);
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

    .resizing .preview-unit,
    .resizing .canvas-wrap {
      transition: none;
    }
  }
</style>
