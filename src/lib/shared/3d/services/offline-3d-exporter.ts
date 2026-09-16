/**
 * Offline 3D Exporter - synchronous scheduler-driven pipeline.
 *
 * Every frame is rendered deterministically by:
 *   1. Setting the performer step + camera transform.
 *   2. Flushing Svelte reactive state (await tick) so $derived/props
 *      propagate into Threlte components.
 *   3. Calling runFrame(time) - a single synchronous call that drives
 *      the entire Threlte scheduler: puppet loop → IK → effects → render.
 *   4. Capturing the canvas.
 *
 * The native Three.js setAnimationLoop is paused for the duration of the
 * export so automatic rAF renders don't race with our manual pacing.
 * This delivers three properties:
 *   - Speed: the export runs at CPU speed, not capped at the display
 *     refresh rate.
 *   - Tab-switch immunity: manual scheduler.run() is unaffected by the
 *     browser throttling rAF when the tab is backgrounded.
 *   - Determinism: monotonic synthetic time means effects/IK receive
 *     exactly 1/fps seconds of delta per frame, independent of wall clock.
 *
 * ── Quality modes ──────────────────────────────────────────────────
 * "standard": 1 render per output frame at native resolution.
 * "cinema":
 *   - 2× supersampling: render to a 2× backing store, then bilinearly
 *     downsample to target. Eliminates shader aliasing on thin geometry
 *     (staves, arms, prop edges) far better than MSAA.
 *   - 4× temporal motion blur: render 4 sub-frames at T, T+¼Δ, T+½Δ,
 *     T+¾Δ and average them into a compositor canvas using a running
 *     alpha `1/(k+1)`. Each sub-frame advances the animation and camera
 *     a fraction of a frame so fast motion integrates over the shutter
 *     interval instead of snapping.
 *   - Combined cost: ~4× wall time vs. standard for the same settings.
 */

import { tick } from "svelte";
import { Vector2 } from "three";
import type { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";
import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
import type { CameraKeyframeBuffer } from "$lib/shared/video-export/domain/camera-keyframe";

export interface Offline3DExportOptions {
  fps: number;
  /** Target vertical resolution: 720, 1080, 2160, or 4320 */
  resolution: number;
  loopCount: number;
  includeStartPlacement: boolean;
  includeEndHold: boolean;
  /**
   * "standard": one render per output frame at native resolution.
   * "cinema": 2x supersampling + 4x temporal motion blur. Roughly 4-8x slower
   * than standard but produces a sharper, smoother result.
   */
  quality?: "standard" | "cinema";
}

export interface Offline3DExportDependencies {
  /** The WebGL canvas to capture frames from */
  webglCanvas: HTMLCanvasElement;
  /** The Three.js PerspectiveCamera (from useThrelte().camera) */
  camera: {
    position: { set(x: number, y: number, z: number): void };
    quaternion: { set(x: number, y: number, z: number, w: number): void };
    fov: number;
    updateProjectionMatrix(): void;
  };
  /** Beats per second for converting animation time to currentStep */
  beatsPerSecond: number;
  /** Total animation duration in seconds (single loop, no start/end hold) */
  totalDurationSeconds: number;
  /** Camera keyframe buffer from pass 1 (or static capture) */
  cameraKeyframes: CameraKeyframeBuffer;
  /**
   * The Three.js WebGLRenderer. In cinema quality mode the exporter
   * temporarily resizes the renderer to 2x target resolution for
   * supersampling antialiasing. Only `getSize`/`setSize` and pixel ratio
   * accessors are used; the renderer is restored before export completes.
   */
  renderer: {
    getSize(target: {
      x: number;
      y: number;
      set(w: number, h: number): unknown;
    }): unknown;
    setSize(w: number, h: number, updateStyle?: boolean): void;
    getPixelRatio(): number;
    setPixelRatio(ratio: number): void;
  };
  /**
   * Runs Threlte's full pipeline synchronously in one call: every useTask
   * callback (puppet loop, IK, effects, render) executes, then the scene
   * is drawn. `timeMs` is a monotonically increasing timestamp used for
   * delta-time calculation inside tasks. This is how the exporter renders
   * at CPU speed without rAF throttling.
   */
  runFrame: (timeMs: number) => void;
  /**
   * Pause Threlte's native rAF loop so manual runFrame calls aren't
   * racing with automatic renders. The loop is resumed after export.
   */
  pauseAutoLoop: () => void;
  /** Restore Threlte's native rAF loop after export completes. */
  resumeAutoLoop: () => void;
  /**
   * Signal that offline export is active. The puppet loop reads
   * exportCurrentStep instead of the live component prop.
   */
  setExporting: (value: boolean) => void;
  /**
   * Set the current animation step for the puppet loop to distribute.
   * The puppet loop reads this value during runFrame and calls
   * goToStep/setProgress on performers - same code path as live playback.
   */
  setExportCurrentStep: (step: number | null) => void;
}
import {
  getExportDimensions,
  calculateBitrate,
} from "$lib/shared/animation-engine/domain/video-export-calculations";
import type { CanvasFrameCapturer } from "$lib/shared/video-export/services/canvas-frame-capturer";
import { interpolateKeyframes } from "$lib/shared/video-export/services/camera-keyframe-interpolator";
import { ExportDiagnostics } from "$lib/shared/video-export/domain/export-diagnostics";

const KEYFRAME_INTERVAL = 30;
const FALLBACK_ASPECT_RATIO = 16 / 9;
// Cinema-mode tunables.
const CINEMA_SSAA = 2;
const CINEMA_SUB_FRAMES = 4;

export class Offline3DExporter {
  private shouldCancel = false;

  constructor(
    private readonly backgroundEncoder: BackgroundVideoEncoder,
    private readonly capturer: CanvasFrameCapturer
  ) {}

  async exportOffline(
    deps: Offline3DExportDependencies,
    onProgress: (progress: VideoExportProgress) => void,
    options: Offline3DExportOptions
  ): Promise<Blob> {
    this.shouldCancel = false;

    const { fps, resolution, loopCount } = options;
    const cinema = options.quality === "cinema";
    const ssaa = cinema ? CINEMA_SSAA : 1;
    const subFrames = cinema ? CINEMA_SUB_FRAMES : 1;

    const liveWidth = deps.webglCanvas.width;
    const liveHeight = deps.webglCanvas.height;
    const aspectRatio =
      liveWidth > 0 && liveHeight > 0
        ? liveWidth / liveHeight
        : FALLBACK_ASPECT_RATIO;

    const { width, height } = getExportDimensions(resolution, aspectRatio);
    const bitrate = calculateBitrate(width, height, fps);

    const totalDurationSec = deps.totalDurationSeconds * loopCount;
    const totalFrames = Math.ceil(totalDurationSec * fps);

    if (totalFrames <= 0) {
      throw new Error(
        `Cannot export: computed 0 frames (duration=${totalDurationSec}s, fps=${fps})`
      );
    }

    // Capture owns the readout until the last frame is handed over; the encoder
    // owns it after. Without the gate the two interleave and the label flips
    // between "Rendering frames" and "Encoding video" several times a second,
    // and the encoder's (lower) count keeps yanking the ring backwards.
    let captureComplete = false;
    let encodedSoFar = 0;
    this.backgroundEncoder.onProgress = (frameIndex, total) => {
      encodedSoFar = frameIndex;
      if (!captureComplete) return;
      onProgress({
        progress: frameIndex / total,
        stage: "encoding",
        currentFrame: frameIndex,
        totalFrames: total,
      });
    };

    const diag = new ExportDiagnostics(
      width,
      height,
      fps,
      totalFrames,
      this.capturer.preferredKind
    );

    const keyframes = deps.cameraKeyframes.keyframes;
    const frameDurationMs = 1000 / fps;
    const subFrameDurationMs = frameDurationMs / subFrames;
    let monotonicTime = performance.now();

    // ── Cinema mode setup ─────────────────────────────────────────
    // Save original renderer state so we can restore it later.
    // Three.js WebGLRenderer.getSize(target) calls target.set(w, h), so
    // the target must be a Vector2 (or compatible object with .set).
    const origSize = new Vector2();
    deps.renderer.getSize(origSize);
    const origPixelRatio = deps.renderer.getPixelRatio();

    // Compositor canvas for motion blur + downsample. Standard mode
    // skips this entirely and captures straight from the WebGL canvas.
    let compositor: HTMLCanvasElement | null = null;
    let compositorCtx: CanvasRenderingContext2D | null = null;
    if (cinema) {
      compositor = document.createElement("canvas");
      compositor.width = width;
      compositor.height = height;
      const ctx = compositor.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("Cinema export requires 2D canvas context support.");
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      compositorCtx = ctx;

      // Resize WebGL backing store to 2× target. Force pixelRatio=1 so
      // setSize treats the numbers as literal backing-store dimensions -
      // otherwise a retina display would double-multiply.
      deps.renderer.setPixelRatio(1);
      deps.renderer.setSize(width * ssaa, height * ssaa, false);
    }

    try {
      deps.setExporting(true);
      // Stop the native rAF loop BEFORE the heavy encoder init, not just before
      // the capture loop. Spawning the export worker loads the (large) mediabunny
      // module and configures WebCodecs; doing that while the live 3D scene is
      // still rendering starves the worker of CPU and inflated init past the
      // ready-timeout on heavier scenes / slower hardware — the "Encoder
      // initialization timed out" export failure. Quiescing the scene first lets
      // init run at CPU speed. It also keeps the manual runFrame calls from racing
      // automatic renders during capture, and gives tab-switch immunity.
      deps.pauseAutoLoop();

      // Give the browser one task boundary to paint the progress state and
      // accept Cancel before encoder startup begins. A click here is latched
      // by cancel() and prevents the worker from starting at all.
      await yieldToEventLoop();
      this.throwIfCancelled();

      // Spawn + configure the encoder worker now that the scene is quiesced.
      await this.backgroundEncoder.initialize({
        width,
        height,
        fps,
        bitrate,
        totalFrames,
      });

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        this.throwIfCancelled();

        diag.startFrame();

        const animationTime = frameIndex / fps;

        if (compositorCtx) {
          // Reset the compositor for this output frame. We want to
          // start with a blank slate so the running-alpha average is
          // built from the subFrames sub-renders and nothing else.
          compositorCtx.globalAlpha = 1;
          compositorCtx.clearRect(0, 0, width, height);
        }

        for (let sub = 0; sub < subFrames; sub++) {
          // Sub-frame timing: evenly distribute sub-renders across the
          // shutter interval [T, T+Δ). When subFrames=1 this reduces to
          // subTime = animationTime, matching standard behaviour.
          const subTime = animationTime + sub / (fps * subFrames);
          const subStep = subTime * deps.beatsPerSecond;

          // 1. Advance animation step for this sub-frame.
          deps.setExportCurrentStep(subStep);

          // 2. Interpolate camera at sub-frame time.
          const cam = interpolateKeyframes(keyframes, subTime);
          deps.camera.position.set(
            cam.position[0],
            cam.position[1],
            cam.position[2]
          );
          deps.camera.quaternion.set(
            cam.quaternion[0],
            cam.quaternion[1],
            cam.quaternion[2],
            cam.quaternion[3]
          );
          deps.camera.fov = cam.fov;
          deps.camera.updateProjectionMatrix();

          // 3. Flush Svelte reactive state → components before Threlte's
          //    useTask callbacks read it.
          await tick();

          // 4. Run Threlte's full pipeline synchronously - puppet loop,
          //    IK, effects, render.
          deps.runFrame(monotonicTime + sub * subFrameDurationMs);

          if (compositorCtx) {
            // Composite sub-render into motion-blur accumulator.
            // Running alpha = 1/(sub+1) gives a mathematically exact
            // uniform average across subFrames sub-renders using plain
            // source-over blending. `drawImage` with differing source
            // and dest sizes performs the SSAA downsample in-browser.
            compositorCtx.globalAlpha = 1 / (sub + 1);
            compositorCtx.drawImage(deps.webglCanvas, 0, 0, width, height);
          }

          // Cinema has already copied this sub-render into its persistent 2D
          // accumulator, so it can yield safely before the next expensive
          // render. Standard mode must synchronously read Three's
          // nonpersistent framebuffer first.
          if (compositorCtx) {
            await yieldToEventLoop();
            this.throwIfCancelled();
          }
        }

        diag.markDrawImage();

        // 5. Capture the finished output frame.
        const captureCanvas = compositor ?? deps.webglCanvas;
        const timestampMicros = Math.round(animationTime * 1_000_000);
        const isKeyframe = frameIndex % KEYFRAME_INTERVAL === 0;
        const frame = this.capturer.capture(captureCanvas, timestampMicros);
        diag.markCapture();

        this.backgroundEncoder.addFrameCaptured(frame, frameIndex, isKeyframe);
        diag.markAddFrame();

        // Standard mode yields after the synchronous canvas read. Cancellation
        // still lands before another render starts, without paying for a
        // duplicate composed render or risking a discarded framebuffer.
        if (!compositorCtx) {
          await yieldToEventLoop();
          this.throwIfCancelled();
        }

        // Keep transferred GPU frames bounded. If encoding falls behind, this
        // wait is cancellation-aware and prevents the queued frames themselves
        // from starving the browser's input loop.
        await this.backgroundEncoder.waitForFrameQueue(6);
        this.throwIfCancelled();

        // 6. Progress report.
        onProgress({
          progress: frameIndex / totalFrames,
          stage: "capturing",
          currentFrame: frameIndex,
          totalFrames,
        });

        monotonicTime += frameDurationMs;
      }

      diag.finish();

      // Hand the readout to the encoder. Every frame is captured but most are
      // still queued inside it, so this is where the honest number lives from
      // here on — and on a long take that tail is a large share of the wait.
      captureComplete = true;
      onProgress({
        progress: encodedSoFar / totalFrames,
        stage: "encoding",
        currentFrame: encodedSoFar,
        totalFrames,
      });

      const blob = await this.backgroundEncoder.finish();
      onProgress({ progress: 1, stage: "complete", totalFrames });
      return blob;
    } catch (err) {
      diag.finish();
      if ((err as Error).message !== "Export cancelled") {
        onProgress({
          progress: 0,
          stage: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    } finally {
      deps.setExportCurrentStep(null);
      deps.setExporting(false);

      // Restore renderer size/pixel ratio - even if export threw or was
      // cancelled - so the live scene keeps rendering at the right size.
      if (cinema) {
        deps.renderer.setPixelRatio(origPixelRatio);
        deps.renderer.setSize(origSize.x, origSize.y, false);
      }

      // Always resume the native loop last, once the renderer is back
      // to its live size.
      deps.resumeAutoLoop();
    }
  }

  cancel(): void {
    this.shouldCancel = true;
    this.backgroundEncoder.cancel();
  }

  private throwIfCancelled(): void {
    if (this.shouldCancel) throw new Error("Export cancelled");
  }
}

/**
 * Yield to the browser's event loop without rAF throttling. A
 * MessageChannel post-message fires on the next macrotask, which
 * is unaffected by tab backgrounding or the 60Hz display refresh.
 */
function yieldToEventLoop(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  if (scheduler?.yield) return scheduler.yield();

  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}
