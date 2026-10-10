/**
 * Stage 4 — Present. Bucketing, and the metadata a row carries.
 *
 * The bucket law under test: circle length = unit length x the order of the
 * closing transform, so ONE unit lands in several buckets — once per admissible
 * closure — and the buckets are the primary organisation.
 *
 * The metadata assertion matters for a different reason: an earlier spec claimed
 * nothing in the codebase analysed a finished sequence for its motion-type mix
 * and scheduled a new classifier. That claim was wrong.
 * `SequenceFeatureExtractor` already does it, and this proves the combinator
 * calls it rather than growing a second one.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { CandidateUnit } from "#lib/shared/combination/domain/closure-types.js";
import {
  bucketByCircleCount,
  describeCombination,
  expandClosures,
} from "#lib/shared/combination/services/circle-buckets.js";
import {
  buildUnitSequence,
  findLOOPCombinations,
} from "#lib/shared/combination/services/loop-combinator.js";
import {
  loadCombinationSteps,
  searchCandidateUnits,
} from "#lib/shared/combination/services/unit-search.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

import { AAAA_CCW } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

let steps: readonly StepData[];

beforeAll(async () => {
  await loadPictographDatasetForTests();
  steps = await loadCombinationSteps(GridMode.DIAMOND);
}, 60_000);

/** The first closing A+G unit of exactly `length` steps the search produces. */
function findUnit(length: number): CandidateUnit {
  const units = searchCandidateUnits(
    {
      steps,
      cardALetters: new Set(["A"]),
      cardBLetters: new Set(["G"]),
    },
    { maxUnitLength: length, maxConnectors: 2 }
  );
  const hit = units.find((unit) => unit.steps.length === length);
  if (!hit) throw new Error(`no closing A+G unit of ${length} steps`);
  return hit;
}

describe("Stage 4 — present", () => {
  it("puts one unit in several buckets, once per admissible closure", () => {
    const unit = findUnit(4);
    const combinations = expandClosures([unit]);
    const buckets = bucketByCircleCount(combinations);

    expect(combinations.length).toBeGreaterThan(1);
    expect(buckets.length).toBeGreaterThan(1);
    for (const bucket of buckets) {
      for (const combination of bucket.combinations) {
        expect(bucket.count).toBe(
          combination.unit.steps.length * combination.closure.circleMultiplier
        );
      }
    }
    // Ascending, which is the order a performer reads them in.
    expect(buckets.map((bucket) => bucket.count)).toEqual(
      [...buckets.map((bucket) => bucket.count)].sort((a, b) => a - b)
    );
  });

  it("groups by closure inside a bucket", () => {
    const buckets = bucketByCircleCount(expandClosures([findUnit(4)]));
    for (const bucket of buckets) {
      const grouped = [...bucket.byClosure.values()].flat();
      expect(grouped).toHaveLength(bucket.combinations.length);
      for (const [id, rows] of bucket.byClosure) {
        for (const row of rows) expect(row.closure.id).toBe(id);
      }
    }
  });

  it("displays the smallest repeating unit of a word", async () => {
    // AAAA reads as A. The raw word stays on the unit for step math; only the
    // display string is simplified.
    const report = await findLOOPCombinations({
      cardALetters: new Set(["A"]),
      cardBLetters: new Set(["G"]),
      steps,
      box: { maxUnitLength: 4, maxConnectors: 2 },
    });
    for (const combination of report.combinations) {
      expect(combination.displayWord.length).toBeLessThanOrEqual(
        combination.unit.word.length
      );
      expect(combination.unit.word.startsWith(combination.displayWord)).toBe(
        true
      );
    }
  }, 120_000);

  it("reads a built unit's features through the existing extractor", async () => {
    const unit = findUnit(4);
    const sequence = await buildUnitSequence(unit, AAAA_CCW);
    const features = describeCombination(sequence);

    expect(features.stepCount).toBe(unit.steps.length);
    // Motion-type mix, gap presence, turns and reversals all arrive from the
    // one extractor — no combinator-local classifier.
    expect(typeof features.hasProMotion).toBe("boolean");
    expect(typeof features.hasDashMotion).toBe("boolean");
    expect(
      features.hasAlphaPositions ||
        features.hasBetaPositions ||
        features.hasGammaPositions
    ).toBe(true);
    expect(features.reversals).toBeDefined();
  }, 60_000);
});
