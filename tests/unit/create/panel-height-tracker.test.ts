import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanelHeightTracker } from "$lib/features/create/shared/state/managers/panel-height-tracker.svelte";
import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
import {
  PANEL_MOTION_ATTRIBUTE,
  PANEL_SETTLE_EVENT,
} from "$lib/shared/panels/panel-motion";

type FrameCallback = FrameRequestCallback;

let cleanup: ((options?: { keepMetrics?: boolean }) => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

// The shared setup swaps document.createElement for bare stubs; the tracker
// reads the panel's ancestry, so these tests need real elements.
function realDiv(): HTMLDivElement {
  return document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div"
  ) as HTMLDivElement;
}

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

    const tool = realDiv();
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

    const tool = realDiv();
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

  it("waits out a panel slide, then measures once when the group settles", () => {
    const frames = new Map<number, FrameCallback>();
    let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
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

    const group = realDiv();
    const tool = realDiv();
    group.append(tool);
    document.body.append(group);
    let height = 700;
    const getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 707,
          height,
          top: 823 - height,
          right: 707,
          bottom: 823,
          left: 0,
          x: 0,
          y: 823 - height,
          toJSON: () => ({}),
        }) as DOMRect
    );
    Object.assign(tool, { getBoundingClientRect });
    const state = panelState();
    cleanup = createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: state,
    });
    getBoundingClientRect.mockClear();

    // Every frame of the slide resizes the tool panel.
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    for (height of [640, 560, 470, 400]) {
      observer?.([], {} as ResizeObserver);
    }
    expect(frames).toHaveLength(0);
    expect(getBoundingClientRect).not.toHaveBeenCalled();

    group.removeAttribute(PANEL_MOTION_ATTRIBUTE);
    group.dispatchEvent(new CustomEvent(PANEL_SETTLE_EVENT, { bubbles: true }));
    expect(frames).toHaveLength(1);
    [...frames.values()][0]?.(0);

    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(state.setToolPanelHeight).toHaveBeenLastCalledWith(400);
    group.remove();
  });

  it("does not measure a collapsed tool panel", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    const tool = realDiv();
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

  it("waits for the settle before its first measure when born mid-slide", () => {
    const frames = new Map<number, FrameCallback>();
    let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );

    const group = realDiv();
    const tool = realDiv();
    group.append(tool);
    document.body.append(group);
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    const getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 707,
          height: 390,
          top: 433,
          right: 707,
          bottom: 823,
          left: 0,
          x: 0,
          y: 433,
          toJSON: () => ({}),
        }) as DOMRect
    );
    Object.assign(tool, { getBoundingClientRect });
    const state = panelState();

    cleanup = createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: state,
    });
    expect(getBoundingClientRect).not.toHaveBeenCalled();

    group.removeAttribute(PANEL_MOTION_ATTRIBUTE);
    group.dispatchEvent(new CustomEvent(PANEL_SETTLE_EVENT, { bubbles: true }));
    [...frames.values()][0]?.(0);

    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(state.setToolPanelHeight).toHaveBeenLastCalledWith(390);
    group.remove();
  });

  it("leaves its root metrics for a replacement tracker", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    const tool = realDiv();
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
    const root = document.documentElement.style;

    createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: panelState(),
    })({ keepMetrics: true });
    expect(root.getPropertyValue("--create-panel-width")).toBe("320px");

    createPanelHeightTracker({
      toolPanelElement: tool,
      buttonPanelElement: null,
      panelState: panelState(),
    })();
    expect(root.getPropertyValue("--create-panel-width")).toBe("");
  });
});
