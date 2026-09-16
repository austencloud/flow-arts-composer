import { describe, it, expect } from "vitest";
import {
  connects,
  startStateOf,
  endStateOf,
  normalizeToStart,
  loopStatus,
} from "$lib/features/write/services/sheet-continuity";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal fake: only the fields sheet-continuity reads.
function seq(
  steps: Array<{
    start: string;
    end: string;
    bStart?: string;
    bEnd?: string;
    rStart?: string;
    rEnd?: string;
  }>,
  isCircular = false
): SequenceData {
  return {
    steps: steps.map((s, i) => ({
      stepNumber: i + 1,
      startPlacement: s.start,
      endPlacement: s.end,
      motions: {
        [HandSide.LEFT]: {
          startOrientation: s.bStart ?? "in",
          endOrientation: s.bEnd ?? "in",
        },
        [HandSide.RIGHT]: {
          startOrientation: s.rStart ?? "in",
          endOrientation: s.rEnd ?? "in",
        },
      },
    })),
    isCircular,
  } as unknown as SequenceData;
}

describe("edge states", () => {
  it("reads start state from step 0 and end state from last step", () => {
    const s = seq([{ start: "alpha1", end: "beta3", bEnd: "out", rEnd: "out" }]);
    expect(startStateOf(s)).toEqual({ position: "alpha1", leftOri: "in", rightOri: "in" });
    expect(endStateOf(s)).toEqual({ position: "beta3", leftOri: "out", rightOri: "out" });
  });
  it("returns null for an empty sequence", () => {
    expect(startStateOf(seq([]))).toBeNull();
    expect(endStateOf(seq([]))).toBeNull();
  });
});

describe("connects", () => {
  const a = seq([{ start: "alpha1", end: "beta3", bEnd: "out", rEnd: "in" }]);
  it("true when next start equals prev end (position + both orientations)", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "out", rStart: "in" }]);
    expect(connects(a, b)).toBe(true);
  });
  it("false on position mismatch", () => {
    const b = seq([{ start: "gamma5", end: "alpha1", bStart: "out", rStart: "in" }]);
    expect(connects(a, b)).toBe(false);
  });
  it("false on blue orientation mismatch", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "in", rStart: "in" }]);
    expect(connects(a, b)).toBe(false);
  });
  it("false on red orientation mismatch", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "out", rStart: "out" }]);
    expect(connects(a, b)).toBe(false);
  });
});

describe("normalizeToStart", () => {
  const target = { position: "beta3", leftOri: "in", rightOri: "in" };

  it("returns the sequence unchanged when it already starts at target", () => {
    const s = seq([{ start: "beta3", end: "alpha1" }]);
    expect(normalizeToStart(s, target)).toBe(s);
  });

  it("leaves a non-circular sequence untouched (cannot losslessly rebase)", () => {
    const s = seq(
      [{ start: "alpha1", end: "beta3" }, { start: "beta3", end: "alpha1" }],
      false
    );
    expect(normalizeToStart(s, target)).toBe(s);
  });

  it("rebases a circular sequence to the beat that starts at the target position", () => {
    const s = seq(
      [{ start: "alpha1", end: "beta3" }, { start: "beta3", end: "alpha1" }],
      true
    );
    const out = normalizeToStart(s, target);
    expect(startStateOf(out)!.position).toBe("beta3");
  });

  it("leaves a circular sequence unchanged when it never passes through the target", () => {
    const s = seq(
      [{ start: "alpha1", end: "gamma5" }, { start: "gamma5", end: "alpha1" }],
      true
    );
    expect(normalizeToStart(s, target)).toBe(s);
  });
});

describe("loopStatus", () => {
  it("empty for no rows", () => {
    expect(loopStatus([])).toBe("empty");
  });
  it("loops when last end equals first start", () => {
    const rows = [
      seq([{ start: "alpha1", end: "beta3", bEnd: "out" }]),
      seq([{ start: "beta3", end: "alpha1", bStart: "out" }]),
    ];
    expect(loopStatus(rows)).toBe("loops");
  });
  it("open when last end differs from first start", () => {
    const rows = [
      seq([{ start: "alpha1", end: "beta3" }]),
      seq([{ start: "beta3", end: "gamma5" }]),
    ];
    expect(loopStatus(rows)).toBe("open");
  });
});
