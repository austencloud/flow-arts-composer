import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLegacySteps } from "@tka/tka-types";
import {
  completeLOOPExtension,
  isLegacyLOOPSeedValid,
  isSupportedLegacyLOOPType,
} from "../../../src/loop/execution/complete-loop-extension.js";
import { getLOOPSpecExpansionMultiplier } from "../../../src/loop/execution/spec-executor.js";
import {
  LOOPComponent,
  loopSpecFromLegacyRhythm,
  symmetricSpec,
} from "../../../src/loop/loop-spec.js";
import {
  ALL_LOOP_TYPES,
  LOOPType,
  Period,
} from "../../../src/loop/loop-types.js";
import type { SequenceStep } from "../../../src/core/types/sequence-engine-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  __dirname,
  "../../../../../tests/fixtures/loop-audit/real-loop-fixtures.json"
);

interface FixtureSample {
  readonly steps: SequenceStep[];
}

const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
  string,
  FixtureSample[]
>;

function seedFor(loopType: LOOPType): SequenceStep[] {
  const sample = fixtures[loopType]?.[0];
  if (!sample) throw new Error(`Missing real fixture for ${loopType}`);
  const steps = normalizeLegacySteps(sample.steps) as SequenceStep[];
  const multiplier = getLOOPSpecExpansionMultiplier(
    loopSpecFromLegacyRhythm(loopType, 2)
  );
  return steps.slice(0, 1 + (steps.length - 1) / multiplier);
}

describe("completeLOOPExtension", () => {
  it("completes selected legacy families from real CSV-backed fixtures", () => {
    // These samples exercise spatial rotation, fused complementary transforms,
    // and temporal rewind. The fixture's nested compounds are already covered
    // by spec-executor parity tests; their recorded full loops do not retain a
    // standalone seed seam for the stricter extension admission gate.
    for (const loopType of [
      LOOPType.ROTATED,
      LOOPType.SWAPPED_INVERTED,
      LOOPType.REWOUND,
    ]) {
      const seed = seedFor(loopType);
      const before = structuredClone(seed);
      let result;
      try {
        result = completeLOOPExtension(seed, {
          loopType,
          period: Period.HALVED,
        });
      } catch (error) {
        throw new Error(
          `${loopType}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      expect(result.steps.length, loopType).toBeGreaterThan(seed.length);
      expect(result.steps.at(-1)?.endPlacement, loopType).toBe(
        result.steps[0]?.startPlacement
      );
      expect(result.steps.at(-1)?.motions.left.endOrientation, loopType).toBe(
        result.steps[0]?.motions.left.startOrientation
      );
      expect(result.steps.at(-1)?.motions.right.endOrientation, loopType).toBe(
        result.steps[0]?.motions.right.startOrientation
      );
      expect(seed).toEqual(before);
      expect(result.steps.slice(0, seed.length)).toEqual(before);
      expect(result.derivedStepIndices).not.toHaveLength(0);
    }
  });

  it("rejects a quartered rewound request instead of silently treating it as halved", () => {
    expect(() =>
      completeLOOPExtension(seedFor(LOOPType.REWOUND), {
        loopType: LOOPType.REWOUND,
        period: Period.QUARTERED,
      })
    ).toThrow(/rewound.*quartered/i);
  });

  it("exposes the exact legacy support gate used by completion", () => {
    for (const type of ALL_LOOP_TYPES)
      expect(isSupportedLegacyLOOPType(type)).toBe(true);
    expect(isSupportedLegacyLOOPType("not-a-loop")).toBe(false);
    expect(
      isLegacyLOOPSeedValid("not-a-placement", "also-invalid", LOOPType.REWOUND)
    ).toBe(false);
    expect(
      isLegacyLOOPSeedValid("alpha5", "alpha1", LOOPType.SWAPPED_INVERTED)
    ).toBe(true);
    expect(
      isLegacyLOOPSeedValid("alpha5", "alpha5", LOOPType.SWAPPED_INVERTED)
    ).toBe(false);
  });

  it("rejects a seed whose declared placement or hand chain is inconsistent", () => {
    const mislabeled = structuredClone(seedFor(LOOPType.ROTATED));
    mislabeled[1]!.endPlacement = "alpha1" as SequenceStep["endPlacement"];
    expect(() =>
      completeLOOPExtension(mislabeled, { loopType: LOOPType.ROTATED })
    ).toThrow(/placement does not match/i);

    const brokenChain = structuredClone(seedFor(LOOPType.ROTATED));
    brokenChain[2]!.motions.left.startOrientation = "out";
    expect(() =>
      completeLOOPExtension(brokenChain, { loopType: LOOPType.ROTATED })
    ).toThrow(/not continuous/i);
  });

  it("keeps a quartered non-rotational legacy request structurally halved", () => {
    const result = completeLOOPExtension(seedFor(LOOPType.SWAPPED_INVERTED), {
      loopType: LOOPType.SWAPPED_INVERTED,
      period: Period.QUARTERED,
    });

    expect(result.structuralExpansionMultiplier).toBe(2);
  });

  it("preserves historical nondegenerate admission for legacy composites", () => {
    expect(
      isLegacyLOOPSeedValid("alpha1", "alpha1", LOOPType.ROTATED_SWAPPED)
    ).toBe(false);
    expect(
      isLegacyLOOPSeedValid("beta1", "beta5", LOOPType.ROTATED_SWAPPED)
    ).toBe(true);
    expect(
      isLegacyLOOPSeedValid(
        "gamma1",
        "gamma3",
        LOOPType.MIRRORED_SWAPPED_INVERTED
      )
    ).toBe(false);
    expect(
      isLegacyLOOPSeedValid(
        "beta1",
        "beta1",
        LOOPType.MIRRORED_SWAPPED_INVERTED
      )
    ).toBe(true);

    expect(() =>
      completeLOOPExtension(alphaIdentitySeed(), {
        loopType: LOOPType.ROTATED_SWAPPED,
      })
    ).toThrow(/legacy LOOP/i);
    expect(() =>
      completeLOOPExtension(alphaIdentitySeed(), {
        spec: symmetricSpec(
          new Map([
            [LOOPComponent.ROTATED, { period: 2 }],
            [LOOPComponent.SWAPPED, { period: 2 }],
          ])
        ),
      })
    ).not.toThrow();
  });
});

function alphaIdentitySeed(): SequenceStep[] {
  const motion = {
    motionType: "static",
    rotationDirection: "noRotation",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  };
  return [
    {
      id: "start",
      stepNumber: 0,
      letter: null,
      startPlacement: "alpha1",
      endPlacement: "alpha1",
      motions: {
        left: { ...motion, hand: "left", startLocation: "s", endLocation: "s" },
        right: {
          ...motion,
          hand: "right",
          startLocation: "n",
          endLocation: "n",
        },
      },
    },
    {
      id: "author-step",
      stepNumber: 1,
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha1",
      motions: {
        left: { ...motion, hand: "left", startLocation: "s", endLocation: "s" },
        right: {
          ...motion,
          hand: "right",
          startLocation: "n",
          endLocation: "n",
        },
      },
    },
  ] as SequenceStep[];
}
