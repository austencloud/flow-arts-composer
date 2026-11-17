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

  describe("failure after the primary started", () => {
    function started(opts: {
      primary?: ITrailOverlayCanvas;
      fallback?: ITrailOverlayCanvas;
    } = {}) {
      const primary = opts.primary ?? makeOverlay();
      const fallback = opts.fallback ?? makeOverlay();
      const onPrimaryFailure = vi.fn();
      const onFallbackFailure = vi.fn();
      const createFallback = vi.fn(() => fallback);
      const overlay = new AdaptiveTrailOverlay({
        createPrimary: () => primary,
        createFallback,
        onPrimaryFailure,
        onFallbackFailure,
      });
      // A plain object: the overlays here are fakes, and the earlier test that
      // spies on document.createElement leaves it unreliable under the project
      // config.
      const container = {} as HTMLElement;
      overlay.initialize(container, 320, 240);
      return {
        overlay,
        primary,
        fallback,
        container,
        onPrimaryFailure,
        onFallbackFailure,
        createFallback,
      };
    }

    it("swaps to the fallback at the new size when resize throws", () => {
      const boom = new Error("framebuffer incomplete");
      const primary = makeOverlay();
      primary.resize = vi.fn(() => {
        throw boom;
      });
      const t = started({ primary });

      expect(() => t.overlay.resize(640, 480)).not.toThrow();

      expect(t.onPrimaryFailure).toHaveBeenCalledOnce();
      expect(t.onPrimaryFailure).toHaveBeenCalledWith(boom);
      expect(primary.dispose).toHaveBeenCalledOnce();
      expect(t.fallback.initialize).toHaveBeenCalledWith(t.container, 640, 480);
    });

    it("swaps to the fallback when renderFrame throws", () => {
      const primary = makeOverlay();
      primary.renderFrame = vi.fn(() => {
        throw new Error("lost");
      });
      const t = started({ primary });
      const frame = {} as TrailOverlayRenderParams;

      expect(() => t.overlay.renderFrame(frame)).not.toThrow();
      expect(t.onPrimaryFailure).toHaveBeenCalledOnce();
      expect(t.fallback.initialize).toHaveBeenCalledWith(t.container, 320, 240);

      t.overlay.renderFrame(frame);
      expect(t.fallback.renderFrame).toHaveBeenCalledWith(frame);
      expect(primary.renderFrame).toHaveBeenCalledOnce();
    });

    it("swaps at once when the primary reports a lost context", () => {
      const primary = makeOverlay();
      let report: (error: unknown) => void = () => {};
      primary.setFailureHandler = vi.fn((handler) => {
        report = handler;
      });
      const t = started({ primary });

      report(new Error("context lost"));

      expect(t.onPrimaryFailure).toHaveBeenCalledOnce();
      expect(primary.dispose).toHaveBeenCalledOnce();
      expect(t.fallback.initialize).toHaveBeenCalledOnce();
    });

    it("ignores a late failure from a disposed or re-initialized owner", () => {
      const primary = makeOverlay();
      let report: (error: unknown) => void = () => {};
      primary.setFailureHandler = vi.fn((handler) => {
        report = handler;
      });
      const t = started({ primary });
      const staleReport = report;
      t.overlay.dispose();
      staleReport(new Error("late"));
      expect(t.createFallback).not.toHaveBeenCalled();
      expect(t.onPrimaryFailure).not.toHaveBeenCalled();

      t.overlay.initialize({} as HTMLElement, 100, 100);
      staleReport(new Error("late again, previous generation"));
      expect(t.createFallback).not.toHaveBeenCalled();
    });

    it("does not loop when the fallback itself throws", () => {
      const primary = makeOverlay();
      primary.resize = vi.fn(() => {
        throw new Error("primary");
      });
      const fallback = makeOverlay();
      fallback.resize = vi.fn(() => {
        throw new Error("fallback");
      });
      const t = started({ primary, fallback });

      t.overlay.resize(640, 480);
      expect(() => t.overlay.resize(800, 600)).not.toThrow();

      expect(t.onFallbackFailure).toHaveBeenCalledOnce();
      expect(fallback.dispose).toHaveBeenCalledOnce();
      expect(t.createFallback).toHaveBeenCalledOnce();
      expect(() => t.overlay.resize(900, 700)).not.toThrow();
      expect(fallback.resize).toHaveBeenCalledOnce();
    });
  });
});
