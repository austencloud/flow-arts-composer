import { BackgroundController } from "@austencloud/backgrounds";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountBackgroundAtDisplayResolution } from "../../src/lib/shared/background/shared/background-canvas-resolution";
import { shouldReduceBackgroundResolution } from "../../src/lib/shared/platform/network-conditions";

vi.mock("../../src/lib/shared/platform/network-conditions", () => ({
  shouldReduceBackgroundResolution: vi.fn(() => false),
}));

describe("background canvas display resolution", () => {
  let controller: BackgroundController;
  let resize: () => void;

  beforeEach(() => {
    vi.mocked(shouldReduceBackgroundResolution).mockReturnValue(false);
    // The suite replaces createElement with plain objects. This test exercises
    // the controller's real mount/resize path, so use jsdom's native elements.
    vi.spyOn(document, "createElement").mockImplementation(
      Document.prototype.createElement.bind(document)
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    controller = new BackgroundController();
  });

  afterEach(() => {
    controller.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function hostAt(width: number, height: number) {
    const host = document.createElement("div");
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      width,
      height,
    } as DOMRect);
    return host;
  }

  function expectDimensions(host: HTMLElement, width: number, height: number) {
    const canvases = host.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    for (const canvas of canvases) {
      expect({ width: canvas.width, height: canvas.height }).toEqual({
        width,
        height,
      });
    }
  }

  it.each([
    [343, 252],
    [733.34375, 636],
    [1030, 1110],
    [3000, 2050],
    [3840, 2160],
  ])("keeps artwork at CSS-pixel scale in a %s × %s host", (width, height) => {
    const host = hostAt(width, height);
    mountBackgroundAtDisplayResolution(controller, host);
    expectDimensions(host, Math.floor(width), Math.floor(height));
  });

  it("tracks panel resizes without resetting a same-host mount", () => {
    const host = hostAt(1030, 1110);
    mountBackgroundAtDisplayResolution(controller, host);
    const canvas = host.querySelector("canvas")!;
    const widthSetter = vi.spyOn(canvas, "width", "set");
    mountBackgroundAtDisplayResolution(controller, host);
    expect(widthSetter).not.toHaveBeenCalled();

    vi.mocked(host.getBoundingClientRect).mockReturnValue({
      width: 760,
      height: 280,
    } as DOMRect);
    resize();
    expectDimensions(host, 760, 280);
  });

  it("uses the replacement host's dimensions after navigation", () => {
    const previous = hostAt(1920, 1080);
    mountBackgroundAtDisplayResolution(controller, previous);
    const next = hostAt(820, 1180);
    mountBackgroundAtDisplayResolution(controller, next);
    expect(previous.querySelectorAll("canvas")).toHaveLength(0);
    expectDimensions(next, 820, 1180);
  });

  it("preserves reduced-data sizing and restores full resolution on resize", () => {
    vi.mocked(shouldReduceBackgroundResolution).mockReturnValue(true);
    const host = hostAt(1600, 2400);
    mountBackgroundAtDisplayResolution(controller, host);
    expectDimensions(host, 640, 960);
    vi.mocked(shouldReduceBackgroundResolution).mockReturnValue(false);
    resize();
    expectDimensions(host, 1600, 2400);
  });

  it("does not enlarge small or hidden hosts in reduced-data mode", () => {
    vi.mocked(shouldReduceBackgroundResolution).mockReturnValue(true);
    const host = hostAt(343, 252);
    mountBackgroundAtDisplayResolution(controller, host);
    expectDimensions(host, 343, 252);
    vi.mocked(host.getBoundingClientRect).mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    resize();
    expectDimensions(host, 1, 1);
  });
});
