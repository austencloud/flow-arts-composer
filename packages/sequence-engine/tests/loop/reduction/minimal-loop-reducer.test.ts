/**
 * Minimal-Loop Reducer tests.
 *
 * Anchored on the real 2026-07-10 defect: a `YΦΔYΦΔYΦΔYΦΔ` (12-step) deck card
 * that is a 6-step mirrored loop copied a second time. The 6-step loop already
 * closes in position and orientation, so the outer doubling is a redundant
 * literal repeat that must collapse to 6 — while the inner mirror (halves are
 * transforms, not copies) must be preserved.
 */

import { describe, it, expect } from "vitest";
import { reduceToMinimalLoop } from "../../../src/loop/reduction/minimal-loop-reducer.js";
import type { Step } from "../../../src/core/types/sequence-engine-types.js";

type Ori = "in" | "out";
type Loc = "n" | "e" | "s" | "w";
type Mt = "pro" | "anti" | "dash" | "static";
type Rot = "cw" | "ccw" | "noRotation";

function m(
  motionType: Mt,
  rotationDirection: Rot,
  startLocation: Loc,
  endLocation: Loc,
  startOrientation: Ori,
  endOrientation: Ori,
) {
  return {
    motionType,
    rotationDirection,
    startLocation,
    endLocation,
    startOrientation,
    endOrientation,
    turns: 0,
  };
}

const RED_STATIC = m("static", "noRotation", "s", "s", "in", "in");

function step(
  stepNumber: number,
  letter: string | null,
  startPlacement: string,
  endPlacement: string,
  left: ReturnType<typeof m>,
): Step {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    letter: letter as Step["letter"],
    startPlacement: startPlacement as Step["startPlacement"],
    endPlacement: endPlacement as Step["endPlacement"],
    duration: 1,
    motions: { left: left as never, right: { ...RED_STATIC } as never },
  } as Step;
}

/** The six distinct steps of the card: YΦΔ then its vertical mirror YΦΔ. */
function cardHalf(startNumber: number): Step[] {
  return [
    step(startNumber + 0, "Y", "gamma13", "beta5", m("pro", "ccw", "w", "s", "in", "in")),
    step(startNumber + 1, "Φ", "beta5", "alpha5", m("dash", "noRotation", "s", "n", "in", "out")),
    step(startNumber + 2, "Δ", "alpha5", "gamma5", m("anti", "ccw", "n", "e", "out", "in")),
    step(startNumber + 3, "Y", "gamma5", "beta5", m("pro", "cw", "e", "s", "in", "in")),
    step(startNumber + 4, "Φ", "beta5", "alpha5", m("dash", "noRotation", "s", "n", "in", "out")),
    step(startNumber + 5, "Δ", "alpha5", "gamma13", m("anti", "cw", "n", "w", "out", "in")),
  ];
}

const START = step(0, null, "gamma13", "gamma13", m("static", "noRotation", "w", "w", "in", "in"));

/** The full 12-step card: two identical copies of the 6-step mirrored loop. */
function card12(): Step[] {
  return [START, ...cardHalf(1), ...cardHalf(7)];
}

describe("reduceToMinimalLoop", () => {
  it("collapses the 12-step YΦΔ×4 card to its 6-step mirrored loop", () => {
    const result = reduceToMinimalLoop(card12());

    expect(result.reduced).toBe(true);
    expect(result.originalLength).toBe(12);
    expect(result.reducedLength).toBe(6);

    const letters = result.steps.filter((s) => s.stepNumber > 0);
    expect(letters).toHaveLength(6);
    expect(letters.map((s) => s.letter)).toEqual(["Y", "Φ", "Δ", "Y", "Φ", "Δ"]);
    // Renumbered contiguously 1..6.
    expect(letters.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    // Start-position step preserved at index 0.
    expect(result.steps[0]!.stepNumber).toBe(0);
  });

  it("PRESERVES the 6-step mirrored loop (halves are transforms, not copies)", () => {
    const mirrored6: Step[] = [START, ...cardHalf(1)];
    const result = reduceToMinimalLoop(mirrored6);

    expect(result.reduced).toBe(false);
    expect(result.reducedLength).toBe(6);
  });

  it("PRESERVES an orientation-cycle loop (same motions, different orientations per pass)", () => {
    // Two passes with identical locations/motion types but DIFFERENT
    // orientations — a genuine period-2 orientation cycle, not a literal copy.
    const a = step(1, "A", "alpha1", "beta1", m("pro", "cw", "n", "s", "in", "out"));
    const b = step(2, "B", "beta1", "alpha1", m("pro", "cw", "s", "n", "out", "in"));
    // pass 2: same motion geometry, orientations shifted (out/in vs in/out)
    const c = step(3, "A", "alpha1", "beta1", m("pro", "cw", "n", "s", "out", "in"));
    const d = step(4, "B", "beta1", "alpha1", m("pro", "cw", "s", "n", "in", "out"));
    const oriCycle: Step[] = [
      step(0, null, "alpha1", "alpha1", m("static", "noRotation", "n", "n", "in", "in")),
      a, b, c, d,
    ];

    const result = reduceToMinimalLoop(oriCycle);
    expect(result.reduced).toBe(false);
    expect(result.reducedLength).toBe(4);
  });

  it("is idempotent — reducing an already-minimal loop changes nothing", () => {
    const once = reduceToMinimalLoop(card12());
    const twice = reduceToMinimalLoop(once.steps);

    expect(twice.reduced).toBe(false);
    expect(twice.reducedLength).toBe(6);
    expect(twice.steps.filter((s) => s.stepNumber > 0)).toHaveLength(6);
  });

  it("collapses a 4× literal repeat all the way to the base unit", () => {
    // YΦΔYΦΔ repeated 4× = 24 steps → collapses to the 6-step base.
    const card24: Step[] = [START, ...cardHalf(1), ...cardHalf(7), ...cardHalf(13), ...cardHalf(19)];
    const result = reduceToMinimalLoop(card24);

    expect(result.reduced).toBe(true);
    expect(result.originalLength).toBe(24);
    expect(result.reducedLength).toBe(6);
  });
});
