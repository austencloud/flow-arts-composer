import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForAnimationFrame } from "./live-canvas-gif-exporter";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("waitForAnimationFrame", () => {
  it("cancels a pending frame when GIF capture is aborted", async () => {
    let frameCallback: FrameRequestCallback | undefined;
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 41;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const controller = new AbortController();
    const waiting = waitForAnimationFrame(controller.signal);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);

    // A delayed browser callback must not revive an export after cancellation.
    frameCallback?.(100);
  });
});
