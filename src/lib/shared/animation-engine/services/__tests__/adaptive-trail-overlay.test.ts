// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "../ITrailOverlayCanvas";
import { AdaptiveTrailOverlay } from "../adaptive-trail-overlay";
import { TrailOverlayWebGL2 } from "../trail-overlay-web-gl2";

function makeOverlay(
  initialize: ITrailOverlayCanvas["initialize"] = () => {}
): ITrailOverlayCanvas {
  return {
    initialize: vi.fn(initialize),
    resize: vi.fn(),
    renderFrame: vi.fn(),
    clear: vi.fn(),
    clearBuffers: vi.fn(),
    refreshStyle: vi.fn(),
    setVisible: vi.fn(),
    setCanvasZIndex: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("AdaptiveTrailOverlay", () => {
  it("replaces a rejected GPU overlay with Canvas2D and preserves live state", async () => {
    const failure = new Error("WebGL2 context unavailable");
    let rejectPrimary: (error: unknown) => void = () => {};
    const primaryInitialization = new Promise<void>((_resolve, reject) => {
      rejectPrimary = reject;
    });
    const primary = makeOverlay(() => primaryInitialization);
    const fallback = makeOverlay();
    const onPrimaryFailure = vi.fn();
    const overlay = new AdaptiveTrailOverlay({
      createPrimary: () => primary,
      createFallback: () => fallback,
      onPrimaryFailure,
    });
    const container = document.createElement("div");

    overlay.setVisible(false);
    overlay.setCanvasZIndex(7);
    overlay.initialize(container, 320, 240);
    overlay.resize(640, 480);
    rejectPrimary(failure);

    await vi.waitFor(() => {
      expect(fallback.initialize).toHaveBeenCalledWith(container, 640, 480);
    });

    expect(onPrimaryFailure).toHaveBeenCalledWith(failure);
    expect(primary.dispose).toHaveBeenCalledOnce();
    expect(fallback.setVisible).toHaveBeenCalledWith(false);
    expect(fallback.setCanvasZIndex).toHaveBeenCalledWith(7);

    const frame = {} as TrailOverlayRenderParams;
    overlay.renderFrame(frame);
    expect(fallback.renderFrame).toHaveBeenCalledWith(frame);
  });

  it("removes the failed GPU canvas before handing control to the fallback", async () => {
    const realDocument = document.implementation.createHTMLDocument();
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = realDocument.createElement(tagName);
        if (tagName.toLowerCase() === "canvas") {
          Object.defineProperty(element, "getContext", {
            configurable: true,
            value: vi.fn(() => null),
          });
        }
        return element;
      });
    const fallback = makeOverlay();
    const onPrimaryFailure = vi.fn();
    const overlay = new AdaptiveTrailOverlay({
      createPrimary: () => new TrailOverlayWebGL2(),
      createFallback: () => fallback,
      onPrimaryFailure,
    });
    const container = realDocument.createElement("div");

    try {
      overlay.initialize(container, 320, 240);

      await vi.waitFor(() => {
        expect(fallback.initialize).toHaveBeenCalledOnce();
      });

      expect(onPrimaryFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "WebGL2Backend: failed to acquire WebGL2 context",
        })
      );
      expect(container.querySelectorAll("canvas")).toHaveLength(0);
    } finally {
      createElement.mockRestore();
    }
  });

  it("does not install a fallback after the overlay has been disposed", async () => {
    let rejectPrimary: (error: unknown) => void = () => {};
    const primary = makeOverlay(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPrimary = reject;
        })
    );
    const createFallback = vi.fn(() => makeOverlay());
    const onPrimaryFailure = vi.fn();
    const overlay = new AdaptiveTrailOverlay({
      createPrimary: () => primary,
      createFallback,
      onPrimaryFailure,
    });

    overlay.initialize(document.createElement("div"), 320, 240);
    overlay.dispose();
    rejectPrimary(new Error("late WebGL2 failure"));
    await Promise.resolve();
    await Promise.resolve();

    expect(createFallback).not.toHaveBeenCalled();
    expect(onPrimaryFailure).not.toHaveBeenCalled();
    expect(primary.dispose).toHaveBeenCalledOnce();
  });
});
