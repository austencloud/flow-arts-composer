import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanelHeightTracker } from "$lib/features/create/shared/state/managers/panel-height-tracker.svelte";
import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";

type FrameCallback = FrameRequestCallback;

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

function panelState(): PanelCoordinationState {
  return {
    setToolPanelHeight: vi.fn(),
    setToolPanelWidth: vi.fn(),
    setButtonPanelHeight: vi.fn(),
    setNavigationBarHeight: vi.fn(),
  } as unknown as PanelCoordinationState;
}

describe("panel height tracker", () => {
  it("publishes only the final coalesced geometry from concurrent panel resizes", () => {
    const frames = new Map<number, FrameCallback>();
    let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));

    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );

    const tool = document.createElement("div");
    let rect = {
      width: 320,
      height: 480,
      top: 20,
      right: 420,
      bottom: 500,
      left: 100,
      x: 100,
      y: 20,
      toJSON: () => ({}),
    };
    Object.assign(tool, { getBoundingClientRect: () => rect as DOMRect });
    const button = document.createElement("div");
    const state = panelState();
    const setProperty = vi.spyOn(document.documentElement.style, "setProperty");

    cleanup = createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: button,
      panelState: state,
    });

    expect(setProperty).toHaveBeenCalledTimes(5);
    observers[0]?.(
      [{ contentRect: { height: 480 } } as ResizeObserverEntry],
      {} as ResizeObserver
    );
    observers[1]?.(
      [{ contentRect: { height: 48 } } as ResizeObserverEntry],
      {} as ResizeObserver
    );
    expect(frames).toHaveLength(1);

    rect = { ...rect, width: 400, height: 560, right: 500, bottom: 580 };
    const scheduled = [...frames.values()][0];
    frames.clear();
    scheduled?.(0);

    expect(state.setButtonPanelHeight).toHaveBeenCalledWith(48);
    expect(state.setToolPanelWidth).toHaveBeenLastCalledWith(400);
    expect(state.setToolPanelHeight).toHaveBeenLastCalledWith(560);
    // Left and top were stable, so only the three changed root metrics write.
    expect(setProperty).toHaveBeenCalledTimes(8);
  });

  it("cancels pending geometry publication during teardown", () => {
    const frames = new Map<number, FrameCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameCallback) => {
      frames.set(1, callback);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    let observer: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observer = callback;
        }
        observe() {}
        disconnect() {}
      }
    );

    const tool = document.createElement("div");
    Object.assign(tool, {
      getBoundingClientRect: () =>
        ({
          width: 320,
          height: 480,
          top: 0,
          right: 320,
          bottom: 480,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    const state = panelState();
    cleanup = createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: state,
    });
    observer?.([], {} as ResizeObserver);

    cleanup();
    cleanup = undefined;

    expect(frames).toHaveLength(0);
  });

  it("does not measure a collapsed tool panel", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    const tool = document.createElement("div");
    const getBoundingClientRect = vi.fn();
    Object.assign(tool, { getBoundingClientRect });
    const state = panelState();

    cleanup = createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: state,
      isToolPanelVisible: () => false,
    });

    expect(getBoundingClientRect).not.toHaveBeenCalled();
    expect(state.setToolPanelHeight).not.toHaveBeenCalled();
  });
});
