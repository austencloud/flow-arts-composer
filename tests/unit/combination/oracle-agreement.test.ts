/**
 * The whole pipeline against the published research oracle.
 *
 * `scripts/combinator-research/by-count.mjs` enumerated A + G inside the
 * standard box — unit <= 6 steps, <= 2 connectors, diamond, both cards required
 * — and its printed count-bucket profile is frozen in `oracle-fixtures.ts`. That
 * script is a separate implementation with its own local closure rule; the
 * engine here calls the app's `isLOOPValidForPlacementPair` instead. Two
 * independent paths landing on the same nine numbers is the strongest evidence
 * available that the engine enumerates the right space and quotients it by the
 * right relation.
 *
 * A disagreement is NOT automatically the engine's bug — it may be a deliberate
 * change to the equivalence relation. But it must then be stated out loud, and
 * this file is where it would be stated.
 *
 * Runtime: the A+G sweep is a few million DFS nodes plus a canonicalisation
 * pass over every closing walk. It runs once for the whole file.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { CountBucket } from "$lib/shared/combination/domain/closure-types";
import {
  findLOOPCombinations,
  type LOOPCombinatorReport,
} from "$lib/shared/combination/services/loop-combinator";
import { admissibleClosures } from "$lib/shared/combination/services/loop-closure";
import { loadCombinationSteps } from "$lib/shared/combination/services/unit-search";

import {
  A_G_COUNT_BUCKET_PROFILE,
  A_G_FOUR_COUNT_WORDS,
  A_G_SIXTEEN_COUNT_WORDS,
  CROSS_WORLD_PAIR_FINGERPRINTS,
} from "./oracle-fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

const SWEEP_TIMEOUT_MS = 300_000;

let report: LOOPCombinatorReport;

const bucketFor = (count: number): CountBucket | undefined =>
  report.buckets.find((bucket) => bucket.count === count);

const wordsIn = (count: number): string[] =>
  [...(bucketFor(count)?.words ?? [])].sort();

beforeAll(async () => {
  await loadPictographDatasetForTests();
  const steps = await loadCombinationSteps(GridMode.DIAMOND);
  report = await findLOOPCombinations({
    cardALetters: new Set(["A"]),
    cardBLetters: new Set(["G"]),
    gridMode: GridMode.DIAMOND,
    steps,
  });
}, SWEEP_TIMEOUT_MS);

describe("A + G against the research oracle", () => {
  it("reproduces the pair's published fingerprint", () => {
    // 256, not 512: A and G are gap-involution partners — the same motion
    // character at opposite gaps — which is the one case the fingerprint law
    // halves. The figure is also the canary for the equivalence relation; an
    // early oracle that skipped the gap-orbit quotient reported 512 here.
    const expected = CROSS_WORLD_PAIR_FINGERPRINTS.find(
      (row) => row.cardA === "A" && row.cardB === "G"
    );
    const words = new Set(report.units.map((unit) => unit.word));
    expect(words.size).toBe(expected?.words);
  });

  it("reproduces the count-bucket profile exactly", () => {
    const measured = Object.fromEntries(
      report.buckets.map((bucket) => [bucket.count, bucket.words.length])
    );
    expect(measured).toEqual(A_G_COUNT_BUCKET_PROFILE);
  });

  it("holds exactly the ten plain 4-count words", () => {
    expect(wordsIn(4)).toEqual([...A_G_FOUR_COUNT_WORDS].sort());

    // Every one of them closes plain — the unit already ends where it started,
    // so one pass IS the circle.
    for (const combination of bucketFor(4)?.combinations ?? []) {
      expect(combination.closure.family).toBe("plain");
      expect(combination.unit.steps).toHaveLength(4);
    }
  });

  it("holds exactly the twelve quartered 16-count words, every one a mixed crossing", () => {
    expect(wordsIn(16)).toEqual([...A_G_SIXTEEN_COUNT_WORDS].sort());

    // The crossing law: shift crossings (D E F J K L) advance the loop 90
    // degrees and dash crossings (Phi Psi) advance it 180. Match them and the
    // unit closes plain at 4; mix them and a 90-degree residue survives, which
    // is what forces the quartered loop at 16.
    const SHIFT_CROSSINGS = new Set(["D", "E", "F", "J", "K", "L"]);
    const DASH_CROSSINGS = new Set(["Φ", "Ψ"]);

    for (const combination of bucketFor(16)?.combinations ?? []) {
      const letters = [...combination.displayWord];
      expect(letters.some((letter) => SHIFT_CROSSINGS.has(letter))).toBe(true);
      expect(letters.some((letter) => DASH_CROSSINGS.has(letter))).toBe(true);
      expect(combination.closure.circleMultiplier).toBe(4);
    }
  });

  it("emits no freeform result — every row re-validates as a LOOP", () => {
    expect(report.combinations.length).toBeGreaterThan(0);
    for (const combination of report.combinations) {
      const closures = admissibleClosures(
        combination.unit.startPlacement,
        combination.unit.endPlacement
      );
      expect(closures.map((closure) => closure.id)).toContain(
        combination.closure.id
      );
      expect(combination.circleCount).toBe(
        combination.unit.steps.length * combination.closure.circleMultiplier
      );
    }
  });

  it("stays inside its declared box, with both cards in every unit", () => {
    for (const unit of report.units) {
      expect(unit.steps.length).toBeLessThanOrEqual(report.box.maxUnitLength);
      expect(unit.connectorCount).toBeLessThanOrEqual(report.box.maxConnectors);
      expect(unit.word).toContain("A");
      expect(unit.word).toContain("G");
    }
  });

  it("reports the realization count as diagnostic, never as the answer", () => {
    // Counting realizations gives a number in the thousands for a pair whose
    // published fingerprint is 256 words. The equivalence relation is what
    // stands between the two, so both are reported and only one is a total.
    expect(report.rawUnitCount).toBeGreaterThan(report.units.length);
  });

  it("answers at the shape altitude, far above the word count", () => {
    // The 4-step results are one idea enumerated: card A, cross out, card B,
    // cross back. Four outbound crossers times four return crossers is sixteen
    // words of ONE shape, which is why the shape count is the headline and the
    // word count is the drill-down.
    expect(report.shapes.length).toBeLessThan(report.units.length);
    expect(report.shapeFamilies.length).toBeLessThanOrEqual(
      report.shapes.length
    );
    // One step of A, cross out, one step of G, cross back — the shape all ten
    // 4-count words and all twelve 16-count words share.
    expect(report.shapes).toContain("A1C1B1C1");

    const fourStep = report.units.filter((unit) => unit.steps.length === 4);
    expect(fourStep.length).toBeGreaterThan(0);
    for (const unit of fourStep) {
      // Two card runs and two crossings, however the entry point cut them.
      expect(unit.shapeFamily.split("C")).toHaveLength(3);
    }
  });
});
