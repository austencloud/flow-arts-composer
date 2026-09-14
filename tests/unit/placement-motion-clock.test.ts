import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPropPlacementMotionState } from "$lib/shared/pictograph/grid/state/prop-placement-motion.svelte";
import { buildPlacementTransformTransition } from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
import { positionPairPreview } from "$lib/features/learn/components/interactive/positions/hand-position-lesson";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { DURATION } from "$lib/shared/transitions/transitions";

const preference = vi.hoisted(() => ({ reduce: false }));
vi.mock("$lib/shared/transitions/motion", () => ({
  reducedMotion: () => preference.reduce,
}));

const start = positionPairPreview(
  { left: GridLocation.SOUTH, right: GridLocation.NORTH },
  GridMode.DIAMOND
);
const end = positionPairPreview(
  { left: GridLocation.WEST, right: GridLocation.EAST },
  GridMode.DIAMOND
);
const transition = buildPlacementTransformTransition(start, end, "arc");
let callbacks: Map<number, FrameRequestCallback>;

beforeEach(() => {
  preference.reduce = false;
  callbacks = new Map();
  let id = 0;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => callbacks.delete(key));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function advance(time: number) {
  const scheduled = [...callbacks.values()];
  callbacks.clear();
  scheduled.forEach((callback) => callback(time));
}

describe("placement motion clock", () => {
  it("waits for prepared SVGs and completes a shared eased movement once", () => {
    const motion = createPropPlacementMotionState();
    const done = vi.fn();
    motion.prepare(transition, done);
    expect(motion.progress).toBe(0);
    expect(callbacks.size).toBe(0);
    motion.start();
    motion.start();
    expect(callbacks.size).toBe(1);
    advance(DURATION.dramatic / 2);
    expect(motion.progress).toBeCloseTo(0.5);
    advance(DURATION.dramatic);
    expect(motion.active).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("allows the completion handler to prepare the next queued action", () => {
    const motion = createPropPlacementMotionState();
    const second = buildPlacementTransformTransition(end, start, "arc");
    motion.prepare(transition, () => motion.prepare(second));
    motion.start();
    advance(DURATION.dramatic);
    expect(motion.active).toBe(true);
    expect(motion.startData).toEqual(end);
    expect(motion.progress).toBe(0);
    expect(callbacks.size).toBe(0);
    motion.destroy();
  });

  it("finishes immediately for reduced motion and cancels on unmount", () => {
    const motion = createPropPlacementMotionState();
    const done = vi.fn();
    preference.reduce = true;
    motion.prepare(transition, done);
    motion.start();
    expect(done).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
    preference.reduce = false;
    motion.prepare(transition, done);
    motion.start();
    motion.destroy();
    advance(DURATION.dramatic);
    expect(done).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });
});
