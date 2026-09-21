/**
 * EffectRendererManager
 *
 * Owns all 16 effect overlay renderers (fire, charcoal, LED, trails, zap, sparkles,
 * echo, bloom, water, bubbles, petals, smoke, ink, frost, silk, pulse).
 * Handles initialize/destroy lifecycle, config sync, and layer ordering.
 *
 * Extracted from AnimationEngine to reduce its line count.
 * This is a plain TypeScript class - no Svelte reactivity needed.
 *
 * P2.3: Named renderer fields replaced by Map<EffectType, EffectRendererLike>.
 * Access via getRenderer(id). Typed helpers (get fireRenderer, etc.) delegate
 * to the Map with a cast for callers that need effect-specific methods.
 */

import type { FireTipTracker } from "./fire-tip-tracker";
import {
  squareFrame,
  type CanvasFrame,
} from "../domain/types/canvas-frame";
import type { LedSampler } from "./led-sampler";
import type { ITrailOverlayCanvas } from "./ITrailOverlayCanvas";
import type { IAnimationRenderLoop } from "./IAnimationRenderLoop";
import type {
  EffectType,
  TipEffectMap,
  TipEffortMap,
} from "../domain/types/tip-effect-types";
import type { FireOverlayConfig } from "../domain/types/fire-types";
import { DEFAULT_FIRE_CONFIG } from "../domain/types/fire-types";
import type { LedOverlayConfig } from "../domain/types/led-types";
import type { LedShutter } from "../domain/led-photometry";

/** The one numeric parameter a shutter carries, whichever mode it is in. */
function shutterParam(shutter: LedShutter): number {
  return shutter.mode === "camera"
    ? shutter.exposureSeconds
    : shutter.timeConstantSeconds;
}

import {
  DEFAULT_LED_CONFIG,
  DEFAULT_LED_INTENT,
} from "../domain/types/led-types";
import { resolveEffectZ } from "./effect-layer";
import type { AnimationVisibilityStateManager } from "../state/animation-visibility-state.svelte";
import type { CharcoalSparkParams } from "../domain/types/charcoal-spark-types";
import { semanticToCharcoalParams } from "../domain/types/charcoal-spark-types";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "./IAnimationRenderLoop";
import type { EffectRendererLike } from "./effects/effect-renderer";
import { EFFECT_PLUGINS, EFFECT_PLUGIN_BY_ID } from "./effects/registry";
// WebGLLedRenderer imported as value — syncLedOverlay uses deferred requestAnimationFrame init.
// LED is special-cased: instantiation deferred, then stored in renderers Map via `set("led", ...)`.
import { WebGLLedRenderer } from "./led/web-gl-led-renderer";
import type { CharcoalSparkRenderer } from "./charcoal/charcoal-spark-renderer";
import type { WebGLFireRenderer } from "./fire/web-gl-fire-renderer";
import type { WebGLLedRenderer as WebGLLedRendererType } from "./led/web-gl-led-renderer";

/** Callback to obtain current frame params (used to trigger re-renders). */
export type FrameParamsProvider = () => RenderFrameParams;

/**
 * Overlay effects driven by EFFECT_PLUGINS (kind canvas2d | webgl).
 * Excludes led (unique deferred lifecycle) and trails (handled separately).
 */
type OverlayEffectId = Exclude<EffectType, "none" | "led" | "trails">;

/** The 14 plugins that use the generic overlay lifecycle (canvas2d + webgl, no led/trails). */
const OVERLAY_PLUGINS = EFFECT_PLUGINS.filter(
  (p) => p.kind === "canvas2d" || p.kind === "webgl"
) as readonly ((typeof EFFECT_PLUGINS)[number] & { id: OverlayEffectId })[];

/**
 * LED intent data arriving from EffectsConfigState lives inside a Svelte 5
 * `$state` proxy, which `structuredClone` rejects with a DataCloneError — and
 * that throw happened inside AnimationEngine.initialize(), killing the whole
 * canvas (no grid, no props) with the error swallowed upstream. This file is
 * plain .ts, so `$state.snapshot` is not available; the intent is JSON-safe by
 * design (it round-trips through persistence), so a JSON clone is the
 * proxy-safe equivalent.
 */
function cloneLedData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface EffectRendererManagerOptions {
  /**
   * Retaining an inactive WebGL renderer makes effect switches instant, but
   * each renderer keeps its context, programs, textures, and framebuffers.
   * Mobile Safari has a much tighter graphics-memory budget, so touch devices
   * release the inactive renderer by default instead of accumulating contexts.
   */
  keepInactiveWebglRenderersWarm?: boolean;
}

function shouldKeepInactiveWebglRenderersWarm(): boolean {
  return typeof navigator === "undefined" || navigator.maxTouchPoints === 0;
}

export class EffectRendererManager {
  // ── Registry-backed renderer Map (P2.3) ─────────────────────────────
  // All renderer instances live here. Access via getRenderer(id).
  private renderers = new Map<EffectType, EffectRendererLike>();

  // ── Non-registry fields (trackers, configs, maps) ────────────────────
  fireTipTracker: FireTipTracker | null = null;
  ledSampler: LedSampler | null = null;

  fireConfig: FireOverlayConfig = { ...DEFAULT_FIRE_CONFIG };
  ledConfig: LedOverlayConfig = structuredClone(DEFAULT_LED_CONFIG);
  private ledInitPending = false;
  /**
   * LED is CREATED + initialized but parked warm: canvas hidden, deregistered
   * from the render loop, GL context/FBOs/programs kept alive so re-enable is
   * instant. LED's own kind:"led" lifecycle (it compiles 5 shader programs +
   * allocates 8 float FBOs synchronously — the freeze) gets the same keep-warm
   * treatment the generic webgl overlays get via warmHidden. Parked from two
   * sources: keep-warm (enabled→disabled parks instead of disposing) and
   * prewarmLed (startup/hover warm). Also guards the per-frame setLedConfig
   * disable path so it can't re-park (and reset the tip tracker) every frame.
   */
  private ledWarmHidden = false;

  /**
   * WebGL overlay ids with a deferred init scheduled (at most one rAF in
   * flight per id). Heavy WebGL init — shader compilation + float-FBO
   * allocation — is deferred off the reactive chain so the click that enables
   * the effect stays smooth. On Windows/ANGLE a synchronous compile can freeze
   * the page for seconds; fire builds ~16 shader programs + ~18 float FBOs.
   * Membership doubles as a cancel signal: dispose() clears it, and the rAF
   * callback bails if its id is no longer present. Same rationale as
   * syncLedOverlay, applied generically to every webgl-kind overlay.
   */
  private pendingWebglInit = new Set<OverlayEffectId>();

  /**
   * WebGL overlay ids that are CREATED + initialized but parked warm: their
   * canvas is hidden and they are deregistered from the render loop, yet their
   * GL context / FBOs / shader programs are kept alive so a later enable is
   * instant (no getContext/FBO realloc — the freeze). Two sources park into
   * here: keep-warm (an enabled→disabled transition parks instead of disposing)
   * and prewarmRenderer (eager startup/hover warm). Membership also guards the
   * disable transition so the per-frame setFireConfig→syncEffectOverlay can't
   * re-run onDisable every frame (which would reset the shared fireTipTracker
   * and starve every per-tip effect).
   */
  private warmHidden = new Set<OverlayEffectId>();

  cellTipEffectMap: TipEffectMap | undefined = undefined;
  cellTipEffortMap: TipEffortMap | undefined = undefined;

  /** Map from effect name to whether tips are currently enabled. LED uses ledConfig.enabled instead. */
  private prevEffectEnabled: Map<OverlayEffectId, boolean> = new Map(
    OVERLAY_PLUGINS.map((p) => [p.id as OverlayEffectId, false])
  );

  /** Whether the given overlay effect was enabled last frame. */
  wasEnabled(id: OverlayEffectId): boolean {
    return this.prevEffectEnabled.get(id) ?? false;
  }

  /** Set the was-enabled flag for the given overlay effect. */
  setWasEnabled(id: OverlayEffectId, value: boolean): void {
    this.prevEffectEnabled.set(id, value);
  }

  // ── Typed renderer accessors (callers need effect-specific methods) ──

  /** Returns the fire renderer, cast to its concrete type, or null. */
  get fireRenderer(): WebGLFireRenderer | null {
    return (this.renderers.get("fire") ?? null) as WebGLFireRenderer | null;
  }

  /** Returns the charcoal renderer, cast to its concrete type, or null. */
  get charcoalRenderer(): CharcoalSparkRenderer | null {
    return (this.renderers.get("charcoal") ??
      null) as CharcoalSparkRenderer | null;
  }

  /** Returns the LED renderer, cast to its concrete type, or null. */
  get ledRenderer(): WebGLLedRendererType | null {
    return (this.renderers.get("led") ?? null) as WebGLLedRendererType | null;
  }

  /** Returns the trail overlay, cast to ITrailOverlayCanvas, or null. */
  get trailOverlay(): ITrailOverlayCanvas | null {
    return (this.renderers.get("trails") ??
      null) as unknown as ITrailOverlayCanvas | null;
  }

  /** Set the trail overlay into the registry Map. Called externally by CanvasLifecycleManager. */
  set trailOverlay(value: ITrailOverlayCanvas | null) {
    if (value == null) {
      this.renderers.delete("trails");
    } else {
      this.renderers.set("trails", value as unknown as EffectRendererLike);
    }
  }

  // ── Dependencies (injected) ─────────────────────────────────────────
  private containerElement: HTMLDivElement | null = null;
  private canvasSize: number = 0;
  /** The rectangle every overlay canvas is allocated to; the engine's square
   *  (`canvasSize`) sits centred inside it. */
  private frame: CanvasFrame = squareFrame(0);
  private renderLoopService: IAnimationRenderLoop | null = null;
  private getFrameParams: FrameParamsProvider | null = null;
  private getVM: (() => AnimationVisibilityStateManager) | null = null;
  effectsConfigState: EffectsConfigState | null = null;

  private readonly keepInactiveWebglRenderersWarm: boolean;

  constructor(options: EffectRendererManagerOptions = {}) {
    this.keepInactiveWebglRenderersWarm =
      options.keepInactiveWebglRenderersWarm ??
      shouldKeepInactiveWebglRenderersWarm();
  }


  /** Get a renderer by effect id. Returns null if not initialized. */
  getRenderer(id: EffectType): EffectRendererLike | null {
    return this.renderers.get(id) ?? null;
  }


  /**
   * Wire dependencies after construction. Called once from AnimationEngine.initialize().
   */
  wire(deps: {
    containerElement: HTMLDivElement;
    canvasSize: number;
    /** The host rectangle, seeded before the first ResizeObserver callback. */
    canvasFrame?: CanvasFrame;
    renderLoopService: IAnimationRenderLoop | null;
    getFrameParams: FrameParamsProvider;
    getVM: () => AnimationVisibilityStateManager;
  }): void {
    this.containerElement = deps.containerElement;
    this.canvasSize = deps.canvasSize;
    this.frame = deps.canvasFrame ?? squareFrame(deps.canvasSize);
    this.renderLoopService = deps.renderLoopService;
    this.getFrameParams = deps.getFrameParams;
    this.getVM = deps.getVM;
  }

  /** Update mutable refs that change after wire() (e.g. renderLoopService set later). */
  updateRefs(refs: {
    renderLoopService?: IAnimationRenderLoop | null;
    canvasSize?: number;
  }): void {
    if (refs.renderLoopService !== undefined)
      this.renderLoopService = refs.renderLoopService;
    if (refs.canvasSize !== undefined) {
      this.canvasSize = refs.canvasSize;
      this.frame = squareFrame(refs.canvasSize);
    }
  }

  /** Expose charcoal params from EffectsConfigState for the registry onInit hook. */
  getCharcoalParamsFromConfig(): CharcoalSparkParams | undefined {
    if (!this.effectsConfigState) return undefined;
    const {
      intensity,
      spread,
      glow,
      emissionStyle,
      coreColor,
      midColor,
      coolColor,
    } = this.effectsConfigState.charcoal;
    return semanticToCharcoalParams(
      { intensity, spread, glow, emissionStyle },
      { coreColor, midColor, coolColor }
    );
  }

  /** Check whether a given overlay effect is currently enabled. */
  isEffectEnabled(effect: OverlayEffectId): boolean {
    return this.prevEffectEnabled.get(effect) ?? false;
  }

  /**
   * Generic init/destroy lifecycle for a single registry-driven overlay effect.
   * Driven by EFFECT_PLUGINS (canvas2d + webgl kinds) via the renderers Map.
   */
  private syncOverlay(plugin: (typeof OVERLAY_PLUGINS)[number]): void {
    const id = plugin.id as OverlayEffectId;
    const enabled = this.prevEffectEnabled.get(id) ?? false;

    if (enabled) {
      const current = this.renderers.get(id);
      if (current?.isInitialized()) {
        // Already created. If it was parked warm (keep-warm or a prewarm), un-park:
        // re-show its canvas and re-register it with the render loop. No
        // getContext/FBO realloc — reactivation is free, so the switch never freezes.
        if (this.warmHidden.has(id)) {
          this.warmHidden.delete(id);
          this.setRendererCanvasVisible(id, true);
          this.renderLoopService?.updateConfig({
            renderers: { [id]: current },
          } as Partial<RenderLoopConfig>);
        }
      } else {
        if (!this.containerElement) return;
        if (plugin.kind === "webgl") {
          // Heavy WebGL init (shader compile + float-FBO alloc) is deferred off
          // the reactive chain so the enabling click stays smooth. The deferred
          // path fires its own triggerRender once the renderer is ready.
          this.scheduleWebglInit(plugin);
          return;
        }
        this.initOverlayRenderer(plugin); // canvas2d: cheap getContext, inline
      }
    } else {
      const current = this.renderers.get(id);
      // Already parked warm → no-op. Critical guard: CanvasSurface calls
      // setFireConfig every frame → syncEffectOverlay, so without this the
      // disable transition would re-run every frame, re-firing plugin.onDisable
      // (which resets the SHARED fireTipTracker) and starving every per-tip
      // effect (bloom, water, sparkles, …). Mirrors the pre-keep-warm
      // delete+return guard. Root-caused 2026-06-23.
      if (this.warmHidden.has(id)) return;
      if (current?.isInitialized()) {
        if (plugin.kind === "webgl" && this.keepInactiveWebglRenderersWarm) {
          // Keep-warm: park the webgl renderer instead of disposing. Hide its
          // canvas (preserveDrawingBuffer would otherwise leave a stale frame)
          // and deregister it from the render loop so the loop can idle-stop —
          // but KEEP the GL context / FBOs / programs so re-enable is instant.
          this.parkWarm(id);
          plugin.onDisable?.(this);
        } else {
          // Canvas2D renderers are cheap to recreate. WebGL renderers take this
          // same disposal path on touch devices so an effect tour cannot leave
          // several heavyweight contexts resident in Mobile Safari.
          current.dispose();
          this.renderers.delete(id);
          this.renderLoopService?.updateConfig({
            renderers: { [id]: null },
          } as Partial<RenderLoopConfig>);
          plugin.onDisable?.(this);
        }
      } else {
        return; // already disabled — nothing to tear down, no re-render
      }
    }

    if (plugin.triggerRender !== false) {
      this.triggerRender();
    }
  }

  /**
   * Construct + initialize one overlay renderer and wire it into the render
   * loop. Shared by the inline canvas2d path and the deferred webgl path so
   * both register the renderer and run plugin.onInit identically.
   */
  private initOverlayRenderer(plugin: (typeof OVERLAY_PLUGINS)[number]): void {
    const id = plugin.id as OverlayEffectId;
    if (!this.containerElement) return;
    const renderer = plugin.createRenderer();
    const success = renderer.initialize(
      this.containerElement,
      this.frame.width,
      this.frame.height
    );
    if (success) {
      this.renderers.set(id, renderer);
      this.renderLoopService?.updateConfig({
        renderers: { [id]: renderer },
      } as Partial<RenderLoopConfig>);
      plugin.onInit?.(this, renderer);
    } else {
      this.renderers.delete(id);
    }
  }

  /**
   * Defer a webgl overlay's init to the next frame so the click that enables it
   * doesn't block on shader compilation. Generalizes syncLedOverlay's proven
   * rAF deferral to every webgl-kind overlay (fire, etc.). At most one rAF in
   * flight per id; membership in pendingWebglInit doubles as a cancel signal so
   * dispose() (which clears the set) aborts an in-flight init.
   */
  private scheduleWebglInit(plugin: (typeof OVERLAY_PLUGINS)[number]): void {
    const id = plugin.id as OverlayEffectId;
    if (this.pendingWebglInit.has(id)) return;
    this.pendingWebglInit.add(id);
    requestAnimationFrame(() => {
      if (!this.pendingWebglInit.has(id)) return; // cancelled by dispose()
      this.pendingWebglInit.delete(id);
      // Re-check: effect may have been toggled off, or container torn down,
      // or the renderer initialized by another path while we were deferred.
      if (!(this.prevEffectEnabled.get(id) ?? false)) return;
      if (!this.containerElement) return;
      if (this.renderers.get(id)?.isInitialized()) return;
      try {
        this.initOverlayRenderer(plugin);
      } catch (err) {
        console.error(`[AnimationEngine] ${id} overlay init error:`, err);
        this.renderers.delete(id);
        return;
      }
      if (plugin.triggerRender !== false) {
        this.triggerRender();
      }
    });
  }

  /**
   * Eagerly create a webgl overlay renderer ahead of the user enabling it, then
   * park it warm. Moves the heavy getContext + float-FBO allocation off the
   * enable click (the freeze) to whenever this is called — engine startup (where
   * nothing is animating yet) or a hover-intent signal that precedes the click.
   * Safe because the render loop gates each effect on its config + assigned tips:
   * a created-but-unassigned renderer never simulates.
   *
   * No-op for non-webgl effects (canvas2d init is already a cheap inline
   * getContext), for renderers already created, or with a deferred init already
   * in flight. The init runs in a rAF so the call site itself never blocks.
   */
  prewarmRenderer(id: EffectType): void {
    if (!this.keepInactiveWebglRenderersWarm) return;

    // LED has its own deferred kind:"led" lifecycle (separate from the generic
    // webgl overlays) but is just as heavy to init — route it to its dedicated
    // warm path so startup/hover prewarm covers it too.
    if (EFFECT_PLUGIN_BY_ID[id]?.kind === "led") {
      this.prewarmLed();
      return;
    }
    const plugin = EFFECT_PLUGIN_BY_ID[id] as
      | (typeof OVERLAY_PLUGINS)[number]
      | undefined;
    // webgl-kind OVERLAY plugins (fire, charcoal) benefit. trails (kind:"trails")
    // inits once at engine startup and is never parked; canvas2d init is already a
    // cheap inline getContext. Any other id is a harmless no-op, so hover-intent
    // can forward whatever effect the pointer is over.
    if (!plugin || plugin.kind !== "webgl") return;
    const oid = id as OverlayEffectId; // narrowed: webgl overlay ⊂ OverlayEffectId
    if (!this.containerElement) return;
    if (this.renderers.get(oid)?.isInitialized()) return;
    if (this.pendingWebglInit.has(oid)) return;
    this.pendingWebglInit.add(oid);
    requestAnimationFrame(() => {
      if (!this.pendingWebglInit.has(oid)) return; // cancelled by dispose()
      this.pendingWebglInit.delete(oid);
      if (!this.containerElement) return;
      if (this.renderers.get(oid)?.isInitialized()) return;
      try {
        this.initOverlayRenderer(plugin);
      } catch (err) {
        console.error(`[AnimationEngine] ${oid} prewarm error:`, err);
        this.renderers.delete(oid);
        return;
      }
      if (this.prevEffectEnabled.get(oid) ?? false) {
        // Enabled while the prewarm was in flight — leave it live and render now.
        this.triggerRender();
      } else {
        this.parkWarm(oid); // hide + deregister from the loop, keep the GL objects
      }
    });
  }

  /** Park a created webgl renderer warm: hide its canvas + deregister it from the
   *  render loop, keeping its GL context/FBOs/programs. The manager retains the
   *  instance in `renderers`; only the loop forgets it (so the loop can idle-stop). */
  private parkWarm(id: OverlayEffectId): void {
    this.setRendererCanvasVisible(id, false);
    // Reset internal + visible state so a stale last frame can't flash when the
    // renderer is un-parked and re-shown. preserveDrawingBuffer:true keeps the
    // last frame in the drawing buffer, so hiding the canvas isn't enough — the
    // sim must be cleared. Contract: every keep-warm webgl renderer's
    // clearSimulation() also blanks the visible default framebuffer (fire
    // web-gl-fire-renderer.ts, charcoal charcoal-spark-renderer.ts). Without
    // this, switching back to a kept-warm effect flashed its last frame.
    const r = this.renderers.get(id) as
      | (EffectRendererLike & { clearSimulation?: () => void })
      | undefined;
    r?.clearSimulation?.();
    this.warmHidden.add(id);
    this.renderLoopService?.updateConfig({
      renderers: { [id]: null },
    } as Partial<RenderLoopConfig>);
  }

  /** Toggle a renderer canvas's display. fire/charcoal/led all expose getCanvas(). */
  private setRendererCanvasVisible(id: EffectType, visible: boolean): void {
    const renderer = this.renderers.get(id) as
      | (EffectRendererLike & { getCanvas?: () => HTMLCanvasElement | null })
      | undefined;
    const canvas = renderer?.getCanvas?.();
    if (canvas) canvas.style.display = visible ? "" : "none";
  }

  /**
   * Sync a single effect overlay by name. Finds the plugin and delegates.
   */
  syncEffectOverlay(effect: OverlayEffectId): void {
    const plugin = EFFECT_PLUGIN_BY_ID[effect] as
      | (typeof OVERLAY_PLUGINS)[number]
      | undefined;
    if (plugin && (plugin.kind === "canvas2d" || plugin.kind === "webgl")) {
      this.syncOverlay(plugin);
    }
  }

  /**
   * Sync all 14 registry-driven overlay effects.
   */
  syncAllOverlays(): void {
    for (const plugin of OVERLAY_PLUGINS) {
      this.syncOverlay(plugin);
    }
  }

  /**
   * Initialize or destroy the LED overlay based on config.enabled.
   * Creates the WebGL canvas lazily on first enable, removes on disable.
   *
   * IMPORTANT: LED WebGL initialization (shader compilation, framebuffer creation)
   * is deferred via requestAnimationFrame to prevent blocking the main thread
   * during Svelte effect processing. On Windows/ANGLE, synchronous shader
   * compilation can hang the page for seconds.
   *
   * LED special-case: deferred lifecycle resists full plugin.createRenderer() integration
   * at the initialization site. The renderer is still stored in the Map once ready.
   */
  syncLedOverlay(): void {
    const currentLed = this.renderers.get("led");
    if (this.ledConfig.enabled) {
      if (currentLed?.isInitialized()) {
        // Already created. If parked warm (keep-warm or a prewarm), un-park:
        // re-show its canvas + re-register with the loop. No re-init — the
        // switch is instant, no shader recompile / FBO realloc (the freeze).
        if (this.ledWarmHidden) {
          this.ledWarmHidden = false;
          this.setRendererCanvasVisible("led", true);
          this.renderLoopService?.updateConfig({
            renderers: { led: currentLed },
          });
          this.triggerRender();
        }
        return;
      }
      if (!this.containerElement || this.ledInitPending) return;
      // Defer WebGL initialization to avoid blocking the reactive effect chain.
      // Without this, shader compilation on Windows/ANGLE can freeze the entire
      // page. Prewarm (startup/hover) avoids even this deferred frame.
      this.ledInitPending = true;
      requestAnimationFrame(() => {
        this.ledInitPending = false;
        // Re-check: config or container may have changed while deferred
        if (!this.ledConfig.enabled || !this.containerElement) return;
        if (this.renderers.get("led")?.isInitialized()) return;
        try {
          const ledRenderer = new WebGLLedRenderer();
          const success = ledRenderer.initialize(
            this.containerElement,
            this.frame.width,
            this.frame.height
          );
          if (success) {
            this.renderers.set("led", ledRenderer);
            this.renderLoopService?.updateConfig({
              renderers: { led: ledRenderer },
            });
            // Trigger a render now that the renderer is ready
            this.triggerRender();
          } else {
            console.warn("[AnimationEngine] LED WebGL initialization failed");
            this.renderers.delete("led");
          }
        } catch (err) {
          console.error("[AnimationEngine] LED overlay init error:", err);
          this.renderers.delete("led");
        }
      });
    } else {
      // Disabled. Keep-warm: park (hide + clear + deregister, keep the GL
      // context) instead of disposing so a re-enable is instant. Guard: this
      // runs on the per-frame setLedConfig path, so without the ledWarmHidden
      // short-circuit it would re-park (and reset the tip tracker) every frame.
      // Mirrors the warmHidden guard for the generic webgl overlays.
      if (this.ledWarmHidden) return;
      if (currentLed?.isInitialized()) {
        if (this.keepInactiveWebglRenderersWarm) {
          this.parkLedWarm();
        } else {
          currentLed.dispose();
          this.renderers.delete("led");
          this.renderLoopService?.updateConfig({ renderers: { led: null } });
          this.ledSampler?.reset();
        }
      }
    }
  }

  /**
   * Park the LED renderer warm: hide its canvas, clear its buffers (so a stale
   * frame / trail energy can't flash on re-show — preserveDrawingBuffer:true),
   * and deregister it from the render loop, keeping its GL context/FBOs/programs
   * alive so a later enable is instant. Mirrors parkWarm for the generic webgl
   * overlays; LED has a dedicated path because of its kind:"led" lifecycle.
   */
  private parkLedWarm(): void {
    this.setRendererCanvasVisible("led", false);
    const led = this.renderers.get("led") as
      | (EffectRendererLike & { clearSimulation?: () => void })
      | undefined;
    led?.clearSimulation?.();
    this.ledWarmHidden = true;
    this.renderLoopService?.updateConfig({ renderers: { led: null } });
    this.ledSampler?.reset();
  }

  /**
   * Eagerly create + park the LED renderer ahead of the user enabling it,
   * moving its heavy synchronous init (5 shader programs + 8 float FBOs) off the
   * switch frame to startup/hover. LED-specific sibling of prewarmRenderer's
   * generic webgl path. The init runs in a rAF so the call site never blocks.
   */
  private prewarmLed(): void {
    if (!this.containerElement) return;
    if (this.renderers.get("led")?.isInitialized()) return;
    if (this.ledInitPending) return;
    this.ledInitPending = true;
    requestAnimationFrame(() => {
      this.ledInitPending = false;
      if (!this.containerElement) return;
      if (this.renderers.get("led")?.isInitialized()) return;
      try {
        const ledRenderer = new WebGLLedRenderer();
        const success = ledRenderer.initialize(
          this.containerElement,
          this.frame.width,
          this.frame.height
        );
        if (!success) {
          this.renderers.delete("led");
          return;
        }
        this.renderers.set("led", ledRenderer);
        if (this.ledConfig.enabled) {
          // Enabled while the prewarm was in flight — go live now.
          this.renderLoopService?.updateConfig({
            renderers: { led: ledRenderer },
          });
          this.triggerRender();
        } else {
          // Park warm: hide + clear, leave it out of the loop.
          this.setRendererCanvasVisible("led", false);
          ledRenderer.clearSimulation();
          this.ledWarmHidden = true;
        }
      } catch (err) {
        console.error("[AnimationEngine] LED prewarm error:", err);
        this.renderers.delete("led");
      }
    });
  }

  // ── Config setters / getters ────────────────────────────────────────

  /**
   * Set fire overlay configuration. Called by visibility state changes.
   */
  setFireConfig(config: Partial<FireOverlayConfig>): void {
    const previousProfile = this.fireConfig.renderingProfile ?? "cinematic";
    Object.assign(this.fireConfig, config);
    // Forward quality setting to renderer if present
    if (config.quality !== undefined && this.fireRenderer) {
      this.fireRenderer.setQuality(config.quality);
    }
    if (
      config.renderingProfile !== undefined &&
      config.renderingProfile !== previousProfile &&
      this.fireRenderer?.isInitialized()
    ) {
      // Natural and Liquid Fire store different data in the thermal field.
      // Clearing on a style switch prevents one look from briefly bleeding
      // into the other while the new flame establishes itself.
      this.fireRenderer.clearSimulation();
    }
    this.syncEffectOverlay("fire");

    // Trigger a render to start/stop fire loop
    this.triggerRender();
  }

  /**
   * Get current fire overlay configuration.
   */
  getFireConfig(): FireOverlayConfig {
    return { ...this.fireConfig };
  }

  /**
   * Set LED overlay configuration. Called by visibility state changes.
   */
  setLedConfig(config: Partial<LedOverlayConfig>): void {
    Object.assign(this.ledConfig, config);
    this.syncLedOverlay();

    // Trigger a render to start/stop LED loop
    this.triggerRender();
  }

  /**
   * Get current LED overlay configuration.
   */
  getLedConfig(): LedOverlayConfig {
    return { ...this.ledConfig };
  }

  /**
   * Set per-cell tip effect map. When provided, this map takes priority
   * over the global visibility manager's map in getFrameParams().
   * Also syncs renderer lifecycle flags so per-cell assignments
   * correctly initialize/destroy overlay renderers.
   */
  setCellTipEffectMap(map: TipEffectMap | undefined): void {
    this.cellTipEffectMap = map;
    this.syncEffectFlagsFromEffectiveMap();
  }

  /**
   * Set per-cell tip effort map. When provided, this map takes priority
   * over the global visibility manager's map in getFrameParams().
   */
  setCellTipEffortMap(map: TipEffortMap | undefined): void {
    this.cellTipEffortMap = map;
  }

  // ── Effective-map queries ────────────────────────────────────────────

  /**
   * Check whether any tip in the effective map (cell-level override first,
   * then global VM map) is assigned the given effect.
   */
  hasEffectInEffectiveMap(effect: EffectType): boolean {
    const effectiveMap =
      this.cellTipEffectMap ?? this.effectsConfigState?.tipEffectMap ?? {};
    return Object.values(effectiveMap).some((a) => a.effect === effect);
  }

  /**
   * Re-derive all prevEffectEnabled flags (and ledConfig.enabled) from the
   * effective tipEffectMap. Called when the cell-level map changes so that
   * per-cell assignments correctly spin up / tear down overlay renderers.
   */
  syncEffectFlagsFromEffectiveMap(): void {
    for (const plugin of OVERLAY_PLUGINS) {
      const id = plugin.id as OverlayEffectId;
      const has = this.hasEffectInEffectiveMap(id);
      const prev = this.prevEffectEnabled.get(id) ?? false;
      if (has !== prev) {
        this.prevEffectEnabled.set(id, has);
        this.syncOverlay(plugin);
      }
    }

    const hasLed = this.hasEffectInEffectiveMap("led");
    if (hasLed !== this.ledConfig.enabled) {
      this.setLedConfig({ enabled: hasLed });
    }
  }

  // ── Layer Ordering ──────────────────────────────────────────────────

  /**
   * Push each effect's behind/front layer override to its overlay canvas.
   * Safe to call any time; renderers that aren't initialized yet are skipped.
   */
  syncEffectLayers(): void {
    if (!this.effectsConfigState) return;
    const state = this.effectsConfigState;
    const apply = (
      id: string,
      renderer: { setCanvasZIndex?: (z: number) => void } | null
    ) => {
      if (!renderer?.setCanvasZIndex) return;
      renderer.setCanvasZIndex(resolveEffectZ(id, state.getEffectLayer(id)));
    };
    apply("trails", this.trailOverlay);
    apply("led", this.ledRenderer);
    for (const plugin of OVERLAY_PLUGINS) {
      apply(
        plugin.id,
        this.renderers.get(plugin.id as OverlayEffectId) ?? null
      );
    }
  }

  // ── Trail Overlay Factory ───────────────────────────────────────────

  /** Runtime A/B toggle: set `window.__TKA_TRAIL_GPU = false` before
   *  a sequence starts to use the legacy Canvas2D overlay instead of
   *  the WebGL2 backend. Default is WebGL2.
   *  Thin wrapper — factory logic now lives in trailsEffectPlugin.createRenderer(). */
  createTrailOverlay(): ITrailOverlayCanvas {
    return EFFECT_PLUGIN_BY_ID.trails.createRenderer() as unknown as ITrailOverlayCanvas;
  }

  // ── Resize ──────────────────────────────────────────────────────────

  /** Resize all effect overlay canvases to the new frame. A bare number is a
   *  square frame of that side (offscreen export contexts). */
  resizeAll(next: CanvasFrame | number): void {
    const frame = typeof next === "number" ? squareFrame(next) : next;
    this.canvasSize = frame.size;
    this.frame = frame;
    const { width, height } = frame;
    // Resize all registry-driven renderers (canvas2d + webgl overlays)
    for (const plugin of OVERLAY_PLUGINS) {
      this.renderers.get(plugin.id as OverlayEffectId)?.resize?.(width, height);
    }
    // LED + trail handled separately
    this.renderers.get("led")?.resize?.(width, height);
    this.renderers.get("trails")?.resize?.(width, height);
    // Reset fire/LED tip trackers so positions recalculate at the new canvas size.
    // Without this, after HMR the tracker uses stale positions from the old size.
    this.fireTipTracker?.reset();
    this.ledSampler?.reset();
  }

  // ── Wire post-init overlays ─────────────────────────────────────────

  /**
   * Re-wire overlay renderers that may have been created during the async
   * initializeCanvas gap. Called after renderLoopService is ready.
   */
  wirePostInitOverlays(): void {
    // Build a single renderers partial and send one updateConfig call.
    const renderersUpdate: Partial<Record<EffectType, EffectRendererLike>> = {};
    for (const plugin of OVERLAY_PLUGINS) {
      const renderer = this.renderers.get(plugin.id as OverlayEffectId);
      if (renderer?.isInitialized()) {
        renderersUpdate[plugin.id as OverlayEffectId] = renderer;
      }
    }
    const led = this.renderers.get("led");
    if (led?.isInitialized()) {
      renderersUpdate["led"] = led;
    }
    if (Object.keys(renderersUpdate).length > 0 && this.renderLoopService) {
      this.renderLoopService.updateConfig({ renderers: renderersUpdate });
    }
  }

  /**
   * Ensure overlays that should be enabled are actually created.
   * Called at end of initialize() in case $effects haven't triggered yet.
   */
  ensureEnabledOverlays(): void {
    for (const plugin of OVERLAY_PLUGINS) {
      const id = plugin.id as OverlayEffectId;
      const enabled = this.prevEffectEnabled.get(id) ?? false;
      if (enabled && !this.renderers.get(id)?.isInitialized()) {
        this.syncOverlay(plugin);
      }
    }
    if (this.ledConfig.enabled && !this.renderers.get("led")?.isInitialized()) {
      this.syncLedOverlay();
    }
  }

  /**
   * Initialize LED state from EffectsConfigState values.
   */
  initLedConfigFromEffectsState(ecs: EffectsConfigState | null): void {
    const tipMap = ecs?.tipEffectMap ?? {};
    const enabled = Object.values(tipMap).some((a) => a.effect === "led");
    Object.assign(
      this.ledConfig,
      cloneLedData(ecs?.led ?? DEFAULT_LED_INTENT),
      { enabled }
    );
  }

  /**
   * Sync LED config from EffectsConfigState. Returns a partial diff for
   * batched setLedConfig() call.
   */
  diffLedConfigFromEffectsState(
    ecs: EffectsConfigState | null
  ): Partial<LedOverlayConfig> {
    const intent = ecs?.led ?? DEFAULT_LED_INTENT;
    const current = this.ledConfig;
    const ledDiff: Partial<LedOverlayConfig> = {};

    const ledEnabled = this.hasEffectInEffectiveMap("led");
    if (ledEnabled !== current.enabled) ledDiff.enabled = ledEnabled;

    // Device and pattern are compared structurally: a change to either forces
    // the sampler to re-materialize, so cheap identity checks are not enough.
    if (
      intent.device.kind !== current.device.kind ||
      intent.device.ledCount !== current.device.ledCount
    ) {
      ledDiff.device = { ...intent.device };
    }
    if (JSON.stringify(intent.pattern) !== JSON.stringify(current.pattern)) {
      ledDiff.pattern = cloneLedData(intent.pattern);
    }
    if (intent.cycleDuration !== current.cycleDuration) {
      ledDiff.cycleDuration = intent.cycleDuration;
    }
    if (
      intent.look.glare !== current.look.glare ||
      intent.look.brightness !== current.look.brightness ||
      intent.look.shutter.mode !== current.look.shutter.mode ||
      shutterParam(intent.look.shutter) !== shutterParam(current.look.shutter)
    ) {
      ledDiff.look = { ...intent.look };
    }

    return ledDiff;
  }

  // ── Dispose ─────────────────────────────────────────────────────────

  dispose(): void {
    // Cancel any in-flight deferred webgl init; the rAF callback bails when its
    // id is no longer present, so clearing the set acts as the cancel signal.
    this.pendingWebglInit.clear();
    this.warmHidden.clear();

    // Dispose all registry-driven renderers (canvas2d + webgl overlays)
    for (const plugin of OVERLAY_PLUGINS) {
      const renderer = this.renderers.get(plugin.id as OverlayEffectId);
      renderer?.dispose();
      this.renderers.delete(plugin.id as OverlayEffectId);
    }
    this.fireTipTracker = null;

    // Dispose LED overlay (also prevent any pending deferred init from running)
    this.ledConfig.enabled = false;
    this.ledInitPending = false;
    this.ledWarmHidden = false;
    const led = this.renderers.get("led");
    led?.dispose();
    this.renderers.delete("led");
    this.ledSampler = null;

    // Dispose trail overlay
    const trail = this.renderers.get("trails");
    trail?.dispose();
    this.renderers.delete("trails");
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private triggerRender(): void {
    if (this.renderLoopService && this.getFrameParams) {
      this.renderLoopService.triggerRender(this.getFrameParams);
    }
  }
}
