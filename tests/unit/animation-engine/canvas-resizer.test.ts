// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasResizer } from "$lib/shared/animation-engine/services/canvas-resizer.svelte";

// The shared setup replaces document.createElement with plain mocks, so real
// nodes (needed for closest() and MutationObserver) come from the HTML parser.
function mountHtml(html: string): HTMLElement {
  document.body.insertAdjacentHTML("beforeend", html);
  return document.body.lastElementChild as HTMLElement;
}

describe("CanvasResizer", () => {
  let notifyResize: ResizeObserverCallback;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = callback;
        }

        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.motionPreference;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses layout pixels through scaled flights and ignores zero-sized parking", async () => {
    let width = 490;
    let height = 487;
    let scale = 0.1;
    const container = {
      get clientWidth() {
        return width;
      },
      get clientHeight() {
        return height;
      },
      closest: () => null,
      getBoundingClientRect: () => ({
        width: width * scale,
        height: height * scale,
      }),
    } as unknown as HTMLDivElement;
    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();
    notifyResize([], {} as ResizeObserver);
    await Promise.resolve();
    expect(renderer.resize).toHaveBeenLastCalledWith(487);
    // Finishing a transform does not notify ResizeObserver. The bitmap must
    // already be correct; there is no later event to repair a 49px raster.
    scale = 1;
    expect(resizer.state.currentSize).toBe(487);
    width = 0;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    width = 800;
    height = 740;
    scale = 0.06;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(renderer.resize).toHaveBeenLastCalledWith(740);
    width = 490;
    height = 487;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(renderer.resize).toHaveBeenLastCalledWith(487);
    resizer.dispose();
  });

  it("reports the whole frame and counts a sideways-only change as a resize", async () => {
    // A wide viewer pane: the square is the height, the overlays get the width.
    let width = 1200;
    let height = 800;
    const container = {
      get clientWidth() {
        return width;
      },
      get clientHeight() {
        return height;
      },
      closest: () => null,
      getBoundingClientRect: () => ({ width, height }),
    } as unknown as HTMLDivElement;
    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();

    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(0);
    expect(renderer.resize).toHaveBeenLastCalledWith(800);
    expect(resizer.state.frame).toEqual({
      size: 800,
      width: 1200,
      height: 800,
    });
    expect(resizer.state.resizeCount).toBe(1);

    // A settings panel closing widens the pane at the same height. The main
    // canvas square is untouched, but the overlays must be reallocated, so
    // the frame and the resize count both move.
    width = 1500;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    expect(resizer.state.frame).toEqual({
      size: 800,
      width: 1500,
      height: 800,
    });
    expect(resizer.state.resizeCount).toBe(2);

    // Same frame again: nothing happens.
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(resizer.state.resizeCount).toBe(2);

    resizer.dispose();
  });

  it("publishes the actual frame before the first observer callback", () => {
    const container = {
      clientWidth: 1200,
      clientHeight: 800,
      closest: () => null,
    } as unknown as HTMLDivElement;
    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();

    resizer.initialize(container, renderer);

    // Effects can be created while the observer callback is still queued. They
    // must receive the wide host, rather than a 500px fallback square that CSS
    // later stretches across the player.
    expect(resizer.state.frame).toEqual({
      size: 800,
      width: 1200,
      height: 800,
    });
    expect(renderer.resize).not.toHaveBeenCalled();
    resizer.dispose();
  });

  it("seeds a square quick-viewer stage before its observer runs", () => {
    const container = {
      clientWidth: 1514,
      clientHeight: 1514,
      closest: () => null,
    } as unknown as HTMLDivElement;
    const resizer = new CanvasResizer();

    resizer.initialize(container, {
      resize: vi.fn().mockResolvedValue(undefined),
    });

    expect(resizer.state.frame).toEqual({
      size: 1514,
      width: 1514,
      height: 1514,
    });
    resizer.dispose();
  });

  it("retains the readable backing size while its workspace pane is inert", async () => {
    let width = 630;
    let inert = false;
    const inertPane = mountHtml("<div inert></div>");
    const container = {
      get clientWidth() {
        return width;
      },
      clientHeight: 780,
      closest: (selector: string) =>
        inert && selector.startsWith("[inert]") ? inertPane : null,
      getBoundingClientRect: () =>
        ({
          width,
          height: 780,
          top: 0,
          right: width,
          bottom: 780,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    } as unknown as HTMLDivElement;

    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();

    notifyResize([], {} as ResizeObserver);
    await Promise.resolve();
    expect(renderer.resize).toHaveBeenLastCalledWith(630);

    inert = true;
    width = 48;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(100);
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    expect(resizer.state.currentSize).toBe(630);

    inert = false;
    width = 48;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(200);
    expect(renderer.resize).toHaveBeenCalledTimes(1);

    width = 560;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(120);
    expect(renderer.resize).toHaveBeenLastCalledWith(560);
    expect(resizer.state.currentSize).toBe(560);

    resizer.dispose();
  });

  it("waits for the final reduced-motion layout before rebuilding", async () => {
    let width = 630;
    let inert = false;
    const inertPane = mountHtml("<div inert></div>");
    const container = {
      get clientWidth() {
        return width;
      },
      clientHeight: 780,
      closest: (selector: string) =>
        inert && selector.startsWith("[inert]") ? inertPane : null,
      getBoundingClientRect: () =>
        ({
          width,
          height: 780,
          top: 0,
          right: width,
          bottom: 780,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    } as unknown as HTMLDivElement;
    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();

    notifyResize([], {} as ResizeObserver);
    await Promise.resolve();

    inert = true;
    width = 48;
    notifyResize([], {} as ResizeObserver);
    document.documentElement.dataset.motionPreference = "reduce";
    inert = false;
    notifyResize([], {} as ResizeObserver);

    await vi.advanceTimersByTimeAsync(39);
    expect(renderer.resize).toHaveBeenCalledTimes(1);

    width = 560;
    await vi.advanceTimersByTimeAsync(1);
    expect(renderer.resize).toHaveBeenLastCalledWith(560);
    expect(renderer.resize).toHaveBeenCalledTimes(2);

    resizer.dispose();
  });

  function laidOut(
    container: HTMLDivElement,
    size: { width: number; height: number }
  ): HTMLDivElement {
    Object.defineProperty(container, "clientWidth", {
      get: () => size.width,
    });
    Object.defineProperty(container, "clientHeight", {
      get: () => size.height,
    });
    return container;
  }

  it("catches up when an inert ancestor is lifted without a size change", async () => {
    // A hidden crossfade source is made inert, the window grows behind it,
    // then the source is revealed. Removing `inert` does not change its box,
    // so ResizeObserver never reports again — the resizer has to notice the
    // reveal itself or the revealed canvas keeps the old, stretched raster.
    const size = { width: 579, height: 496 };
    const pane = mountHtml("<div inert><div></div></div>");
    const container = laidOut(pane.firstElementChild as HTMLDivElement, size);

    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();
    notifyResize([], {} as ResizeObserver);

    size.width = 891;
    size.height = 1020;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(1000);
    expect(renderer.resize).not.toHaveBeenCalled();

    pane.removeAttribute("inert");
    await vi.advanceTimersByTimeAsync(1000);
    expect(renderer.resize).toHaveBeenLastCalledWith(891);
    expect(resizer.state.frame).toEqual({
      size: 891,
      width: 891,
      height: 1020,
    });

    resizer.dispose();
  });

  it("keeps a laid-out staging source current while it is inert", async () => {
    // A crossfade's standby source is inert but keeps the stage's full box,
    // so its observations are real layout, not a collapsing pane. It must
    // follow the stage while hidden so it is sharp the moment it is revealed.
    const size = { width: 579, height: 496 };
    const workspace = mountHtml(
      "<div><div inert data-inert-keeps-layout><div></div></div></div>"
    );
    const container = laidOut(
      workspace.querySelector("[data-inert-keeps-layout] > div")!,
      size
    );

    const renderer = { resize: vi.fn().mockResolvedValue(undefined) };
    const resizer = new CanvasResizer();
    resizer.initialize(container, renderer);
    resizer.setup();
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(0);
    expect(renderer.resize).toHaveBeenLastCalledWith(496);

    size.width = 891;
    size.height = 1020;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(50);
    expect(renderer.resize).toHaveBeenLastCalledWith(891);

    // The same staging source inside a pane that is itself leaving the
    // workspace is still suppressed: that pane's geometry is collapsing.
    workspace.setAttribute("inert", "");
    size.width = 48;
    notifyResize([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(1000);
    expect(renderer.resize).toHaveBeenCalledTimes(2);
    expect(resizer.state.currentSize).toBe(891);

    resizer.dispose();
  });
});
