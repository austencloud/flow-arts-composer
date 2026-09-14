<!--
CanvasSurface.svelte - Non-recursive LEAF render body for AnimatorCanvas

================================================================================
ARCHITECTURAL NOTE
================================================================================

This is the single-canvas render body extracted out of AnimatorCanvas.svelte.

WHY IT EXISTS:
AnimatorCanvas self-imported (`import AnimatorCanvasSelf from "./AnimatorCanvas.svelte"`)
to render its blue-only / red-only split-mode canvases. That self-import — plus the
AnimatorCanvas -> DisassembleCanvasView -> AnimatorCanvas cycle — crashed Vite HMR
(`reading 'default'` + forced full reload on every edit).

CanvasSurface is the cycle-break: a NON-RECURSIVE leaf that owns the engine, the
single `.canvas-wrapper`, and the 2D overlays. It MUST NEVER import
AnimatorCanvas.svelte, DisassembleCanvasView.svelte, DisassembleTransition.svelte,
or any SplitCanvasView. Keep this file leaf-clean.

WHAT IT OWNS:
1. The AnimationEngine instance (created with `new AnimationEngine()` directly).
2. Container element + the `.canvas-wrapper` div.
3. The 2D overlays (GlyphOverlay, PathLinesOverlay, ProgressOverlay).
4. The hidden GlyphRenderer (TKAGlyph -> SVG bridge).
5. Engine lifecycle: init/dispose + RenderContext registry register/unregister.
6. The single $effect that pushes reactive props into engine.update().
7. All engine-driven derivations the overlays consume.

The parent (AnimatorCanvas) binds the engine back out via `bind:engine` so it can
drive pauseResize/resumeResize during the disassemble transition and surface
captureEffectDiagnostics to the context menu.
================================================================================
-->
<script lang="ts">
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { TrailSettings } from "../domain/types/trail-types";
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
  import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
  import GlyphRenderer from "./GlyphRenderer.svelte";
  import GlyphOverlay from "./layers/GlyphOverlay.svelte";
  import PathLinesOverlay from "./layers/PathLinesOverlay.svelte";
  import ProgressOverlay from "./layers/ProgressOverlay.svelte";
  import {
    AnimationEngine,
    type AdditionalLayerTextureStatus,
  } from "../services/animation-engine.svelte";
  import { createRenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";
  import {
    getAnimationVisibilityManager,
    type AnimationVisibilityStateManager,
  } from "../state/animation-visibility-state.svelte";
  import { isSeamlesslyLoopable as sequenceLoopabilityCheck } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import type { FireOverlayConfig } from "../domain/types/fire-types";
  import type { LedOverlayConfig } from "../domain/types/led-types";
  import type {
    TipEffectMap,
    TipEffortMap,
    EffectType,
  } from "../domain/types/tip-effect-types";
  import { untrack, type Snippet } from "svelte";
  import { fireCacheInvalidation } from "../state/fire-invalidation-signal.svelte";
  import { effectErrorSignal } from "../state/effect-error-signal.svelte";
  import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { tryGetViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import { getRenderContextRegistry } from "../get-render-context-registry";
  import { installAnimatorDiagnostics } from "../debug/animator-diagnostics";
  import type { QualityTier } from "../domain/types/quality-types";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { GlyphOverlayFrameMode } from "../domain/glyph-overlay-frame";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";

  let {
    // Engine-driving props
    leftProp,
    rightProp,
    additionalLayers = [],
    preloadAdditionalLayers = [],
    tunnelSpectrum = true,
    tunnelPropColors = null,
    primaryPropColors,
    tunnelSelectedLayer = null,
    gridVisible = true,
    gridOpacity = undefined,
    gridMode = GridMode.DIAMOND,
    backgroundAlpha = 1,
    letter = null,
    stepData = null,
    sequenceData = null,
    currentStep = 0,
    isPlaying = false,
    trailSettings: externalTrailSettings = $bindable(),
    leftPropType = null,
    rightPropType = null,
    fanAppearance = undefined,
    leftBuugengFlipped = undefined,
    rightBuugengFlipped = undefined,
    previewDarkMode = null,
    isSeamlesslyLoopable = undefined,
    showNonRadialPoints = true,
    mandalaVisibleOverride = undefined,
    fireConfig = undefined,
    ledConfig = undefined,
    tipEffectMap: cellTipEffectMap = undefined,
    tipEffortMap: cellTipEffortMap = undefined,
    virtualTime = undefined,
    // Overlay / glyph visibility props (resolved by the parent from the visibility manager)
    hideTkaGlyph = false,
    hideStepNumbers = false,
    beatIndicators = true,
    darkModeEnabled = false,
    effectiveTkaGlyphVisible = false,
    elementalGlyphVisible = false,
    propElementalType = null,
    glyphFrame = "pictograph",
    effectiveBeatNumbersVisible = false,
    positionGlyphVisible = false,
    leftPathLinesVisible = false,
    rightPathLinesVisible = false,
    suppress2DOverlays = false,
    // Engine wiring props
    resizePaused = false,
    visibilityManagerOverride = undefined,
    effectsConfigState = undefined,
    prewarmEffects = undefined,
    contextId = undefined,
    initialQualityTier = undefined,
    // Callbacks
    onCanvasReady = () => {},
    onInitialized = undefined,
    onEffectError = undefined,
    onAdditionalLayerTextureStatusChange = undefined,
    // Bound back to the parent so it can drive resize + diagnostics
    engine = $bindable(),
    // Optional overlay pinned inside the square .canvas-wrapper (position:relative),
    // e.g. a corner play/pause toggle. Anchors to the actual canvas, not the
    // header/progress stack. Undefined → nothing rendered.
    cornerControl = undefined,
  }: {
    leftProp: PropState | null;
    rightProp: PropState | null;
    additionalLayers?: AdditionalLayerProps[];
    preloadAdditionalLayers?: AdditionalLayerProps[];
    tunnelSpectrum?: boolean;
    tunnelPropColors?: TunnelPropColorPair | null;
    /** Embedded teaching surfaces can pin colors without changing saved preferences. */
    primaryPropColors?: TunnelPropColorPair;
    tunnelSelectedLayer?: number | readonly number[] | null;
    gridVisible?: boolean;
    gridOpacity?: number;
    gridMode?: GridMode | null;
    backgroundAlpha?: number;
    letter?: Letter | null;
    stepData?: StartPositionData | StepData | null;
    sequenceData?: SequenceData | null;
    currentStep?: number;
    isPlaying?: boolean;
    trailSettings?: TrailSettings;
    leftPropType?: string | null;
    rightPropType?: string | null;
    fanAppearance?: FanAppearance;
    leftBuugengFlipped?: boolean;
    rightBuugengFlipped?: boolean;
    previewDarkMode?: boolean | null;
    isSeamlesslyLoopable?: boolean;
    showNonRadialPoints?: boolean;
    mandalaVisibleOverride?: boolean;
    fireConfig?: Partial<FireOverlayConfig>;
    ledConfig?: Partial<LedOverlayConfig>;
    tipEffectMap?: TipEffectMap;
    tipEffortMap?: TipEffortMap;
    virtualTime?: number;
    hideTkaGlyph?: boolean;
    hideStepNumbers?: boolean;
    /** Show the canvas's Start/End text overlay. On by default; the guide
     *  showcase turns it off (its on-screen strip already labels the steps). */
    beatIndicators?: boolean;
    darkModeEnabled?: boolean;
    effectiveTkaGlyphVisible?: boolean;
    elementalGlyphVisible?: boolean;
    propElementalType?: ElementalType | null;
    glyphFrame?: GlyphOverlayFrameMode;
    effectiveBeatNumbersVisible?: boolean;
    /** Show the α/β/γ start→end position indicator (guide hand-path exploration). */
    positionGlyphVisible?: boolean;
    leftPathLinesVisible?: boolean;
    rightPathLinesVisible?: boolean;
    suppress2DOverlays?: boolean;
    resizePaused?: boolean;
    visibilityManagerOverride?: AnimationVisibilityStateManager;
    effectsConfigState?: EffectsConfigState;
    /** WebGL overlay effects (today: "fire") to warm at engine startup so the
     *  first switch to them never freezes. Omit on memory-sensitive surfaces. */
    prewarmEffects?: EffectType[];
    contextId?: string;
    /** Optional adaptive-quality ceiling applied before engine startup. */
    initialQualityTier?: QualityTier;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    onInitialized?: () => void;
    onEffectError?: (effectName: string, error: Error) => void;
    onAdditionalLayerTextureStatusChange?: (
      status: AdditionalLayerTextureStatus
    ) => void;
    /** The engine instance, bound back to the parent for resize + diagnostics control. */
    engine?: AnimationEngine;
    /** Optional overlay pinned inside the square canvas (e.g. a corner toggle). */
    cornerControl?: Snippet;
  } = $props();

  const resolvedContextId =
    contextId ?? `canvas-${Math.random().toString(36).slice(2, 8)}`;

  let containerElement: HTMLDivElement | undefined = $state();

  // Engine instance - created here in the leaf and bound back out to the parent.
  function createEngine() {
    const nextEngine = new AnimationEngine();
    if (initialQualityTier) {
      nextEngine.setInitialQualityTier(initialQualityTier);
    }
    return nextEngine;
  }

  let engineInstance = $state(createEngine());
  engine = engineInstance;

  // Off-screen / hidden-tab gating. Every on-screen animated canvas goes
  // through the one owner in `shared/render-gating`: while this surface is
  // scrolled away or the tab is hidden, its rAF stops entirely and the canvas
  // holds its last painted frame. Created here (no DOM work, SSR-safe) and
  // attached once the container element exists. The offscreen export engine is
  // built by `render-context-factory`, never by this component, so it never
  // receives a gate and is never paused.
  let activityGate = createRenderActivityGate({ name: resolvedContextId });
  engineInstance.setActivityGate(activityGate);

  let initializationError = $state<Error | null>(null);
  let retryInitialization = $state<(() => void) | null>(null);

  // Sync 2D overlay suppression (for 3D mode)
  $effect.pre(() => {
    engineInstance.animatorState.setSuppress2DOverlays(suppress2DOverlays);
  });

  // Use $derived to read visibilityManagerOverride reactively (avoids state_referenced_locally)
  const visibilityManager = $derived(
    visibilityManagerOverride ?? getAnimationVisibilityManager()
  );
  $effect.pre(() => {
    // Read through visibilityManager derived (which already tracks visibilityManagerOverride)
    // to avoid capturing the destructured prop directly
    const override =
      visibilityManager !== getAnimationVisibilityManager()
        ? visibilityManager
        : null;
    if (override) {
      engineInstance.setVisibilityManager(override);
    }
  });

  // Fall back to ancestor-provided context when no prop is passed so the
  // customize panel (Zap/Sparkle/Echo/Bloom) actually drives this canvas.
  const inheritedEffectsConfig = getEffectsConfigContext();
  $effect.pre(() => {
    const ecs = effectsConfigState ?? inheritedEffectsConfig ?? null;
    engineInstance.setEffectsConfigState(ecs);
    // Wire to the global VM singleton so the fallback getActiveEffect/setActiveEffect
    // delegates work in UI contexts that don't use the effects-config-context provider.
    getAnimationVisibilityManager().effectsConfigState = ecs;
  });

  // Re-sync the engine whenever effects config changes (fire sliders, presets, etc.).
  // EffectsConfigState mutations don't notify the VM observer, so we bridge here.
  // untrack the notification so observer-triggered mutations don't re-enter this effect.
  $effect(() => {
    const ecs = effectsConfigState ?? inheritedEffectsConfig ?? null;
    if (!ecs) return;
    void ecs.version;
    untrack(() => getAnimationVisibilityManager().notifyObservers());
  });

  // Hover-intent prewarm: when the user points at an effect in the picker,
  // EffectsPanel sets ecs.prewarmHint. Warm that effect's webgl renderer (today:
  // fire) ahead of the click so the switch never freezes. Best-effort — a no-op
  // before init or for non-webgl effects.
  $effect(() => {
    const ecs = effectsConfigState ?? inheritedEffectsConfig ?? null;
    const hint = ecs?.prewarmHint;
    if (!hint) return;
    untrack(() => engineInstance.prewarmEffect(hint));
  });

  // Push viewer-scoped motion visibility into the engine whenever the toggle
  // changes. Reads tryGet so this still works outside the viewer
  // (landing page, browse previews) - context absent → method never called.
  const viewerVisibilityCtx = tryGetViewerVisibilityContext();
  $effect(() => {
    if (!viewerVisibilityCtx) return;
    engineInstance.setMotionVisibility(
      viewerVisibilityCtx.leftMotion,
      viewerVisibilityCtx.rightMotion
    );
  });

  const effectiveIsSeamlesslyLoopable = $derived.by(() => {
    if (isSeamlesslyLoopable !== undefined) return isSeamlesslyLoopable;
    if (!sequenceData) return false;
    return sequenceLoopabilityCheck(sequenceData);
  });

  // When an external caller (e.g. video export orchestrator) signals that the
  // fire frame cache is stale, invalidate it so the simulation re-records.
  let lastFireInvalidationSignal = fireCacheInvalidation.signal;
  $effect(() => {
    const sig = fireCacheInvalidation.signal;
    if (sig !== lastFireInvalidationSignal) {
      lastFireInvalidationSignal = sig;
      const mode = fireCacheInvalidation.mode;
      if (mode === "cacheOnly") {
        untrack(() => engineInstance.invalidateFireFrameCacheOnly());
      } else if (mode === "thermalClear") {
        untrack(() => engineInstance.clearFireThermalFields());
      } else {
        untrack(() => engineInstance.invalidateFireCache());
      }
    }
  });

  // When an overlay effect (fire/charcoal/LED) fails repeatedly, the render loop
  // auto-disables it and fires this signal. Show a warning so the user knows.
  let lastEffectErrorSignal = effectErrorSignal.signal;
  $effect(() => {
    const sig = effectErrorSignal.signal;
    if (sig !== lastEffectErrorSignal) {
      lastEffectErrorSignal = sig;
      const name = effectErrorSignal.effectName;
      const err = effectErrorSignal.error;
      if (name && err) {
        console.warn(
          `[CanvasSurface] ${name} effect was auto-disabled after repeated failures. ` +
            `Toggle the effect off and on to retry. Error: ${err.message}`
        );
        effectErrorSignal.clear();
      }
    }
  });

  // Derived state from engine
  const isInitialized = $derived(engineInstance.animatorState.isInitialized);
  const isPreRendering = $derived(engineInstance.animatorState.isPreRendering);
  const preRenderProgress = $derived(
    engineInstance.animatorState.preRenderProgress
  );
  const preRenderedFramesReady = $derived(
    engineInstance.animatorState.preRenderedFramesReady
  );
  const displayedLetter = $derived(
    engineInstance.animatorState.displayedLetter
  );
  const displayedTurnsTuple = $derived(
    engineInstance.animatorState.displayedTurnsTuple
  );
  const displayedStepNumber = $derived(
    engineInstance.animatorState.displayedStepNumber
  );
  const displayedMusicalPosition = $derived(
    engineInstance.animatorState.displayedMusicalPosition
  );

  // Initialize engine when container element appears.
  // The hero canvas stays mounted always - no teardown during disassemble.
  $effect(() => {
    const el = containerElement;
    if (!el) return;

    const currentEngine = engineInstance;
    const currentActivityGate = activityGate;
    currentActivityGate.attach(el);

    // Register the render context AFTER the (async) engine init resolves.
    // getRenderContext returns null until the awaited lifecycle init has created
    // the renderer/renderLoop/trailCapturer/resizer. The previous queueMicrotask
    // fired before that completed, so getRenderContext returned null and the
    // context was NEVER registered — silently disabling every registry consumer
    // (the export's native-res resize and the export-start trail reset). The
    // `disposed` guard prevents registering a context for an engine that was torn
    // down before init finished.
    let disposed = false;
    let initializationRevision = 0;

    function initialize() {
      const revision = ++initializationRevision;
      initializationError = null;

      untrack(() => {
        void currentEngine
          .initialize(el, {
            onCanvasReady,
            onTrailSettingsChange: (settings) => {
              externalTrailSettings = settings;
            },
            onEffectError,
            prewarmEffects,
          })
          .then(() => {
            if (disposed || revision !== initializationRevision) return;
            const ctx = currentEngine.getRenderContext(resolvedContextId, el);
            if (ctx) {
              getRenderContextRegistry().register(ctx);
            }
          })
          .catch((err) => {
            if (disposed || revision !== initializationRevision) return;
            const failure = err instanceof Error ? err : new Error(String(err));
            initializationError = failure;
            console.error(
              "[CanvasSurface] Animation initialization failed:",
              failure
            );
          });
      });
    }

    retryInitialization = () => {
      initializationError = null;
      activityGate = createRenderActivityGate({ name: resolvedContextId });
      engineInstance = createEngine();
      engineInstance.setActivityGate(activityGate);
      engine = engineInstance;
    };

    initialize();

    // Dev-only: install the LED/fire console diagnostics on window. Gated on
    // import.meta.env.DEV so production never gets these window globals. The
    // teardown removes them when the engine is disposed.
    let disposeDiagnostics: (() => void) | undefined;
    if (import.meta.env.DEV) {
      disposeDiagnostics = installAnimatorDiagnostics(
        engineInstance,
        () => containerElement
      );
    }

    return () => {
      disposed = true;
      ++initializationRevision;
      retryInitialization = null;
      untrack(() => {
        disposeDiagnostics?.();
        currentActivityGate.dispose();
        getRenderContextRegistry().unregister(resolvedContextId);
        currentEngine.dispose();
      });
    };
  });

  // Single effect to pass all props to engine
  $effect(() => {
    // Resizing clears the canvas even while paused. Read the completed-resize
    // signal here so the current pose is repainted without advancing playback.
    if (isInitialized) void engineInstance.canvasResizeCount;
    const currentFireConfig = fireConfig;
    const currentLedConfig = ledConfig;
    const currentCellTipEffectMap = cellTipEffectMap;
    const currentCellTipEffortMap = cellTipEffortMap;
    const props = {
      leftProp,
      rightProp,
      additionalLayers,
      preloadAdditionalLayers,
      onAdditionalLayerTextureStatusChange,
      tunnelSpectrum,
      tunnelPropColors,
      primaryPropColors:
        primaryPropColors ?? getSettings().primaryPropColors ?? null,
      tunnelSelectedLayer,
      gridVisible,
      gridOpacity,
      gridMode,
      backgroundAlpha,
      letter,
      stepData,
      sequenceData,
      currentStep,
      isPlaying,
      externalTrailSettings,
      leftPropType,
      rightPropType,
      fanAppearance,
      leftBuugengFlipped,
      rightBuugengFlipped,
      previewDarkMode,
      isSeamlesslyLoopable,
      virtualTime,
      showNonRadialPoints,
      mandalaVisibleOverride,
    };
    untrack(() => {
      if (currentFireConfig) {
        engineInstance.setFireConfig(currentFireConfig);
      }
      if (currentLedConfig) {
        engineInstance.setLedConfig(currentLedConfig);
      }
      engineInstance.setCellTipEffectMap(currentCellTipEffectMap);
      engineInstance.setCellTipEffortMap(currentCellTipEffortMap);
      engineInstance.update(props);
    });
  });

  $effect(() => {
    if (isInitialized) {
      engineInstance.processPendingGlyph();
      // Wait for the render loop to paint at least one frame before
      // signaling readiness. The initializer sets isInitialized BEFORE
      // starting the render loop (step 8 vs step 10), so without this
      // delay the callback fires while the canvas is still blank.
      untrack(() => {
        if (onInitialized) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              onInitialized?.();
            });
          });
        }
      });
    }
  });

  // Pause/resume resize observation when parent controls it via prop
  $effect(() => {
    if (resizePaused) {
      engineInstance.pauseResize();
    } else {
      engineInstance.resumeResize();
    }
  });

  function handleGlyphSvgReady(
    svgString: string,
    width: number,
    height: number,
    x: number,
    y: number
  ) {
    engineInstance.handleGlyphSvgReady(svgString, width, height, x, y);
  }
</script>

<!-- Hidden GlyphRenderer that converts TKAGlyph to SVG for Canvas2D rendering -->
{#if letter}
  <GlyphRenderer {letter} {stepData} onSvgReady={handleGlyphSvgReady} />
{/if}

<div
  class="canvas-wrapper"
  bind:this={containerElement}
  data-transparent={backgroundAlpha === 0 ? "true" : "false"}
  data-dark-mode={darkModeEnabled ? "true" : "false"}
>
  {#if !suppress2DOverlays}
    <GlyphOverlay
      {letter}
      {displayedLetter}
      {displayedTurnsTuple}
      {displayedStepNumber}
      {displayedMusicalPosition}
      {stepData}
      tkaGlyphVisible={effectiveTkaGlyphVisible}
      {elementalGlyphVisible}
      {propElementalType}
      {glyphFrame}
      stepNumbersVisible={effectiveBeatNumbersVisible}
      {positionGlyphVisible}
      darkMode={darkModeEnabled}
      isAtStartPosition={beatIndicators &&
        !hideStepNumbers &&
        currentStep < 1 &&
        sequenceData !== null}
      isAtEndPosition={beatIndicators &&
        !hideStepNumbers &&
        sequenceData !== null &&
        !effectiveIsSeamlesslyLoopable &&
        currentStep >= (sequenceData.steps?.length ?? 0) + 0.99}
    />

    <!-- Always mounted: PathLinesOverlay self-gates on showLeft/showRight and owns
         its own fade in/out, so the overlay must stay in the tree for its
         out-transition to play when the Paths toggle flips off. -->
    <PathLinesOverlay
      {primaryPropColors}
      {sequenceData}
      {currentStep}
      {stepData}
      showLeft={leftPathLinesVisible}
      showRight={rightPathLinesVisible}
      vm={visibilityManager}
    />

    <ProgressOverlay
      {isPreRendering}
      {preRenderProgress}
      {preRenderedFramesReady}
    />
  {/if}

  {@render cornerControl?.()}

  {#if initializationError}
    <div class="initialization-error">
      <PanelState
        type="error"
        title="Animation unavailable"
        message="The animation could not start."
        onretry={() => retryInitialization?.()}
        compact
      />
    </div>
  {/if}
</div>

<style>
  /* Canvas wrapper: square in portrait mode. Owns the background color so the
     main canvas can stay transparent - effect overlays at z<3 sit between this
     background and the main canvas's opaque prop pixels. */
  .canvas-wrapper {
    position: relative;
    width: 100%;
    /* Square: height = width using container query */
    height: 100cqw;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .canvas-wrapper[data-dark-mode="true"] {
    background: #0a0a0f;
  }

  .canvas-wrapper[data-transparent="true"] {
    background: transparent;
  }

  .canvas-wrapper :global(canvas) {
    background: transparent;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .initialization-error {
    position: absolute;
    inset: 0;
    z-index: 6;
    display: grid;
    place-items: center;
    background: var(--theme-panel-bg, #f5f5f5);
  }

  @media (prefers-reduced-motion: reduce) {
    .canvas-wrapper,
    .canvas-wrapper :global(canvas) {
      transition: none;
    }
  }
</style>
