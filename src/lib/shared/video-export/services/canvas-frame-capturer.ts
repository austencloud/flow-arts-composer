import type { CapturedFrame } from "#lib/shared/video-export/domain/captured-frame.js";

/**
 * Canvas Frame Capturer
 *
 * Picks the fastest transport path the browser supports and produces a
 * CapturedFrame ready to hand to the video encoder worker.
 *
 * Preference order (2026):
 *   1. WebCodecs VideoFrame from canvas - zero-copy GPU handoff. Used on
 *      Chrome 94+, Edge 94+, Safari 16.4+, Firefox 133+.
 *   2. ImageData readback - legacy main-thread copy. Only reached on
 *      Firefox <133 and ancient browsers, which also use the worker's
 *      WASM encode path.
 *
 * ImageBitmap is intentionally NOT an intermediate tier: no browser we
 * support has createImageBitmap without VideoFrame, and the worker's
 * WASM encoder can't consume an ImageBitmap without another readback.
 */
export class CanvasFrameCapturer {
  readonly preferredKind: "video-frame" | "image-data";

  constructor() {
    if (typeof (globalThis as { VideoFrame?: unknown }).VideoFrame !== "undefined") {
      this.preferredKind = "video-frame";
    } else {
      this.preferredKind = "image-data";
    }
  }

  /**
   * `durationMicros` is how long the frame shows. The encoded chunk takes it
   * from the frame, and the muxer sizes each sample by it - without it the
   * file's last frame lasts no time at all.
   */
  capture(
    canvas: HTMLCanvasElement,
    timestampMicros: number,
    durationMicros?: number
  ): CapturedFrame {
    const width = canvas.width;
    const height = canvas.height;

    if (this.preferredKind === "video-frame") {
      // Construct a VideoFrame directly from the canvas. The browser
      // keeps the pixel data GPU-resident and hands us a transferable
      // handle. VideoFrame requires .close() exactly once by the final
      // consumer - in this pipeline that's the worker after encode().
      const frame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        ...(durationMicros !== undefined ? { duration: durationMicros } : {}),
      });
      return { kind: "video-frame", frame, timestampMicros, width, height };
    }

    // Legacy path - forces a full GPU→CPU pixel readback. Only reached
    // on browsers without WebCodecs, which also use the WASM encoder in
    // the worker and therefore need raw RGBA bytes anyway.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "CanvasFrameCapturer: cannot capture ImageData from a canvas without a 2D context"
      );
    }
    const data = ctx.getImageData(0, 0, width, height);
    return { kind: "image-data", data, timestampMicros, width, height };
  }
}
