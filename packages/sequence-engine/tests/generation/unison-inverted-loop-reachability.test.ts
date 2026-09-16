/**
 * Regression lock for feedback NzFty7BJJeKCkMSGruy4 (2026-09-15, Generate tab):
 *
 *   Unable to generate a valid inverted LOOP after 40 attempts
 *   (last failure: No valid 4-step path exists: step 1 has no reachable
 *    positions given the current constraints)
 *
 * The user's setup: Diamond, Level 2, 8 steps, Inverted LOOP built as
 * "Adds length" at halfway, hand relationship Unison + Inverted with Match
 * turns, no dash filter, and every gamma start blocked.
 *
 * Unison + Inverted admits only the beta-to-beta rows (I, Ψ-, and the static
 * β, which Level 2 without a dash filter drops from the reachability pool).
 * Before 4cc2eb63ad the random-start LOOP targets were built from every grid
 * position, not just the ones the relationship can start from. An alpha
 * target's required end (itself, for an inversion) is unreachable through a
 * beta-only pool, so backward reachability threw and aborted the attempt.
 * When a beta target sorted first, the detector labelled the I-I-I-I cycle as
 * swapped or rotated+swapped and identity validation rejected it. Measured
 * at the then-deployed cb4d4210b4: 0 of 40 builds. Both halves are fixed by
 * 4cc2eb63ad (eligible-start filtering plus requested-construction identity
 * checks); this test keeps them fixed.
 */
import { describe, expect, it } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import { isSequenceCircular } from "../../src/loop/detection/LOOPDetector.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { loopSpecFromWire } from "../../src/loop/loop-spec.js";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const UNISON_INVERTED: HandRelationshipOptions = {
  map: "identity",
  inverted: true,
};

const BLOCKED_GAMMA = [
  "gamma15",
  "gamma13",
  "gamma11",
  "gamma9",
  "gamma7",
  "gamma5",
  "gamma3",
  "gamma1",
];

/** Pre-fix, ~60% of builds threw on reachability; a dozen makes a pass ~1e-5. */
const BUILDS = 12;

/**
 * A float keeps the dataset motion in the prefloat fields; the relationship
 * is a statement about that dataset motion.
 */
function dataset(m: MotionData): MotionData {
  const withPrefloat = m as MotionData & {
    prefloatMotionType?: string;
    prefloatRotationDirection?: string;
  };
  return {
    ...m,
    motionType: (withPrefloat.prefloatMotionType ??
      m.motionType) as MotionData["motionType"],
    rotationDirection: (withPrefloat.prefloatRotationDirection ??
      m.rotationDirection) as MotionData["rotationDirection"],
  };
}

describe("unison inverted hands inside an inverted expand LOOP (feedback NzFty7BJ)", () => {
  it("builds eight closed diamond steps at Level 2 with every gamma start blocked", () => {
    const builder = new SequenceBuilder(
      new CsvVariationProvider(loadDiamondVariations())
    );

    for (let run = 0; run < BUILDS; run++) {
      const result = builder.build({
        length: 4,
        gridMode: "diamond",
        level: 2,
        maxTurnIntensity: 1,
        matchHandTurns: true,
        leftStartOrientation: "in",
        rightStartOrientation: "in",
        constraintOptions: {
          propContinuity: "maximize",
          handPathContinuity: "maximize",
          handRelationship: UNISON_INVERTED,
        },
        blockedStartPlacements: BLOCKED_GAMMA,
        loop: {
          type: LOOPType.INVERTED,
          period: Period.HALVED,
          useTargetedGeneration: true,
          requestedTotalLength: 8,
          loopSpec: loopSpecFromWire({
            left: { inverted: { period: 2 } },
            right: { inverted: { period: 2 } },
          }),
        },
      });

      expect(result.sequence).toHaveLength(9);
      expect(isSequenceCircular(result.sequence)).toBe(true);

      const start = String(result.sequence[0]!.startPlacement);
      expect(BLOCKED_GAMMA).not.toContain(start);
      expect(start.startsWith("beta")).toBe(true);

      for (const step of result.sequence.slice(1)) {
        const left = dataset(step.motions.left as unknown as MotionData);
        const right = dataset(step.motions.right as unknown as MotionData);
        expect(
          handRelationshipHolds(left, right, UNISON_INVERTED),
          `step ${step.stepNumber} (${step.letter}) ${left.startLocation}>${left.endLocation} vs ${right.startLocation}>${right.endLocation}`
        ).toBe(true);
      }
    }
  });
});
