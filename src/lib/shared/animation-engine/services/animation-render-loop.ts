/**
 * @deprecated Superseded by render-graph FrameGraph + RenderBackend.executeFrame().
 * The render-graph dispatches passes via its own RAF loop with z-ordered
 * scheduling. This file remains active until the render-graph is promoted.
 *
 * Animation Render Loop Implementation
 *
 * Manages the requestAnimationFrame render loop for AnimatorCanvas.
 * Handles RAF scheduling, trail point gathering, and scene rendering.
 */

import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import type { ITrailCapturer as TrailCapturer } from "$lib/shared/animation-engine/services/ITrailCapturer";
import type { TrailPoint, TrailSettings } from "../domain/types/trail-types";
import { TrailMode } from "../domain/types/trail-types";
import type { AnimationPathCache } from "$lib/shared/animation-engine/services/animation-path-cache";
import type { FrameBudgetMonitor } from "$lib/shared/animation-engine/services/frame-budget-monitor";
import type { WebGLFireRenderer } from "./fire/web-gl-fire-renderer";
import type { CharcoalSparkRenderer } from "./charcoal/charcoal-spark-renderer";
import type {
  RenderedPropTransform,
  PropTipData,
} from "../domain/types/fire-types";
import type { FireTipTrackerConfig } from "./fire-tip-tracker";
import type { FireTipTracker } from "./fire-tip-tracker";
import type { WebGLLedRenderer } from "$lib/shared/animation-engine/services/led/web-gl-led-renderer";
import type { LedSamplerConfig } from "./led-sampler";
import type { LedSampler } from "./led-sampler";
import type { ITrailOverlayCanvas } from "./ITrailOverlayCanvas";
import type {
  RenderLoopConfig,
  RenderFrameParams,
} from "./IAnimationRenderLoop";
import type { EffectRendererLike } from "./effects/effect-renderer";
import { QualityTier } from "../domain/types/quality-types";
import { effectErrorSignal } from "../state/effect-error-signal.svelte";
import { resolveEffect } from "../domain/types/tip-effect-types";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import {
  dimHex,
  spotlightFactor,
  tunnelPropColor,
  type TunnelLayerSelection,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";
import type { FireTipUpdateResult } from "./fire-tip-tracker";
import type { FireFrameInput } from "../domain/types/fire-types";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MandalaOverlayCanvas } from "$lib/shared/mandala/services/mandala-overlay-canvas";
import { MandalaPathPreparer } from "$lib/shared/mandala/services/mandala-path-preparer";
import {
  DEFAULT_MANDALA_OVERLAY_CONFIG,
  type MandalaOverlayConfig,
  MANDALA_GUIDE_FLOOR_OPACITY,
} from "$lib/shared/mandala/domain/mandala-overlay-types";
import type { MandalaHandVisibility } from "$lib/shared/mandala/domain/mandala-types";
import type { RenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";

// Longtask observer singleton - one PerformanceObserver shared across every
// AnimationRenderLoop instance. Without this, each loop attaches its own
// observer and every main-thread stall produces N duplicate log lines where
// N is the number of live AnimatorCanvas instances on the page.
type LongTaskListener = (durationMs: number) => void;
const longTaskListeners = new Set<LongTaskListener>();
let longTaskObserverInstalled = false;
let lastBigLongTaskLogTime = 0;

function installLongTaskObserver(): void {
  if (longTaskObserverInstalled) return;
  if (typeof PerformanceObserver === "undefined") return;
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  try {
    const observer = new PerformanceObserver((list) => {
      const now = performance.now();
      const warnEnabled =
        typeof window !== "undefined" &&
        (window as { __TKA_FPS_LOG?: boolean }).__TKA_FPS_LOG === true;
      for (const entry of list.getEntries()) {
        for (const listener of longTaskListeners) listener(entry.duration);
        // Warn once per 2s for individually-huge stalls when the FPS diagnostic
        // is enabled. Otherwise the listener just accumulates duration for the
        // FPS summary window (which itself is gated).
        if (
          warnEnabled &&
          entry.duration > 150 &&
          now - lastBigLongTaskLogTime > 2000
        ) {
          lastBigLongTaskLogTime = now;
          console.warn(
            `[LongTask] ${entry.duration.toFixed(0)}ms main-thread block`
          );
        }
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
    longTaskObserverInstalled = true;
  } catch {
    // Observer setup failed - silently degrade (FPS summary still works).
  }
}

function subscribeToLongTasks(listener: LongTaskListener): () => void {
  installLongTaskObserver();
  longTaskListeners.add(listener);
  return () => longTaskListeners.delete(listener);
}

function hasTrailTips(map: TipEffectMap | undefined): boolean {
  if (!map) return false;
  return Object.values(map).some((a) => a.effect === "trails");
}

const MANDALA_GUIDE_CONFIG: MandalaOverlayConfig = {
  ...DEFAULT_MANDALA_OVERLAY_CONFIG,
  enabled: true,
  mode: "guide",
  // Shared with the Shape Matrix hero floor so the live trail remains the
  // brightest read while it runs directly over the mandala path, and the
  // still floor → live guide handoff changes nothing on screen.
  opacity: MANDALA_GUIDE_FLOOR_OPACITY,
};

/**
 * Context shared across all registry effect dispatches within a single frame.
 */
interface EffectDispatchContext {
  tipMap: TipEffectMap;
  sharedTips: PropTipData[];
  params: RenderFrameParams;
  currentTime: number;
  renderedTransforms:
    | {
        left: RenderedPropTransform | null;
        right: RenderedPropTransform | null;
      }
    | undefined;
  /** Live prop sprite images — echo ghosts these at past poses. */
  propImages:
    | { left: HTMLImageElement | null; right: HTMLImageElement | null }
    | undefined;
  loopDetectedThisFrame: boolean;
  isSeamlesslyLoopable: boolean;
}

/**
 * Descriptor for a single registry-driven effect.
 * Each entry defines how to get the renderer, build the tip input,
 * and invoke the renderer's renderFrame method.
 */
type EffectRenderer = {
  isInitialized(): boolean;
  clear(): void;
  renderFrame: (...args: unknown[]) => void;
};

interface EffectDispatchEntry {
  effect: EffectType;
  configKey: keyof RenderFrameParams;
  getRenderer: (loop: AnimationRenderLoop) => EffectRenderer | null;
  needsDt: boolean;
  resetTimeOnInactive: boolean;
  buildInput: (ctx: EffectDispatchContext, dt: number) => unknown;
  render: (
    renderer: EffectRenderer,
    config: unknown,
    input: unknown,
    dt: number,
    ctx: EffectDispatchContext
  ) => void;
}

export class AnimationRenderLoop {
  private renderer: AnimationRenderer | null = null;
  private TrailCapturer: TrailCapturer | null = null;
  private pathCache: AnimationPathCache | null = null;
  private frameBudgetMonitor: FrameBudgetMonitor | null = null;
  private fireTipTracker: FireTipTracker | null = null;
  private ledSampler: LedSampler | null = null;
  private onEffectError: ((effectName: string, error: Error) => void) | null =
    null;
  private mandalaOverlay: MandalaOverlayCanvas | null = null;
  private readonly mandalaPathPreparer = new MandalaPathPreparer();
  private previousMandalaPaths: ReturnType<MandalaPathPreparer["prepare"]> =
    null;
  /**
   * Registry-driven renderer map. Keyed by EffectType id.
   * Populated/updated via initialize() and updateConfig().
   * Replaces the 16 hand-typed named renderer fields from pre-P2.4.
   */
  private renderers = new Map<EffectType, EffectRendererLike>();
  private canvasSize: number = 950;
  private lastTrailFrameTime: number = 0;
  // Timestamp of the last frame that actually stamped the trail accumulator.
  // Separate from lastTrailFrameTime (which uses 0 as an uninitialized
  // sentinel) so the export-duplicate guard works correctly even when the
  // virtualTime is exactly 0 (the first export frame: i/fps * 1000 = 0).
  private lastStampedTrailTime: number | null = null;
  // The texture-load/crossfade signals can begin a render tick after the frame
  // parameters switch to the new prop type. Remember the last geometry identity
  // seen by the trail path so that exact boundary frame is always segmented.
  private previousLeftTrailPropType: string | null | undefined = undefined;
  private previousRightTrailPropType: string | null | undefined = undefined;
  private rafId: number | null = null;
  // When true, the free-running rAF loop is disabled (offscreen export). The
  // deterministic renderSync() path still renders; start()/triggerRender() and
  // the self-reschedule bail so effect keep-warm/prewarm can't restart the loop
  // and race the export driver (which pinned prop fade alpha to 0 → props
  // dropped from fire/charcoal/LED exports).
  private externallyDriven = false;
  // Canonical off-screen / hidden-tab gate. Null means "always render" (the
  // pre-gating behavior), which is what every deterministic driver keeps.
  private activityGate: RenderActivityGate | null = null;
  private unsubscribeGate: (() => void) | null = null;
  private needsRender: boolean = false;
  private getFrameParamsCallback: (() => RenderFrameParams) | null = null;
  private isDisposed: boolean = false; // Prevent RAF from continuing after disposal

  // Effect error tracking: auto-recover on first failure, escalate on repeated failures
  // Fire and LED keep dedicated fields (special dispatch logic)
  private consecutiveFireErrors: number = 0;
  private consecutiveLedErrors: number = 0;
  private fireDisabledByError: boolean = false;
  private ledDisabledByError: boolean = false;

  // Registry effects: error tracking via Maps keyed by EffectType
  private readonly effectErrors = new Map<EffectType, number>();
  private readonly effectDisabled = new Map<EffectType, boolean>();
  private readonly effectLastFrameTime = new Map<EffectType, number>();
  private static readonly EFFECT_ERROR_THRESHOLD = 3;

  // Loop detection for cache-based trail gathering and fire frame cache
  // Tracks when the animation loops to prevent trail artifacts
  private previousStep: number = 0;
  private loopOccurredAtStep: number | null = null;
  /** True on the frame where a loop was detected. Reset each frame. */
  private loopDetectedThisFrame: boolean = false;
  /** True after the first loop has occurred. Prevents wrap-around on initial play. */
  private hasLoopedAtLeastOnce: boolean = false;
  /** Timestamp when the current loop started. Used for timestamp-indexed fire cache. */
  private loopStartTime: number = 0;

  // Track quality tier for fire adaptive quality
  private previousQualityTier: QualityTier | null = null;

  // Track 2D overlay suppression state to clear canvases on transition
  private wasSuppressed: boolean = false;

  // Frame drop diagnostics - logs slow frames to console for debugging.
  // Disabled by default. Enable via browser console: window.__TKA_FRAME_DROP_LOG = true
  private frameDropLoggingEnabled = false;
  private static readonly FRAME_DROP_THRESHOLD_MS = 20; // ~50fps - anything below 60fps
  private lastFrameTime = 0; // Track RAF-to-RAF gap (true frame duration including browser overhead)
  private lastFrameDropLogTime = 0; // Rate-limit logs to avoid feedback loop with console recording extensions
  private static readonly FRAME_DROP_LOG_COOLDOWN_MS = 2000; // Max 1 log per 2 seconds
  private framesRenderedSinceStart = 0; // Warm-up grace period - skip frame drop logging for first N frames
  private static readonly WARMUP_FRAMES = 10; // First 10 frames always have high RAF gaps

  // Rolling FPS summary - logs once per second while playing so you can see
  // average FPS + min/max frame time + frame count without spamming per-frame.
  // Enabled by default; gate with window.__TKA_FPS_LOG = false to silence.
  private fpsWindowStart = 0; // performance.now() at window open
  private fpsWindowFrames = 0; // frames rendered in current window
  private fpsWindowMinFrameMs = Infinity;
  private fpsWindowMaxFrameMs = 0;
  private fpsWindowMaxRenderMs = 0; // slowest render() call this window
  private fpsWindowRenderMsSum = 0; // sum of render() times this window
  private fpsWindowDrops = 0; // frames this window that breached budget
  private fpsWindowLongTaskMs = 0; // total longtask ms attributed to window (read from module singleton)
  private longTaskSubscriberDispose: (() => void) | null = null;

  // Idle auto-stop: after N consecutive idle frames (not playing, no needsRender, no
  // effects active), stop the RAF loop. Prevents 16+ arrange grid cells from each
  // burning a permanent RAF loop just because trails are globally force-enabled.
  // triggerRender() restarts the loop whenever actual rendering is needed.
  private consecutiveIdleFrames = 0;
  private static readonly IDLE_STOP_THRESHOLD = 60; // ~1 second at 60fps

  // CRITICAL: Reusable arrays to prevent GC pressure on mobile
  // These are reused every frame instead of allocating new arrays
  private reusableLeftTrailPoints: TrailPoint[] = [];
  private reusableRightTrailPoints: TrailPoint[] = [];
  // Additional tunnel layer trail points (lazily populated)
  private reusableAdditionalLayerTrails: Array<{
    left: TrailPoint[];
    right: TrailPoint[];
  }> = [];

  initialize(config: RenderLoopConfig): void {
    this.renderer = config.renderer;
    this.TrailCapturer = config.TrailCapturer;
    this.pathCache = config.pathCache;
    this.canvasSize = config.canvasSize;
    this.frameBudgetMonitor = config.frameBudgetMonitor ?? null;
    this.fireTipTracker = config.fireTipTracker ?? null;
    this.ledSampler = config.ledSampler ?? null;
    this.onEffectError = config.onEffectError ?? null;
    this.mandalaOverlay = config.mandalaOverlay ?? null;
    this.previousLeftTrailPropType = undefined;
    this.previousRightTrailPropType = undefined;

    // Merge the initial renderers record into the Map.
    if (config.renderers) {
      for (const [id, renderer] of Object.entries(config.renderers)) {
        if (renderer != null) {
          this.renderers.set(id as EffectType, renderer);
        }
      }
    }

    // Subscribe to the module-singleton longtask observer so the FPS summary
    // can attribute main-thread stalls to the window in which they occurred.
    // One observer serves all AnimationRenderLoop instances - without the
    // singleton, N loops produced N duplicate log lines per longtask.
    if (!this.longTaskSubscriberDispose) {
      this.longTaskSubscriberDispose = subscribeToLongTasks((durationMs) => {
        this.fpsWindowLongTaskMs += durationMs;
      });
    }
  }

  updateConfig(config: Partial<RenderLoopConfig>): void {
    if (config.renderer !== undefined) this.renderer = config.renderer;
    if (config.TrailCapturer !== undefined)
      this.TrailCapturer = config.TrailCapturer;
    if (config.pathCache !== undefined) this.pathCache = config.pathCache;
    if (
      config.canvasSize !== undefined &&
      config.canvasSize !== this.canvasSize
    ) {
      this.canvasSize = config.canvasSize;
      this.mandalaOverlay?.resize(this.canvasSize, this.canvasSize);
      this.mandalaPathPreparer.clearCache();
      this.previousMandalaPaths = null;
    }
    if (config.frameBudgetMonitor !== undefined)
      this.frameBudgetMonitor = config.frameBudgetMonitor ?? null;
    if (config.fireTipTracker !== undefined)
      this.fireTipTracker = config.fireTipTracker ?? null;
    if (config.ledSampler !== undefined)
      this.ledSampler = config.ledSampler ?? null;
    if (config.onEffectError !== undefined)
      this.onEffectError = config.onEffectError ?? null;
    if (config.mandalaOverlay !== undefined) {
      this.mandalaOverlay = config.mandalaOverlay;
      this.mandalaPathPreparer.clearCache();
      this.previousMandalaPaths = null;
    }
    // Merge renderer additions/removals from the registry record.
    if (config.renderers !== undefined) {
      for (const [id, renderer] of Object.entries(
        config.renderers as Record<
          string,
          EffectRendererLike | null | undefined
        >
      )) {
        if (renderer != null) {
          this.renderers.set(id as EffectType, renderer);
        } else {
          this.renderers.delete(id as EffectType);
        }
      }
    }
  }

  start(getFrameParams: () => RenderFrameParams): void {
    if (this.externallyDriven) return;
    this.getFrameParamsCallback = getFrameParams;
    this.framesRenderedSinceStart = 0;
    if (!this.gateAllows()) return;
    if (this.rafId === null && this.renderer) {
      this.rafId = requestAnimationFrame(this.renderLoop);
    }
  }

  /**
   * Route this loop through the canonical off-screen / hidden-tab gate.
   * See `shared/render-gating/render-activity-gate.ts`.
   *
   * While the gate is closed the rAF stops entirely: the canvas keeps its last
   * painted frame and costs nothing. When it reopens, the frame clock is
   * re-seeded before the first frame so a surface parked off screen for thirty
   * seconds cannot resume with a thirty-second timestep, and the loop restarts
   * from whatever the last caller asked for.
   *
   * An externally driven loop (offscreen export) is never gated — it has no
   * rAF to pause and its frames are produced deliberately.
   */
  setActivityGate(gate: RenderActivityGate | null): void {
    if (gate === this.activityGate) return;
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    this.activityGate = gate;
    if (gate) {
      this.unsubscribeGate = gate.subscribe((active) => {
        if (active) this.resumeFromGate();
        else this.pauseForGate();
      });
      if (!gate.active) this.pauseForGate();
      return;
    }
    this.resumeFromGate();
  }

  private gateAllows(): boolean {
    if (this.externallyDriven) return true;
    return this.activityGate === null || this.activityGate.active;
  }

  /**
   * Park the loop without touching the render state it will resume into. Unlike
   * stop(), this keeps `getFrameParamsCallback` and the effect-error bookkeeping
   * so scrolling back into view resumes the same picture rather than re-running
   * a cold start.
   */
  private pauseForGate(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.resetFrameClocks();
  }

  private resumeFromGate(): void {
    if (this.isDisposed || this.externallyDriven) return;
    if (this.rafId !== null) return;
    if (!this.renderer || !this.getFrameParamsCallback) return;
    this.resetFrameClocks();
    // A surface that has been frozen needs one frame drawn on arrival even if
    // nothing else is "active work", or it reveals a stale composite.
    this.needsRender = true;
    this.consecutiveIdleFrames = 0;
    this.framesRenderedSinceStart = 0;
    this.rafId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * Drop every wall-clock anchor so the next frame derives its own delta from
   * scratch. `lastFrameTime = 0` makes dtSeconds fall back to 1/60 instead of
   * the full paused span; the trail and loop anchors re-seed the same way.
   */
  private resetFrameClocks(): void {
    this.lastFrameTime = 0;
    this.lastTrailFrameTime = 0;
    this.lastStampedTrailTime = null;
    this.loopStartTime = 0;
    this.effectLastFrameTime.clear();
    this.fpsWindowStart = 0;
  }

  /** See IAnimationRenderLoop.setExternallyDriven. Disables the rAF loop for
   *  the offscreen export engine so effect keep-warm/prewarm triggerRender()
   *  calls can't restart it and race the deterministic renderSync() driver. */
  setExternallyDriven(value: boolean): void {
    this.externallyDriven = value;
    if (value) this.stop();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.getFrameParamsCallback = null;
    // Reset loop tracking on stop
    this.previousStep = 0;
    this.loopOccurredAtStep = null;
    this.hasLoopedAtLeastOnce = false;
    this.loopStartTime = 0;
    // Reset effect error tracking so effects can retry on next start
    this.consecutiveFireErrors = 0;
    this.consecutiveLedErrors = 0;
    this.fireDisabledByError = false;
    this.ledDisabledByError = false;
    this.effectErrors.clear();
    this.effectDisabled.clear();
    this.effectLastFrameTime.clear();
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  renderFrame(params: RenderFrameParams): void {
    if (!this.renderer) return;
    this.render(params, performance.now());
  }

  triggerRender(getFrameParams: () => RenderFrameParams): void {
    if (this.externallyDriven) return;
    this.needsRender = true;
    this.consecutiveIdleFrames = 0; // Reset idle counter - new work incoming
    this.getFrameParamsCallback = getFrameParams;
    // Off screen or hidden tab: remember the request, draw it on resume.
    if (!this.gateAllows()) return;
    if (this.rafId === null && this.renderer) {
      this.framesRenderedSinceStart = 0; // Reset warm-up on loop restart
      this.rafId = requestAnimationFrame(this.renderLoop);
    }
  }

  /** Render ONE frame synchronously, now, with an explicit sim dt (seconds).
   *  Bypasses rAF/needsRender scheduling — used by the offscreen export path so
   *  rendering is deterministic. The free-running loop is never started. */
  renderSync(
    params: RenderFrameParams,
    timeMs: number,
    dtSeconds: number
  ): void {
    this.render(params, timeMs, dtSeconds);
  }

  setTargetFps(_fps: number | null): void {
    // No-op: FPS throttling removed - time-based animation interpolation
    // makes frame rate differences imperceptible in the preview.
    // FPS setting only affects the exported video file.
  }

  /** Snapshot of render loop state for diagnostic reports. */
  getDiagnostics(): Record<string, unknown> {
    const fireRenderer = this.renderers.get("fire") as
      | (WebGLFireRenderer & { getDiagnostics?: () => unknown })
      | undefined;
    const charcoalRenderer = this.renderers.get("charcoal");
    const ledRenderer = this.renderers.get("led");
    const trailOverlay = this.renderers.get("trails");
    return {
      isRunning: this.rafId !== null,
      isDisposed: this.isDisposed,
      previousStep: this.previousStep,
      loopDetectedThisFrame: this.loopDetectedThisFrame,
      hasLoopedAtLeastOnce: this.hasLoopedAtLeastOnce,
      loopStartTime: this.loopStartTime,
      qualityTier: this.previousQualityTier,
      consecutiveFireErrors: this.consecutiveFireErrors,
      consecutiveLedErrors: this.consecutiveLedErrors,
      fireDisabledByError: this.fireDisabledByError,
      ledDisabledByError: this.ledDisabledByError,
      consecutiveIdleFrames: this.consecutiveIdleFrames,
      framesRenderedSinceStart: this.framesRenderedSinceStart,
      canvasSize: this.canvasSize,
      fireRendererInitialized: fireRenderer?.isInitialized() ?? false,
      charcoalRendererInitialized: charcoalRenderer?.isInitialized() ?? false,
      ledRendererInitialized: ledRenderer?.isInitialized() ?? false,
      hasTrailOverlay: !!trailOverlay,
      fireTipDiagnostics: this.fireTipTracker?.getDiagnostics?.() ?? null,
      fireRendererDiagnostics: fireRenderer?.getDiagnostics?.() ?? null,
    };
  }

  dispose(): void {
    // Mark as disposed FIRST to stop any pending RAF callbacks
    this.isDisposed = true;
    this.stop();
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    this.activityGate = null;
    this.longTaskSubscriberDispose?.();
    this.longTaskSubscriberDispose = null;
    this.renderer = null;
    this.TrailCapturer = null;
    this.pathCache = null;
    this.frameBudgetMonitor = null;
    this.getFrameParamsCallback = null;
    this.fireTipTracker = null;
    this.ledSampler = null;
    this.mandalaOverlay = null;
    this.mandalaPathPreparer.clearCache();
    this.previousMandalaPaths = null;
    this.previousLeftTrailPropType = undefined;
    this.previousRightTrailPropType = undefined;
    // Dispose all renderers in the registry map.
    // AnimationRenderLoop does not own the renderers' DOM canvas elements
    // (EffectRendererManager owns those); we only hold the reference.
    // Clear the map without calling dispose() here — callers that own the
    // renderers (EffectRendererManager.dispose()) will call dispose() on them.
    this.renderers.clear();
    // Clear reusable arrays to free memory
    this.reusableLeftTrailPoints.length = 0;
    this.reusableRightTrailPoints.length = 0;
    this.reusableAdditionalLayerTrails.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Registry-driven effect dispatch infrastructure
  // ---------------------------------------------------------------------------

  /**
   * Build the flat emitter list for the per-tip overlay effects. Unlike
   * buildFourPosTips (4 fixed slots, base props only), this carries every
   * matching tip including tunnel kaleidoscope layers (propIndex >= 2), each
   * tagged with its end (for tracking-mode) and its spectrum-gated color (for
   * prop-colored effects). Color gating mirrors the trail overlay: base props
   * use the trail colors; layers use the spectrum fan when rainbow is on, base
   * colors when off.
   */
  private static buildEmitterTips(
    tips: PropTipData[],
    tipMap: TipEffectMap,
    effect: EffectType,
    params: RenderFrameParams
  ): EmitterTip[] {
    const layerCount = params.props.additionalLayers.length;
    const spectrum =
      (params.props.tunnelSpectrum ?? true) && !params.props.tunnelPropColors;
    const baseLeft =
      params.props.tunnelPropColors?.left ?? params.trailSettings.leftColor;
    const baseRight =
      params.props.tunnelPropColors?.right ?? params.trailSettings.rightColor;
    const out: EmitterTip[] = [];
    for (const t of tips) {
      if (resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) !== effect)
        continue;
      out.push({
        x: t.x,
        y: t.y,
        propIndex: t.propIndex,
        tipIndex: t.tipIndex,
        end: t.tipIndex === 0 ? "A" : "B",
        color: AnimationRenderLoop.resolveTipColor(
          t.propIndex,
          layerCount,
          spectrum,
          baseLeft,
          baseRight,
          params.props.tunnelSelectedLayer ?? null
        ),
      });
    }
    return out;
  }

  /**
   * Build array-of-tips input for bloom and pulse (effects that need
   * {x, y, propIndex, tipIndex, leftColor, rightColor}[] with center fallback).
   */
  /**
   * Resolve a tip's prop color the way the trail overlay does: the base pair
   * (propIndex 0/1) uses the trail colors; overlaid tunnel layers (propIndex >= 2)
   * fan across the spectrum when the rainbow toggle is on, base colors by parity
   * (even = left family, odd = right) when off. Shared by buildEmitterTips and
   * buildArrayTips so every per-tip effect — bloom and pulse included —
   * color-matches the staff it sits on instead of collapsing every copy to red.
   */
  private static resolveTipColor(
    propIndex: number,
    layerCount: number,
    spectrum: boolean,
    baseLeft: string,
    baseRight: string,
    selectedLayer: TunnelLayerSelection = null
  ): string {
    const isLeft = propIndex % 2 === 0;
    const raw =
      propIndex <= 1
        ? isLeft
          ? baseLeft
          : baseRight
        : spectrum
          ? tunnelPropColor(propIndex, layerCount).hex
          : isLeft
            ? baseLeft
            : baseRight;
    // Spotlight: dim the tip's color when another performer is selected.
    return dimHex(
      raw,
      spotlightFactor(selectedLayer, Math.floor(propIndex / 2))
    );
  }

  private static buildArrayTips(
    tips: PropTipData[],
    tipMap: TipEffectMap,
    effect: EffectType,
    params: RenderFrameParams,
    renderedTransforms:
      | {
          left: RenderedPropTransform | null;
          right: RenderedPropTransform | null;
        }
      | undefined
  ): {
    x: number;
    y: number;
    propIndex: number;
    tipIndex: number;
    color: string;
    velocityX?: number;
    velocityY?: number;
  }[] {
    const layerCount = params.props.additionalLayers.length;
    const spectrum =
      (params.props.tunnelSpectrum ?? true) && !params.props.tunnelPropColors;
    const baseLeft =
      params.props.tunnelPropColors?.left ?? params.trailSettings.leftColor;
    const baseRight =
      params.props.tunnelPropColors?.right ?? params.trailSettings.rightColor;
    const result: {
      x: number;
      y: number;
      propIndex: number;
      tipIndex: number;
      color: string;
      velocityX?: number;
      velocityY?: number;
    }[] = [];
    let globalTipIndex = 0;
    for (const t of tips) {
      if (resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) !== effect)
        continue;
      result.push({
        x: t.x,
        y: t.y,
        propIndex: t.propIndex,
        tipIndex: globalTipIndex++,
        velocityX: t.velocityX,
        velocityY: t.velocityY,
        color: AnimationRenderLoop.resolveTipColor(
          t.propIndex,
          layerCount,
          spectrum,
          baseLeft,
          baseRight,
          params.props.tunnelSelectedLayer ?? null
        ),
      });
    }
    // Center fallback for props with no tip-tracker output (base pair only).
    const leftTransform = renderedTransforms?.left;
    if (
      params.props.leftProp &&
      leftTransform &&
      resolveEffect(0, 0, tipMap, {}) === effect &&
      !result.some((t) => t.propIndex === 0)
    ) {
      result.push({
        x: leftTransform.centerX,
        y: leftTransform.centerY,
        propIndex: 0,
        tipIndex: globalTipIndex++,
        color: baseLeft,
      });
    }
    const rightTransform = renderedTransforms?.right;
    if (
      params.props.rightProp &&
      rightTransform &&
      resolveEffect(1, 0, tipMap, {}) === effect &&
      !result.some((t) => t.propIndex === 1)
    ) {
      result.push({
        x: rightTransform.centerX,
        y: rightTransform.centerY,
        propIndex: 1,
        tipIndex: globalTipIndex++,
        color: baseRight,
      });
    }
    return result;
  }

  /** Dispatch registry — one entry per simple overlay effect. */
  private readonly effectDispatchRegistry: readonly EffectDispatchEntry[] = [
    // --- Zap: 4-pos, no dt ---
    {
      effect: "zap",
      configKey: "zapConfig",
      getRenderer: (l) =>
        (l.renderers.get("zap") ?? null) as EffectRenderer | null,
      needsDt: false,
      resetTimeOnInactive: false,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "zap",
          ctx.params
        ),
      render: (r, cfg, inp) => r.renderFrame(cfg, inp),
    },
    // --- Sparkles: 4-pos, dt ---
    {
      effect: "sparkles",
      configKey: "sparklesConfig",
      getRenderer: (l) =>
        (l.renderers.get("sparkles") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: false,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "sparkles",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Ghost: stroboscopic prop mandala — emitters + playback phase + seq epoch ---
    {
      effect: "ghost",
      configKey: "ghostConfig",
      getRenderer: (l) =>
        (l.renderers.get("ghost") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: false,
      buildInput: (ctx) => {
        // Ghost ghosts the REAL prop sprite at past poses (onion-skin). Assemble
        // each live prop's blit transform from the already-computed prop
        // transforms (center/angle/scale) + dimensions + the sprite image.
        const rt = ctx.renderedTransforms;
        const imgs = ctx.propImages;
        const p = ctx.params;
        const props: Array<{
          id: number;
          image: CanvasImageSource;
          centerX: number;
          centerY: number;
          angle: number;
          width: number;
          height: number;
          flipped: boolean;
        }> = [];
        if (rt?.left && imgs?.left && p.props.leftProp) {
          props.push({
            id: 0,
            image: imgs.left,
            centerX: rt.left.centerX,
            centerY: rt.left.centerY,
            angle: rt.left.angle,
            width: p.props.leftPropDimensions.width * rt.left.scaleFactor,
            height: p.props.leftPropDimensions.height * rt.left.scaleFactor,
            flipped: p.leftPropFlipped ?? false,
          });
        }
        if (rt?.right && imgs?.right && p.props.rightProp) {
          props.push({
            id: 1,
            image: imgs.right,
            centerX: rt.right.centerX,
            centerY: rt.right.centerY,
            angle: rt.right.angle,
            width: p.props.rightPropDimensions.width * rt.right.scaleFactor,
            height: p.props.rightPropDimensions.height * rt.right.scaleFactor,
            flipped: p.rightPropFlipped ?? false,
          });
        }
        // Wipe the exposure when the sequence changes; hold it across loop wraps.
        return {
          props,
          currentStep: p.currentStep,
          epoch: p.sequenceContentHash ?? "",
        };
      },
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Bloom: array-of-tips, no dt ---
    {
      effect: "bloom",
      configKey: "bloomConfig",
      getRenderer: (l) =>
        (l.renderers.get("bloom") ?? null) as EffectRenderer | null,
      needsDt: false,
      resetTimeOnInactive: false,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildArrayTips(
          ctx.sharedTips,
          ctx.tipMap,
          "bloom",
          ctx.params,
          ctx.renderedTransforms
        ),
      render: (r, cfg, inp) => r.renderFrame(cfg, inp),
    },
    // --- Goo: 4-pos, dt, resetTimeOnInactive ---
    {
      effect: "goo",
      configKey: "gooConfig",
      getRenderer: (l) =>
        (l.renderers.get("goo") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "goo",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Bubbles: 4-pos, dt, resetTimeOnInactive ---
    {
      effect: "bubbles",
      configKey: "bubblesConfig",
      getRenderer: (l) =>
        (l.renderers.get("bubbles") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "bubbles",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Petals: 4-pos, dt, resetTimeOnInactive ---
    {
      effect: "petals",
      configKey: "petalsConfig",
      getRenderer: (l) =>
        (l.renderers.get("petals") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "petals",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Smoke: 4-pos, dt, resetTimeOnInactive ---
    {
      effect: "smoke",
      configKey: "smokeConfig",
      getRenderer: (l) =>
        (l.renderers.get("smoke") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "smoke",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Ink: 4-pos, dt, loop boundary continuity ---
    {
      effect: "ink",
      configKey: "inkConfig",
      getRenderer: (l) =>
        (l.renderers.get("ink") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "ink",
          ctx.params
        ),
      render: (r, cfg, inp, dt, ctx) =>
        r.renderFrame(cfg, inp, dt, {
          loopDetected: ctx.loopDetectedThisFrame,
          isSeamlesslyLoopable: ctx.isSeamlesslyLoopable,
        }),
    },
    // --- Frost: 4-pos, dt, resetTimeOnInactive ---
    {
      effect: "frost",
      configKey: "frostConfig",
      getRenderer: (l) =>
        (l.renderers.get("frost") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "frost",
          ctx.params
        ),
      render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
    },
    // --- Silk: 4-pos, dt, resetTimeOnInactive, loopDetected arg ---
    {
      effect: "silk",
      configKey: "silkConfig",
      getRenderer: (l) =>
        (l.renderers.get("silk") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "silk",
          ctx.params
        ),
      render: (r, cfg, inp, dt, ctx) =>
        r.renderFrame(
          cfg,
          inp,
          dt,
          ctx.loopDetectedThisFrame && ctx.isSeamlesslyLoopable
        ),
    },
    // --- Animal: 4-pos, dt, resetTimeOnInactive, loopDetected arg (mirrors silk) ---
    {
      effect: "animal",
      configKey: "animalConfig",
      getRenderer: (l) =>
        (l.renderers.get("animal") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildEmitterTips(
          ctx.sharedTips,
          ctx.tipMap,
          "animal",
          ctx.params
        ),
      render: (r, cfg, inp, dt, ctx) =>
        r.renderFrame(
          cfg,
          inp,
          dt,
          ctx.loopDetectedThisFrame && ctx.isSeamlesslyLoopable
        ),
    },
    // --- Pulse: array-of-tips, dt, resetTimeOnInactive, currentStep arg ---
    {
      effect: "pulse",
      configKey: "pulseConfig",
      getRenderer: (l) =>
        (l.renderers.get("pulse") ?? null) as EffectRenderer | null,
      needsDt: true,
      resetTimeOnInactive: true,
      buildInput: (ctx) =>
        AnimationRenderLoop.buildArrayTips(
          ctx.sharedTips,
          ctx.tipMap,
          "pulse",
          ctx.params,
          ctx.renderedTransforms
        ),
      render: (r, cfg, inp, dt, ctx) =>
        r.renderFrame(cfg, inp, ctx.params.currentStep ?? 0, dt),
    },
  ];

  /**
   * Dispatch a single effect from the registry. Handles:
   *   - renderer existence + initialization check
   *   - config presence check
   *   - error-disabled check (circuit breaker)
   *   - dt computation (if needsDt)
   *   - buildInput → render call
   *   - error counting + auto-disable after threshold
   *   - inactive clear + time reset
   */
  private dispatchEffect(
    entry: EffectDispatchEntry,
    ctx: EffectDispatchContext
  ): void {
    const renderer = entry.getRenderer(this);
    if (!renderer?.isInitialized()) return;

    const config = ctx.params[entry.configKey];
    const hasOverlay = this.fireTipTracker && config != null;

    if (hasOverlay && !this.effectDisabled.get(entry.effect)) {
      try {
        let dt = 0;
        if (entry.needsDt) {
          const lastTime = this.effectLastFrameTime.get(entry.effect) ?? 0;
          const rawDt =
            lastTime > 0 ? (ctx.currentTime - lastTime) / 1000 : 1 / 60;
          dt = Math.min(
            0.1,
            !Number.isFinite(rawDt) || rawDt <= 0 ? 1 / 60 : rawDt
          );
          this.effectLastFrameTime.set(entry.effect, ctx.currentTime);
        }
        const input = entry.buildInput(ctx, dt);
        entry.render(renderer, config, input, dt, ctx);
        this.effectErrors.set(entry.effect, 0);
      } catch (error) {
        const count = (this.effectErrors.get(entry.effect) ?? 0) + 1;
        this.effectErrors.set(entry.effect, count);
        renderer.clear();

        if (count >= AnimationRenderLoop.EFFECT_ERROR_THRESHOLD) {
          this.effectDisabled.set(entry.effect, true);
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(
            `[AnimationRenderLoop] ${entry.effect} effect disabled after repeated failures:`,
            err
          );
          if (this.onEffectError) {
            this.onEffectError(entry.effect, err);
          } else {
            effectErrorSignal.trigger(entry.effect, err);
          }
        } else {
          console.warn(
            `[AnimationRenderLoop] ${entry.effect} render error (attempt ${count}/${AnimationRenderLoop.EFFECT_ERROR_THRESHOLD}), resetting:`,
            error
          );
        }
      }
    } else if (!hasOverlay) {
      renderer.clear();
      if (entry.resetTimeOnInactive) {
        this.effectLastFrameTime.set(entry.effect, 0);
      }
    }
  }

  private renderLoop = (currentTime: number): void => {
    // CRITICAL: Check disposed flag first to prevent memory leaks
    if (this.isDisposed) {
      this.rafId = null;
      return;
    }

    // The gate can close between a frame being scheduled and that frame being
    // dispatched. Bail here rather than paint a surface nobody can see; the
    // gate subscription re-schedules when it reopens.
    if (!this.gateAllows()) {
      this.rafId = null;
      return;
    }

    if (!this.renderer || !this.getFrameParamsCallback) {
      this.rafId = null;
      return;
    }

    const params = this.getFrameParamsCallback();
    const { trailSettings, isPlaying, virtualTime } = params;

    // Use virtual time if provided (export mode), otherwise fallback to RAF timestamp
    const effectiveTime = virtualTime ?? currentTime;

    // Real-time trail capture
    const trailsActive = hasTrailTips(params.tipEffectMap);
    if (
      trailsActive &&
      trailSettings.mode !== TrailMode.OFF &&
      this.TrailCapturer
    ) {
      const currentStep =
        params.stepData && "stepNumber" in params.stepData
          ? params.stepData.stepNumber
          : undefined;
      this.TrailCapturer.captureFrame(
        {
          leftProp: params.props.leftProp,
          rightProp: params.props.rightProp,
          additionalLayers:
            params.props.additionalLayers.length > 0
              ? params.props.additionalLayers
              : undefined,
        },
        currentStep,
        effectiveTime
      );
    }

    // Determine what actually needs continuous rendering
    const trailsNeedContinuousRender =
      hasTrailTips(params.tipEffectMap) && trailSettings.mode !== TrailMode.OFF;
    const backgroundTransitioning =
      this.renderer?.isBackgroundTransitioning() ?? false;
    const mandalaTransitioning =
      this.mandalaOverlay?.isTransitioning() ?? false;

    // Build a per-effect active map using the exact same gating semantics as before:
    //   fire:     params.fireConfig != null && renderer.isInitialized()
    //   charcoal: params.fireConfig != null && renderer.isInitialized()  (shares fireConfig gate)
    //   led:      params.ledConfig?.enabled === true && renderer.isInitialized()
    //   trails:   gated separately below (hasTrailTips + mode check)
    //   all 12 canvas2d effects: params.{id}Config != null && renderer.isInitialized()
    const activeByEffect = new Map<EffectType, boolean>();
    const paramsAsRecord = params as unknown as Record<string, unknown>;
    for (const entry of this.effectDispatchRegistry) {
      const renderer = entry.getRenderer(this);
      const cfgPresent = paramsAsRecord[entry.configKey] != null;
      activeByEffect.set(
        entry.effect,
        cfgPresent && renderer?.isInitialized() === true
      );
    }
    // Special gates for fire, charcoal, led (not in effectDispatchRegistry)
    const fireActive =
      params.fireConfig != null &&
      this.renderers.get("fire")?.isInitialized() === true;
    const charcoalActive =
      params.fireConfig != null &&
      this.renderers.get("charcoal")?.isInitialized() === true;
    const ledActive =
      params.ledConfig?.enabled === true &&
      this.renderers.get("led")?.isInitialized() === true;

    const anyRegistryActive = [...activeByEffect.values()].some(Boolean);
    const anyEffectActive =
      anyRegistryActive || fireActive || charcoalActive || ledActive;

    // Active work: playing, effects running, background animating, or explicit render request
    const hasActiveWork =
      this.needsRender ||
      isPlaying ||
      backgroundTransitioning ||
      mandalaTransitioning ||
      anyEffectActive;

    // Trails alone (without active work) should not keep the loop alive forever.
    // Allow a grace period for initialization/texture loading, then auto-stop.
    // If trails are active in FADE mode, extend the idle threshold to allow
    // them to fade completely (at least twice the fade duration).
    const idleThreshold =
      trailsNeedContinuousRender && trailSettings.mode === TrailMode.FADE
        ? Math.max(
            AnimationRenderLoop.IDLE_STOP_THRESHOLD,
            Math.ceil((trailSettings.fadeDurationMs * 2) / 16)
          )
        : AnimationRenderLoop.IDLE_STOP_THRESHOLD;

    if (hasActiveWork) {
      this.consecutiveIdleFrames = 0;
    } else {
      this.consecutiveIdleFrames++;
    }

    const shouldContinueLoop =
      hasActiveWork ||
      (trailsNeedContinuousRender &&
        this.consecutiveIdleFrames < idleThreshold);

    if (shouldContinueLoop) {
      this.render(params, effectiveTime);
      this.needsRender = false;
      // Only schedule next frame if not disposed, not externally driven (the
      // offscreen export engine renders via renderSync only), and still on
      // screen — a gate that closed during this frame must not be resurrected
      // by the loop's own self-reschedule.
      if (!this.isDisposed && !this.externallyDriven && this.gateAllows()) {
        this.rafId = requestAnimationFrame(this.renderLoop);
      } else {
        this.rafId = null;
      }
    } else {
      // Stop loop - triggerRender() will restart if needed
      this.rafId = null;
      this.consecutiveIdleFrames = 0;
    }
  };

  // providedDtSeconds: explicit sim timestep for deterministic (export) render.
  // When omitted (live), derive it from the rAF-to-rAF gap so behavior is
  // byte-identical to the renderers' previous wall-clock fallback.
  private render(
    params: RenderFrameParams,
    currentTime: number,
    providedDtSeconds?: number
  ): void {
    if (!this.renderer) return;

    // Measure RAF-to-RAF gap (includes browser layout, GC, other JS, vsync wait)
    const rafGap =
      this.lastFrameTime > 0 ? currentTime - this.lastFrameTime : 0;
    this.lastFrameTime = currentTime;

    const dtSeconds = providedDtSeconds ?? (rafGap > 0 ? rafGap / 1000 : 0.016);

    // Frame budget monitoring: measure render time for adaptive quality
    const frameStart = this.frameBudgetMonitor?.beginFrame() ?? 0;

    const {
      stepData,
      currentStep,
      trailSettings: rawTrailSettings,
      gridVisible,
      gridMode,
      letter,
      props,
      visibility,
    } = params;

    // Tail length is authored as "visible ring points at ~60fps render rate."
    // The path-cache pipeline uses fadeDurationMs for both read window and
    // fade rate, so scale fadeDurationMs up to honor tailLength - otherwise
    // a long tailLength in download/export mode would be clipped by the
    // legacy 2500ms default. The overlay reads ring-buffer directly by
    // tailLength; extending fadeDurationMs also slows its GPU decay so
    // visibly-long trails don't fade out mid-tail.
    const FRAME_MS_60 = 1000 / 60;
    const tailDurationMs = (rawTrailSettings.tailLength ?? 20) * FRAME_MS_60;
    const effectiveFadeDurationMs = Math.max(
      rawTrailSettings.fadeDurationMs,
      tailDurationMs
    );
    const trailSettings: TrailSettings =
      effectiveFadeDurationMs === rawTrailSettings.fadeDurationMs
        ? rawTrailSettings
        : { ...rawTrailSettings, fadeDurationMs: effectiveFadeDurationMs };

    // Get turn tuple for glyph rendering
    const leftMotion = stepData?.motions?.left;
    const rightMotion = stepData?.motions?.right;
    const turnsTuple =
      isVisibleMotion(leftMotion) && isVisibleMotion(rightMotion)
        ? `${leftMotion.turns}${rightMotion.turns}`
        : null;

    if (this.loopStartTime === 0) {
      this.loopStartTime = currentTime;
    }

    // Gather trail points. When the trail overlay is active (chaining mode),
    // disable seamless loop wrap-around - the overlay accumulates pixels
    // across sequences, so wrap-around would draw the loop-back path on
    // top of the next sequence's trail.
    const effectiveLoopable = this.renderers.has("trails")
      ? false
      : (params.isSeamlesslyLoopable ?? false);
    const trailPoints = this.gatherTrailPoints(
      currentStep,
      trailSettings,
      effectiveLoopable,
      params.tipEffectMap
    );

    // Update loopStartTime when a loop is detected (set inside gatherTrailPoints)
    if (this.loopDetectedThisFrame) {
      this.loopStartTime = currentTime;
    }

    // Apply visibility settings
    const effectiveGridVisible = gridVisible && visibility.gridVisible;
    const effectiveGridOpacity =
      params.gridOpacity === undefined
        ? undefined
        : effectiveGridVisible
          ? Math.max(0, Math.min(1, params.gridOpacity))
          : 0;
    const effectivePropsVisible = visibility.propsVisible;
    const effectiveTrailsVisible = hasTrailTips(params.tipEffectMap);

    // Derive motion visibility from both internal state AND whether prop is actually present
    // (props may be filtered to null by parent component based on its own visibility state)
    const effectiveLeftMotionVisible =
      visibility.leftMotionVisible && props.leftProp !== null;
    const effectiveRightMotionVisible =
      visibility.rightMotionVisible && props.rightProp !== null;

    this.renderMandalaGuide(
      params,
      dtSeconds,
      currentTime,
      effectiveLeftMotionVisible,
      effectiveRightMotionVisible
    );

    // Build additional layer render data
    const additionalLayerRenderData = props.additionalLayers.map((layer, i) => {
      const layerTrails = trailPoints.additionalLayers[i];
      const colors = trailSettings.additionalLayerColors[i];
      return {
        leftProp: layer.leftProp,
        rightProp: layer.rightProp,
        leftTrailPoints:
          effectiveTrailsVisible && effectiveLeftMotionVisible && layerTrails
            ? layerTrails.left
            : [],
        rightTrailPoints:
          effectiveTrailsVisible && effectiveRightMotionVisible && layerTrails
            ? layerTrails.right
            : [],
        hasLeft: !!layer.leftProp && effectiveLeftMotionVisible,
        hasRight: !!layer.rightProp && effectiveRightMotionVisible,
        opacity: Math.max(0, Math.min(1, layer.opacity ?? 1)),
        trailCaptureSuppressed: layer.trailCaptureSuppressed,
        formationTransitionActive: layer.formationTransitionActive,
        leftColor: colors?.left ?? "#8b5cf6",
        rightColor: colors?.right ?? "#f97316",
        leftPropType: layer.leftPropType,
        rightPropType: layer.rightPropType,
      };
    });

    // When entering 3D suppression mode, clear all overlay canvases so stale
    // frames don't bleed through. The 3D layer sits on top via z-index, but
    // WebGL overlay canvases can show through if not cleared.
    if (params.suppress2DOverlays && !this.wasSuppressed) {
      this.wasSuppressed = true;
      // Clear WebGL overlay canvases (fire, charcoal, led) so stale frames don't show through
      for (const id of ["fire", "charcoal", "led"] as EffectType[]) {
        const r = this.renderers.get(id) as
          | (EffectRendererLike & {
              getCanvas?: () => HTMLCanvasElement | null;
            })
          | undefined;
        if (!r?.isInitialized()) continue;
        const canvas = r.getCanvas?.();
        if (!canvas) continue;
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (gl) gl.clear(gl.COLOR_BUFFER_BIT);
      }
      // Clear trail overlay (Canvas2D)
      const trailOverlayRenderer = this.renderers.get("trails") as
        | (ITrailOverlayCanvas & { canvas?: HTMLCanvasElement })
        | undefined;
      if (trailOverlayRenderer) {
        const trailCanvas = trailOverlayRenderer.canvas;
        if (trailCanvas) {
          const ctx2d = trailCanvas.getContext("2d");
          if (ctx2d)
            ctx2d.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        }
      }
      // Clear all registry effect overlays (Canvas2D)
      for (const entry of this.effectDispatchRegistry) {
        const renderer = entry.getRenderer(this);
        if (renderer?.isInitialized()) renderer.clear();
      }
    } else if (!params.suppress2DOverlays && this.wasSuppressed) {
      this.wasSuppressed = false;
    }

    // Route trail rendering through the overlay canvas
    const trailOverlay = this.renderers.get("trails") as
      | ITrailOverlayCanvas
      | undefined;
    if (trailOverlay && effectiveTrailsVisible && !params.suppress2DOverlays) {
      if (this.lastTrailFrameTime === 0) {
        trailOverlay.setVisible(true);
      }
      // Re-stamp only when (virtual) time has advanced. During export the
      // render loop ticks multiple times at the SAME virtualTime — one
      // calculateStateForStep sets the position, then several rAF ticks fire
      // while the frame is composited/encoded. On those repeat ticks dt is 0,
      // so there is no fade, yet advanceAccumulator would re-stamp the leading
      // edge at globalAlpha 1.0. Drawing the same semi-transparent line over
      // itself compounds it toward solid — the export "doubly opaque" trail
      // bug. The accumulator already holds this timestamp's stamp from the
      // first tick, so skip the duplicate. Live playback's rAF clock always
      // advances, so this is a no-op there.
      const isDuplicateTimestamp =
        this.lastStampedTrailTime !== null &&
        currentTime === this.lastStampedTrailTime;
      if (isDuplicateTimestamp) {
        // No new stamp this tick; visible trail canvas keeps the first-tick
        // composite, which the exporter reads.
      } else {
        const dt =
          this.lastTrailFrameTime > 0
            ? (currentTime - this.lastTrailFrameTime) / 1000
            : 1 / 60;
        this.lastTrailFrameTime = currentTime;
        this.lastStampedTrailTime = currentTime;

        // A prop-type change is an explicit path discontinuity. Detect it from
        // the geometry identity itself, not only from the async texture/crossfade
        // signals: those signals can arrive one render tick later than the new
        // frame parameters. The overlay keeps its painted accumulator, skips new
        // captures throughout the swap, then starts a disconnected source ring.
        const leftTrailPropType = params.leftPropType?.toLowerCase() ?? null;
        const rightTrailPropType = params.rightPropType?.toLowerCase() ?? null;
        const leftPropIdentityChanged =
          this.previousLeftTrailPropType !== undefined &&
          this.previousLeftTrailPropType !== leftTrailPropType;
        const rightPropIdentityChanged =
          this.previousRightTrailPropType !== undefined &&
          this.previousRightTrailPropType !== rightTrailPropType;
        this.previousLeftTrailPropType = leftTrailPropType;
        this.previousRightTrailPropType = rightTrailPropType;

        const leftPropSwapSuppressed =
          leftPropIdentityChanged ||
          !!params.trailsSuppressedUntilTextureLoad ||
          (this.renderer?.isLeftPropCrossfadeInProgress() ?? false);
        const rightPropSwapSuppressed =
          rightPropIdentityChanged ||
          !!params.trailsSuppressedUntilTextureLoad ||
          (this.renderer?.isRightPropCrossfadeInProgress() ?? false);

        trailOverlay.renderFrame({
          leftTrailPoints: effectiveLeftMotionVisible ? trailPoints.left : [],
          rightTrailPoints: effectiveRightMotionVisible
            ? trailPoints.right
            : [],
          trailSettings,
          deltaTime: dt,
          currentTime: currentTime,
          canvasSize: this.canvasSize,
          hasLeft: !!params.props.leftProp && effectiveLeftMotionVisible,
          hasRight: !!params.props.rightProp && effectiveRightMotionVisible,
          additionalLayers:
            additionalLayerRenderData.length > 0
              ? additionalLayerRenderData
              : undefined,
          tunnelSpectrum: props.tunnelSpectrum,
          tunnelPropColors: props.tunnelPropColors,
          tunnelSelectedLayer: props.tunnelSelectedLayer ?? null,
          leftProp: params.props.leftProp,
          rightProp: params.props.rightProp,
          leftPropType: params.leftPropType,
          rightPropType: params.rightPropType,
          tipEffectMap: params.tipEffectMap,
          loopDetected: this.loopDetectedThisFrame,
          isSeamlesslyLoopable: params.isSeamlesslyLoopable ?? false,
          leftPropSwapSuppressed,
          rightPropSwapSuppressed,
        });
      }
    } else if (
      trailOverlay &&
      !effectiveTrailsVisible &&
      this.lastTrailFrameTime > 0
    ) {
      trailOverlay.clear();
      trailOverlay.setVisible(false);
      this.lastTrailFrameTime = 0;
      this.lastStampedTrailTime = null;
    }

    // Render scene
    // NOTE: Props are passed regardless of visibility so the renderer can fade them out.
    // The renderer's fade managers handle visibility transition animations for:
    // - Overall props toggle (propsFadeManager)
    // - Individual left/right motion toggles (leftPropFadeManager, rightPropFadeManager)
    this.renderer.renderScene({
      leftProp: props.leftProp,
      rightProp: props.rightProp,
      gridVisible: effectiveGridVisible,
      gridOpacity: effectiveGridOpacity,
      gridMode: gridMode?.toString() ?? null,
      letter: letter ?? null,
      turnsTuple,
      leftPropDimensions: props.leftPropDimensions,
      rightPropDimensions: props.rightPropDimensions,
      leftTrailPoints:
        effectiveTrailsVisible && effectiveLeftMotionVisible
          ? trailPoints.left
          : [],
      rightTrailPoints:
        effectiveTrailsVisible && effectiveRightMotionVisible
          ? trailPoints.right
          : [],
      additionalLayers:
        additionalLayerRenderData.length > 0
          ? additionalLayerRenderData
          : undefined,
      trailSettings,
      skipTrailRendering: this.renderers.has("trails"),
      currentTime,
      visibility: {
        gridVisible: effectiveGridVisible,
        propsVisible: effectivePropsVisible,
        trailsVisible: effectiveTrailsVisible,
        leftMotionVisible: effectiveLeftMotionVisible,
        rightMotionVisible: effectiveRightMotionVisible,
      },
      leftPropFlipped: params.leftPropFlipped ?? false,
      rightPropFlipped: params.rightPropFlipped ?? false,
      leftPropType: params.leftPropType,
      rightPropType: params.rightPropType,
      qualityHints: this.frameBudgetMonitor?.getQualityHints(),
      tunnelSelectedLayer: props.tunnelSelectedLayer ?? null,
    });

    // Read prop transforms from Canvas2D renderer for fire coherence
    const renderedTransforms =
      this.renderer?.getLastPropTransforms?.() ?? undefined;
    const renderedPropSprites =
      this.renderer?.getLastRenderedPropSprites?.() ?? [];

    // Fire/charcoal/zap overlays: render after Canvas2D so they composite on top.
    // Fire, charcoal, and zap all consume FireTipTracker output (zap reads the
    // same {x,y} positions but ignores velocity). The tracker is updated at most
    // once per frame and the result is shared across the three branches below.
    const activeFireRenderer = (
      this.renderers.get("fire") as WebGLFireRenderer | undefined
    )?.isInitialized()
      ? (this.renderers.get("fire") as WebGLFireRenderer)
      : null;
    const activeCharcoalRenderer = (
      this.renderers.get("charcoal") as CharcoalSparkRenderer | undefined
    )?.isInitialized()
      ? (this.renderers.get("charcoal") as CharcoalSparkRenderer)
      : null;
    const hasFireOrCharcoalOverlay =
      this.fireTipTracker &&
      ((activeFireRenderer && params.fireConfig != null) ||
        activeCharcoalRenderer);
    const hasAnyRegistryOverlay =
      this.fireTipTracker &&
      this.effectDispatchRegistry.some((entry) => {
        const renderer = entry.getRenderer(this);
        return (
          renderer?.isInitialized() &&
          (params as unknown as Record<string, unknown>)[entry.configKey] !=
            null
        );
      });
    const hasAnyTipOverlay = hasFireOrCharcoalOverlay || hasAnyRegistryOverlay;

    let sharedTipResult: FireTipUpdateResult | null = null;
    if (hasAnyTipOverlay && !params.suppress2DOverlays) {
      // A freeform wrap teleports back to its start and must invalidate cached
      // tip velocity. A true LOOP ends at the same pose, so resetting here
      // would manufacture a three-frame emitter gap in every per-tip effect.
      if (
        this.loopDetectedThisFrame &&
        !(params.isSeamlesslyLoopable ?? false)
      ) {
        this.fireTipTracker!.reset();
      }

      const tipTrackerConfig: FireTipTrackerConfig = {
        canvasSize: this.canvasSize,
        leftPropDimensions: props.leftPropDimensions,
        rightPropDimensions: props.rightPropDimensions,
        leftPropType: params.leftPropType,
        rightPropType: params.rightPropType,
        renderedTransforms,
        // Overlaid tunnel layers get tips too, so per-tip effects cover every
        // copy in the kaleidoscope (not just the base pair). Absent for normal
        // single-sequence playback → identical legacy behavior.
        additionalLayers:
          props.additionalLayers.length > 0
            ? props.additionalLayers.map((l) => ({
                leftProp: effectiveLeftMotionVisible ? l.leftProp : null,
                rightProp: effectiveRightMotionVisible ? l.rightProp : null,
                opacity: l.opacity,
              }))
            : undefined,
      };

      sharedTipResult = this.fireTipTracker!.update(
        effectiveLeftMotionVisible ? props.leftProp : null,
        effectiveRightMotionVisible ? props.rightProp : null,
        tipTrackerConfig,
        currentTime
      );
    }

    if (
      hasFireOrCharcoalOverlay &&
      !this.fireDisabledByError &&
      !params.suppress2DOverlays &&
      sharedTipResult
    ) {
      try {
        const tipResult = sharedTipResult;

        // Filter tips by resolved effect so each renderer only gets its assigned tips.
        // tipEffectMap is always the authority. No legacy fallback.
        const allTips = tipResult.tips;
        const tipMap = params.tipEffectMap ?? {};

        const fireTips = allTips.filter(
          (t) => resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) === "fire"
        );
        const charcoalTips = allTips.filter(
          (t) =>
            resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) === "charcoal"
        );

        const fireInput: FireFrameInput = {
          tips: allTips,
          currentTime,
          dt: dtSeconds,
          canvasWidth: this.canvasSize,
          canvasHeight: this.canvasSize,
          darkMode: params.darkMode ?? false,
          propSprites: renderedPropSprites,
          propColors: params.propColors,
          loopDetected: this.loopDetectedThisFrame || tipResult.gapDetected,
          playbackSpeed: params.playbackSpeed,
          sequenceContentHash: params.sequenceContentHash,
          relativeTime: currentTime - this.loopStartTime,
          isSeamlesslyLoopable: params.isSeamlesslyLoopable ?? false,
        };

        // Fire and charcoal can now run simultaneously on different tips.
        //
        // A renderer with no tips this frame is still driven, with an empty tip
        // list, while it holds live fire or sparks. Switching a fire-capable
        // prop to hands removes every tip at once (hands have no tip points),
        // and both canvases keep their last frame under
        // preserveDrawingBuffer:true — so dropping the call there is what left
        // dead fire stuck on the animation canvas. An empty tip list injects
        // nothing and lets what is already burning age out; each renderer
        // reports when there is nothing visible left and the calls stop.
        if (
          activeFireRenderer &&
          (fireTips.length > 0 || activeFireRenderer.hasResidualFire())
        ) {
          if (tipResult.gapDetected) {
            activeFireRenderer.clearSimulation();
          }
          activeFireRenderer.renderFire(
            { ...fireInput, tips: fireTips },
            params.fireConfig!
          );
        }
        if (
          activeCharcoalRenderer &&
          (charcoalTips.length > 0 ||
            activeCharcoalRenderer.hasActiveParticles())
        ) {
          if (tipResult.gapDetected) {
            activeCharcoalRenderer.clearSimulation();
          }
          activeCharcoalRenderer.renderCharcoal(
            { ...fireInput, tips: charcoalTips },
            params.fireConfig!
          );
        }

        // Successful frame resets the error counter
        this.consecutiveFireErrors = 0;
      } catch (error) {
        this.consecutiveFireErrors++;

        // First few failures: reset state and try again next frame
        this.fireTipTracker?.reset();
        activeFireRenderer?.clearSimulation();
        activeCharcoalRenderer?.clearSimulation();

        if (
          this.consecutiveFireErrors >=
          AnimationRenderLoop.EFFECT_ERROR_THRESHOLD
        ) {
          // Repeated failures: disable fire and notify user
          this.fireDisabledByError = true;
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(
            "[AnimationRenderLoop] Fire effect disabled after repeated failures:",
            err
          );
          if (this.onEffectError) {
            this.onEffectError("fire", err);
          } else {
            effectErrorSignal.trigger("fire", err);
          }
        } else {
          console.warn(
            `[AnimationRenderLoop] Fire render error (attempt ${this.consecutiveFireErrors}/${AnimationRenderLoop.EFFECT_ERROR_THRESHOLD}), resetting:`,
            error
          );
        }
      }
    }

    // Registry-driven dispatch: replaces 12 individual effect blocks
    // (sparkles, echo, bloom, water, bubbles, petals, smoke, ink, frost, silk, pulse)
    // with a single loop over the dispatch registry.
    if (!params.suppress2DOverlays && sharedTipResult) {
      const tipMap = params.tipEffectMap ?? {};
      const ctx: EffectDispatchContext = {
        tipMap,
        sharedTips: sharedTipResult.tips,
        params,
        currentTime,
        renderedTransforms,
        propImages: this.renderer?.getPropImages?.(),
        loopDetectedThisFrame: this.loopDetectedThisFrame,
        isSeamlesslyLoopable: params.isSeamlesslyLoopable ?? false,
      };
      for (const entry of this.effectDispatchRegistry) {
        this.dispatchEffect(entry, ctx);
      }
    }

    // LED overlay: render after fire so it composites on top of both Canvas2D and fire
    const activeLedRenderer = (
      this.renderers.get("led") as WebGLLedRenderer | undefined
    )?.isInitialized()
      ? (this.renderers.get("led") as WebGLLedRenderer)
      : null;
    if (
      activeLedRenderer &&
      this.ledSampler &&
      params.ledConfig?.enabled &&
      !this.ledDisabledByError &&
      !params.suppress2DOverlays
    ) {
      try {
        // A hidden hand should take its LEDs with it. The base prop state stays
        // available so the Canvas2D renderer can fade the sprite out, but the
        // LED sampler must not keep emitting points for that hidden prop or any
        // of its tunnel copies.
        const visibleLeftProp = effectiveLeftMotionVisible
          ? props.leftProp
          : null;
        const visibleRightProp = effectiveRightMotionVisible
          ? props.rightProp
          : null;
        const ledSamplerConfig: LedSamplerConfig = {
          canvasSize: this.canvasSize,
          leftPropDimensions: props.leftPropDimensions,
          rightPropDimensions: props.rightPropDimensions,
          leftPropType: params.leftPropType,
          rightPropType: params.rightPropType,
          // LEDs cover overlaid tunnel layers too (parity with fire/charcoal).
          additionalLayers:
            props.additionalLayers.length > 0
              ? props.additionalLayers.map((l) => ({
                  leftProp: effectiveLeftMotionVisible ? l.leftProp : null,
                  rightProp: effectiveRightMotionVisible ? l.rightProp : null,
                  opacity: l.opacity,
                }))
              : undefined,
          tunnelSpectrum: props.tunnelSpectrum ?? true,
          tunnelPropColors: props.tunnelPropColors,
        };

        const allLeds = this.ledSampler.update(
          visibleLeftProp,
          visibleRightProp,
          ledSamplerConfig,
          currentTime,
          params.ledConfig
        );

        // Filter LEDs by resolved effect assignment. A pixel staff resolves
        // against the shaft end each LED sits nearest, so the per-end
        // assignment cascade keeps working at 200 LEDs.
        const ledTipMap = params.tipEffectMap ?? {};
        const leds = allLeds.filter(
          (l) =>
            resolveEffect(l.propIndex, l.endpointIndex, ledTipMap, {}) === "led"
        );

        // The renderer clears its retained glow and trail buffers when the LED
        // list is empty. Skipping that frame leaves the last LED image visible.
        activeLedRenderer.renderLeds(
          {
            leds,
            currentTime,
            canvasWidth: this.canvasSize,
            canvasHeight: this.canvasSize,
          },
          params.ledConfig
        );

        // Successful frame resets the error counter
        this.consecutiveLedErrors = 0;
      } catch (error) {
        this.consecutiveLedErrors++;

        if (
          this.consecutiveLedErrors >=
          AnimationRenderLoop.EFFECT_ERROR_THRESHOLD
        ) {
          this.ledDisabledByError = true;
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(
            "[AnimationRenderLoop] LED effect disabled after repeated failures:",
            err
          );
          if (this.onEffectError) {
            this.onEffectError("led", err);
          } else {
            effectErrorSignal.trigger("led", err);
          }
        } else {
          console.warn(
            `[AnimationRenderLoop] LED render error (attempt ${this.consecutiveLedErrors}/${AnimationRenderLoop.EFFECT_ERROR_THRESHOLD}), resetting:`,
            error
          );
        }
      }
    }

    // End frame budget measurement (updates rolling averages, may trigger tier change)
    const renderTime = performance.now() - frameStart;

    if (this.frameBudgetMonitor) {
      this.frameBudgetMonitor.endFrame(frameStart);

      // Propagate quality tier changes to fire renderer
      const hints = this.frameBudgetMonitor.getQualityHints();
      if (hints && hints.tier !== this.previousQualityTier) {
        this.previousQualityTier = hints.tier;
        const fireRenderer = this.renderers.get("fire") as
          | WebGLFireRenderer
          | undefined;
        if (fireRenderer?.isInitialized()) {
          // Map quality tier → fire simulation quality level
          const fireQuality =
            params.fireConfig?.renderingProfile === "legacy"
              ? 2
              : hints.tier === QualityTier.HIGH
                ? 4
                : hints.tier === QualityTier.MEDIUM
                  ? 2
                  : 1;
          fireRenderer.setQuality(fireQuality);
        }
      }
    }

    // Frame drop diagnostics: log when frames exceed budget
    // Rate-limited to prevent feedback loops with console recording extensions (rrweb, Sentry, etc.)
    // Skip during warm-up (first N frames have high RAF gaps from browser initialization)
    this.framesRenderedSinceStart++;
    const isWarmingUp =
      this.framesRenderedSinceStart <= AnimationRenderLoop.WARMUP_FRAMES;
    const isFirstFrameAfterRestart = rafGap > 1000;
    const logEnabled =
      this.frameDropLoggingEnabled ||
      (typeof window !== "undefined" &&
        (window as { __TKA_FRAME_DROP_LOG?: boolean }).__TKA_FRAME_DROP_LOG ===
          true);
    const droppedThisFrame =
      params.isPlaying &&
      !isWarmingUp &&
      !isFirstFrameAfterRestart &&
      (renderTime > AnimationRenderLoop.FRAME_DROP_THRESHOLD_MS ||
        rafGap > 100);
    if (logEnabled && droppedThisFrame) {
      const now = performance.now();
      if (
        now - this.lastFrameDropLogTime >
        AnimationRenderLoop.FRAME_DROP_LOG_COOLDOWN_MS
      ) {
        this.lastFrameDropLogTime = now;
        const fireState = this.renderers.get("fire")?.isInitialized()
          ? params.fireConfig != null
            ? "active"
            : "idle"
          : "off";
        const trailCount =
          this.reusableLeftTrailPoints.length +
          this.reusableRightTrailPoints.length;
        console.warn(
          `[FrameDrop] render=${renderTime.toFixed(1)}ms rafGap=${rafGap.toFixed(1)}ms ` +
            `step=${params.currentStep.toFixed(2)} fire=${fireState} ` +
            `trails=${trailCount} tier=${this.previousQualityTier ?? "?"} ` +
            `loop=${this.loopDetectedThisFrame ? "YES" : "no"}`
        );
      }
    }

    // Rolling 1-second FPS summary - complements the per-drop log by telling
    // you the average even when individual drops fall below the 2s cooldown.
    // Opt-in diagnostic: enable with window.__TKA_FPS_LOG = true
    const fpsLogEnabled =
      typeof window !== "undefined" &&
      (window as { __TKA_FPS_LOG?: boolean }).__TKA_FPS_LOG === true;
    if (
      fpsLogEnabled &&
      params.isPlaying &&
      !isWarmingUp &&
      !isFirstFrameAfterRestart
    ) {
      if (this.fpsWindowStart === 0) {
        this.fpsWindowStart = currentTime;
      }
      this.fpsWindowFrames++;
      this.fpsWindowRenderMsSum += renderTime;
      if (rafGap > 0) {
        if (rafGap < this.fpsWindowMinFrameMs)
          this.fpsWindowMinFrameMs = rafGap;
        if (rafGap > this.fpsWindowMaxFrameMs)
          this.fpsWindowMaxFrameMs = rafGap;
      }
      if (renderTime > this.fpsWindowMaxRenderMs)
        this.fpsWindowMaxRenderMs = renderTime;
      if (droppedThisFrame) this.fpsWindowDrops++;

      const elapsed = currentTime - this.fpsWindowStart;
      if (elapsed >= 1000) {
        const avgFps = (this.fpsWindowFrames / elapsed) * 1000;
        const avgRender = this.fpsWindowRenderMsSum / this.fpsWindowFrames;
        const fireState = this.renderers.get("fire")?.isInitialized()
          ? params.fireConfig != null
            ? "active"
            : "idle"
          : "off";
        const trailsOn = hasTrailTips(params.tipEffectMap);
        const trailCount =
          this.reusableLeftTrailPoints.length +
          this.reusableRightTrailPoints.length;
        this.fpsWindowStart = currentTime;
        this.fpsWindowFrames = 0;
        this.fpsWindowMinFrameMs = Infinity;
        this.fpsWindowMaxFrameMs = 0;
        this.fpsWindowMaxRenderMs = 0;
        this.fpsWindowRenderMsSum = 0;
        this.fpsWindowDrops = 0;
        this.fpsWindowLongTaskMs = 0;
      }
    } else if (!params.isPlaying) {
      // Reset window when playback pauses so the next play-session starts clean
      this.fpsWindowStart = 0;
      this.fpsWindowFrames = 0;
      this.fpsWindowMinFrameMs = Infinity;
      this.fpsWindowMaxFrameMs = 0;
      this.fpsWindowMaxRenderMs = 0;
      this.fpsWindowRenderMsSum = 0;
      this.fpsWindowDrops = 0;
      this.fpsWindowLongTaskMs = 0;
    }
  }

  /**
   * Paint the complete engine-aligned path guide beneath the scene. Geometry is
   * cached by sequence, path policy, prop types, and resolved trail endpoints,
   * so the per-frame path is an identity check after the first preparation.
   */
  private renderMandalaGuide(
    params: RenderFrameParams,
    deltaTime: number,
    currentTime: number,
    showLeft: boolean,
    showRight: boolean
  ): void {
    const overlay = this.mandalaOverlay;
    if (!overlay) return;

    const steps = params.mandalaSteps;
    if (
      !params.mandalaVisible ||
      params.suppress2DOverlays ||
      !steps ||
      steps.length === 0 ||
      (!showLeft && !showRight)
    ) {
      overlay.setVisible(false);
      return;
    }

    // A prop type becomes reactive before its replacement texture finishes
    // loading. Keep the old guide in place during that gap so the mandala and
    // prop begin their crossfades together once the new artwork is ready.
    if (params.trailsSuppressedUntilTextureLoad && this.previousMandalaPaths) {
      overlay.setVisible(true);
      overlay.renderFrame({
        preparedPaths: this.previousMandalaPaths,
        progress: 1,
        config: MANDALA_GUIDE_CONFIG,
        deltaTime,
        currentTime,
        canvasSize: this.canvasSize,
        currentStep: params.currentStep,
      });
      return;
    }

    const show: MandalaHandVisibility =
      showLeft && showRight ? "both" : showLeft ? "left" : "right";
    const preparedPaths = this.mandalaPathPreparer.prepare(
      steps,
      this.canvasSize,
      {
        show,
        leftPropType: params.leftPropType,
        rightPropType: params.rightPropType,
        trackingMode: params.trailSettings.trackingMode,
        pathOptions: params.mandalaPathOptions,
        leftColor:
          params.primaryPropColors?.left ?? params.trailSettings.leftColor,
        rightColor:
          params.primaryPropColors?.right ?? params.trailSettings.rightColor,
        sequenceKey: params.sequenceContentHash,
      }
    );

    if (!preparedPaths) {
      overlay.setVisible(false);
      return;
    }

    if (
      MANDALA_GUIDE_CONFIG.mode === "drawing" &&
      this.previousMandalaPaths !== preparedPaths
    ) {
      overlay.clear();
    }
    this.previousMandalaPaths = preparedPaths;
    overlay.setVisible(true);
    overlay.renderFrame({
      preparedPaths,
      progress: 1,
      config: MANDALA_GUIDE_CONFIG,
      deltaTime,
      currentTime,
      canvasSize: this.canvasSize,
      currentStep: params.currentStep,
    });
  }

  private static compactByTrailFlag(
    points: TrailPoint[],
    tipMap: TipEffectMap
  ): void {
    let w = 0;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      if (resolveEffect(pt.propIndex, pt.tipIndex, tipMap, {}) === "trails") {
        points[w++] = pt;
      }
    }
    points.length = w;
  }

  private gatherTrailPoints(
    currentStep: number,
    trailSettings: TrailSettings,
    isSeamlesslyLoopable: boolean,
    tipEffectMap?: TipEffectMap
  ): {
    left: TrailPoint[];
    right: TrailPoint[];
    additionalLayers: Array<{ left: TrailPoint[]; right: TrailPoint[] }>;
  } {
    // CRITICAL: Reuse arrays to prevent GC pressure on mobile
    // Clear arrays without deallocating (length = 0 keeps capacity)
    this.reusableLeftTrailPoints.length = 0;
    this.reusableRightTrailPoints.length = 0;

    // Per-tip trail flags: only gather points for tips assigned "trails".
    // When no map is provided, default to gathering all tips.
    const tipMap = tipEffectMap ?? {};
    const hasAnyTrailEntry = Object.keys(tipMap).length > 0;
    const leftTip0Trails =
      !hasAnyTrailEntry || resolveEffect(0, 0, tipMap, {}) === "trails";
    const leftTip1Trails =
      !hasAnyTrailEntry || resolveEffect(0, 1, tipMap, {}) === "trails";
    const rightTip0Trails =
      !hasAnyTrailEntry || resolveEffect(1, 0, tipMap, {}) === "trails";
    const rightTip1Trails =
      !hasAnyTrailEntry || resolveEffect(1, 1, tipMap, {}) === "trails";

    // Detect animation loop (currentStep jumps backward significantly)
    // This happens when the sequence repeats from the beginning
    const LOOP_DETECTION_THRESHOLD = 0.5; // steps
    this.loopDetectedThisFrame = false;
    if (this.previousStep - currentStep > LOOP_DETECTION_THRESHOLD) {
      this.loopDetectedThisFrame = true;
      this.hasLoopedAtLeastOnce = true;
      // For non-seamless loops, record where the loop occurred to clamp trail start.
      // For seamless loops, don't clamp - trails wrap around the boundary.
      if (!isSeamlesslyLoopable) {
        this.loopOccurredAtStep = currentStep;
      } else {
        // Clear any stale clamp from a previous non-seamless session
        this.loopOccurredAtStep = null;
      }
    }
    this.previousStep = currentStep;

    // Use cache for perfect gap-free trails (if available and valid)
    const usingCache =
      this.pathCache && this.pathCache.isValid() && currentStep !== null;

    if (usingCache && this.pathCache) {
      const scaleFactor = this.canvasSize / 950;
      const cacheInfo = this.pathCache.getCacheInfo();

      if (cacheInfo && cacheInfo.totalSteps > 0) {
        const stepDurationMs = cacheInfo.totalDurationMs / cacheInfo.totalSteps;

        // Calculate how many steps the trail should span
        const fadeSteps =
          trailSettings.mode === TrailMode.FADE &&
          trailSettings.fadeDurationMs > 0
            ? trailSettings.fadeDurationMs / stepDurationMs
            : currentStep; // Non-fade: show entire trail from step 0

        const desiredStart = currentStep - fadeSteps;

        // Determine if trail wraps around the loop boundary.
        // Only wrap if a loop has actually occurred - on initial play there's
        // no previous loop to read trail data from.
        const needsWrapAround =
          isSeamlesslyLoopable && desiredStart < 0 && this.hasLoopedAtLeastOnce;

        if (needsWrapAround) {
          // SEAMLESS LOOP WRAP-AROUND:
          // Trail window spans the loop boundary, so read from two ranges:
          //   1. Tail of previous loop: [totalSteps + desiredStart, totalSteps]
          //   2. Head of current loop:  [0, currentStep]
          // We read the tail up to totalSteps (not totalSteps + 1) because
          // position at totalSteps equals position at 0 for seamless loops.
          // Using totalSteps + 1 would extend the tail 1 beat past the boundary,
          // causing a spatial fold-back (trail doubles back) and a visible jump
          // in the trail's oldest visible position.
          const cacheEndStep = cacheInfo.totalSteps;
          const wrapStartStep = Math.max(0, cacheEndStep + desiredStart);

          // Blue prop: tail segment + head segment, filtered by per-tip trail flags
          let leftCount = 0;
          if (leftTip0Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              0,
              wrapStartStep,
              cacheEndStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          if (leftTip1Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              1,
              wrapStartStep,
              cacheEndStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          if (leftTip0Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              0,
              0,
              currentStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          if (leftTip1Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              1,
              0,
              currentStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          this.reusableLeftTrailPoints.length = leftCount;

          // Red prop: tail segment + head segment, filtered by per-tip trail flags
          let rightCount = 0;
          if (rightTip0Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              0,
              wrapStartStep,
              cacheEndStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          if (rightTip1Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              1,
              wrapStartStep,
              cacheEndStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          if (rightTip0Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              0,
              0,
              currentStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          if (rightTip1Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              1,
              0,
              currentStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          this.reusableRightTrailPoints.length = rightCount;
        } else {
          // NORMAL PATH (non-seamless, or seamless but trail doesn't cross boundary yet)
          let startStep = Math.max(0, desiredStart);

          // For non-seamless loops, clamp at loop point to prevent stale trail artifacts
          if (this.loopOccurredAtStep !== null) {
            startStep = Math.max(startStep, this.loopOccurredAtStep);
          }

          // Blue prop trails, filtered by per-tip trail flags
          let leftCount = 0;
          if (leftTip0Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              0,
              startStep,
              currentStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          if (leftTip1Trails) {
            leftCount += this.pathCache.fillTrailPoints(
              0,
              1,
              startStep,
              currentStep,
              scaleFactor,
              this.reusableLeftTrailPoints,
              leftCount
            );
          }
          this.reusableLeftTrailPoints.length = leftCount;

          // Red prop trails, filtered by per-tip trail flags
          let rightCount = 0;
          if (rightTip0Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              0,
              startStep,
              currentStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          if (rightTip1Trails) {
            rightCount += this.pathCache.fillTrailPoints(
              1,
              1,
              startStep,
              currentStep,
              scaleFactor,
              this.reusableRightTrailPoints,
              rightCount
            );
          }
          this.reusableRightTrailPoints.length = rightCount;
        }
      }
    } else if (this.TrailCapturer && !this.renderers.has("trails")) {
      // Fallback to real-time capture - only when NOT using the overlay.
      // The overlay accumulates pixels, so during the brief cache-rebuild
      // gap it's better to draw nothing (existing pixels fade naturally)
      // than to draw broken real-time capture points as artifacts.
      this.TrailCapturer.fillTrailPointArrays(
        this.reusableLeftTrailPoints,
        this.reusableRightTrailPoints,
        this.reusableAdditionalLayerTrails
      );

      // Post-filter captured points by per-tip trail flags (allocation-free compact)
      if (hasAnyTrailEntry) {
        AnimationRenderLoop.compactByTrailFlag(
          this.reusableLeftTrailPoints,
          tipMap
        );
        AnimationRenderLoop.compactByTrailFlag(
          this.reusableRightTrailPoints,
          tipMap
        );
      }
    }

    // Overlaid tunnel-layer trails ALWAYS come from the live capturer. The path
    // cache only stores base prop paths, and the real-time fallback above is
    // gated off while the trails overlay is active — so without this, layer
    // trails vanish exactly when trails is the chosen effect. Downstream gating
    // (effectiveTrailsVisible) hides these when trails isn't active, so filling
    // unconditionally here is safe.
    if (this.TrailCapturer) {
      this.TrailCapturer.fillAdditionalLayerTrails(
        this.reusableAdditionalLayerTrails
      );
    } else {
      this.reusableAdditionalLayerTrails.length = 0;
    }

    return {
      left: this.reusableLeftTrailPoints,
      right: this.reusableRightTrailPoints,
      additionalLayers: this.reusableAdditionalLayerTrails,
    };
  }
}
