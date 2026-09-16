/**
 * Layer 1 core — the seam-graph closed-walk search.
 *
 * Three things this suite pins:
 *   1. Every result is a CLOSED loop with placement continuity at every seam,
 *      including the wrap from the last step back to the first.
 *   2. `impossible` is a STRUCTURAL proof and nothing else. AAAA (alpha world)
 *      + GGGG (beta world) is answered by the reachability precheck — at
 *      default options, without searching — and an empty bounded search never
 *      claims it.
 *   3. The bounded claims are separable: `searchedToLength`, `resultsTruncated`
 *      and `budgetExhausted` each say a different true thing.
 *
 * Ambient bridging is Task 9; every call here runs with `allowAmbient: false`.
 *
 * The GG/HH calls raise `maxResults` above the default because the classifier
 * RANKS before it slices: a default page of 24 is the two dozen most
 * card-worthy results, and the shapes under test here (a 2-block concatenation
 * AND a 4-block interleave) only coexist in a wider slice. Nothing about the
 * search itself is relaxed — `rawWalkCap`, not `maxResults`, is what bounds
 * how much of the space is looked at.
 */

import { beforeAll, describe, expect, it } from "vitest";

import type {
  CombinationSearchReport,
  WalkBlock,
} from "$lib/shared/combination/domain/types";
import { findCombinations } from "$lib/shared/combination/services/sequence-combinator";
import { contentDedupKey } from "$lib/shared/combination/services/walk-classifier";

import { AAAA_CCW, FALG, GGGG_CW, HHHH_CCW, HHHH_CW } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

/** Rotation-faithful twins re-derive their letters from the dataframe. */
beforeAll(async () => {
  await loadPictographDatasetForTests();
}, 60_000);

const GH_OPTIONS = {
  allowAmbient: false,
  maxResultLength: 8,
  maxResults: 200,
} as const;

let ghReport: CombinationSearchReport | null = null;

/** One search shared by the shape/continuity assertions below. */
async function gh(): Promise<CombinationSearchReport> {
  ghReport ??= await findCombinations(GGGG_CW, HHHH_CCW, GH_OPTIONS);
  return ghReport;
}

/**
 * Every fixture loop is 4 steps and no transform changes step count, so every
 * source in a GGGG/HHHH search is 4 long — which is what lets these tests do
 * cyclic index arithmetic without the engine exposing its source table.
 */
const FIXTURE_CYCLE = 4;

/** Blocks in cyclic walk order, paired with their successor. */
function adjacentPairs(blocks: readonly WalkBlock[]): [WalkBlock, WalkBlock][] {
  return blocks.map((block, i) => [block, blocks[(i + 1) % blocks.length]!]);
}

function isCyclicallyContiguous(
  before: WalkBlock,
  after: WalkBlock,
  cycle: number
): boolean {
  return (
    before.sourceId === after.sourceId &&
    (before.startStepIndex + before.steps.length) % cycle ===
      after.startStepIndex % cycle
  );
}

describe("sequence combinator — walk search", () => {
  it("finds a sequential (2-block) combination of GGGG + HHHH", async () => {
    const report = await gh();
    expect(report.gridModeMismatch).toBe(false);
    expect(report.impossible).toBe(false);
    expect(report.results.length).toBeGreaterThan(0);

    const sequential = report.results.find((r) => r.blocks.length === 2);
    expect(sequential, "expected a two-block concatenation").toBeDefined();
    expect(sequential!.sequence.steps.length).toBe(
      sequential!.blocks[0]!.steps.length + sequential!.blocks[1]!.steps.length
    );
  });

  it("finds an interleaved (4+ block) combination carrying both letters", async () => {
    const report = await gh();
    const fused = report.results.find((r) => r.blocks.length >= 4);
    expect(fused, "expected a four-block interleave").toBeDefined();

    const letters = fused!.sequence.steps.map((s) => s.letter ?? "").join("");
    expect(letters).toMatch(/G/);
    expect(letters).toMatch(/H/);
  });

  it("every result is a closed loop with placement continuity", async () => {
    const report = await gh();
    expect(report.results.length).toBeGreaterThan(0);

    for (const result of report.results) {
      const steps = result.sequence.steps;
      expect(steps.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]!.startPlacement, result.canonicalHash).toBe(
          steps[i - 1]!.endPlacement
        );
      }
      expect(steps[0]!.startPlacement, result.canonicalHash).toBe(
        steps.at(-1)!.endPlacement
      );
      expect(steps.map((s) => s.stepNumber)).toEqual(
        steps.map((_, i) => i + 1)
      );
    }
  });

  it("every result draws material from BOTH cards and names its B variants", async () => {
    const report = await gh();
    for (const result of report.results) {
      expect(result.cardAShare, result.canonicalHash).toBeGreaterThan(0);
      expect(result.cardBShare, result.canonicalHash).toBeGreaterThan(0);
      expect(result.cardAShare + result.cardBShare).toBeCloseTo(1, 10);

      // A list, because one combination may mix B variants (FALG is its own
      // proof of that). Non-empty follows from cardBShare > 0.
      expect(result.variantsB.length, result.canonicalHash).toBeGreaterThan(0);
      expect(result.variantsB.length).toBeLessThanOrEqual(
        result.blocks.filter((b) => b.kind === "cardB").length
      );
    }
  });

  it("anchors on card A's twin, not only its identity", async () => {
    // twin(GGGG_CW) is HHHH_CW, and HHHH_CCW's own twin supplies the returning
    // step — so a real 2-step combination exists whose ONLY card-A material is
    // the twin. Anchoring solely on the identity source would never reach it.
    const report = await gh();
    const twinOnly = report.results.find((r) => {
      const aBlocks = r.blocks.filter((b) => b.kind === "cardA");
      return (
        aBlocks.length > 0 && aBlocks.every((b) => b.sourceId === "A twin")
      );
    });
    expect(twinOnly, "expected a twin-anchored combination").toBeDefined();
  });

  it("records each walk in its canonical block partition", async () => {
    // Entering a run mid-way splits it across the walk's first and last block.
    // Those get rejoined before recording, so no result may end with a block
    // that is cyclically contiguous with the one it starts with.
    const report = await gh();
    for (const result of report.results) {
      const first = result.blocks[0]!;
      const last = result.blocks.at(-1)!;
      expect(
        isCyclicallyContiguous(last, first, FIXTURE_CYCLE),
        `${result.canonicalHash} kept a wrap-split block pair`
      ).toBe(false);
    }
  });

  it("separates truncation, budget and depth in its report", async () => {
    const report = await gh();
    // 200 results asked for, the space is far bigger: the raw-walk cap fires,
    // which is a healthy "more exist", NOT an error and NOT impossibility.
    expect(report.resultsTruncated).toBe(true);
    expect(report.budgetExhausted).toBe(false);
    expect(report.searchComplete).toBe(false);
    expect(report.impossible).toBe(false);
    expect(report.searchedToLength).toBeGreaterThanOrEqual(0);
    expect(report.searchedToLength).toBeLessThanOrEqual(
      GH_OPTIONS.maxResultLength
    );
  });

  it("re-enters card A at a different phase of its own cycle", async () => {
    // FALG passes beta5 twice (steps 1 and 5) and alpha3 twice (steps 2 and 6),
    // so leaving FALG at one alpha3 and rejoining at the other is a legal —
    // and musically real — move. Only the step the extend branch would have
    // taken is excluded, so the two card-A blocks must be a genuine re-entry.
    const report = await findCombinations(FALG, GGGG_CW, {
      allowAmbient: false,
      maxResultLength: 5,
      maxResults: 5_000,
      allowMirror: false,
      allowRotation: false,
      allowHandSwap: false,
      exploreRotationFaithful: false,
    });

    const cycle = FALG.steps.length;
    const reentry = report.results.find((r) =>
      adjacentPairs(r.blocks).some(
        ([before, after]) =>
          before.sourceId === after.sourceId &&
          !isCyclicallyContiguous(before, after, cycle)
      )
    );
    expect(reentry, "expected a same-source re-entry").toBeDefined();
    expect(reentry!.cardBShare).toBeGreaterThan(0);
  }, 60_000);

  it("proves AAAA + GGGG impossible at DEFAULT options, without searching", async () => {
    // No spatial/colour/twin transform moves a placement family, so no card-B
    // seam is reachable from any card-A seam. The precheck settles that in
    // O(seams) for EVERY length — the old bounded sweep could only have said
    // "nothing up to 8", and at the default length 32 it would have run out of
    // budget and proven nothing at all.
    const report = await findCombinations(AAAA_CCW, GGGG_CW, {
      allowAmbient: false,
    });
    expect(report.results).toHaveLength(0);
    expect(report.impossible).toBe(true);
    expect(report.gridModeMismatch).toBe(false);
    expect(report.searchComplete).toBe(true);
    // The search never ran: no budget was consumed and the claim covers the
    // whole requested depth.
    expect(report.budgetExhausted).toBe(false);
    expect(report.resultsTruncated).toBe(false);
    expect(report.searchedToLength).toBe(32);

    // A budget of one node cannot change a structural answer.
    const starved = await findCombinations(AAAA_CCW, GGGG_CW, {
      allowAmbient: false,
      searchBudget: 1,
    });
    expect(starved.impossible).toBe(true);
    expect(starved.budgetExhausted).toBe(false);
  }, 60_000);

  it("treats a card with no steps as unreachable, not as a search", async () => {
    const empty = { ...HHHH_CCW, steps: [] };
    const report = await findCombinations(GGGG_CW, empty, {
      allowAmbient: false,
    });
    expect(report.results).toHaveLength(0);
    expect(report.impossible).toBe(true);
    expect(report.gridModeMismatch).toBe(false);
    expect(report.budgetExhausted).toBe(false);
  }, 60_000);

  it("dedups rotations of the same closed walk", async () => {
    // Both cards are 4-fold symmetric — GGGG's rotation-faithful twin IS
    // HHHH_CW — so the SAME cyclic walk is reachable from several card-A start
    // indices, each entering at a different phase. Without rotation-canonical
    // dedup every such walk would be reported once per phase.
    //
    // maxResultLength 4 keeps this EXHAUSTIVE, so the assertion is over the
    // whole space rather than over whatever the budget happened to reach.
    const report = await findCombinations(GGGG_CW, HHHH_CW, {
      allowAmbient: false,
      maxResultLength: 4,
      maxResults: 100_000,
    });
    expect(report.searchComplete).toBe(true);
    expect(report.searchedToLength).toBe(4);
    expect(report.results.length).toBeGreaterThan(0);

    // `contentDedupKey`, not `canonicalHash`. The latter is the canonicalizer's
    // label, and on this pair it collides hard — 235 distinct loops share 60
    // values, because its beat signatures use location DELTAS with no spatial
    // normalization applied (sequence-canonicalizer.ts:37), so every rotation
    // of a walk hashes alike. Identity lives on the dedup key.
    const keys = report.results.map((r) => contentDedupKey(r.sequence));
    expect(new Set(keys).size).toBe(keys.length);

    // Re-derive the rotation classes independently of the engine's own key:
    // per step, (source, step identity), canonicalized by rotation. Two results
    // landing in the same class would mean the same loop reported twice.
    const rotationClass = (blocks: readonly WalkBlock[]): string => {
      const keys = blocks.flatMap((b) =>
        b.steps.map((s) => `${b.sourceId}#${s.id}`)
      );
      let best = keys.join(">");
      for (let k = 1; k < keys.length; k++) {
        const rotated = [...keys.slice(k), ...keys.slice(0, k)].join(">");
        if (rotated < best) best = rotated;
      }
      return best;
    };
    const classes = report.results.map((r) => rotationClass(r.blocks));
    expect(new Set(classes).size).toBe(classes.length);
  }, 120_000);

  it("is deterministic — same inputs, same results in the same order", async () => {
    const options = {
      allowAmbient: false,
      maxResultLength: 6,
      maxResults: 40,
    };
    const first = await findCombinations(GGGG_CW, HHHH_CCW, options);
    const second = await findCombinations(GGGG_CW, HHHH_CCW, options);

    expect(second.results.map((r) => r.canonicalHash)).toEqual(
      first.results.map((r) => r.canonicalHash)
    );
    expect(second.results.map((r) => r.sequence.word)).toEqual(
      first.results.map((r) => r.sequence.word)
    );
    expect(second.searchComplete).toBe(first.searchComplete);
    expect(second.searchedToLength).toBe(first.searchedToLength);
  }, 60_000);

  it("reports a grid-mode mismatch instead of searching", async () => {
    const boxish = { ...HHHH_CCW, gridMode: "box" as never };
    const report = await findCombinations(GGGG_CW, boxish, {
      allowAmbient: false,
    });
    expect(report.gridModeMismatch).toBe(true);
    expect(report.results).toHaveLength(0);
    expect(report.impossible).toBe(true);
    expect(report.searchComplete).toBe(true);
  });

  it("clamps maxResultLength to a walkable range", async () => {
    const tooShort = await findCombinations(GGGG_CW, HHHH_CCW, {
      allowAmbient: false,
      maxResultLength: 0,
      maxResults: 5,
    });
    // Clamped up to 2 — the shortest closed walk there can be.
    expect(tooShort.searchedToLength).toBeLessThanOrEqual(2);
    for (const r of tooShort.results) {
      expect(r.sequence.steps.length).toBeLessThanOrEqual(2);
    }

    const tooLong = await findCombinations(AAAA_CCW, GGGG_CW, {
      allowAmbient: false,
      maxResultLength: 4096,
    });
    // Clamped down to 64, which the precheck then reports as fully covered.
    expect(tooLong.searchedToLength).toBe(64);
  }, 60_000);
});
