import type { QualityTier } from "../domain/types/quality-types";

// Longtask observer singleton - one PerformanceObserver shared across every
// AnimationRenderLoop instance. Without this, each loop attaches its own
// observer and every main-thread stall produces N duplicate log lines where
// N is the number of live AnimatorCanvas instances on the page.
export type LongTaskListener = (durationMs: number) => void;
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

export function subscribeToLongTasks(listener: LongTaskListener): () => void {
  installLongTaskObserver();
  longTaskListeners.add(listener);
  return () => longTaskListeners.delete(listener);
}

/** What one rendered frame looked like to the drop log and FPS summary. */
export interface FrameDiagnosticSample {
  currentTime: number;
  /** RAF-to-RAF gap: the true frame duration including browser overhead. */
  rafGap: number;
  /** How long render() itself took this frame. */
  renderTime: number;
  isPlaying: boolean;
}

/** Scene facts printed with a frame-drop warning; built only when one logs. */
export interface FrameDropContext {
  currentStep: number;
  fireState: "active" | "idle" | "off";
  trailCount: number;
  tier: QualityTier | "?";
  loopDetected: boolean;
}

/**
 * Console diagnostics for the render loop: a rate-limited warning per dropped
 * frame and a rolling one-second FPS window. Both are opt-in via window
 * flags, so in normal use this only counts frames. Owns the longtask
 * subscription that attributes main-thread stalls to the current window.
 */
export class FrameDropDiagnostics {
  // Frame drop diagnostics - logs slow frames to console for debugging.
  // Disabled by default. Enable via browser console: window.__TKA_FRAME_DROP_LOG = true
  private frameDropLoggingEnabled = false;
  private static readonly FRAME_DROP_THRESHOLD_MS = 20; // ~50fps - anything below 60fps
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

  /** Frames rendered since the loop (re)started; drives the warm-up grace. */
  get framesRendered(): number {
    return this.framesRenderedSinceStart;
  }

  // Subscribe to the module-singleton longtask observer so the FPS summary
  // can attribute main-thread stalls to the window in which they occurred.
  // One observer serves all AnimationRenderLoop instances - without the
  // singleton, N loops produced N duplicate log lines per longtask.
  attachLongTaskObserver(): void {
    if (!this.longTaskSubscriberDispose) {
      this.longTaskSubscriberDispose = subscribeToLongTasks((durationMs) => {
        this.fpsWindowLongTaskMs += durationMs;
      });
    }
  }

  detachLongTaskObserver(): void {
    this.longTaskSubscriberDispose?.();
    this.longTaskSubscriberDispose = null;
  }

  /** The loop (re)started: the first frames always have high RAF gaps. */
  resetWarmup(): void {
    this.framesRenderedSinceStart = 0;
  }

  /** The frame clocks were reset: open a fresh FPS window on the next frame. */
  resetWindow(): void {
    this.fpsWindowStart = 0;
  }

  recordFrame(
    sample: FrameDiagnosticSample,
    describe: () => FrameDropContext
  ): void {
    const { currentTime, rafGap, renderTime, isPlaying } = sample;
    // Frame drop diagnostics: log when frames exceed budget
    // Rate-limited to prevent feedback loops with console recording extensions (rrweb, Sentry, etc.)
    // Skip during warm-up (first N frames have high RAF gaps from browser initialization)
    this.framesRenderedSinceStart++;
    const isWarmingUp =
      this.framesRenderedSinceStart <= FrameDropDiagnostics.WARMUP_FRAMES;
    const isFirstFrameAfterRestart = rafGap > 1000;
    const logEnabled =
      this.frameDropLoggingEnabled ||
      (typeof window !== "undefined" &&
        (window as { __TKA_FRAME_DROP_LOG?: boolean }).__TKA_FRAME_DROP_LOG ===
          true);
    const droppedThisFrame =
      isPlaying &&
      !isWarmingUp &&
      !isFirstFrameAfterRestart &&
      (renderTime > FrameDropDiagnostics.FRAME_DROP_THRESHOLD_MS ||
        rafGap > 100);
    if (logEnabled && droppedThisFrame) {
      const now = performance.now();
      if (
        now - this.lastFrameDropLogTime >
        FrameDropDiagnostics.FRAME_DROP_LOG_COOLDOWN_MS
      ) {
        this.lastFrameDropLogTime = now;
        const { currentStep, fireState, trailCount, tier, loopDetected } =
          describe();
        console.warn(
          `[FrameDrop] render=${renderTime.toFixed(1)}ms rafGap=${rafGap.toFixed(1)}ms ` +
            `step=${currentStep.toFixed(2)} fire=${fireState} ` +
            `trails=${trailCount} tier=${tier} ` +
            `loop=${loopDetected ? "YES" : "no"}`
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
      isPlaying &&
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
        this.fpsWindowStart = currentTime;
        this.fpsWindowFrames = 0;
        this.fpsWindowMinFrameMs = Infinity;
        this.fpsWindowMaxFrameMs = 0;
        this.fpsWindowMaxRenderMs = 0;
        this.fpsWindowRenderMsSum = 0;
        this.fpsWindowDrops = 0;
        this.fpsWindowLongTaskMs = 0;
      }
    } else if (!isPlaying) {
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
}
