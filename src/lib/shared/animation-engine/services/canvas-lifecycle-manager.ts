import type { CanvasResizer } from "./canvas-resizer.svelte";
import type { IAnimationRenderLoop } from "$lib/shared/animation-engine/services/IAnimationRenderLoop";
import type { EffectRendererManager } from "./effect-renderer-manager";
import type { TrailCapturer } from "./trail-capturer";
import type { AnimatorCanvasInitializer } from "./animator-canvas-initializer";
import type { IAnimationPrecomputer } from "$lib/shared/animation-engine/services/IAnimationPrecomputer";
import type { AnimationVisibilitySynchronizer } from "./animation-visibility-synchronizer";
import type { GlyphTransitionController } from "./glyph-transition-controller.svelte";
import type { SequenceCache } from "./sequence-cache.svelte";
import type { TrailSettingsSynchronizer } from "./trail-settings-synchronizer.svelte";
import type { PropTypeChanger } from "./prop-type-changer.svelte";
import type { IGlyphTextureLoader } from "$lib/shared/animation-engine/services/IGlyphTextureLoader";
import type { IPropTextureLoader } from "$lib/shared/animation-engine/services/IPropTextureLoader";
import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import type { ISVGGenerator as SVGGenerator } from "$lib/shared/animation-engine/services/ISVGGenerator";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import type { TurnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import type { SequenceAnimationOrchestrator } from "./sequence-animation-orchestrator";
import type { AnimationVisibilityStateManager } from "../state/animation-visibility-state.svelte";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import type { PropSystem } from "./managers/prop-system";
import type { PropPipeline } from "./prop-pipeline";
import type { PropTypeManager } from "./prop-type-manager";
import type { FrameBudgetMonitor } from "./frame-budget-monitor";
import type { AnimationEngineProps, AnimationEngineCallbacks } from "./animation-engine.svelte";
import type { AnimatorState } from "../state/animator-state.svelte";
import type { RenderFrameParams } from "$lib/shared/animation-engine/services/IAnimationRenderLoop";
import { loadAnimatorServices as loadServices } from "./animator-loader";
import { TrailCapturer as TrailCapturerImpl } from "./trail-capturer";
import { SequenceAnimationOrchestrator as SAO } from "./sequence-animation-orchestrator";
import { AnimationStateManager } from "./animation-state-manager";
import { AnimationPrecomputer } from "./animation-precomputer.svelte";
import { CanvasResizer as CanvasResizerImpl } from "./canvas-resizer.svelte";
import { GlyphTextureLoader } from "./glyph-texture-loader.svelte";
import { AnimationRenderLoop } from "./animation-render-loop";
import { GlyphTransitionController as GlyphTransition } from "./glyph-transition-controller.svelte";
import { SequenceCache as SequenceCacheImpl } from "./sequence-cache.svelte";
import { TrailSettingsSynchronizer as TrailSettingsSync } from "./trail-settings-synchronizer.svelte";
import { PropTypeChanger as PropTypeChangerImpl } from "./prop-type-changer.svelte";
import { AnimationVisibilitySynchronizer as VisibilitySync } from "./animation-visibility-synchronizer";
import type { AnimationVisibilityState } from "./animation-visibility-synchronizer";
import { FireTipTracker } from "./fire-tip-tracker";
import { LedSampler } from "./led-sampler";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { MandalaOverlayCanvas } from "$lib/shared/mandala/services/mandala-overlay-canvas";
import { squareFrame } from "../domain/types/canvas-frame";

/**
 * Context passed to CanvasLifecycleManager.initialize().
 *
 * Carries everything the init sequence needs that lives on the engine side:
 * the container, the engine's state object, VM overrides, effect config, and
 * collaborator modules (PropSystem, FrameBudgetMonitor).
 *
 * Callbacks / closures that depend on engine private methods are passed as
 * plain function references so the manager never imports from the engine.
 */
export interface LifecycleInitCtx {
  containerElement: HTMLDivElement;
  visibilityManagerOverride: AnimationVisibilityStateManager | null;
  effectsConfigState: EffectsConfigState | null;
  effectRendererManager: EffectRendererManager;
  propSystem: PropSystem;
  frameBudgetMonitor: FrameBudgetMonitor;
  /** Engine's canvasSize at init time. */
  canvasSize: number;
  /** Live accessor for the engine's lastPropsRef (for render-loop boot). */
  getLastPropsRef: () => AnimationEngineProps | null;
  state: AnimatorState;
  callbacks: AnimationEngineCallbacks;
  /** Engine's prevDarkMode at init time (set before initialize() is called). */
  prevDarkMode: boolean;
  /** Initial grid mode (from lastPropsRef, resolved before calling initialize). */
  initialGridMode: GridMode | null | undefined;
  /** Initial showNonRadialPoints flag (from lastPropsRef). */
  initialShowNonRadialPoints: boolean;
  /** Engine's buildFrameParams bound method — called by render-loop boot. */
  buildFrameParams: (props: AnimationEngineProps) => RenderFrameParams;
  /** Engine's getVM() bound method — passed into erm.wire(). */
  getVM: () => AnimationVisibilityStateManager;
  /** Bound engine handleVisibilityChange — wired to visibility subscriber. */
  onVisibilityChange: (state: AnimationVisibilityState) => void;
  /** Engine instanceId — forwarded to precomputer. */
  instanceId: string;
}

export class CanvasLifecycleManager {
  // ── Services created during init (previously owned by engine) ──────────────
  private _resizer: CanvasResizer | null = null;
  private _renderLoop: IAnimationRenderLoop | null = null;
  private _effectManager: EffectRendererManager | null = null;
  private _trailCapturer: TrailCapturer | null = null;
  private _canvasInitializer: AnimatorCanvasInitializer | null = null;
  private _precomputer: IAnimationPrecomputer | null = null;
  private _visibilitySyncService: AnimationVisibilitySynchronizer | null = null;
  private _glyphTransitionService: GlyphTransitionController | null = null;
  private _sequenceCacheService: SequenceCache | null = null;
  private _trailSettingsSyncService: TrailSettingsSynchronizer | null = null;
  private _propTypeChangeService: PropTypeChanger | null = null;
  private _glyphTextureService: IGlyphTextureLoader | null = null;
  private _propTextureService: IPropTextureLoader | null = null;
  private _unsubscribeVisibility: (() => void) | null = null;
  private _mandalaOverlay: MandalaOverlayCanvas | null = null;
  private _containerElement: HTMLDivElement | null = null;
  private _initialCanvasSize = 0;

  private _animationRenderer: AnimationRenderer | null = null;
  private _svgGenerator: SVGGenerator | null = null;
  private _settingsService: SettingsState | null = null;
  private _orchestrator: SequenceAnimationOrchestrator | null = null;
  private _turnsTupleGenerator: TurnsTupleGenerator | null = null;

  // ── Public getters — the engine reads these instead of its own fields ───────
  get renderLoop(): IAnimationRenderLoop | null { return this._renderLoop; }
  get resizer(): CanvasResizer | null { return this._resizer; }
  get precomputer(): IAnimationPrecomputer | null { return this._precomputer; }
  get glyphTextureLoader(): IGlyphTextureLoader | null { return this._glyphTextureService; }
  get propTextureLoader(): IPropTextureLoader | null { return this._propTextureService; }
  get visibilitySynchronizer(): AnimationVisibilitySynchronizer | null { return this._visibilitySyncService; }
  get glyphTransition(): GlyphTransitionController | null { return this._glyphTransitionService; }
  get sequenceCache(): SequenceCache | null { return this._sequenceCacheService; }
  get trailSettingsSync(): TrailSettingsSynchronizer | null { return this._trailSettingsSyncService; }
  get propTypeChanger(): PropTypeChanger | null { return this._propTypeChangeService; }
  get trailCapturer(): TrailCapturer | null { return this._trailCapturer; }
  get animationRenderer(): AnimationRenderer | null { return this._animationRenderer; }
  get svgGenerator(): SVGGenerator | null { return this._svgGenerator; }
  get settingsService(): SettingsState | null { return this._settingsService; }
  get orchestrator(): SequenceAnimationOrchestrator | null { return this._orchestrator; }
  get turnsTupleGenerator(): TurnsTupleGenerator | null { return this._turnsTupleGenerator; }

  /**
   * Wire the canvasInitializer and effectManager before calling initialize().
   * These two are constructed by the engine (effectManager at engine startup,
   * canvasInitializer at engine startup) and injected here.
   */
  configure(deps: {
    canvasInitializer?: AnimatorCanvasInitializer;
    effectManager?: EffectRendererManager;
  }): void {
    if (deps.canvasInitializer !== undefined) this._canvasInitializer = deps.canvasInitializer;
    if (deps.effectManager !== undefined) this._effectManager = deps.effectManager;
  }

  /**
   * Own the full service-creation and wiring lifecycle.
   *
   * Preserves the exact init ordering that AnimatorCanvasInitializer.initialize()
   * enforced, including the race fix: state.setInitialized(true) fires AFTER
   * the render loop is running (step 10), never before.
   *
   * AnimatorCanvasInitializer is kept as a collaborator (not absorbed) to
   * preserve its destroy-guard / concurrent-init-guard logic.
   */
  async initialize(ctx: LifecycleInitCtx): Promise<void> {
    if (!this._canvasInitializer || !this._effectManager) {
      throw new Error("[CanvasLifecycleManager] configure() must be called before initialize()");
    }

    const {
      containerElement,
      visibilityManagerOverride,
      effectsConfigState,
      effectRendererManager,
      propSystem,
      frameBudgetMonitor,
      canvasSize,
      getLastPropsRef,
      state,
      callbacks,
      prevDarkMode,
      initialGridMode,
      initialShowNonRadialPoints,
      buildFrameParams,
      getVM,
      onVisibilityChange,
      instanceId,
    } = ctx;
    this._containerElement = containerElement;
    this._initialCanvasSize = canvasSize;
    const propPipeline = propSystem.propPipeline;
    const propTypeManager = propSystem.propTypeManager;

    // ── Pre-canvas: create sync services that do not need the renderer ────────
    this._visibilitySyncService = new VisibilitySync(visibilityManagerOverride ?? undefined);
    this._visibilitySyncService.effectsConfigState = effectsConfigState;
    this._unsubscribeVisibility = this._visibilitySyncService.subscribe(onVisibilityChange);

    this._glyphTransitionService = new GlyphTransition();
    this._sequenceCacheService = new SequenceCacheImpl();
    this._trailSettingsSyncService = new TrailSettingsSync();
    this._propTypeChangeService = new PropTypeChangerImpl();

    // These are the bodies of the engine's former initialize*Service methods,
    // now as private manager methods called via the InitializerDependencies
    // contract that AnimatorCanvasInitializer expects.

    const loadAnimatorServicesFn = async (): Promise<boolean> => {
      const loaded = await this._doLoadAnimatorServices(
        state,
        visibilityManagerOverride
      );
      // The first texture load runs before wire(); without settings it would
      // paint the default prop look until the next update swapped it.
      if (loaded) {
        propTypeManager.updateRefs({ settingsService: this._settingsService });
      }
      return loaded;
    };

    const initPrecomputationFn = (): void => {
      this._doInitPrecomputationService(state, canvasSize, instanceId);
    };

    const initPropTextureLoaderFn = (): void => {
      this._doInitPropTextureLoader(state, propPipeline);
    };

    const initResizeServiceFn = (): void => {
      this._doInitResizeService(containerElement, () => startRenderLoopFn());
    };

    const initGlyphTextureLoaderFn = (): void => {
      this._doInitGlyphTextureLoader();
    };

    const initRenderLoopServiceFn = (): void => {
      this._doInitRenderLoopService({
        containerElement,
        effectRendererManager,
        propTypeManager,
        frameBudgetMonitor,
        canvasSize,
        getLastPropsRef,
        buildFrameParams,
        getVM,
        callbacks,
      });
    };

    const loadPropTexturesFn = (): Promise<void> => {
      return propPipeline.loadTextures(state, prevDarkMode);
    };

    const startRenderLoopFn = (): void => {
      this._renderLoop?.triggerRender(() => {
        const props = getLastPropsRef();
        return buildFrameParams(props ?? { leftProp: null, rightProp: null });
      });
    };

    // ── Delegate to AnimatorCanvasInitializer (keeps destroy-guard logic) ─────
    await this._canvasInitializer.initialize(
      {
        containerElement,
        backgroundAlpha: 1,
        gridMode: initialGridMode ?? null,
        showNonRadialPoints: initialShowNonRadialPoints,
        loadAnimatorServices: loadAnimatorServicesFn,
        initializePrecomputationService: () => {
          initPrecomputationFn();
          this._precomputer?.initializeFramePreRenderer();
        },
        initializePropTextureLoader: initPropTextureLoaderFn,
        initializeResizeService: () => {
          initResizeServiceFn();
          this._resizer?.setup();
        },
        initializeGlyphTextureLoader: initGlyphTextureLoaderFn,
        initializeRenderLoopService: initRenderLoopServiceFn,
        loadPropTextures: loadPropTexturesFn,
        startRenderLoop: startRenderLoopFn,
      },
      {
        onPixiLoading: (loading) => state.setRendererLoading(loading),
        onPixiError: (error) => state.setRendererError(error),
        onPixiRendererReady: (renderer) => {
          this._animationRenderer = renderer;
          renderer.setDarkMode(prevDarkMode, false);
        },
        onInitialized: (initialized) => state.setInitialized(initialized),
        onCanvasReady: (canvas) => callbacks.onCanvasReady?.(canvas),
      }
    );
  }

  // ── Private init helpers (former engine initialize*Service methods) ─────────

  private async _doLoadAnimatorServices(
    state: AnimatorState,
    visibilityManagerOverride: AnimationVisibilityStateManager | null
  ): Promise<boolean> {
    const result = loadServices();
    if (!result.success) {
      state.setRendererError(result.error || "Failed to load animator services");
      return false;
    }
    const { services } = result;
    if (!services.svgGenerator) {
      state.setRendererError("Failed to load SVG generator service");
      return false;
    }
    if (!services.TrailCapturer) {
      state.setRendererError("Failed to load trail capture service");
      return false;
    }

    this._svgGenerator = services.svgGenerator;
    this._settingsService = services.settingsService;
    this._orchestrator = new SAO(new AnimationStateManager());
    if (visibilityManagerOverride) {
      this._orchestrator.setVisibilityManager(visibilityManagerOverride);
    }
    this._trailCapturer = new TrailCapturerImpl();
    this._turnsTupleGenerator = services.turnsTupleGenerator;
    state.setServicesReady(true);
    return true;
  }

  private _doInitPrecomputationService(
    state: AnimatorState,
    canvasSize: number,
    instanceId: string
  ): void {
    if (!this._orchestrator) return;
    this._precomputer = new AnimationPrecomputer();
    this._precomputer.initialize({
      orchestrator: this._orchestrator,
      TrailCapturer: this._trailCapturer,
      renderer: this._animationRenderer,
      propDimensions: state.leftPropDimensions,
      canvasSize,
      instanceId,
    });
  }

  private _doInitPropTextureLoader(
    state: AnimatorState,
    propPipeline: PropPipeline
  ): void {
    if (!this._animationRenderer || !this._svgGenerator) {
      state.setRendererError("Cannot initialize PropTextureLoader: missing dependencies");
      return;
    }
    this._propTextureService = propPipeline.initializeTextureLoader(
      this._animationRenderer,
      this._svgGenerator,
      this._trailCapturer
    );
  }

  private _doInitResizeService(
    containerElement: HTMLDivElement,
    redraw: () => void
  ): void {
    if (!this._animationRenderer) return;
    const renderer = this._animationRenderer;
    this._resizer = new CanvasResizerImpl();
    this._resizer.initialize(containerElement, {
      resize: async (size) => {
        await renderer.resize(size);
        // Resizing clears the canvas. A paused player has no next frame to repair it.
        if (this._containerElement === containerElement) redraw();
      },
    });
  }

  private _doInitGlyphTextureLoader(): void {
    if (!this._animationRenderer) return;
    this._glyphTextureService = new GlyphTextureLoader();
    this._glyphTextureService.initialize(this._animationRenderer);
  }

  private _doInitRenderLoopService(params: {
    containerElement: HTMLDivElement;
    effectRendererManager: EffectRendererManager;
    propTypeManager: PropTypeManager;
    frameBudgetMonitor: FrameBudgetMonitor;
    canvasSize: number;
    getLastPropsRef: () => AnimationEngineProps | null;
    buildFrameParams: (props: AnimationEngineProps) => RenderFrameParams;
    getVM: () => AnimationVisibilityStateManager;
    callbacks: AnimationEngineCallbacks;
  }): void {
    if (!this._animationRenderer) return;

    const {
      containerElement,
      effectRendererManager: erm,
      propTypeManager,
      frameBudgetMonitor,
      canvasSize,
      getLastPropsRef,
      buildFrameParams,
      getVM,
      callbacks,
    } = params;

    erm.fireTipTracker = new FireTipTracker();
    erm.ledSampler = new LedSampler();
    // The main renderer was just allocated from this host's real dimensions,
    // but ResizeObserver has not delivered its first callback yet. Seed every
    // overlay consumer with the same frame so a quick viewer cannot stretch a
    // default-square particle canvas across its actual stage.
    const initialFrame = this._resizer?.state.frame ?? squareFrame(canvasSize);

    const renderLoop = new AnimationRenderLoop();
    this._renderLoop = renderLoop;
    renderLoop.initialize({
      renderer: this._animationRenderer,
      TrailCapturer: this._trailCapturer,
      pathCache: this._precomputer?.getPathCache() ?? null,
      canvasSize: initialFrame.size,
      canvasFrame: initialFrame,
      frameBudgetMonitor,
      fireTipTracker: erm.fireTipTracker,
      ledSampler: erm.ledSampler,
      mandalaOverlay: this._mandalaOverlay,
      onEffectError: callbacks.onEffectError,
    });

    erm.wire({
      containerElement,
      canvasSize: initialFrame.size,
      canvasFrame: initialFrame,
      renderLoopService: renderLoop,
      getFrameParams: () => buildFrameParams(getLastPropsRef() ?? { leftProp: null, rightProp: null }),
      getVM,
    });

    propTypeManager.wire({
      settingsService: this._settingsService,
      propTextureService: this._propTextureService,
      trailCapturer: this._trailCapturer,
      renderLoopService: renderLoop,
      precomputationService: this._precomputer,
      propTypeChangeService: this._propTypeChangeService,
      fireTipTracker: erm.fireTipTracker,
      animationRenderer: this._animationRenderer,
    });

    erm.trailOverlay = erm.createTrailOverlay();
    erm.trailOverlay.initialize(
      containerElement,
      initialFrame.width,
      initialFrame.height
    );
    renderLoop.updateConfig({ renderers: { trails: erm.trailOverlay as unknown as import("./effects/effect-renderer").EffectRendererLike } });
    erm.syncEffectLayers();
  }


  pauseResize(): void {
    this._resizer?.pauseObservation();
  }

  resumeResize(): void {
    this._resizer?.resumeObservation();
  }

  /**
   * Lazily own the mandala layer so canvases that leave the feature off pay no
   * DOM or backing-buffer cost. The render loop owns frame drawing, while this
   * manager owns creation, attachment, and disposal.
   */
  syncMandalaOverlay(enabled: boolean): void {
    if (enabled) {
      if (this._mandalaOverlay || !this._containerElement) return;
      const frame = this._resizer?.state.frame;
      const size = frame?.size || this._initialCanvasSize || 500;
      const overlay = new MandalaOverlayCanvas();
      overlay.initialize(
        this._containerElement,
        frame?.width || size,
        frame?.height || size
      );
      this._mandalaOverlay = overlay;
      this._renderLoop?.updateConfig({ mandalaOverlay: overlay });
      return;
    }

    if (!this._mandalaOverlay) return;
    const overlay = this._mandalaOverlay;
    this._mandalaOverlay = null;
    this._renderLoop?.updateConfig({ mandalaOverlay: null });
    overlay.dispose();
  }

  dispose(callbacks?: {
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    onInitialized?: (v: boolean) => void;
  }): void {
    this._unsubscribeVisibility?.();

    this._visibilitySyncService?.dispose();
    this._glyphTransitionService?.dispose();
    this._sequenceCacheService?.dispose();
    this._trailSettingsSyncService?.dispose();
    this._propTypeChangeService?.dispose();

    this._renderLoop?.dispose();
    this._resizer?.teardown();
    this._mandalaOverlay?.dispose();
    this._mandalaOverlay = null;

    this._glyphTextureService?.dispose?.();
    this._propTextureService?.dispose?.();

    this._precomputer?.dispose?.();

    this._effectManager?.dispose();

    this._trailCapturer?.clearTrails();

    if (this._canvasInitializer && callbacks) {
      this._canvasInitializer.destroy({
        onCanvasReady: (canvas) => callbacks.onCanvasReady?.(canvas),
        onInitialized: (initialized) => callbacks.onInitialized?.(initialized),
      });
    }

    this._containerElement = null;
    this._initialCanvasSize = 0;
  }
}
