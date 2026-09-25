import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import CrossfadeMeasureHarness from "./CrossfadeMeasureHarness.svelte";
import { CrossfadeDom, heightKeyframes, layerAt } from "./crossfade-dom-fakes";

/**
 * Crossfade (animateHeight) must only write heights it can actually measure,
 * and a height that changes mid-ease must bend the ease rather than let it
 * finish somewhere stale.
 *
 * Hidden measurement: Drawer renders its children while the dialog is still
 * `display: none`. The layer then reports offsetHeight 0, and writing that
 * collapsed the box to 0px for a frame when the sheet opened (visible on the
 * module navigation sheet's first open under reduced motion).
 *
 * Stale target: a reflow that lands while the box is still easing toward the
 * previous target (a child measuring its own width right after mount) updated
 * the inline height but left the animation heading to the old one, so the box
 * eased to the wrong height and then snapped.
 *
 * Both are silent: nothing throws, the box just jumps.
 */

let dom: CrossfadeDom;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  dom = new CrossfadeDom();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  dom.restore();
});

function mountHarness(props: {
  mode?: "crossfade" | "swap";
  initiallyHidden?: boolean;
}) {
  const harness = mount(CrossfadeMeasureHarness, {
    target: document.body,
    props,
  });
  cleanups.push(() => void unmount(harness));
  flushSync();
  dom.settleFrames();
  const box = document.querySelector<HTMLElement>(".crossfade");
  if (!box) throw new Error("crossfade box did not mount");
  return { harness, box };
}

function setContentHeight(layer: HTMLElement, height: number): void {
  layer
    .querySelector("[data-content]")
    ?.setAttribute("data-height", String(height));
}

/** Time the animation still has left before it finishes, and before it moves. */
function remaining(animation: {
  currentTime: number;
  effect: { getComputedTiming(): ComputedEffectTiming } | null;
}): { hold: number; total: number } {
  const timing = animation.effect?.getComputedTiming();
  if (!timing) throw new Error("animation has no timing");
  return {
    hold: Number(timing.delay) - animation.currentTime,
    total: Number(timing.endTime) - animation.currentTime,
  };
}

describe("Crossfade animateHeight: layer not rendered", () => {
  it("writes no height while mounted under display:none, then measures once shown", () => {
    const { harness, box } = mountHarness({ initiallyHidden: true });
    expect(box.style.height).toBe("");

    harness.setHidden(false);
    flushSync();
    dom.notifyResize(layerAt(box, 0));
    dom.settleFrames();

    expect(box.style.height).toBe("244px");
    expect(dom.heightAnimationsOn(box)).toEqual([]);
  });

  it("keeps the last real height when its parent is hidden", () => {
    const { harness, box } = mountHarness({});
    expect(box.style.height).toBe("244px");

    harness.setHidden(true);
    flushSync();
    dom.notifyResize(layerAt(box, 0));
    dom.settleFrames();

    expect(box.style.height).toBe("244px");
  });

  it("animates a key change made while hidden on the first rendered measurement", () => {
    const { harness, box } = mountHarness({});
    harness.setHidden(true);
    flushSync();
    dom.notifyResize(layerAt(box, 0));
    dom.settleFrames();

    // The new layer mounts and is observed while nothing can be measured.
    harness.setKey("short");
    flushSync();
    dom.settleFrames();
    expect(box.style.height).toBe("244px");
    expect(dom.heightAnimationsOn(box)).toEqual([]);

    harness.setHidden(false);
    flushSync();
    dom.notifyResize(layerAt(box, 1));
    dom.settleFrames();

    expect(box.style.height).toBe("52px");
    const eases = dom.heightAnimationsOn(box);
    expect(eases.map(heightKeyframes)).toEqual([{ from: 244, to: 52 }]);
  });
});

describe("Crossfade animateHeight: reflow while the box is still easing", () => {
  it("bends the running ease to the new height without a jump, on the original clock", () => {
    const { harness, box } = mountHarness({});
    harness.setKey("short");
    flushSync();
    dom.settleFrames();

    const [ease] = dom.heightAnimationsOn(box);
    if (!ease) throw new Error("key change did not start a height ease");
    expect(heightKeyframes(ease)).toEqual({ from: 244, to: 52 });

    // A quarter of the way down, the incoming content reflows taller.
    ease.currentTime = 50;
    const onScreen = box.offsetHeight;
    const shortLayer = layerAt(box, 1);
    setContentHeight(shortLayer, 80);
    dom.notifyResize(shortLayer);
    dom.settleFrames();

    expect(box.style.height).toBe("80px");
    const running = dom.heightAnimationsOn(box);
    expect(running).toHaveLength(1);
    const [bent] = running;
    if (!bent) throw new Error("unreachable");
    expect(heightKeyframes(bent)?.to).toBe(80);
    expect(box.offsetHeight).toBeCloseTo(onScreen);
    expect(remaining(bent).total).toBeCloseTo(150);
  });

  it("keeps the swap's hold when the reflow lands before the box starts moving", () => {
    const { harness, box } = mountHarness({ mode: "swap" });
    harness.setKey("short");
    flushSync();
    dom.settleFrames();

    const [ease] = dom.heightAnimationsOn(box);
    if (!ease) throw new Error("key change did not start a height ease");
    expect(remaining(ease)).toEqual({ hold: 200, total: 400 });

    // Still inside the hold: the old layer is fading out, the box has not moved.
    ease.currentTime = 50;
    const shortLayer = layerAt(box, 1);
    setContentHeight(shortLayer, 80);
    dom.notifyResize(shortLayer);
    dom.settleFrames();

    const [bent] = dom.heightAnimationsOn(box);
    if (!bent) throw new Error("reflow dropped the height ease");
    expect(heightKeyframes(bent)).toEqual({ from: 244, to: 80 });
    expect(box.offsetHeight).toBe(244);
    const left = remaining(bent);
    expect(left.hold).toBeCloseTo(150);
    expect(left.total).toBeCloseTo(350);
  });

  it("still snaps a reflow at rest without animating", () => {
    const { harness, box } = mountHarness({});
    harness.setKey("short");
    flushSync();
    dom.settleFrames();
    for (const ease of dom.heightAnimationsOn(box)) ease.finish();

    const shortLayer = layerAt(box, 1);
    setContentHeight(shortLayer, 80);
    dom.notifyResize(shortLayer);
    dom.settleFrames();

    expect(box.style.height).toBe("80px");
    expect(dom.heightAnimationsOn(box)).toEqual([]);
  });
});
