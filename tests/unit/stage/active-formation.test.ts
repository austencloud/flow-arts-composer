import { describe, expect, it } from "vitest";
import {
  resolveActiveFormationIndex,
  resolveArrangeTargetIndex,
} from "#lib/features/stage/domain/active-formation.js";
import type { Formation } from "#lib/features/stage/domain/stage-types.js";

const sets = [
  { id: "a", atBeat: 0, transitionBeats: 0, spots: {} },
  { id: "b", atBeat: 16, transitionBeats: 8, spots: {} },
  { id: "c", atBeat: 32, transitionBeats: 0, spots: {} },
] as Formation[];

describe("arrange target resolution", () => {
  it("targets the active set away from any transition window", () => {
    expect(resolveArrangeTargetIndex(sets, null, 4)).toBe(0);
    expect(resolveActiveFormationIndex(sets, null, 4)).toBe(0);
  });

  it("targets the destination while the cast walks into it", () => {
    expect(resolveArrangeTargetIndex(sets, null, 8)).toBe(1);
    expect(resolveArrangeTargetIndex(sets, null, 15)).toBe(1);
    expect(resolveActiveFormationIndex(sets, null, 15)).toBe(0);
  });

  it("targets the set the playhead sits on", () => {
    expect(resolveArrangeTargetIndex(sets, null, 16)).toBe(1);
    expect(resolveArrangeTargetIndex(sets, null, 40)).toBe(2);
  });

  it("does not jump to a set that snaps with no transition", () => {
    expect(resolveArrangeTargetIndex(sets, null, 31)).toBe(1);
  });

  it("honors a pinned selection", () => {
    expect(resolveArrangeTargetIndex(sets, "a", 12)).toBe(0);
  });

  it("returns -1 with no sets", () => {
    expect(resolveArrangeTargetIndex([], null, 0)).toBe(-1);
  });
});
