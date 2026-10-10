import { describe, it, expect } from "vitest";
import { calculateOrientationAt } from "#lib/shared/animation-engine/services/orientation-at.js";
import { calculateEndOrientation } from "#lib/shared/render/core/calculations/orientation.js";
import { getAllLetterVariants } from "../../../../../../tests/helpers/real-pictograph-loader";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  MotionType,
  HandSide,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// A spread across motion families: Type 1 (pro/anti), Type 4 (dash), Type 6 (static).
const LETTERS = [Letter.A, Letter.B, Letter.G, Letter.J, Letter.PHI, Letter.ALPHA];
const TURN_VALUES = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Cover cardinal (in/out) AND interradial (clockIn/counterOut) starts, so the
// invariant genuinely exercises Task 3's interradial mapOrientationToAngle fix
// end-to-end through the engine (real CSV rows only ever carry startOrientation
// "in", so without this the interradial path is never round-tripped here).
const START_ORIENTATIONS = [
  Orientation.IN,
  Orientation.OUT,
  Orientation.CLOCK_IN,
  Orientation.COUNTER_OUT,
];

describe("calculateOrientationAt(·, 1) === calculateEndOrientation (dataset invariant)", () => {
  it("matches the shipped algebra at t=1 for real motions across turn values", async () => {
    const mismatches: string[] = [];
    let comparisons = 0;
    for (const letter of LETTERS) {
      const variants = await getAllLetterVariants(letter);
      for (const picto of variants) {
        for (const hand of [picto.motions.left, picto.motions.right]) {
          if (!hand) continue;
          if ((hand.startOrientation as string).startsWith("center")) continue; // deferred
          for (const turns of TURN_VALUES) {
            for (const startOri of START_ORIENTATIONS) {
              const endOrientation = calculateEndOrientation({
                motionType: hand.motionType,
                turns,
                rotationDirection: hand.rotationDirection,
                startLocation: hand.startLocation,
                endLocation: hand.endLocation,
                startOrientation: startOri,
              });
              const input = {
                motionType: hand.motionType as MotionType,
                rotationDirection: hand.rotationDirection as RotationDirection,
                startLocation: hand.startLocation,
                endLocation: hand.endLocation,
                startOrientation: startOri,
                endOrientation,
                turns,
              };
              const actual = calculateOrientationAt(input, 1, HandSide.RIGHT);
              comparisons++;
              if (actual !== endOrientation) {
                mismatches.push(
                  `${letter} ${hand.motionType} ${hand.startLocation}->${hand.endLocation} ` +
                    `turns=${turns} start=${startOri}: engine@1=${actual} algebra=${endOrientation}`
                );
              }
            }
          }
        }
      }
    }
    expect(comparisons).toBeGreaterThan(500);
    expect(mismatches, `\n${mismatches.slice(0, 40).join("\n")}`).toEqual([]);
  }, 30000);
});

describe("calculateOrientationAt — halfway physical correctness", () => {
  it("halves a 0-turn anti shift to a 90deg (cardinal) orientation", () => {
    // anti base reverses in->out over the arc; at the midpoint it is 90deg = clock or counter.
    const out = calculateOrientationAt(
      {
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: "n",
        endLocation: "e",
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        turns: 0,
      },
      0.5
    );
    expect([Orientation.CLOCK, Orientation.COUNTER]).toContain(out);
  });

  it("halves a 0-turn pro shift back to the start orientation (base preserved)", () => {
    const out = calculateOrientationAt(
      {
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: "w",
        endLocation: "n",
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns: 0,
      },
      0.5
    );
    expect(out).toBe(Orientation.IN);
  });
});

describe("calculateOrientationAt — decidability boundary", () => {
  const base = {
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: "n" as const,
    endLocation: "e" as const,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  };

  it("halving is on-lattice for half-integer turns (non-null)", () => {
    for (const turns of [0, 0.5, 1, 1.5, 2]) {
      expect(calculateOrientationAt({ ...base, turns }, 0.5)).not.toBeNull();
    }
  });

  it("halving an L4 quarter-turn is off-lattice (null)", () => {
    for (const turns of [0.25, 0.75]) {
      expect(calculateOrientationAt({ ...base, turns }, 0.5)).toBeNull();
    }
  });
});
