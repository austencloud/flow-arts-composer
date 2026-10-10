import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CanvasFrameCapturer } from "#lib/shared/video-export/services/canvas-frame-capturer.js";

type Globals = {
  VideoFrame: unknown;
};

describe("CanvasFrameCapturer", () => {
  const originalVideoFrame = (globalThis as unknown as Globals).VideoFrame;

  afterEach(() => {
    (globalThis as unknown as Globals).VideoFrame = originalVideoFrame;
    vi.restoreAllMocks();
  });

  describe("capability detection", () => {
    it("picks video-frame when globalThis.VideoFrame exists", () => {
      (globalThis as unknown as Globals).VideoFrame = class FakeVideoFrame {};
      const capturer = new CanvasFrameCapturer();
      expect(capturer.preferredKind).toBe("video-frame");
    });

    it("picks image-data when globalThis.VideoFrame is undefined", () => {
      (globalThis as unknown as Globals).VideoFrame = undefined;
      const capturer = new CanvasFrameCapturer();
      expect(capturer.preferredKind).toBe("image-data");
    });
  });

  describe("capture()", () => {
    it("returns a video-frame CapturedFrame when VideoFrame is supported", async () => {
      const frameInstances: unknown[] = [];
      class FakeVideoFrame {
        readonly source: unknown;
        readonly timestamp: number;
        constructor(source: unknown, init: { timestamp: number }) {
          this.source = source;
          this.timestamp = init.timestamp;
          frameInstances.push(this);
        }
        close() {}
      }
      (globalThis as unknown as Globals).VideoFrame = FakeVideoFrame;

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;

      const capturer = new CanvasFrameCapturer();
      const captured = await capturer.capture(canvas, 123456);

      expect(captured.kind).toBe("video-frame");
      expect(captured.width).toBe(640);
      expect(captured.height).toBe(480);
      expect(captured.timestampMicros).toBe(123456);
      if (captured.kind === "video-frame") {
        expect(captured.frame).toBeInstanceOf(FakeVideoFrame);
        expect(frameInstances).toHaveLength(1);
      }
    });

    it("gives the frame the duration it shows for, so a file's last frame lasts", () => {
      const inits: { timestamp: number; duration?: number }[] = [];
      (globalThis as unknown as Globals).VideoFrame = class FakeVideoFrame {
        constructor(
          _source: unknown,
          init: { timestamp: number; duration?: number }
        ) {
          inits.push(init);
        }
        close() {}
      };
      const canvas = document.createElement("canvas");
      const capturer = new CanvasFrameCapturer();

      capturer.capture(canvas, 2_400_000, Math.round(1_000_000 / 30));
      capturer.capture(canvas, 2_433_333);

      expect(inits[0]).toEqual({ timestamp: 2_400_000, duration: 33_333 });
      // No duration given leaves it unset rather than zero.
      expect(inits[1]).toEqual({ timestamp: 2_433_333 });
    });

    it("returns an image-data CapturedFrame when VideoFrame is unavailable", async () => {
      (globalThis as unknown as Globals).VideoFrame = undefined;

      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 8;
      // Prime the 2D context so getImageData returns real data.
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 16, 8);

      const capturer = new CanvasFrameCapturer();
      const captured = await capturer.capture(canvas, 999);

      expect(captured.kind).toBe("image-data");
      expect(captured.width).toBe(16);
      expect(captured.height).toBe(8);
      expect(captured.timestampMicros).toBe(999);
      if (captured.kind === "image-data") {
        expect(captured.data.width).toBe(16);
        expect(captured.data.height).toBe(8);
        expect(captured.data.data.length).toBe(16 * 8 * 4);
      }
    });
  });
});
