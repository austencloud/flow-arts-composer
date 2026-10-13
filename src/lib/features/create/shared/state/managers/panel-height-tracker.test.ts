import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PANEL_MOTION_ATTRIBUTE,
  PANEL_SETTLE_EVENT,
} from "#lib/shared/panels/panel-motion.js";
import type { PanelCoordinationState } from "../panel-coordination-state.svelte";
import {
  createPanelHeightTracker,
  type PanelHeightTrackerCleanup,
} from "./panel-height-tracker.svelte";

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  fire() {
    this.callback(
      [{} as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

describe("createPanelHeightTracker", () => {
  let frames: FrameRequestCallback[];
  let group: HTMLDivElement;
  let toolPanel: HTMLDivElement;
  let toolPanelWidth: number;
  let panelState: { setToolPanelWidth: ReturnType<typeof vi.fn> };
  let stop: PanelHeightTrackerCleanup;

  const runFrames = () => {
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  };

  beforeEach(() => {
    frames = [];
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      frames.push(frame);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    // The shared setup replaces createElement, so build the tree from markup.
    document.body.innerHTML =
      "<div data-group><div data-tool-panel></div></div>";
    group = document.body.querySelector<HTMLDivElement>("[data-group]")!;
    toolPanel = group.querySelector<HTMLDivElement>("[data-tool-panel]")!;
    toolPanelWidth = 2486;
    toolPanel.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: toolPanelWidth,
        bottom: 1000,
        width: toolPanelWidth,
        height: 1000,
      }) as DOMRect;

    panelState = { setToolPanelWidth: vi.fn() };
    stop = createPanelHeightTracker({
      toolPanelElement: toolPanel,
      buttonPanelElement: null,
      panelState: {
        ...panelState,
        setToolPanelHeight: vi.fn(),
        setNavigationBarHeight: vi.fn(),
        setButtonPanelHeight: vi.fn(),
      } as unknown as PanelCoordinationState,
    });
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  const lastPublishedWidth = () =>
    panelState.setToolPanelWidth.mock.calls.at(-1)?.[0];

  it("publishes the tool panel width it finds at rest", () => {
    expect(lastPublishedWidth()).toBe(2486);
  });

  // Regression: picking a start position in Construct slides the workspace
  // open and halves the tool panel. PanelGroup dispatches its settle event
  // before Svelte removes the motion attribute from the DOM, so a settle
  // handler that re-checked the attribute skipped the measurement. The
  // empty-workspace width stuck, and the step editor opened across the whole
  // screen on a wide monitor until some unrelated resize or scroll.
  it("re-measures when the slide settles, even before the motion attribute clears", () => {
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    toolPanelWidth = 1243;
    FakeResizeObserver.instances[0]!.fire();
    runFrames();
    expect(lastPublishedWidth()).toBe(2486);

    group.dispatchEvent(new CustomEvent(PANEL_SETTLE_EVENT, { bubbles: true }));
    runFrames();

    expect(lastPublishedWidth()).toBe(1243);
  });
});
