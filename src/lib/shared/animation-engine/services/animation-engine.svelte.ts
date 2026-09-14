/**
 * AnimationEngine - Pure TypeScript orchestration for canvas animation
 *
 * This class is a thin façade. Per-update render orchestration lives in
 * PlaybackSync; effect, prop, and frame subsystems are in their respective
 * managers. This class wires them together and exposes the public API.
 *
 * Extraction history:
 *   P1.1 CanvasLifecycleManager — service creation + wiring
 *   P1.2 PropSystem             — prop pipeline + dark-mode
 *   P1.3 FrameSystem            — per-frame params + glyph sync
 *   P1.4 EffectSystem           — 14 overlay renderers + effect sync
 *   P1.5 PlaybackSync           — per-update orchestration (completes P1)
 */

import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { type TrailSettings } from "../domain/types/trail-types";
import type { AdditionalLayerProps } from "../domain/types/trail-capture-types";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "../state/animation-visibility-state.svelte";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { TipEffortMap } from "../domain/types/tip-effect-types";

// Services
import { DEFAULT_CANVAS_SIZE } from "./canvas-resizer.svelte";
import { FrameBudgetMonitor } from "./frame-budget-monitor";
import { detectDeviceTier } from "./device-tier-detector";
import type { QualityTier } from "../domain/types/quality-types";
import { AnimatorCanvasInitializer } from "./animator-canvas-initializer";
import type { FireOverlayConfig } from "../domain/types/fire-types";
import type { LedOverlayConfig } from "../domain/types/led-types";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";

import { LiveRenderContext } from "./render-context";
import type { RenderContext } from "./render-context-registry";
import type { RenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";

// Extracted modules
import {
  CanvasLifecycleManager,
  type LifecycleInitCtx,
} from "./canvas-lifecycle-manager";
import { PropSystem } from "./managers/prop-system";
import { FrameSystem } from "./managers/frame-system";
import { EffectSystem } from "./managers/effect-system";
import { PlaybackSync } from "./managers/playback-sync";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import {
  createAnimatorState,
  type AnimatorState,
} from "../state/animator-state.svelte";

// ── Effects helper utility (used by initialize + hasEffectInMap) ────────────

/** Returns true if any entry in the map has the given effect type. */
function hasEffectInMap(
  map: TipEffectMap | undefined,
  effect: string
): boolean {
  if (!map) return false;
  return Object.values(map).some((a) => a.effect === effect);
}

/**
 * Props passed to engine.update()
 */
export interface AnimationEngineProps {
  leftProp: PropState | null;
  rightProp: PropState | null;
  additionalLayers?: AdditionalLayerProps[];
  /** Layers whose prop sprites should be ready before they enter a frame. */
  preloadAdditionalLayers?: AdditionalLayerProps[];
  onAdditionalLayerTextureStatusChange?: (
    status: AdditionalLayerTextureStatus
  ) => void;
  gridVisible?: boolean;
  /** Direct grid alpha for a host-owned transition. Undefined keeps the
   * renderer's ordinary visibility-toggle fade. */
  gridOpacity?: number;
  gridMode?: GridMode | null;
  backgroundAlpha?: number;
  letter?: Letter | null;
  stepData?: StartPositionData | StepData | null;
  sequenceData?: SequenceData | null;
  currentStep?: number;
  isPlaying?: boolean;
  externalTrailSettings?: TrailSettings;
  // Prop type overrides - bypass settings when provided (useful for demos/previews)
  leftPropType?: string | null;
  rightPropType?: string | null;
  /** Visual fan build. The notation prop remains fan/bigfan. */
  fanAppearance?: FanAppearance;
  /** Per-document chirality overrides for isolated editors/previews. */
  leftBuugengFlipped?: boolean;
  rightBuugengFlipped?: boolean;
  // Preview-only dark mode override - when provided, bypasses global setting
  // Used in sequence viewer preview so dark mode toggle doesn't affect global app state
  previewDarkMode?: boolean | null;
  // Whether sequence returns to start position - controls trail clearing on loop
  isSeamlesslyLoopable?: boolean;
  /** Virtual time for this frame (in ms). Used during video export. */
  virtualTime?: number;
  /** When false, hides nonradial (layer2/intercardinal) grid points. Default true. */
  showNonRadialPoints?: boolean;
  /** Per-canvas override for the engine-aligned mandala guide. Split views use
   *  this to keep their isolated guide visible without changing user settings. */
  mandalaVisibleOverride?: boolean;
  /** Tunnel per-prop rainbow spectrum. When true (default) each overlaid layer
   *  takes its own spectrum color; when false layers inherit the base/preset
   *  colors. Only meaningful when additionalLayers is non-empty. */
  tunnelSpectrum?: boolean;
  /** Exact Left/Right colors for Custom Tunnel mode. */
  tunnelPropColors?: TunnelPropColorPair | null;
  primaryPropColors?: TunnelPropColorPair | null;
  /** Tunnel performer spotlight: the selected performer (0 = base, k = copy arm
   *  k), or null. When set, every other copy dims in the render. Default null. */
  tunnelSelectedLayer?: number | readonly number[] | null;
}

export interface AdditionalLayerTextureStatus {
  requested: number;
  loaded: number;
  loading: number;
}

/**
 * Default props for initial render (when no props have been passed yet)
 */
const DEFAULT_ENGINE_PROPS: AnimationEngineProps = {
  leftProp: null,
  rightProp: null,
};

/**
 * Callbacks for component to receive events
 */
export interface AnimationEngineCallbacks {
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onTrailSettingsChange?: (settings: TrailSettings) => void;
  /** Called when an effect (fire/charcoal/LED) fails repeatedly and is auto-disabled */
  onEffectError?: (effectName: string, error: Error) => void;
  /**
   * Webgl overlay effects to warm during startup (currently only "fire" is an
   * actionable webgl overlay). Their GL context + FBOs are created at the end of
   * initialize() — while nothing is animating yet — and parked warm, so the first
   * switch to that effect is instant instead of freezing the props. Surfaces that
   * want to stay memory-light (production viewer) omit this and rely on
   * hover-intent prewarm instead. Non-webgl ids are harmless no-ops.
   */
  prewarmEffects?: EffectType[];
}

export class AnimationEngine {
  // REACTIVE STATE - Component derives from this
  private readonly _animatorState = createAnimatorState();

  get state(): AnimatorState {
    return this._animatorState;
  }
  get animatorState(): AnimatorState {
    return this._animatorState;
  }

  private readonly lifecycleManager = new CanvasLifecycleManager();
  private readonly effectSystem = new EffectSystem(this._animatorState, {
    lifecycleManager: this.lifecycleManager,
  });
  private readonly propSystem = new PropSystem(this._animatorState, {
    lifecycleManager: this.lifecycleManager,
  });
  private readonly frameSystem = new FrameSystem(this._animatorState, {
    lifecycleManager: this.lifecycleManager,
    propSystem: this.propSystem,
  });

  // canvasSize is owned by PlaybackSync (via getCanvasSize/setCanvasSize closures below).
  // We keep a local field so the engine can read it in captureEffectDiagnostics and
  // pass the initial value into the lifecycle ctx — PlaybackSync keeps it up to date.
  private _canvasSize: number = DEFAULT_CANVAS_SIZE;

  private readonly playbackSync = new PlaybackSync(this._animatorState, {
    lifecycleManager: this.lifecycleManager,
    propSystem: this.propSystem,
    frameSystem: this.frameSystem,
    effectSystem: this.effectSystem,
    getVM: () => this.getVM(),
    getCallbacks: () => this.callbacks,
    getCanvasSize: () => this._canvasSize,
    setCanvasSize: (s) => {
      this._canvasSize = s;
    },
    buildFrameDeps: () => this.buildFrameDeps(),
  });

  private readonly canvasInitializer = new AnimatorCanvasInitializer();
  private readonly frameBudgetMonitor: FrameBudgetMonitor =
    new FrameBudgetMonitor(detectDeviceTier());

  private containerElement: HTMLDivElement | null = null;
  /**
   * Canonical off-screen / hidden-tab gate for this engine's render loop.
   * Set by the on-screen host (CanvasSurface) before or after initialize();
   * the offscreen export engine never sets one, so its deterministic driver is
   * never paused for being parked at left:-9999px.
   */
  private activityGate: RenderActivityGate | null = null;
  private callbacks: AnimationEngineCallbacks = {};
  private instanceId = Math.random().toString(36).substring(2, 8);
  /** Per-instance visibility manager override. When set, this engine uses its own
   * manager instead of the global singleton, allowing multiple canvases to have
   * independent visibility/effect settings. */
  private visibilityManagerOverride: AnimationVisibilityStateManager | null =
    null;
  private unsubscribeVisibility: (() => void) | null = null;

  /** Per-performer effort resolver. When set, getEffortForPerformer() calls it
   *  instead of reading the global visibility manager. */
  private _performerEffortResolver: ((performerId: string) => EffortId) | null =
    null;

  /**
   * Set a per-instance visibility manager override. Must be called before
   * initialize() so that the engine (and its sub-services) read from the
   * correct manager from the start.
   */
  setVisibilityManager(manager: AnimationVisibilityStateManager): void {
    this.visibilityManagerOverride = manager;
  }

  /** Set the adaptive quality ceiling before this engine initializes. */
  setInitialQualityTier(tier: QualityTier): void {
    if (this.state.isInitialized) return;
    this.frameBudgetMonitor.setMaximumTier(tier);
  }

  /**
   * Seed the initial canvas size. Must be called before initialize() so the
   * canvas + every overlay (trail, fire, led) is created at this size from the
   * first frame. Without it the engine boots at DEFAULT_CANVAS_SIZE and only
   * reaches the container's real size via the async ResizeObserver — which, for
   * a fresh offscreen export engine, fires mid-export and wipes the trail ring
   * buffers + upscales the early frames. Live canvases don't hit this because
   * they settle long before any export. No-op once initialized.
   */
  setInitialCanvasSize(size: number): void {
    if (this.state.isInitialized) return;
    if (size > 0) this._canvasSize = size;
  }

  get canvasResizeCount(): number {
    return this.lifecycleManager.resizer?.state.resizeCount ?? 0;
  }

  /**
   * Wire the shared EffectsConfigState so the engine reads live per-effect
   * intents (zap, etc.) from the same source the Customize panels write to.
   *
   * Pass null to detach (falls back to DEFAULT_EFFECTS_CONFIG-resolved values).
   * Call before initialize() so first-frame render uses the correct params.
   */
  setEffectsConfigState(state: EffectsConfigState | null): void {
    this.effectSystem.setEffectsConfigState(state);
    const vss = this.lifecycleManager.visibilitySynchronizer;
    if (vss) {
      vss.effectsConfigState = state;
    }
  }

  /**
   * Update motion visibility from the viewer-scoped state.
   * Called by AnimatorCanvas whenever the user toggles Blue/Red in the
   * header popover. Mutates the engine's internal visibilityState so the
   * next render frame reflects it. Also triggers an immediate re-render
   * so the change takes effect without waiting for the next animation tick.
   */
  setMotionVisibility(left: boolean, right: boolean): void {
    if (
      this.state.leftMotionVisible === left &&
      this.state.rightMotionVisible === right
    ) {
      return;
    }
    this.state.setMotionVisibility(left, right);
    if (this.state.isInitialized) {
      this.lifecycleManager.renderLoop?.triggerRender(() =>
        this.frameSystem.buildFrameParams(
          this.playbackSync.lastPropsRef ?? DEFAULT_ENGINE_PROPS,
          this.buildFrameDeps()
        )
      );
    }
  }

  /**
   * Set a per-performer effort resolver. When set, getEffortForPerformer()
   * calls the resolver instead of reading the global visibility manager.
   * Pass null to clear and restore global-fallback behavior.
   */
  setPerformerEffortResolver(
    resolver: ((performerId: string) => EffortId) | null
  ): void {
    this._performerEffortResolver = resolver;
  }

  /**
   * Return the effort preset for a given performer.
   * Uses the per-performer resolver when set; falls back to the global
   * visibility manager otherwise.
   */
  getEffortForPerformer(performerId: string): EffortId {
    if (this._performerEffortResolver) {
      return this._performerEffortResolver(performerId);
    }
    return this.getVM().getEffortPreset();
  }

  /** Return the per-instance override if set, otherwise the global singleton. */
  private getVM(): AnimationVisibilityStateManager {
    return this.visibilityManagerOverride ?? getAnimationVisibilityManager();
  }

  /**
   * Initialize the engine with a container element.
   *
   * Assembles the LifecycleInitCtx and delegates all service creation/wiring to
   * CanvasLifecycleManager.initialize(). The engine retains only the state,
   * callbacks, and collaborator modules it needs for update() / dispose().
   */
  async initialize(
    containerElement: HTMLDivElement,
    callbacks: AnimationEngineCallbacks = {}
  ): Promise<void> {
    this.containerElement = containerElement;
    this.callbacks = callbacks;

    this.lifecycleManager.configure({
      canvasInitializer: this.canvasInitializer,
      effectManager: this.effectSystem.rendererManager,
    });

    // Initialize visibility manager prev-state flags.
    const vm = this.getVM();
    const ecs = this.effectSystem.effectsConfigState;
    this.propSystem.initPrevDarkMode(vm.isDarkMode());

    // PlaybackSync owns prevTrailsActive / prevPropsVisible
    this.playbackSync.setPrevTrailsActive(
      hasEffectInMap(ecs?.tipEffectMap, "trails")
    );
    this.playbackSync.setPrevPropsVisible(vm.getVisibility("props"));

    // Initialize effect-system prev-state (fire sliders, charcoal, effort, ERM flags)
    this.effectSystem.initPrevState(ecs);

    this.state.setVisibilityState({
      grid: vm.getGridMode() !== "none",
      stepNumbers: vm.getVisibility("stepNumbers"),
      props: vm.getVisibility("props"),
      trails: hasEffectInMap(ecs?.tipEffectMap, "trails"),
      tkaGlyph: vm.getVisibility("tkaGlyph"),
      elementalGlyph: vm.getVisibility("elementalGlyph"),
      darkMode: vm.isDarkMode(),
      wordHeader: vm.getVisibility("wordHeader"),
      mandala: vm.getVisibility("mandala"),
      activeEffect: (ecs?.activeEffect ?? "none") as EffectType,
      tipEffectMap: ecs?.tipEffectMap ?? {},
    });

    // Build the init context and delegate service creation to the manager.
    const ctx: LifecycleInitCtx = {
      containerElement,
      visibilityManagerOverride: this.visibilityManagerOverride,
      effectsConfigState: this.effectSystem.effectsConfigState,
      effectRendererManager: this.effectSystem.rendererManager,
      propSystem: this.propSystem,
      frameBudgetMonitor: this.frameBudgetMonitor,
      canvasSize: this._canvasSize,
      getLastPropsRef: () => this.playbackSync.lastPropsRef,
      state: this._animatorState,
      callbacks,
      prevDarkMode: this.propSystem.prevDarkMode,
      initialGridMode: this.playbackSync.lastPropsRef?.gridMode,
      initialShowNonRadialPoints:
        this.playbackSync.lastPropsRef?.showNonRadialPoints ?? true,
      buildFrameParams: (props) =>
        this.frameSystem.buildFrameParams(props, this.buildFrameDeps()),
      getVM: () => this.getVM(),
      onVisibilityChange: (state) =>
        this.playbackSync.handleVisibilityChange(state),
      instanceId: this.instanceId,
    };

    await this.lifecycleManager.initialize(ctx);

    // The render loop only exists after the lifecycle manager builds it, so a
    // gate handed to the engine before initialize() is applied here.
    this.lifecycleManager.renderLoop?.setActivityGate(this.activityGate);

    // Sync previousGridMode with the grid texture loaded during initialization.
    const initGridMode =
      this.playbackSync.lastPropsRef?.gridMode?.toString() ?? "diamond";
    this.playbackSync.setPreviousGridMode(initGridMode);
    this.playbackSync.setPreviousShowNonRadialPoints(
      this.playbackSync.lastPropsRef?.showNonRadialPoints ?? true
    );

    // Wire overlay renderers that may have been created during the async
    // initializeCanvas gap.
    this.effectSystem.rendererManager.wirePostInitOverlays();

    // Create overlays that weren't created yet.
    this.effectSystem.rendererManager.ensureEnabledOverlays();

    // Startup warm: create + park the requested webgl renderers now, before the
    // render loop free-runs, so their getContext + FBO cost lands during load
    // (nothing animating yet) and the first switch to them never freezes.
    const prewarm = callbacks.prewarmEffects;
    if (prewarm) {
      for (const id of prewarm)
        this.effectSystem.rendererManager.prewarmRenderer(id);
    }
  }

  /**
   * Eagerly warm a webgl overlay renderer (currently fire) ahead of the user
   * enabling it — driven by hover intent. Delegates to the renderer manager,
   * which parks the warmed renderer until it's enabled. No-op before init or for
   * non-webgl effects.
   */
  prewarmEffect(id: EffectType): void {
    this.effectSystem.rendererManager.prewarmRenderer(id);
  }

  /**
   * Update with new props — delegates entirely to PlaybackSync.
   * AnimatorCanvas.svelte calls engine.update(props) each frame.
   */
  update(props: AnimationEngineProps): void {
    this.playbackSync.update(props);
  }

  /**
   * Prepare the export prop types BEFORE the frame loop starts. Mirrors the
   * canonical override path (PropTypeManager.handleOverrides → loadPropTextures)
   * that the live engine runs through PlaybackSync.update — but the offscreen
   * export engine is driven only through renderFrame(), which never touches
   * PlaybackSync, so that sync never happens. Without this the engine state
   * stays at the boot default ("staff", staff dimensions) and:
   *   - frame-parameter-builder reads the prop TYPE from state.currentLeftPropType
   *     /currentRightPropType (frame-parameter-builder.ts:227-228,244-245), so a
   *     non-staff export drew the staff body.
   *   - it reads prop DIMENSIONS from state.leftPropDimensions/rightPropDimensions
   *     (frame-parameter-builder.ts:209-210), so a non-staff prop drew at staff
   *     size.
   * A bare renderer.loadPerColorPropTextures() (the prior partial fix) loaded
   * the image but updated NEITHER state field, leaving the type/dimension desync.
   *
   * This reuses the existing canonical prop path: it registers the overrides on
   * the PropTypeManager (so loadPropTextures bypasses settings and uses these
   * exact types), writes the types into AnimatorState, then runs the manager's
   * loadPropTextures — which loads the per-color textures via the prop texture
   * service AND syncs the resolved dimensions back into state (prop-type-manager.ts
   * :305-308). End state after this resolves: state.currentLeftPropType/currentRightPropType
   * === the resolved types, state.leftPropDimensions/rightPropDimensions === the
   * loaded prop's real dimensions, and the image is present in the image loader.
   *
   * `darkMode` selects the prop color set (matches the renderer.setDarkMode that
   * initialize already applied). Types are stored as-is (e.g. "staff"); the frame
   * builder lowercases them when comparing, so the PropType value is fine.
   */
  async prepareExportPropTypes(
    left: string,
    right: string,
    darkMode: boolean,
    colors: TunnelPropColorPair | null = null
  ): Promise<void> {
    const ptm = this.propSystem.propTypeManager;
    // Register overrides so loadPropTextures uses these exact types (not settings).
    ptm.propTypeOverrideLeft = left;
    ptm.propTypeOverrideRight = right;
    // Carry the type into engine state so frame-parameter-builder reads it.
    this.state.setLeftPropType(left);
    this.state.setRightPropType(right);
    this.state.setLegacyPropType(left);
    // Load textures + sync dimensions into state via the canonical manager path.
    await this.propSystem.propPipeline.loadTextures(
      this.state,
      darkMode,
      colors
    );
  }

  /**
   * Pre-load the tunnel's additional-layer prop textures before the export frame
   * loop. Sibling to prepareExportPropTypes — the offscreen engine bypasses
   * PlaybackSync.update (the live path's handleAdditionalLayers), which is the
   * ONLY place these per-layer textures are loaded. Without this the kaleidoscope's
   * overlaid copies have no prop image and the export renders only the base pair.
   * `spectrum` mirrors the live controller so the layer colors match.
   */
  async prepareExportAdditionalLayers(
    layerCount: number,
    spectrum: boolean,
    colors: TunnelPropColorPair | null = null
  ): Promise<void> {
    await this.propSystem.propTypeManager.preloadAdditionalLayerTextures(
      layerCount,
      spectrum,
      this.state.currentLeftPropType,
      undefined,
      colors
    );
  }

  /** Render one export frame synchronously and deterministically. `timeMs` is
   *  the frame's virtual time; `dtSeconds` is the fixed sim step (e.g. 1/fps).
   *  Used by the offscreen export driver — no rAF, no live-engine mutation. */
  renderFrame(
    props: AnimationEngineProps,
    timeMs: number,
    dtSeconds: number
  ): void {
    // Honor the caller's trail settings the same way the live update() path does.
    // buildFrameParams resolves trailSettings from STATE (getEffectiveTrailSettings
    // reads state.trailSettings), NOT from props — so without this sync the
    // offscreen export engine, which is driven only through renderFrame (never
    // PlaybackSync.update), renders trails with the DEFAULT settings. That dropped
    // the user's trackingMode (default RIGHT_END instead of their BOTH_ENDS), so
    // the export showed a single-end trail while the live animator showed both —
    // and ignored custom colors / line width / tailLength too. Mirrors
    // PlaybackSync.update's externalTrailSettings → state sync.
    if (props.externalTrailSettings) {
      this._animatorState.setTrailSettings(props.externalTrailSettings);
    }
    const params = this.frameSystem.buildFrameParams(
      props,
      this.buildFrameDeps()
    );
    params.virtualTime = timeMs;
    this.lifecycleManager.renderLoop?.renderSync(params, timeMs, dtSeconds);
  }

  handleGlyphSvgReady(
    svgString: string,
    width: number,
    height: number,
    x: number,
    y: number
  ): void {
    this.lifecycleManager.glyphTextureLoader?.handleGlyphSvgReady(
      svgString,
      width,
      height,
      x,
      y
    );
  }

  /**
   * Process pending glyph if any
   */
  processPendingGlyph(): void {
    const glyphLoader = this.lifecycleManager.glyphTextureLoader;
    if (
      this.state.isInitialized &&
      glyphLoader?.getPendingGlyph() &&
      this.lifecycleManager.animationRenderer
    ) {
      glyphLoader.processPendingGlyph();
    }
  }

  /**
   * Set target FPS for preview throttling.
   * null = render at native refresh rate (no throttling).
   */
  setTargetFps(fps: number | null): void {
    this.lifecycleManager.renderLoop?.setTargetFps(fps);
  }

  /**
   * Route this engine's render loop through the canonical off-screen /
   * hidden-tab gate. Safe before initialize(): the gate is re-applied once the
   * loop exists. See `shared/render-gating/render-activity-gate.ts`.
   */
  setActivityGate(gate: RenderActivityGate | null): void {
    this.activityGate = gate;
    this.lifecycleManager.renderLoop?.setActivityGate(gate);
  }

  /**
   * Invalidate the fire frame cache so the simulation re-records from scratch.
   * Call after video export (which uses jumpToStep frame-by-frame) to prevent
   * stale cached fire frames from replaying when normal playback resumes.
   */
  invalidateFireCache(): void {
    this.effectSystem.invalidateFireCache();
  }

  /**
   * Invalidate the fire frame cache without clearing simulation FBOs.
   * Use before video export so the cache records fresh frames while the
   * Navier-Stokes simulation retains its warm (steady-state) fluid fields.
   */
  invalidateFireFrameCacheOnly(): void {
    this.effectSystem.invalidateFireFrameCacheOnly();
  }

  clearFireThermalFields(): void {
    this.effectSystem.clearFireThermalFields();
  }

  // --- EXPORT DIAGNOSTIC (remove after debugging) ---
  getLedRenderer() {
    return this.effectSystem.getLedRenderer();
  }

  enableFireDiagnostics(): void {
    this.effectSystem.enableFireDiagnostics();
  }
  disableFireDiagnostics(): void {
    this.effectSystem.disableFireDiagnostics();
  }
  resetFireDiagnosticCounter(): void {
    this.effectSystem.resetFireDiagnosticCounter();
  }
  sampleFireCanvas(): string {
    return this.effectSystem.sampleFireCanvas();
  }
  snapshotFireCanvas(): void {
    this.effectSystem.snapshotFireCanvas();
  }

  /**
   * Capture a diagnostic snapshot of the entire effect pipeline.
   * Called from the canvas context menu when the user sees a visual glitch.
   * Returns a JSON-serializable object with all relevant state.
   */
  captureEffectDiagnostics(): Record<string, unknown> {
    const vm = this.getVM();
    const settings = vm.getSettings();
    const lastProps = this.playbackSync.lastPropsRef;

    const core = this.effectSystem.captureDiagnostics({
      isInitialized: this.state.isInitialized,
      isPlaying: lastProps?.isPlaying ?? false,
      currentStep: lastProps?.currentStep ?? 0,
      canvasSize: this._canvasSize,
      instanceId: this.instanceId,
    });

    return {
      ...core,
      visibility: {
        activeEffect:
          this.effectSystem.effectsConfigState?.activeEffect ?? "none",
        tipEffectMap: this.effectSystem.effectsConfigState?.tipEffectMap ?? {},
        effortPreset: settings.effortPreset,
        pathShape: settings.pathShape,
      },
      renderLoop: this.lifecycleManager.renderLoop?.getDiagnostics() ?? null,
      qualityHints: this.frameBudgetMonitor?.getQualityHints() ?? null,
      sequenceInfo: this.playbackSync.prevSequenceDataForDiag
        ? {
            word: this.playbackSync.prevSequenceDataForDiag.word,
            stepCount:
              this.playbackSync.prevSequenceDataForDiag.steps?.length ?? 0,
            gridMode: this.playbackSync.prevSequenceDataForDiag.gridMode,
          }
        : null,
      propTypes: {
        left: this.state.currentLeftPropType,
        right: this.state.currentRightPropType,
      },
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
  }

  getRenderContext(
    id: string,
    container: HTMLDivElement
  ): RenderContext | null {
    const renderer = this.lifecycleManager.animationRenderer;
    const renderLoop = this.lifecycleManager.renderLoop;
    const trailCapturer = this.lifecycleManager.trailCapturer;
    const resizer = this.lifecycleManager.resizer;
    const precomputer = this.lifecycleManager.precomputer;
    const canvas = renderer?.getCanvas();
    if (!canvas || !renderLoop || !trailCapturer || !resizer) {
      return null;
    }

    return new LiveRenderContext({
      id,
      canvas,
      container,
      renderer: renderer!,
      effectManager: this.effectSystem.rendererManager,
      trailCapturer,
      renderLoop,
      resizer,
      precomputer: precomputer!,
      renderFrameSync: (props, timeMs, dtSeconds) =>
        this.renderFrame(props, timeMs, dtSeconds),
    });
  }

  /** The live render target used for direct, settings-faithful GIF capture. */
  getCanvas(): HTMLCanvasElement | null {
    return this.lifecycleManager.animationRenderer?.getCanvas() ?? null;
  }

  dispose(): void {
    this.lifecycleManager.dispose({
      onCanvasReady: (canvas) => this.callbacks.onCanvasReady?.(canvas),
      onInitialized: (initialized) => {
        this.state.setInitialized(initialized);
      },
    });

    this.containerElement = null;
    this.activityGate = null;
    this.playbackSync.reset();
    this.frameSystem.resetHandPresenceCache();
  }

  pauseResize(): void {
    this.lifecycleManager.pauseResize();
  }
  resumeResize(): void {
    this.lifecycleManager.resumeResize();
  }

  setFireConfig(config: Partial<FireOverlayConfig>): void {
    this.effectSystem.setFireConfig(config);
  }

  getFireConfig(): FireOverlayConfig {
    return this.effectSystem.getFireConfig();
  }

  setLedConfig(config: Partial<LedOverlayConfig>): void {
    this.effectSystem.setLedConfig(config);
  }

  getLedConfig(): LedOverlayConfig {
    return this.effectSystem.getLedConfig();
  }

  setCellTipEffectMap(map: TipEffectMap | undefined): void {
    this.effectSystem.setCellTipEffectMap(map);
  }

  setCellTipEffortMap(map: TipEffortMap | undefined): void {
    this.effectSystem.setCellTipEffortMap(map);
  }

  /**
   * Build the per-frame deps object passed to FrameSystem.buildFrameParams().
   * Extracted so all call sites share the same construction logic.
   * Passed to PlaybackSync as a thunk.
   */
  private buildFrameDeps() {
    return {
      effectsConfigState: this.effectSystem.effectsConfigState,
      effectRendererManager: this.effectSystem.rendererManager,
      getVM: () => this.getVM(),
    };
  }
}
