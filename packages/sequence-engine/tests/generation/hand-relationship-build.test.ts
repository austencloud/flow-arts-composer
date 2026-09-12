/**
 * The hand relationship option survives the whole build: reachability
 * pre-filter, first-step selection, beam search, turn materialization and
 * LOOP extension. Runs against the production dataframes.
 */
import { describe, expect, it } from "vitest";
import { SequenceBuilder } from "../../src/generation/index.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import type { Step } from "../../src/core/types/sequence-engine-types.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { isSequenceCircular } from "../../src/loop/detection/LOOPDetector.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const MIRRORED: HandRelationshipOptions = { map: "reflect-north-south" };

const diamond = () =>
  new SequenceBuilder(new CsvVariationProvider(loadDiamondVariations()));
const box = () =>
  new SequenceBuilder(new CsvVariationProvider(loadBoxVariations()));

/**
 * Turns are independent per hand, so one hand may have floated. The
 * relationship is a statement about the dataset motion, which a float keeps
 * in prefloatMotionType / prefloatRotationDirection.
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

function expectRelationship(
  sequence: Step[],
  options: HandRelationshipOptions
): void {
  expect(sequence.length).toBeGreaterThan(1);
  for (const step of sequence.slice(1)) {
    const left = dataset(step.motions.left as unknown as MotionData);
    const right = dataset(step.motions.right as unknown as MotionData);
    expect(
      handRelationshipHolds(left, right, options),
      `step ${step.stepNumber} (${step.letter}) ${left.startLocation}>${left.endLocation} vs ${right.startLocation}>${right.endLocation}`
    ).toBe(true);
  }
}

describe("SequenceBuilder with a hand relationship", () => {
  it("diamond L1 mirrored: every step mirrors and the start is symmetric", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { handRelationship: MIRRORED },
      });
      expectRelationship(result.sequence, MIRRORED);
      expect(["alpha3", "alpha7", "beta1", "beta5"]).toContain(
        String(result.sequence[0]!.startPosition)
      );
    }
  });

  it("box L1 mirrored lands on the reflected gamma positions", () => {
    const result = box().build({
      length: 8,
      gridMode: "box",
      level: 1,
      constraintOptions: { handRelationship: MIRRORED },
    });
    expectRelationship(result.sequence, MIRRORED);
    expect(["gamma2", "gamma6", "gamma12", "gamma16"]).toContain(
      String(result.sequence[0]!.startPosition)
    );
  });

  it.each([
    ["flipped", { map: "reflect-east-west" } as HandRelationshipOptions],
    ["unison", { map: "identity" } as HandRelationshipOptions],
    ["opposite", { map: "rotate-180" } as HandRelationshipOptions],
    [
      "mirrored inverted",
      { map: "reflect-north-south", inverted: true } as HandRelationshipOptions,
    ],
  ])("diamond L1 %s holds on every step", (_name, options) => {
    const result = diamond().build({
      length: 8,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: options },
    });
    expectRelationship(result.sequence, options);
  });

  it("L3 with full turn intensity still holds: turns and floats vary per hand", () => {
    const result = diamond().build({
      length: 8,
      gridMode: "diamond",
      level: 3,
      maxTurnIntensity: 3,
      constraintOptions: { handRelationship: MIRRORED },
    });
    expectRelationship(result.sequence, MIRRORED);
  });

  it("mirrored plus rotated halved closes and stays mirrored through the loop", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: MIRRORED },
      loop: {
        type: LOOPType.ROTATED,
        period: Period.HALVED,
        useTargetedGeneration: true,
        requestedTotalLength: 8,
      },
    });
    expect(isSequenceCircular(result.sequence)).toBe(true);
    expectRelationship(result.sequence, MIRRORED);
  });

  it("unison plus rotated quartered closes: identity commutes with everything", () => {
    const result = diamond().build({
      length: 2,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: { map: "identity" } },
      loop: {
        type: LOOPType.ROTATED,
        period: Period.QUARTERED,
        useTargetedGeneration: true,
        requestedTotalLength: 8,
      },
    });
    expect(isSequenceCircular(result.sequence)).toBe(true);
    expectRelationship(result.sequence, { map: "identity" });
  });

  it("mirrored plus rotated quartered cannot close and says so", () => {
    expect(() =>
      diamond().build({
        length: 2,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { handRelationship: MIRRORED },
        loop: {
          type: LOOPType.ROTATED,
          period: Period.QUARTERED,
          useTargetedGeneration: true,
          requestedTotalLength: 8,
        },
      })
    ).toThrow();
  });
});

describe("SequenceBuilder with matchHandTurns", () => {
  it("gives both hands the same turns on every step, floats included, and keeps the relationship", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 3,
        maxTurnIntensity: 3,
        matchHandTurns: true,
        constraintOptions: { handRelationship: MIRRORED },
      });
      expectRelationship(result.sequence, MIRRORED);
      expect(result.turnAllocation.left).toEqual(result.turnAllocation.right);
      for (const step of result.sequence.slice(1)) {
        expect(step.motions.left.turns).toEqual(step.motions.right.turns);
        expect(step.motions.left.motionType === "float").toBe(
          step.motions.right.motionType === "float"
        );
      }
    }
  });

  /**
   * A shift's spin is fixed by its path; a dash's comes from turns after the
   * row is chosen, so dash steps with turns are where the derived spin shows.
   * The beam picks them at random, so build until a few have appeared.
   */
  function dashStepsWithTurns(
    options: HandRelationshipOptions,
    want: number
  ): Array<{ left: string; right: string }> {
    const seen: Array<{ left: string; right: string }> = [];
    for (let i = 0; i < 40 && seen.length < want; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        maxTurnIntensity: 3,
        matchHandTurns: true,
        constraintOptions: { handRelationship: options },
      });
      for (const step of result.sequence.slice(1)) {
        const { left, right } = step.motions;
        if (left.motionType !== "dash" || right.motionType !== "dash") continue;
        expect(left.turns).toEqual(right.turns);
        if (right.rotationDirection === "noRotation") continue;
        seen.push({
          left: String(left.rotationDirection),
          right: String(right.rotationDirection),
        });
      }
    }
    return seen;
  }

  it("spins a left dash the mirror way when the hands are mirrored", () => {
    const seen = dashStepsWithTurns(MIRRORED, 3);
    expect(seen.length).toBeGreaterThan(0);
    for (const { left, right } of seen) expect(left).not.toBe(right);
  });

  it("keeps the same spin on both hands for unison dashes", () => {
    const seen = dashStepsWithTurns({ map: "identity" }, 3);
    expect(seen.length).toBeGreaterThan(0);
    for (const { left, right } of seen) expect(left).toBe(right);
  });

  it("leaves turns independent when the flag is off", () => {
    let differed = false;
    for (let i = 0; i < 10 && !differed; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 3,
        maxTurnIntensity: 3,
        constraintOptions: { handRelationship: MIRRORED },
      });
      differed = result.turnAllocation.left.some(
        (t, idx) => t !== result.turnAllocation.right[idx]
      );
    }
    expect(differed).toBe(true);
  });
});
