import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  observeSettledResize,
  PANEL_MOTION_ATTRIBUTE,
  PANEL_SETTLE_EVENT,
} from "./panel-motion.js";

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve() {}

  disconnect() {
    this.observed = [];
  }

  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function settle(from: Element) {
  from.dispatchEvent(new CustomEvent(PANEL_SETTLE_EVENT, { bubbles: true }));
}

describe("observeSettledResize", () => {
  let group: HTMLDivElement;
  let element: HTMLDivElement;
  let measure: ReturnType<typeof vi.fn<() => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    FakeResizeObserver.instances = [];
    // The shared setup replaces createElement, so build the tree from markup.
    document.body.innerHTML =
      "<div data-group><div data-element></div></div><div data-other></div>";
    group = document.body.querySelector<HTMLDivElement>("[data-group]")!;
    element = group.querySelector<HTMLDivElement>("[data-element]")!;
    measure = vi.fn<() => void>();
    stop = observeSettledResize(element, measure);
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  const observer = () => FakeResizeObserver.instances[0]!;

  it("measures each resize while the panel group is at rest", () => {
    expect(observer().observed).toEqual([element]);
    observer().fire();
    observer().fire();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("holds resizes through a slide and measures once when the group settles", () => {
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    observer().fire();
    observer().fire();
    observer().fire();
    expect(measure).not.toHaveBeenCalled();

    settle(group);
    expect(measure).toHaveBeenCalledTimes(1);

    // A settle with nothing held is not a measurement.
    settle(group);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("waits for its own group, not a settle elsewhere on the page", () => {
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    observer().fire();

    settle(document.body.querySelector("[data-other]")!);
    expect(measure).not.toHaveBeenCalled();

    settle(group);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("stops observing and listening on cleanup", () => {
    group.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    observer().fire();
    stop();

    expect(observer().observed).toEqual([]);
    settle(group);
    expect(measure).not.toHaveBeenCalled();
  });
});
