/**
 * When a per-frame motion renderer hands a prop back to its still pose, the
 * prop must not spin. The renderer's last frames carry an accumulated angle
 * (-89.2°) while the still pose names the same heading canonically (270°),
 * and playback can end before its final frame paints, so the browser would
 * ease from the last painted angle a full turn the long way. PropSvg lands
 * on the nearest equivalent and keeps transitions off for two frames, until
 * the browser has painted it. Changes between still poses keep their eased,
 * direction-aware transition.
 */
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPropSvg } from "./prop-svg-harness.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let prop: ReturnType<typeof mountPropSvg> | null = null;
let frames: Map<number, FrameRequestCallback>;

/** Run the next animation frame's callbacks, as the browser would before painting. */
function nextFrame(): void {
  const due = [...frames.values()];
  frames.clear();
  for (const callback of due) callback(performance.now());
  flushSync();
}

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
  frames = new Map();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  prop?.destroy();
  prop = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  vi.unstubAllGlobals();
});

describe("PropSvg handoff from per-frame motion", () => {
  it("keeps transitions off until the still angle has painted", () => {
    prop = mountPropSvg(host, { rotation: -89.2, directPositioning: true });
    expect(prop.transitionsOff()).toBe(true);

    // The last travel frame writes the still angle and playback ends before
    // the browser paints it.
    prop.set({ rotation: 270 });
    prop.set({ rotation: 270, directPositioning: false });
    expect(prop.rotation()).toBe(270);
    expect(prop.transitionsOff()).toBe(true);

    nextFrame();
    expect(prop.transitionsOff()).toBe(true);
    nextFrame();
    expect(prop.transitionsOff()).toBe(false);
    expect(prop.rotation()).toBe(270);
  });

  it("lands on the still angle's equivalent nearest the last frame", () => {
    prop = mountPropSvg(host, { rotation: -89.2, directPositioning: true });

    prop.set({ rotation: 270, directPositioning: false });
    expect(prop.rotation()).toBeCloseTo(-90, 6);
    expect(prop.transitionsOff()).toBe(true);
  });

  it("drops the hold when per-frame motion resumes", () => {
    prop = mountPropSvg(host, { rotation: 10, directPositioning: true });
    prop.set({ rotation: 0, directPositioning: false });
    prop.set({ rotation: 20, directPositioning: true });

    expect(frames.size).toBe(0);
    expect(prop.rotation()).toBe(20);
    expect(prop.transitionsOff()).toBe(true);
  });

  it("still eases a change between still poses the way its turns go", () => {
    prop = mountPropSvg(host, {
      rotation: 0,
      directPositioning: false,
      turns: 0,
      rotationDirection: "ccw",
    });

    prop.set({ rotation: 90, turns: 1 });
    expect(prop.rotation()).toBe(-270);
    expect(prop.transitionsOff()).toBe(false);
  });
});
