/**
 * Background Video Encoder
 *
 * Delegates WebCodecs encoding and MP4 muxing to a dedicated Web Worker so the
 * main thread stays responsive during export. Communicates via structured
 * messages (see video-export.worker.ts for the protocol).
 *
 * Lifecycle:
 *   1. initialize() - spawns worker, posts config, waits for "ready"
 *   2. addFrame()   - posts ImageData (transferred, zero-copy) per frame
 *   3. finish()     - signals end, waits for completed MP4 ArrayBuffer
 *   4. cancel()     - aborts immediately and terminates the worker
 */

export interface BackgroundExportConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalFrames: number;
  /** "h264" (default, 4:2:0) or "av1" (4:4:4, near-exact parity). */
  codec?: "h264" | "av1";
  /** Mux fragmented MP4 (MSE-appendable) instead of progressive. Default false. */
  fragmented?: boolean;
  /**
   * Optional source whose original audio track is decoded, normalized to AAC,
   * and muxed into the exported MP4. Visual frames still use the existing
   * worker encoder; this extends that one output rather than creating a second
   * composition pipeline.
   */
  originalAudio?: {
    url: string;
    startSeconds?: number;
    endSeconds?: number;
  };
}
import type {
  ExportWorkerMessage,
  ExportWorkerResponse,
} from "#lib/shared/animation-engine/workers/video-export.worker.js";
import type { CapturedFrame } from "#lib/shared/video-export/domain/captured-frame.js";

export class BackgroundVideoEncoder {
  private worker: Worker | null = null;
  private totalFrames = 0;
  private submittedFrames = 0;
  private dequeuedFrames = 0;
  private encodedFrames = 0;
  private drainWaiters = new Set<{
    maxPendingFrames: number;
    resolve: () => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
  }>();

  /**
   * Pending promise resolvers for request/response cycles.
   * Only one "initialize" and one "finish" can be in flight at a time.
   */
  private initResolve: (() => void) | null = null;
  private initReject: ((reason: Error) => void) | null = null;
  private finishResolve: ((blob: Blob) => void) | null = null;
  private finishReject: ((reason: Error) => void) | null = null;

  /**
   * First error the worker reported during this export. We track it
   * persistently so that (a) later cascade errors don't overwrite the
   * root-cause message, (b) addFrameCaptured can bail cheaply once the
   * encoder is known dead, and (c) finish() can fail fast with the
   * original reason instead of waiting for yet another worker roundtrip.
   *
   * Cleared when initialize() starts a fresh export.
   */
  private firstError: Error | null = null;

  onProgress: ((frameIndex: number, totalFrames: number) => void) | null = null;

  /** Max wait for the worker to report "ready". A stalled VideoEncoder.configure()
   *  posts neither "ready" nor an error, so without this the init promise hangs
   *  forever and the export UI freezes at 0%.
   *
   *  Sized for the *slow-but-not-hung* case, not just the hung one: spawning the
   *  worker cold-loads the large mediabunny module and then configures WebCodecs.
   *  On a contended main thread / slow hardware / cold module cache that init can
   *  legitimately take >15s (measured ~14s under a 20x CPU throttle even with the
   *  scene idle). The old 15s ceiling clipped those healthy-but-slow inits and
   *  surfaced them as "Encoder initialization timed out". 30s clears the slow
   *  path while still bounding a genuine hang. (The primary fix for the common
   *  case lives in Offline3DExporter: it now pauses the live render loop before
   *  this init so the worker isn't fighting the 3D scene for CPU.) */
  private static readonly READY_TIMEOUT_MS = 30_000;

  private initTimer: ReturnType<typeof setTimeout> | null = null;

  // Public API

  async initialize(config: BackgroundExportConfig): Promise<void> {
    // Terminate any leftover worker from a previous export
    this.rejectDrainWaiters(new Error("Encoder restarted"));
    this.terminateWorker();

    this.totalFrames = config.totalFrames;
    this.submittedFrames = 0;
    this.dequeuedFrames = 0;
    this.encodedFrames = 0;
    this.firstError = null;

    // Spawn the worker. Vite resolves the URL at build time via
    // `new URL("...", import.meta.url)` so the worker file is bundled correctly.
    this.worker = new Worker(
      new URL("../workers/video-export.worker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = this.handleMessage;
    this.worker.onerror = this.handleWorkerError;

    // Wait for the worker to finish configuring the encoder, with a timeout so a
    // stalled configure() can't hang the export at 0% forever.
    return new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;

      this.initTimer = setTimeout(() => {
        if (this.initReject) {
          const err = new Error(
            "Encoder initialization timed out. The codec configuration did not " +
              "complete (try a lower resolution/fps, or a different browser)."
          );
          this.initReject(err);
          this.initResolve = null;
          this.initReject = null;
        }
        this.terminateWorker();
      }, BackgroundVideoEncoder.READY_TIMEOUT_MS);

      this.postToWorker({
        type: "config",
        config: {
          width: config.width,
          height: config.height,
          fps: config.fps,
          bitrate: config.bitrate,
          totalFrames: config.totalFrames,
          codec: config.codec,
          fragmented: config.fragmented,
          originalAudio: config.originalAudio,
        },
      });
    });
  }

  addFrame(
    imageData: ImageData,
    frameIndex: number,
    timestampMicros: number,
    isKeyframe: boolean
  ): void {
    if (!this.worker) {
      // Worker was disposed (e.g., viewer closed during export). The export
      // loop will check shouldCancel on the next iteration and abort cleanly.
      return;
    }

    // Transfer the underlying ArrayBuffer so it moves to the worker without
    // copying. After this call the ImageData on the main thread is neutered.
    const buffer = imageData.data.buffer;

    const message: ExportWorkerMessage = {
      type: "frame",
      imageData,
      frameIndex,
      timestampMicros,
      isKeyframe,
    };

    this.worker.postMessage(message, [buffer]);
    this.submittedFrames += 1;
  }

  addFrameCaptured(
    frame: CapturedFrame,
    frameIndex: number,
    isKeyframe: boolean
  ): void {
    // Bail fast if the worker is gone OR if the encoder has already
    // reported an error. After the first error, every subsequent frame
    // is a waste of GPU memory and postMessage bandwidth - the worker's
    // encoder is closed and will reject them anyway. Close the VideoFrame
    // handle ourselves so it doesn't leak through to GC.
    if (!this.worker || this.firstError !== null) {
      if (frame.kind === "video-frame") {
        frame.frame.close();
      }
      return;
    }

    // Branch by kind so postMessage transferables are correct. The worker
    // closes every VideoFrame after encode(); we close here only when the
    // worker is unreachable (see early-return above).
    if (frame.kind === "video-frame") {
      this.worker.postMessage(
        {
          type: "frame-captured",
          frame,
          frameIndex,
          isKeyframe,
        },
        [frame.frame]
      );
    } else {
      // image-data: transfer the underlying ArrayBuffer.
      this.worker.postMessage(
        {
          type: "frame-captured",
          frame,
          frameIndex,
          isKeyframe,
        },
        [frame.data.data.buffer]
      );
    }
    this.submittedFrames += 1;
  }

  /**
   * Applies main-thread backpressure to long exports. A transferred VideoFrame
   * still occupies browser/GPU memory until the worker encodes and closes it;
   * bounding that queue prevents a fast compositor from freezing the tab while
   * hundreds of full-resolution frames wait behind the codec.
   */
  async waitForFrameQueue(
    maxPendingFrames = 8,
    signal?: AbortSignal
  ): Promise<void> {
    if (!Number.isInteger(maxPendingFrames) || maxPendingFrames < 0) {
      throw new RangeError(
        "Pending frame limit must be a non-negative integer"
      );
    }
    if (this.firstError) throw this.firstError;
    if (signal?.aborted) throw new Error("Export cancelled");
    if (!this.worker) throw new Error("Export cancelled");
    if (this.submittedFrames - this.dequeuedFrames <= maxPendingFrames) return;

    await new Promise<void>((resolve, reject) => {
      const waiter = {
        maxPendingFrames,
        resolve,
        reject,
        signal,
        onAbort: undefined as (() => void) | undefined,
      };
      waiter.onAbort = () => {
        this.drainWaiters.delete(waiter);
        reject(new Error("Export cancelled"));
      };
      this.drainWaiters.add(waiter);
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      if (signal?.aborted) waiter.onAbort();
    });
  }

  async finish(): Promise<Blob> {
    if (!this.worker) {
      throw new Error("Export cancelled");
    }

    // If the encoder already died mid-export, fail fast with the real
    // error from the encoder's error callback. Without this guard we'd
    // post {type:"finish"} to the worker, hit the worker's errored-state
    // bail path, and reject with the less-informative fallback message.
    if (this.firstError !== null) {
      throw this.firstError;
    }

    return new Promise<Blob>((resolve, reject) => {
      this.finishResolve = resolve;
      this.finishReject = reject;

      this.postToWorker({ type: "finish" });
    });
  }

  cancel(): void {
    // Attempt to tell the worker to cancel gracefully first
    if (this.worker) {
      try {
        this.postToWorker({ type: "cancel" });
      } catch {
        // Worker may already be terminated
      }
    }

    // Reject any pending promises
    this.rejectPending(new Error("Export cancelled"));

    // Hard-terminate the worker
    this.terminateWorker();
  }

  // Worker communication

  private postToWorker(message: ExportWorkerMessage): void {
    this.worker?.postMessage(message);
  }

  private clearInitTimer(): void {
    if (this.initTimer) {
      clearTimeout(this.initTimer);
      this.initTimer = null;
    }
  }

  private handleMessage = (event: MessageEvent<ExportWorkerResponse>): void => {
    const response = event.data;

    switch (response.type) {
      case "ready":
        this.clearInitTimer();
        this.initResolve?.();
        this.initResolve = null;
        this.initReject = null;
        break;

      case "progress":
        this.encodedFrames = Math.max(
          this.encodedFrames,
          response.frameIndex + 1
        );
        this.onProgress?.(response.frameIndex, this.totalFrames);
        break;

      case "dequeued":
        this.dequeuedFrames = Math.max(
          this.dequeuedFrames,
          response.frameCount
        );
        this.resolveDrainWaiters();
        break;

      case "complete": {
        const blob = new Blob([response.buffer], { type: "video/mp4" });

        this.encodedFrames = this.submittedFrames;
        this.dequeuedFrames = this.submittedFrames;
        this.resolveDrainWaiters();

        this.finishResolve?.(blob);
        this.finishResolve = null;
        this.finishReject = null;

        // Export complete - clean up the worker
        this.terminateWorker();
        break;
      }

      case "error": {
        // Preserve the FIRST error we see as the root cause. Later errors
        // are almost always cascades from the first (e.g. "Cannot call
        // 'encode' on a closed codec" follow-ups after the encoder has
        // already died). The first error is the informative one.
        if (this.firstError === null) {
          this.firstError = new Error(response.error);
        }

        this.rejectDrainWaiters(this.firstError);

        this.clearInitTimer();

        // Route the first/root-cause error to whichever promise is
        // currently in flight. If no promise is in flight (frame capture
        // is still running and finish() hasn't been called yet), the
        // error stays in firstError and addFrameCaptured/finish will
        // surface it on the next call.
        if (this.initReject) {
          this.initReject(this.firstError);
          this.initResolve = null;
          this.initReject = null;
        } else if (this.finishReject) {
          this.finishReject(this.firstError);
          this.finishResolve = null;
          this.finishReject = null;
        }
        break;
      }
    }
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(
      `Worker error: ${event.message || "Unknown worker error"}`
    );
    this.rejectPending(error);
    this.terminateWorker();
  };

  // ---------------------------------------------------------------------------
  // Cleanup helpers
  // ---------------------------------------------------------------------------

  private rejectPending(error: Error): void {
    this.clearInitTimer();
    this.rejectDrainWaiters(error);
    if (this.initReject) {
      this.initReject(error);
      this.initResolve = null;
      this.initReject = null;
    }
    if (this.finishReject) {
      this.finishReject(error);
      this.finishResolve = null;
      this.finishReject = null;
    }
  }

  private resolveDrainWaiters(): void {
    const pendingFrames = this.submittedFrames - this.dequeuedFrames;
    for (const waiter of this.drainWaiters) {
      if (pendingFrames <= waiter.maxPendingFrames) {
        this.drainWaiters.delete(waiter);
        if (waiter.onAbort)
          waiter.signal?.removeEventListener("abort", waiter.onAbort);
        waiter.resolve();
      }
    }
  }

  private rejectDrainWaiters(error: Error): void {
    for (const waiter of this.drainWaiters) {
      if (waiter.onAbort)
        waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.reject(error);
    }
    this.drainWaiters.clear();
  }

  private terminateWorker(): void {
    this.clearInitTimer();
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
}
