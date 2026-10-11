import { describe, it, expect } from "vitest";
import {
  applyReversalToMotion,
  getReversalFlagsForBeat,
  cumulativeParities,
  resolvePattern,
  type ResolvedReversalPattern,
} from "#lib/features/choreo-card/domain/reversal-transform.js";

describe("applyReversalToMotion", () => {
  it("flips pro↔anti when reversed", () => {
    expect(applyReversalToMotion("pro", true)).toBe("anti");
    expect(applyReversalToMotion("anti", true)).toBe("pro");
  });
  it("leaves pro/anti unchanged when not reversed", () => {
    expect(applyReversalToMotion("pro", false)).toBe("pro");
    expect(applyReversalToMotion("anti", false)).toBe("anti");
  });
  it("leaves static and dash unchanged even when reversed", () => {
    expect(applyReversalToMotion("static", true)).toBe("static");
    expect(applyReversalToMotion("dash", true)).toBe("dash");
  });
});

describe("getReversalFlagsForBeat", () => {
  it("maps P/R/B/- symbols", () => {
    expect(getReversalFlagsForBeat("PPPP", 0)).toEqual({ leftReversal: true, rightReversal: true });
    expect(getReversalFlagsForBeat("RRRR", 0)).toEqual({ leftReversal: false, rightReversal: true });
    expect(getReversalFlagsForBeat("BBBB", 0)).toEqual({ leftReversal: true, rightReversal: false });
    expect(getReversalFlagsForBeat("----", 0)).toEqual({ leftReversal: false, rightReversal: false });
  });
  it("wraps via modulo", () => {
    expect(getReversalFlagsForBeat("P-", 4)).toEqual(getReversalFlagsForBeat("P-", 0));
  });
  it("throws on unknown symbol", () => {
    expect(() => getReversalFlagsForBeat("X", 0)).toThrow();
  });
});

describe("cumulativeParities", () => {
  it("PPPP alternates parity per hand (not uniform)", () => {
    const { left, right } = cumulativeParities("PPPP", 4);
    expect(left).toEqual([true, false, true, false]);
    expect(right).toEqual([true, false, true, false]);
  });

  it("long-book P-P- → both hands flip then hold: [T,T,F,F]", () => {
    const { left, right } = cumulativeParities("P-P-", 4);
    expect(left).toEqual([true, true, false, false]);
    expect(right).toEqual([true, true, false, false]);
  });

  it("alternating RBRB toggles each hand on its own beats", () => {
    const { left, right } = cumulativeParities("RBRB", 4);
    expect(right).toEqual([true, true, false, false]); // R on beats 0,2
    expect(left).toEqual([false, true, true, false]); // B on beats 1,3
  });

  it("round-trips through relative detection: construct PPPP rotations → detector reads PPPP", () => {
    // Build a rotation sequence from cumulative parity (base cw, flipped→ccw),
    // then apply reversal-detector.ts's rule (a beat reverses when its spin
    // differs from the previous beat, wrapping at the loop boundary).
    const { left } = cumulativeParities("PPPP", 4);
    const rot = left.map((p) => (p ? "ccw" : "cw"));
    const detected = rot.map((r, i) => r !== rot[(i + rot.length - 1) % rot.length]);
    expect(detected).toEqual([true, true, true, true]); // every beat reverses → book
  });

  it("uniform-anti (the OLD bug) detects as continuous, proving it was wrong", () => {
    const rot = ["ccw", "ccw", "ccw", "ccw"]; // what absolute-flip PPPP produced
    const detected = rot.map((r, i) => r !== rot[(i + rot.length - 1) % rot.length]);
    expect(detected).toEqual([false, false, false, false]); // no reversals = continuous
  });
});

describe("resolvePattern", () => {
  const F = false, T = true;

  it("all-false → continuous, named, clean", () => {
    const r = resolvePattern([F, F, F, F], [F, F, F, F]);
    expect(r.sequence).toBe("----");
    expect(r.id).toBe("continuous");
    expect(r.label).toBe("Continuous");
    expect(r.isNamed).toBe(true);
    expect(r.isCleanLoop).toBe(true);
  });

  it("both all-true → book (PPPP)", () => {
    const r = resolvePattern([T, T, T, T], [T, T, T, T]);
    expect(r.sequence).toBe("PPPP");
    expect(r.id).toBe("book");
    expect(r.isNamed).toBe(true);
  });

  it("red all-true, blue none → red-book (RRRR)", () => {
    const r = resolvePattern([F, F, F, F], [T, T, T, T]);
    expect(r.sequence).toBe("RRRR");
    expect(r.id).toBe("red-book");
  });

  it("alternating red@0,2 blue@1,3 → RBRB", () => {
    const r = resolvePattern([F, T, F, T], [T, F, T, F]);
    expect(r.sequence).toBe("RBRB");
    expect(r.id).toBe("alternating");
    expect(r.isNamed).toBe(true);
  });

  it("custom even-count pattern → string id, not named, clean", () => {
    const r = resolvePattern([T, T, F, F], [F, F, F, F]);
    expect(r.sequence).toBe("BB--");
    expect(r.id).toBe("BB--");
    expect(r.label).toBe("Custom");
    expect(r.isNamed).toBe(false);
    expect(r.isCleanLoop).toBe(true);
  });

  it("odd reversal count on a hand → not clean loop", () => {
    const r = resolvePattern([T, F, F, F], [F, F, F, F]);
    expect(r.sequence).toBe("B---");
    expect(r.isCleanLoop).toBe(false);
  });

  it("pair symbol emitted when both reverse same step", () => {
    const r = resolvePattern([T, F, F, F], [T, F, F, F]);
    expect(r.sequence[0]).toBe("P");
    expect(r.isCleanLoop).toBe(false);
  });
});
