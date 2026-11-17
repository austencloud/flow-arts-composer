import { describe, expect, it } from "vitest";
import {
  resolveWorkerResizeTiming,
  type WorkerResizeMoment,
} from "#lib/shared/3d/worker-renderer/services/worker-resize-timing.js";

const drawingLiveFrames: WorkerResizeMoment = {
  visible: true,
  disposed: false,
  preparingFirstFrame: false,
  frameQueued: true,
  hasScene: true,
};

describe("when the worker canvas takes a new size", () => {
  it("waits for the next frame while live frames are being drawn", () => {
    expect(resolveWorkerResizeTiming(drawingLiveFrames)).toBe(
      "with-next-frame"
    );
  });

  it("resizes at once when no frame is coming to apply it", () => {
    expect(
      resolveWorkerResizeTiming({ ...drawingLiveFrames, frameQueued: false })
    ).toBe("now");
    expect(
      resolveWorkerResizeTiming({ ...drawingLiveFrames, visible: false })
    ).toBe("now");
  });

  it("resizes at once while a scene is still being prepared", () => {
    expect(
      resolveWorkerResizeTiming({
        ...drawingLiveFrames,
        preparingFirstFrame: true,
      })
    ).toBe("now");
    expect(
      resolveWorkerResizeTiming({ ...drawingLiveFrames, hasScene: false })
    ).toBe("now");
  });

  it("resizes at once after the renderer is disposed", () => {
    expect(
      resolveWorkerResizeTiming({ ...drawingLiveFrames, disposed: true })
    ).toBe("now");
  });
});
