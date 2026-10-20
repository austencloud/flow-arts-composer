// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { calculate } from "../mandala-geometry-calculator";
import {
  EMPTY_MANDALA_SIGNATURE,
  mandalaCoverage,
  mandalaKey,
  mandalaSignature,
} from "../mandala-density";
import type { MandalaPaths } from "../../domain/mandala-types";
import type { MotionLike, StepLike } from "../types";

const CLOCKWISE = ["n", "e", "s", "w"] as const;

function motion(motionType: "pro" | "anti", start: number): MotionLike {
  return {
    motionType,
    rotationDirection: "cw",
    startLocation: CLOCKWISE[start % 4]!,
    endLocation: CLOCKWISE[(start + 1) % 4]!,
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
  };
}

const pro = (start: number) => motion("pro", start);
const anti = (start: number) => motion("anti", start);

/**
 * Both hands circling the grid, the left hand turning the other way and
 * `offset` quarters ahead, so the two hands trace two different figures.
 */
function bothHands(offset: number): StepLike[] {
  return Array.from({ length: 4 }, (_, beat) => ({
    motions: { left: anti(beat + offset), right: pro(beat) },
  }));
}

/** Only the right hand circling. */
function oneHand(): StepLike[] {
  return Array.from({ length: 4 }, (_, beat) => ({
    motions: { left: null, right: pro(beat) },
  }));
}

describe("mandala density", () => {
  it("measures coverage between 0 and 1", () => {
    const coverage = mandalaCoverage(calculate(bothHands(2)));
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });

  it("ranks two hands above one", () => {
    expect(mandalaCoverage(calculate(bothHands(2)))).toBeGreaterThan(
      mandalaCoverage(calculate(oneHand()))
    );
  });

  it("gives one key to one picture and another to another", () => {
    const paths = calculate(bothHands(2));
    const a = mandalaKey(paths);
    // A fresh object with the same geometry is measured again and agrees.
    const again = mandalaKey({ ...paths, left: [...paths.left] });
    const other = mandalaKey(calculate(bothHands(1)));
    expect(a).toBe(again);
    expect(a).not.toBe(other);
    expect(a).toMatch(/^[0-9a-f]{8}-\d+$/);
  });

  it("scores empty geometry 0 with no key", () => {
    expect(mandalaSignature({ left: [], right: [], purple: [] })).toBe(EMPTY_MANDALA_SIGNATURE);
  });

  it("reads a path's curve end points when it carries no beats", () => {
    const traced = calculate(bothHands(2));
    const stripped: MandalaPaths = {
      left: traced.left.map(({ d, tipIndex }) => ({ d, tipIndex })),
      right: traced.right.map(({ d, tipIndex }) => ({ d, tipIndex })),
      purple: [],
    };
    const fromBeats = mandalaCoverage(traced);
    const fromPath = mandalaCoverage(stripped);
    expect(fromPath).toBeGreaterThan(0);
    expect(Math.abs(fromPath - fromBeats)).toBeLessThan(0.05);
  });
});
