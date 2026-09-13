import { describe, expect, it, vi } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import { loopSpecFromLegacy } from "../../src/loop/loop-spec.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { isSequenceCircular } from "../../src/loop/detection/LOOPDetector.js";
import { loopExecutorSelector } from "../../src/loop/execution/LOOPExecutorSelector.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const rows = loadDiamondVariations();

function build(
  type: LOOPType,
  relationship?: HandRelationshipOptions,
  filtered = false
) {
  const provider = new CsvVariationProvider(
    filtered
      ? rows.filter((row) =>
          handRelationshipHolds(row.leftMotion, row.rightMotion, {
            map: "rotate-180",
          })
        )
      : rows
  );
  return new SequenceBuilder(provider).build({
    length: 8,
    gridMode: "diamond",
    level: 1,
    maxTurnIntensity: 0,
    constraintOptions: relationship ? { handRelationship: relationship } : {},
    loop: {
      type,
      period: Period.HALVED,

      useTargetedGeneration: true,
      loopSpec: loopSpecFromLegacy(type, 2),
    },
  });
}

describe("requested LOOP identity with constrained hands", () => {
  it("searches eligible starts when a forbidden relationship target sorts first", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const result = new SequenceBuilder(new CsvVariationProvider(rows)).build({
        length: 2,
        gridMode: "diamond",
        level: 3,
        maxTurnIntensity: 1,
        matchHandTurns: true,
        leftStartOrientation: "in",
        rightStartOrientation: "in",
        blockedStartPositions: [
          ...new Set(rows.map((row) => row.startPosition)),
        ].filter((position) => position !== "alpha1" && position !== "beta1"),
        constraintOptions: {
          propContinuity: "maximize",
          handPathContinuity: "maximize",
          motionFamily: { exclude: ["dash"] },
          handRelationship: { map: "identity" },
        },
        loop: {
          type: LOOPType.ROTATED,
          period: Period.QUARTERED,
          requestedTotalLength: 8,
          useTargetedGeneration: true,
          loopSpec: loopSpecFromLegacy(LOOPType.ROTATED, 4),
        },
      });
      expect(result.sequence).toHaveLength(9);
      expect(isSequenceCircular(result.sequence)).toBe(true);
      expect(result.sequence[0]!.startPosition).toBe("beta1");
      for (const step of result.sequence.slice(1)) {
        expect(step.motions.left.motionType).not.toBe("dash");
        expect(step.motions.right.motionType).not.toBe("dash");
        expect(step.motions.left.turns).toBe(step.motions.right.turns);
      }
      for (const hand of ["left", "right"] as const) {
        expect(result.sequence[0]!.motions[hand].startOrientation).toBe("in");
        expect(result.sequence.at(-1)!.motions[hand].endOrientation).toBe("in");
      }
    } finally {
      random.mockRestore();
    }
  });
  it("rejects a derived motion corrupted after canonical LOOP execution", () => {
    const execute = loopExecutorSelector.executeSpec.bind(loopExecutorSelector);
    let calls = 0;
    const spy = vi
      .spyOn(loopExecutorSelector, "executeSpec")
      .mockImplementation((sequence, spec) => {
        const seedCount = sequence.length - 1;
        const result = execute(sequence, spec);
        if (calls++ % 2 === 0) {
          const step = result[seedCount + 1]!;
          result[seedCount + 1] = {
            ...step,
            motions: {
              ...step.motions,
              left: {
                ...step.motions.left,
                turns: Number(step.motions.left.turns ?? 0) + 2,
              },
            },
          };
        }
        return result;
      });
    try {
      expect(() => build(LOOPType.ROTATED, { map: "rotate-180" })).toThrow(
        "Unable to generate a valid rotated LOOP"
      );
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([LOOPType.MIRRORED_ROTATED, LOOPType.MIRRORED_INVERTED])(
    "preserves box reflection construction through orientation closure: %s",
    (type) => {
      const result = new SequenceBuilder(
        new CsvVariationProvider(loadBoxVariations())
      ).build({
        length: 4,
        gridMode: "box",
        level: 2,
        maxTurnIntensity: 1,
        constraintOptions: {
          handRelationship: { map: "reflect-north-south", inverted: true },
        },
        loop: {
          type,
          period: Period.HALVED,
          requestedTotalLength: 16,
          useTargetedGeneration: true,
          loopSpec: loopSpecFromLegacy(type, 2),
        },
      });
      expect(result.sequence).toHaveLength(17);
      expect(isSequenceCircular(result.sequence)).toBe(true);
      for (const step of result.sequence.slice(1)) {
        expect(
          handRelationshipHolds(step.motions.left, step.motions.right, {
            map: "reflect-north-south",
            inverted: true,
          })
        ).toBe(true);
      }
    }
  );
  it.each<{ type: LOOPType; relationship: HandRelationshipOptions }>([
    { type: LOOPType.SWAPPED, relationship: { map: "rotate-180" } },
    { type: LOOPType.SWAPPED, relationship: { map: "reflect-north-south" } },
    {
      type: LOOPType.ROTATED_SWAPPED,
      relationship: { map: "rotate-180", inverted: true },
    },
  ])(
    "accepts $type when another description is preferred ($relationship.map)",
    ({ type, relationship }) => {
      const result = build(type, relationship);
      expect(result.sequence.length).toBeGreaterThan(1);
      expect(isSequenceCircular(result.sequence)).toBe(true);
      for (const step of result.sequence.slice(1)) {
        expect(
          handRelationshipHolds(
            step.motions.left,
            step.motions.right,
            relationship
          )
        ).toBe(true);
      }
    }
  );

  it("keeps rejecting a weaker identity without a requested hand relationship", () => {
    expect(() => build(LOOPType.SWAPPED, undefined, true)).toThrow(
      "identity mismatch"
    );
  });
});
