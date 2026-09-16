import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraKeyframeBuffer } from "$lib/shared/video-export/domain/camera-keyframe";
import { Offline3DExporter } from "$lib/shared/3d/services/offline-3d-exporter";
import type { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";
import type { CanvasFrameCapturer } from "$lib/shared/video-export/services/canvas-frame-capturer";

function createHarness() {
  const encoder = {
    initialize: vi.fn().mockResolvedValue(undefined),
    addFrameCaptured: vi.fn(),
    waitForFrameQueue: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(new Blob()),
    cancel: vi.fn(),
    onProgress: null,
  } as unknown as BackgroundVideoEncoder;
  const capture = vi.fn();
  const capturer = {
    preferredKind: "image-data",
    capture,
  } as unknown as CanvasFrameCapturer;
  const exporter = new Offline3DExporter(encoder, capturer);

  const camera = {
    position: { x: 0, y: 1, z: 2, set: vi.fn() },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set: vi.fn() },
    fov: 50,
    updateProjectionMatrix: vi.fn(),
  };
  const cameraKeyframes = new CameraKeyframeBuffer();
  cameraKeyframes.captureStatic(camera);
  const pauseAutoLoop = vi.fn();
  const resumeAutoLoop = vi.fn();
  const runFrame = vi.fn();

  return {
    exporter,
    encoder,
    capture,
    pauseAutoLoop,
    resumeAutoLoop,
    runFrame,
    deps: {
      webglCanvas: Object.assign(document.createElement("canvas"), {
        width: 640,
        height: 360,
      }),
      camera,
      beatsPerSecond: 1,
      totalDurationSeconds: 1,
      cameraKeyframes,
      renderer: {
        getSize: (target: { set(w: number, h: number): unknown }) =>
          target.set(640, 360),
        setSize: vi.fn(),
        getPixelRatio: () => 1,
        setPixelRatio: vi.fn(),
      },
      runFrame,
      pauseAutoLoop,
      resumeAutoLoop,
      setExporting: vi.fn(),
      setExportCurrentStep: vi.fn(),
    },
  };
}

describe("Offline3DExporter cancellation checkpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("honors a cancel click before encoder startup", async () => {
    const harness = createHarness();
    vi.stubGlobal("scheduler", {
      yield: vi.fn(async () => harness.exporter.cancel()),
    });

    const result = harness.exporter.exportOffline(harness.deps, vi.fn(), {
      fps: 1,
      resolution: 720,
      loopCount: 1,
      includeStartPlacement: false,
      includeEndHold: false,
    });

    await expect(result).rejects.toThrow("Export cancelled");
    expect(harness.encoder.initialize).not.toHaveBeenCalled();
    expect(harness.pauseAutoLoop).toHaveBeenCalledOnce();
    expect(harness.resumeAutoLoop).toHaveBeenCalledOnce();
  });

  it("honors one cancel click after a render unit before capturing another frame", async () => {
    const harness = createHarness();
    let yieldCount = 0;
    vi.stubGlobal("scheduler", {
      yield: vi.fn(async () => {
        yieldCount += 1;
        if (yieldCount === 2) harness.exporter.cancel();
      }),
    });

    const result = harness.exporter.exportOffline(harness.deps, vi.fn(), {
      fps: 1,
      resolution: 720,
      loopCount: 1,
      includeStartPlacement: false,
      includeEndHold: false,
    });

    await expect(result).rejects.toThrow("Export cancelled");
    expect(harness.encoder.initialize).toHaveBeenCalledOnce();
    expect(harness.runFrame).toHaveBeenCalledOnce();
    expect(harness.capture).toHaveBeenCalledOnce();
    expect(harness.encoder.addFrameCaptured).toHaveBeenCalledOnce();
    expect(harness.resumeAutoLoop).toHaveBeenCalledOnce();
  });

  it("captures a nonpersistent framebuffer before yielding control", async () => {
    const harness = createHarness();
    let yieldCount = 0;
    vi.stubGlobal("scheduler", {
      yield: vi.fn(async () => {
        yieldCount += 1;
      }),
    });
    harness.capture.mockImplementation(() => {
      // One startup yield is expected. A second yield here would let the
      // browser discard the default framebuffer before this read.
      expect(yieldCount).toBe(1);
      return { kind: "image-data" };
    });

    await harness.exporter.exportOffline(harness.deps, vi.fn(), {
      fps: 1,
      resolution: 720,
      loopCount: 1,
      includeStartPlacement: false,
      includeEndHold: false,
    });

    expect(harness.runFrame).toHaveBeenCalledOnce();
    expect(harness.capture).toHaveBeenCalledOnce();
    expect(yieldCount).toBe(2);
  });
});
