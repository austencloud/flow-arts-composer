import { describe, expect, it } from "vitest";

import {
  completeLOOPExtension,
  detectLOOPFromSteps,
  hasRewoundStructure,
  isLegacyLOOPSeedValid,
  LOOPType,
  Period,
} from "@tka/sequence-engine/loop";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import { corpus } from "./harness/corpus";
import {
  buildSeed,
  cloneSeed,
  loadPictographRows,
} from "./harness/canonical-fixtures";
import { checkStepCoherence } from "./harness/invariants";

const REQUESTS = [
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.FLIPPED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.REWOUND,
] as const;

const COMPONENTS: Record<(typeof REQUESTS)[number], readonly string[]> = {
  [LOOPType.ROTATED]: ["rotated"],
  [LOOPType.MIRRORED]: ["mirrored"],
  [LOOPType.FLIPPED]: ["flipped"],
  [LOOPType.SWAPPED]: ["swapped"],
  [LOOPType.INVERTED]: ["inverted"],
  [LOOPType.SWAPPED_INVERTED]: ["swapped", "inverted"],
  [LOOPType.ROTATED_INVERTED]: ["rotated", "inverted"],
  [LOOPType.MIRRORED_SWAPPED]: ["mirrored", "swapped"],
  [LOOPType.MIRRORED_INVERTED]: ["mirrored", "inverted"],
  [LOOPType.ROTATED_SWAPPED]: ["rotated", "swapped"],
  [LOOPType.MIRRORED_ROTATED]: ["mirrored", "rotated"],
  [LOOPType.MIRRORED_INVERTED_ROTATED]: ["mirrored", "inverted", "rotated"],
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: ["mirrored", "swapped", "inverted"],
  [LOOPType.ROTATED_SWAPPED_INVERTED]: ["rotated", "swapped", "inverted"],
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: ["mirrored", "rotated", "swapped"],
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: [
    "mirrored",
    "rotated",
    "inverted",
    "swapped",
  ],
  [LOOPType.REWOUND]: ["rewound"],
};

function firstAccepted(type: (typeof REQUESTS)[number]): StepData[] {
  if (COMPONENTS[type].includes("inverted")) {
    // The bounded corpus keeps only the first two continuations per row.
    // Find a non-static closing pair independently for restricted beta starts
    // so the operation assertion can observe pro/anti inversion itself.
    const rows = loadPictographRows("diamond");
    for (const first of rows) {
      if (
        ![first.left.motionType, first.right.motionType].some(
          (type) => type === "pro" || type === "anti"
        )
      )
        continue;
      const second = rows.find(
        (candidate) =>
          candidate.startPlacement === first.endPlacement &&
          isLegacyLOOPSeedValid(
            first.startPlacement,
            candidate.endPlacement,
            type,
            Period.HALVED
          )
      );
      if (second) return buildSeed([first, second], "diamond");
    }
  }
  for (const entry of corpus(
    (seed) =>
      isLegacyLOOPSeedValid(
        seed[0]!.startPlacement,
        seed.at(-1)!.endPlacement,
        type,
        Period.HALVED
      ) &&
      (!COMPONENTS[type].includes("inverted") ||
        seed
          .slice(1)
          .some((step) =>
            Object.values(step.motions).some(
              (motion) =>
                motion.motionType === "pro" || motion.motionType === "anti"
            )
          ))
  )) {
    return entry.steps;
  }
  throw new Error(`No canonical seed admitted for ${type}`);
}

describe("canonical LOOP completion", () => {
  it("completes every admitted canonical seed across grids, periods, turns, and orientations", () => {
    const failures: string[] = [];
    const coverage = new Set<string>();
    for (const loopType of REQUESTS) {
      for (const period of [Period.HALVED, Period.QUARTERED]) {
        if (loopType === LOOPType.REWOUND && period === Period.QUARTERED)
          continue;
        for (const entry of corpus((seed) =>
          isLegacyLOOPSeedValid(
            seed[0]!.startPlacement,
            seed.at(-1)!.endPlacement,
            loopType,
            period
          )
        )) {
          try {
            const result = completeLOOPExtension(cloneSeed(entry.steps), {
              loopType,
              period,
            });
            const steps = result.steps as StepData[];
            if (
              checkStepCoherence(steps).length > 0 ||
              steps.at(-1)!.endPlacement !== steps[0]!.startPlacement ||
              steps.at(-1)!.motions.left.endOrientation !==
                steps[0]!.motions.left.startOrientation ||
              steps.at(-1)!.motions.right.endOrientation !==
                steps[0]!.motions.right.startOrientation
            ) {
              failures.push(`${loopType}/${period} ${entry.label}`);
            }
            coverage.add(`${loopType}/${period}/${entry.gridMode}`);
          } catch (error) {
            failures.push(
              `${loopType}/${period} ${entry.label}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
    for (const loopType of REQUESTS) {
      for (const period of [Period.HALVED, Period.QUARTERED]) {
        if (loopType === LOOPType.REWOUND && period === Period.QUARTERED)
          continue;
        const gridModes = [
          LOOPType.MIRRORED_SWAPPED_INVERTED,
          LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
        ].includes(loopType)
          ? ["diamond"]
          : ["diamond", "box"];
        for (const gridMode of gridModes) {
          expect(coverage).toContain(`${loopType}/${period}/${gridMode}`);
        }
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it.each(REQUESTS)("preserves the seed and performs %s", (loopType) => {
    const seed = firstAccepted(loopType);
    const sourceMotions = new Map<string, StepData["motions"]["left"]>();
    for (const source of seed) {
      source.motions.left = {
        ...source.motions.left,
        sourceToken: `${source.stepNumber}:left`,
      } as typeof source.motions.left;
      source.motions.right = {
        ...source.motions.right,
        sourceToken: `${source.stepNumber}:right`,
      } as typeof source.motions.right;
      sourceMotions.set(`${source.stepNumber}:left`, source.motions.left);
      sourceMotions.set(`${source.stepNumber}:right`, source.motions.right);
    }
    const before = cloneSeed(seed);
    const result = completeLOOPExtension(seed, {
      loopType,
      period: Period.HALVED,
    });
    const completed = result.steps as StepData[];

    expect(seed).toEqual(before);
    expect(completed.slice(0, seed.length)).toEqual(before);
    expect(result.derivedStepIndices.length).toBeGreaterThan(0);
    expect(checkStepCoherence(completed)).toEqual([]);
    expect(completed.at(-1)!.endPlacement).toBe(completed[0]!.startPlacement);
    expect(completed.at(-1)!.motions.left.endOrientation).toBe(
      completed[0]!.motions.left.startOrientation
    );
    expect(completed.at(-1)!.motions.right.endOrientation).toBe(
      completed[0]!.motions.right.startOrientation
    );

    if (loopType === LOOPType.REWOUND) {
      expect(hasRewoundStructure(completed)).toBe(true);
      return;
    }

    const derived = completed.filter((step) =>
      result.derivedStepIndices.includes(step.stepNumber)
    );

    if (COMPONENTS[loopType].includes("swapped")) {
      expect(
        derived.some((step) =>
          (step.motions.left as { sourceToken?: string }).sourceToken?.endsWith(
            ":right"
          )
        )
      ).toBe(true);
    }

    if (COMPONENTS[loopType].includes("inverted")) {
      expect(
        derived.some((step) =>
          Object.values(step.motions).some((motion) => {
            const token = (motion as { sourceToken?: string }).sourceToken;
            const original = token ? sourceMotions.get(token) : undefined;
            return (
              (original?.motionType === "pro" &&
                motion.motionType === "anti") ||
              (original?.motionType === "anti" && motion.motionType === "pro")
            );
          })
        )
      ).toBe(true);
    }

    if (
      COMPONENTS[loopType].length === 1 &&
      !COMPONENTS[loopType].includes("swapped") &&
      !COMPONENTS[loopType].includes("inverted")
    ) {
      const detected = detectLOOPFromSteps(completed);
      for (const component of COMPONENTS[loopType]) {
        expect(detected.components).toContain(component);
      }
    }
  });

  it("rejects the invalid quartered rewound request", () => {
    expect(() =>
      completeLOOPExtension(firstAccepted(LOOPType.REWOUND), {
        loopType: LOOPType.REWOUND,
        period: Period.QUARTERED,
      })
    ).toThrow("Rewound LOOP does not support a quartered period");
  });
});
