// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";

const disposals: Array<() => void> = [];
function createState() {
  const { state, dispose } = createViewer3DStateForTest({ renderMode: "3d" });
  disposals.push(dispose);
  return state;
}
afterEach(() => {
  while (disposals.length) disposals.pop()!();
  delete document.documentElement.dataset.motionPreference;
});

describe("viewer camera recovery", () => {
  it("focuses a moved selection, independent of a distant panned target", () => {
    const state = createState();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    const performer = state.performerManager.performers[1]!;
    performer.position.x = 7;
    performer.position.z = -3;
    state.replacePerformerSelection(1);
    state.updateCameraSnapshot({
      position: { x: -1.367, y: 27.09, z: -70.943 },
      target: { x: -1.367, y: 27.09, z: -69.943 },
      rotation: { x: 0, y: 0, z: 0 },
      fov: 50,
      timestamp: 0,
    });
    const snap = vi.fn();
    state.registerSnapTo(snap);
    state.focusSelectedPerformers();
    const [eye, target] = snap.mock.calls.at(-1)!;
    expect(target.x).toBeCloseTo(7);
    expect(target.z).toBeCloseTo(-3);
    expect(eye.x).toBeCloseTo(target.x);
    expect(eye.y).toBeCloseTo(target.y);
    expect(eye.z).toBeLessThan(target.z);
    expect(
      Math.hypot(eye.x - target.x, eye.y - target.y, eye.z - target.z)
    ).toBeLessThan(15);
    expect(performer.position).toMatchObject({ x: 7, z: -3 });
  });

  it("falls back to the cast with no selection and respects reduced motion", () => {
    const state = createState();
    state.performerManager.addPerformer();
    state.clearPerformerSelection();
    document.documentElement.dataset.motionPreference = "reduce";
    const snap = vi.fn();
    state.registerSnapTo(snap);
    state.focusSelectedPerformers();
    expect(snap).toHaveBeenCalled();
    expect(snap.mock.calls.at(-1)![3]).toBe(false);
  });

  it("does not let the retiring renderer disconnect its replacement", () => {
    const state = createState();
    const oldCamera = vi.fn();
    const newCamera = vi.fn();
    const unregisterOld = state.registerSnapTo(oldCamera);
    const unregisterNew = state.registerSnapTo(newCamera);
    unregisterOld();
    const eye = { x: 0, y: 1, z: -4 };
    const target = { x: 0, y: 1, z: 0 };
    state.snapCameraTo(eye, target);
    expect(oldCamera).not.toHaveBeenCalled();
    expect(newCamera).toHaveBeenCalledTimes(1);
    unregisterNew();
    state.snapCameraTo(eye, target);
    expect(newCamera).toHaveBeenCalledTimes(1);
  });
});
