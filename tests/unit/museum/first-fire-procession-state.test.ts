import { describe, expect, it } from "vitest";
import {
  completeFirstFireGrowth,
  completedFirstFireShrines,
  createFirstFireProcessionState,
  enterFirstFireShrine,
  reachFirstFireOrbitZone,
} from "#lib/features/museum/data/first-fire-procession-state.js";
import type { FirstFireShrineId } from "#lib/features/museum/data/first-fire-procession-plan.js";

function completeShrine(
  state: ReturnType<typeof createFirstFireProcessionState>,
  shrine: FirstFireShrineId
) {
  let next = enterFirstFireShrine(state, shrine);
  for (let zone = 0; zone < 4; zone++) {
    next = reachFirstFireOrbitZone(next, shrine, zone);
  }
  return next;
}

describe("First Fire Torch Procession state", () => {
  it("advances through the three solo shrines, extinction and growth", () => {
    let state = createFirstFireProcessionState();
    state = completeShrine(state, "dj");
    expect(state.phase).toBe("dj-complete");
    state = completeShrine(state, "ek");
    expect(state.phase).toBe("ek-complete");
    state = completeShrine(state, "fl");
    expect(state.phase).toBe("fire-extinguished");
    expect(completedFirstFireShrines(state)).toEqual(["dj", "ek", "fl"]);
    state = completeFirstFireGrowth(state);
    expect(state.phase).toBe("growth-complete");
  });

  it("treats repeated and overlapping zone events as idempotent", () => {
    let state = enterFirstFireShrine(createFirstFireProcessionState(), "dj");
    const first = reachFirstFireOrbitZone(state, "dj", 1);
    expect(first.orbitProgress.dj).toBe(2);
    expect(reachFirstFireOrbitZone(first, "dj", 1)).toBe(first);
    expect(reachFirstFireOrbitZone(first, "dj", 0)).toBe(first);
    state = reachFirstFireOrbitZone(first, "dj", 3);
    expect(state.orbitProgress.dj).toBe(4);
    expect(state.phase).toBe("dj-complete");
  });

  it("ignores a later shrine until the visitor reaches it in order", () => {
    const initial = createFirstFireProcessionState();
    expect(enterFirstFireShrine(initial, "ek")).toBe(initial);
    expect(reachFirstFireOrbitZone(initial, "fl", 3)).toBe(initial);
  });

  it("preserves completion until a new run creates a fresh state", () => {
    let state = createFirstFireProcessionState();
    state = completeShrine(state, "dj");
    state = completeShrine(state, "ek");
    state = completeShrine(state, "fl");
    state = completeFirstFireGrowth(state);

    const reentered = state;
    expect(reentered.phase).toBe("growth-complete");
    expect(reentered.orbitProgress).toEqual({ dj: 4, ek: 4, fl: 4 });
    expect(createFirstFireProcessionState()).toEqual({
      phase: "approach",
      orbitProgress: { dj: 0, ek: 0, fl: 0 },
    });
  });
});
