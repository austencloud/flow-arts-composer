import { beforeEach, describe, expect, it } from "vitest";
import { PANEL_MOTION_ATTRIBUTE } from "#lib/shared/panels/panel-motion.js";
import {
  hasPendingAncestorLayoutTransition,
  isAncestorResizing,
  shouldCommitContainerSize,
  type TransitionLike,
} from "./container-settle";

// The shared setup file swaps document.createElement for plain stub objects;
// these cases need real nodes so `contains` means what it says. Resolve it from
// document's own prototype chain to stay in the jsdom realm, and rely on
// isolate:true to keep the restore inside this file.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

beforeEach(() => {
  (document as unknown as { createElement: unknown }).createElement =
    realCreateElement.bind(document);
  document.body.replaceChildren();
});

function nest(): { wrapper: HTMLElement; panel: HTMLElement } {
  const wrapper = document.createElement("div");
  const panel = document.createElement("div");
  wrapper.appendChild(panel);
  document.body.appendChild(wrapper);
  return { wrapper, panel };
}

function transition(
  target: Element | null,
  transitionProperty: string,
  playState = "running"
): TransitionLike {
  return { transitionProperty, playState, effect: { target } };
}

describe("hasPendingAncestorLayoutTransition", () => {
  it("waits on the workspace expansion the picker opens inside", () => {
    const { wrapper, panel } = nest();
    expect(
      hasPendingAncestorLayoutTransition(panel, [
        transition(wrapper, "grid-template-columns"),
      ])
    ).toBe(true);
  });

  it("ignores a transition that only repaints an ancestor", () => {
    const { wrapper, panel } = nest();
    expect(
      hasPendingAncestorLayoutTransition(panel, [
        transition(wrapper, "opacity"),
        transition(wrapper, "background-color"),
      ])
    ).toBe(false);
  });

  it("ignores keyframe animations, which carry no transitionProperty", () => {
    const { wrapper, panel } = nest();
    expect(
      hasPendingAncestorLayoutTransition(panel, [
        { playState: "running", effect: { target: wrapper } },
      ])
    ).toBe(false);
  });

  it("ignores a finished expansion", () => {
    const { wrapper, panel } = nest();
    expect(
      hasPendingAncestorLayoutTransition(panel, [
        transition(wrapper, "grid-template-columns", "finished"),
      ])
    ).toBe(false);
  });

  it("does not wait on the measured box's own transition", () => {
    const { panel } = nest();
    expect(
      hasPendingAncestorLayoutTransition(panel, [transition(panel, "width")])
    ).toBe(false);
  });

  it("ignores a transition on an unrelated branch", () => {
    const { panel } = nest();
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    expect(
      hasPendingAncestorLayoutTransition(panel, [
        transition(elsewhere, "width"),
      ])
    ).toBe(false);
  });
});

describe("isAncestorResizing", () => {
  it("waits on a panel group that is moving before its transition registers", () => {
    const { wrapper, panel } = nest();
    wrapper.setAttribute(PANEL_MOTION_ATTRIBUTE, "");
    expect(isAncestorResizing(panel, [])).toBe(true);
  });

  it("waits on a pending layout transition outside any panel group", () => {
    const { wrapper, panel } = nest();
    expect(
      isAncestorResizing(panel, [transition(wrapper, "flex-basis")])
    ).toBe(true);
  });

  it("lets a still panel group through", () => {
    const { panel } = nest();
    expect(isAncestorResizing(panel, [])).toBe(false);
  });
});

describe("shouldCommitContainerSize", () => {
  const settled = {
    width: 545,
    height: 700,
    previous: { width: 545, height: 700 },
    elapsedMs: 300,
    timeoutMs: 1500,
    resizingTimeoutMs: 4000,
  };

  it("holds the pre-expansion width even though two frames agreed on it", () => {
    // The exact shape of the bug: the ease has not produced a frame yet, so
    // the box reads 1089 twice running while it is on its way to 545.
    expect(
      shouldCommitContainerSize({
        width: 1089,
        height: 700,
        previous: { width: 1089, height: 700 },
        ancestorResizing: true,
        elapsedMs: 156,
        timeoutMs: 1500,
        resizingTimeoutMs: 4000,
      })
    ).toBe(false);
  });

  it("commits once nothing above it is still resizing", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        ancestorResizing: false,
      })
    ).toBe(true);
  });

  it("waits for a first frame to compare against", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        previous: null,
        ancestorResizing: false,
      })
    ).toBe(false);
  });

  it("keeps waiting while the box is still moving", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        previous: { width: 800, height: 700 },
        ancestorResizing: false,
      })
    ).toBe(false);
  });

  it("holds the pre-expansion width past the cap while the panels still move", () => {
    // A cold first load stopped producing frames for seconds with the slide
    // frozen at its start; committing at the cap drew the desktop catalog
    // and then swapped it, so the opening arrival played twice.
    expect(
      shouldCommitContainerSize({
        ...settled,
        width: 1201,
        previous: { width: 1201, height: 700 },
        ancestorResizing: true,
        elapsedMs: 1800,
      })
    ).toBe(false);
  });

  it("commits once a resize above has run past its own cap", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        ancestorResizing: true,
        elapsedMs: 4001,
      })
    ).toBe(true);
  });

  it("commits past the cap a box that keeps changing on its own", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        previous: { width: 800, height: 700 },
        ancestorResizing: false,
        elapsedMs: 1501,
      })
    ).toBe(true);
  });

  it("never commits an unmeasured box, cap or no cap", () => {
    expect(
      shouldCommitContainerSize({
        ...settled,
        width: 0,
        height: 0,
        ancestorResizing: false,
        elapsedMs: 5000,
      })
    ).toBe(false);
  });
});
