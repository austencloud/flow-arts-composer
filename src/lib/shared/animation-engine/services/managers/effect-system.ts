/**
 * EffectSystem
 *
 * Owns the effect-rendering subsystem extracted from AnimationEngine:
 *
 *  - EffectRendererManager instance (14+ overlay renderers + lifecycle + configs)
 *  - EffectController instance (fire/LED/cell-map API surface)
 *  - effectsConfigState field + setter wiring
 *  - Effect-specific change-detection prev-fields
 *    (prevColorBlend, prevFireIntensity, prevFireBrightness, prevFireTurbulence, prevFireColorCurve,
 *     prevCharcoalParamsJson, prevEffortPreset)
 *  - initPrevState() — initialise all the above from EffectsConfigState at startup
 *  - syncEffects() — the effect-sync portion of handleVisibilityChange()
 *  - Config/diagnostics passthroughs delegated to EffectController
 *  - Renderer accessors used by retained engine branches
 *
 * Does NOT import AnimationEngine — keeps the dependency graph acyclic.
 * CanvasLifecycleManager is imported as `import type` only.
 */

import { EffectRendererManager } from "../effect-renderer-manager";
import { EffectController } from "../effect-controller";
import type { AnimatorState } from "../../state/animator-state.svelte";
import type { CanvasLifecycleManager } from "../canvas-lifecycle-manager";
import type { EffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import type { FireRenderingStyle } from "#lib/shared/effects/domain/effects-config.js";
import type {
  FireOverlayConfig,
  FireColorCurve,
} from "../../domain/types/fire-types";
import {
  BASE_FIRE_PHYSICS,
  BASE_COLOR_CURVE,
  intensityToPhysics,
} from "../../domain/types/fire-types";
import type { LedOverlayConfig } from "../../domain/types/led-types";
import type {
  TipEffectMap,
  TipEffortMap,
} from "../../domain/types/tip-effect-types";
import {
  semanticToCharcoalParams,
  type CharcoalSparkParams,
} from "../../domain/types/charcoal-spark-types";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { AnimationVisibilityState } from "../animation-visibility-synchronizer";
import type { AnimationVisibilityStateManager } from "../../state/animation-visibility-state.svelte";
import type { ITrailOverlayCanvas } from "../ITrailOverlayCanvas";
import type { FireTipTracker } from "../fire-tip-tracker";
import type { WebGLFireRenderer } from "../fire/web-gl-fire-renderer";
import type { CharcoalSparkRenderer } from "../charcoal/charcoal-spark-renderer";
import type { WebGLLedRenderer } from "../led/web-gl-led-renderer";
import { EFFECT_PLUGINS } from "../effects/registry";

// ── Helpers (mirrored from engine — keep in sync) ───────────────────────────

/** Returns true if any entry in the map has the given effect type. */
function hasEffectInMap(
  map: TipEffectMap | undefined,
  effect: string
): boolean {
  if (!map) return false;
  return Object.values(map).some((a) => a.effect === effect);
}

/** Extract CharcoalSparkParams from EffectsConfigState, with defaults. */
function getCharcoalParamsFromConfig(
  ecs: EffectsConfigState | null | undefined
): CharcoalSparkParams {
  if (!ecs) {
    return semanticToCharcoalParams({ intensity: 0.5, spread: 0.5, glow: 0.6 });
  }
  const { intensity, spread, glow, emissionStyle, coreColor, midColor, coolColor } =
    ecs.charcoal;
  return semanticToCharcoalParams(
    { intensity, spread, glow, emissionStyle },
    { coreColor, midColor, coolColor }
  );
}

export class EffectSystem {
  private readonly _rendererManager = new EffectRendererManager();
  private readonly _controller = new EffectController(this._rendererManager);

  // ── effectsConfigState (owned here; engine reads via getter) ────────────────
  private _effectsConfigState: EffectsConfigState | null = null;

  private _prevColorBlend: number = 0.5;
  private _prevFireIntensity: number = 0.7;
  private _prevFireBrightness: number = 0.5;
  private _prevFireTurbulence: number = 0.5;
  private _prevFireColorCurve: FireColorCurve | null = null;
  private _prevFireRenderingStyle: FireRenderingStyle = "natural";
  private _prevCharcoalParamsJson: string = "";
  private _prevEffortPreset: EffortId = "linear";

  constructor(
    private readonly _state: AnimatorState,
    private readonly _deps: { lifecycleManager: CanvasLifecycleManager }
  ) {}


  get rendererManager(): EffectRendererManager {
    return this._rendererManager;
  }

  get controller(): EffectController {
    return this._controller;
  }


  get effectsConfigState(): EffectsConfigState | null {
    return this._effectsConfigState;
  }

  /**
   * Wire the shared EffectsConfigState. Sets both the local field and
   * rendererManager.effectsConfigState so renderer config queries stay in sync.
   * The engine still sets vss.effectsConfigState directly (vss is engine-owned).
   */
  setEffectsConfigState(state: EffectsConfigState | null): void {
    this._effectsConfigState = state;
    this._rendererManager.effectsConfigState = state;
  }

  // ── Renderer accessors (for retained engine branches) ──────────────────────

  get trailOverlay(): ITrailOverlayCanvas | null {
    return this._rendererManager.getRenderer(
      "trails"
    ) as unknown as ITrailOverlayCanvas | null;
  }

  get fireTipTracker(): FireTipTracker | null {
    return this._rendererManager.fireTipTracker;
  }

  get fireRenderer(): WebGLFireRenderer | null {
    return this._rendererManager.getRenderer(
      "fire"
    ) as WebGLFireRenderer | null;
  }

  get charcoalRenderer(): CharcoalSparkRenderer | null {
    return this._rendererManager.getRenderer(
      "charcoal"
    ) as CharcoalSparkRenderer | null;
  }

  get ledRenderer(): WebGLLedRenderer | null {
    return this._rendererManager.getRenderer("led") as WebGLLedRenderer | null;
  }

  // ── Init prev-state (called from engine.initialize()) ──────────────────────

  /**
   * Initialise all effect-specific prev-fields and the EffectRendererManager's
   * prevHas* flags from the current EffectsConfigState.
   * Mirrors the block that was at engine.initialize() lines ~313-365.
   */
  initPrevState(ecs: EffectsConfigState | null): void {
    this._prevColorBlend = ecs?.fire.colorBlend ?? 0.5;
    this._prevFireIntensity = ecs?.fire.intensity ?? 0.7;
    this._prevFireBrightness = ecs?.fire.brightness ?? 0.5;
    this._prevFireTurbulence = ecs?.fire.turbulence ?? 0.5;
    this._prevFireRenderingStyle = ecs?.fire.renderingStyle ?? "natural";
    this._prevCharcoalParamsJson = JSON.stringify(
      getCharcoalParamsFromConfig(ecs)
    );

    const erm = this._rendererManager;

    // Set was-enabled flags for all overlay effects via the registry loop
    for (const plugin of EFFECT_PLUGINS) {
      if (plugin.kind === "canvas2d" || plugin.kind === "webgl") {
        // OverlayEffectId = Exclude<EffectType, "none" | "led" | "trails">
        erm.setWasEnabled(
          plugin.id as Exclude<typeof plugin.id, "none" | "led" | "trails">,
          hasEffectInMap(ecs?.tipEffectMap, plugin.id)
        );
      }
    }

    // Build fireConfig from base params + slider mappings
    erm.fireConfig.colorBlend = this._prevColorBlend;
    erm.fireConfig.intensity = this._prevFireIntensity;
    erm.fireConfig.brightness = this._prevFireBrightness;
    erm.fireConfig.flameHeight = this._prevFireIntensity;
    erm.fireConfig.turbulence = this._prevFireTurbulence;
    erm.fireConfig.renderingProfile =
      this._prevFireRenderingStyle === "liquid" ? "legacy" : "cinematic";
    erm.fireConfig.fuelRendererType = "fluid";

    const basePhysics = BASE_FIRE_PHYSICS;
    const intensityOverrides = intensityToPhysics(this._prevFireIntensity);
    erm.fireConfig.physicsPreset = {
      ...basePhysics,
      ...intensityOverrides,
    };
    erm.fireConfig.colorCurve = ecs?.fire.colorCurve ?? BASE_COLOR_CURVE;
    erm.fireConfig.charcoalParams = getCharcoalParamsFromConfig(ecs);

    erm.initLedConfigFromEffectsState(ecs);
  }

  // ── syncEffects (effect-specific portion of handleVisibilityChange) ─────────

  /**
   * Sync all effect-specific state from the incoming visibility change.
   * Extracted from engine.handleVisibilityChange() — covers:
   *   - syncEffectFlagsFromEffectiveMap()
   *   - fire slider sync block
   *   - effort-preset reset
   *   - charcoal param sync
   *   - LED sync
   *   - syncEffectLayers()
   *
   * The engine keeps the outer orchestration (dark-mode, trails, props, path-shape
   * branches) and calls this method for the effect-specific work.
   *
   * @param state  The incoming AnimationVisibilityState from the subscriber.
   * @param vm     The visibility manager for this engine instance.
   */
  syncEffects(
    state: AnimationVisibilityState,
    vm: AnimationVisibilityStateManager
  ): void {
    const erm = this._rendererManager;
    const ecs = this._effectsConfigState;

    // Sync effect toggles — cell-level override takes priority
    erm.syncEffectFlagsFromEffectiveMap();

    // Sync fire slider values + color curve -> physics
    const colorBlend = ecs?.fire.colorBlend ?? 0.5;
    const fireIntensity = ecs?.fire.intensity ?? 0.7;
    const fireBrightness = ecs?.fire.brightness ?? 0.5;
    const fireTurbulence = ecs?.fire.turbulence ?? 0.5;
    const fireColorCurve = ecs?.fire.colorCurve ?? null;
    const fireRenderingStyle = ecs?.fire.renderingStyle ?? "natural";

    const slidersChanged =
      colorBlend !== this._prevColorBlend ||
      fireIntensity !== this._prevFireIntensity ||
      fireBrightness !== this._prevFireBrightness ||
      fireTurbulence !== this._prevFireTurbulence ||
      fireColorCurve !== this._prevFireColorCurve ||
      fireRenderingStyle !== this._prevFireRenderingStyle;

    if (slidersChanged) {
      this._prevColorBlend = colorBlend;
      this._prevFireIntensity = fireIntensity;
      this._prevFireBrightness = fireBrightness;
      this._prevFireTurbulence = fireTurbulence;
      this._prevFireColorCurve = fireColorCurve;
      this._prevFireRenderingStyle = fireRenderingStyle;

      const basePhysics = BASE_FIRE_PHYSICS;
      const intOverrides = intensityToPhysics(fireIntensity);
      erm.setFireConfig({
        colorBlend,
        fuelRendererType: "fluid",
        intensity: fireIntensity,
        brightness: fireBrightness,
        flameHeight: fireIntensity,
        turbulence: fireTurbulence,
        renderingProfile:
          fireRenderingStyle === "liquid" ? "legacy" : "cinematic",
        physicsPreset: {
          ...basePhysics,
          ...intOverrides,
        },
        colorCurve: fireColorCurve ?? BASE_COLOR_CURVE,
      });
    }

    // Reset fire tip tracker when effort preset changes
    const effortPreset = vm.getEffortPreset();
    if (effortPreset !== this._prevEffortPreset) {
      this._prevEffortPreset = effortPreset;
      erm.fireTipTracker?.reset();
      if (erm.fireRenderer?.isInitialized()) {
        erm.fireRenderer.clearSimulation();
      }
      if (erm.charcoalRenderer?.isInitialized()) {
        erm.charcoalRenderer.clearSimulation();
      }
    }

    // Sync charcoal params independently
    if (erm.wasEnabled("charcoal") && erm.charcoalRenderer?.isInitialized()) {
      const currentCharcoalParams = getCharcoalParamsFromConfig(ecs);
      const currentCharcoalJson = JSON.stringify(currentCharcoalParams);
      if (currentCharcoalJson !== this._prevCharcoalParamsJson) {
        this._prevCharcoalParamsJson = currentCharcoalJson;
        erm.charcoalRenderer.setParams(currentCharcoalParams);
      }
    }

    // Sync LED effect from EffectsConfigState
    const ledDiff = erm.diffLedConfigFromEffectsState(ecs);
    if (Object.keys(ledDiff).length > 0) {
      erm.setLedConfig(ledDiff);
    }

    // Sync effect layer ordering
    erm.syncEffectLayers();
  }

  // ── Config / diagnostics passthroughs (public API; engine delegates here) ───

  invalidateFireCache(): void {
    this._controller.invalidateFireCache();
  }

  invalidateFireFrameCacheOnly(): void {
    this._controller.invalidateFireFrameCacheOnly();
  }

  clearFireThermalFields(): void {
    this._controller.clearFireThermalFields();
  }

  getLedRenderer(): WebGLLedRenderer | null {
    return this._rendererManager.ledRenderer;
  }

  enableFireDiagnostics(): void {
    this._rendererManager.fireRenderer?.enableDiagnostics();
  }

  disableFireDiagnostics(): void {
    this._rendererManager.fireRenderer?.disableDiagnostics();
  }

  resetFireDiagnosticCounter(): void {
    this._rendererManager.fireRenderer?.resetDiagnosticCounter?.();
  }

  sampleFireCanvas(): string {
    return (
      this._rendererManager.fireRenderer?.sampleFireCanvas?.() ??
      "no fire renderer"
    );
  }

  snapshotFireCanvas(): void {
    this._rendererManager.fireRenderer?.snapshotFireCanvas?.();
  }

  captureDiagnostics(
    context: import("../effect-controller").DiagnosticContext
  ): Record<string, unknown> {
    return this._controller.captureDiagnostics(context);
  }

  setFireConfig(config: Partial<FireOverlayConfig>): void {
    this._controller.setFireConfig(config);
  }

  getFireConfig(): FireOverlayConfig {
    return this._controller.getFireConfig();
  }

  setLedConfig(config: Partial<LedOverlayConfig>): void {
    this._controller.setLedConfig(config);
  }

  getLedConfig(): LedOverlayConfig {
    return this._controller.getLedConfig();
  }

  setCellTipEffectMap(map: TipEffectMap | undefined): void {
    this._controller.setCellTipEffectMap(map);
  }

  setCellTipEffortMap(map: TipEffortMap | undefined): void {
    this._controller.setCellTipEffortMap(map);
  }
}
