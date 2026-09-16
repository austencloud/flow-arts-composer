/**
 * Layer 1, ambient arm — the ΦΨ pinch.
 *
 * Two cards that share no seam are not combinable from their own material at
 * any length; the reachability precheck proves that and says so. Ambient base
 * material changes the GRAPH, not the search: a Ψ step at alpha5 and a Φ step
 * at beta5 add two edges, and with them AAAA (alpha world) and HHHH (beta
 * world) suddenly close into Austen's AAAAΨHHΦ shape.
 *
 * The subtle part, and the reason this suite exists as its own file: the
 * precheck must consume the SAME expanded edge set the search walks. A precheck
 * that only knows card material would keep proclaiming AAAA + HHHH impossible
 * while the search was perfectly able to find results — an engine contradicting
 * its own theorem. So `impossible` is asserted BOTH ways here: it must survive
 * an empty ambient pool, and it must fall the moment a real bridge exists.
 *
 * And a bridge that only goes one way (Ψ: alpha→beta, nothing back) is the case
 * that separates a PROOF from a bounded empty search. Card-B seams genuinely
 * ARE reachable, so `impossible` must be false — and no closed walk exists, so
 * the results must be empty with `searchComplete` true. "Nothing up to here",
 * not "nothing ever".
 *
 * A provider is a COLLABORATOR, not an authority, and the second half of this
 * suite is about what happens when it misbehaves — a mislabelled seam, a letter
 * that is not the letter, a lookup that throws. None of those may produce an
 * unperformable sequence, a dishonest ingredient list, or a proof.
 *
 * Providers here are hand-built stubs over the verified fixtures. Wiring the
 * real `motionQueryHandler`-backed provider is Task 10.
 */

import { beforeAll, describe, expect, it } from "vitest";

import type {
  AmbientOptionProvider,
  CombinationResult,
  SeamState,
  WalkBlock,
} from "$lib/shared/combination/domain/types";
import { findCombinations } from "$lib/shared/combination/services/sequence-combinator";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

import {
  AAAA_CCW,
  FALG,
  GGGG_CW,
  HHHH_CCW,
  PHI_PSI_LOOP,
  PHI_STEP,
  PSI_STEP,
} from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

beforeAll(async () => {
  await loadPictographDatasetForTests();
}, 60_000);

// Stub providers

/** Ψ alpha5>beta1 and Φ beta5>alpha5 — the two-way pinch. */
const bothWays: AmbientOptionProvider = {
  async optionsAt(seam: SeamState) {
    if (seam === PSI_STEP.startPlacement) return [PSI_STEP];
    if (seam === PHI_STEP.startPlacement) return [PHI_STEP];
    return [];
  },
};

/** Ψ alpha5>beta1 only — a one-way door out of the alpha world. */
const psiOnly: AmbientOptionProvider = {
  async optionsAt(seam: SeamState) {
    return seam === PSI_STEP.startPlacement ? [PSI_STEP] : [];
  },
};

/** A provider that offers nothing anywhere. */
const barren: AmbientOptionProvider = {
  async optionsAt() {
    return [];
  },
};

/** A provider whose lookup is broken. */
const throwing: AmbientOptionProvider = {
  async optionsAt(seam: SeamState): Promise<readonly StepData[]> {
    throw new Error(`provider is down (asked about ${seam})`);
  },
};

// --- Malformed / mislabelled material -------------------------------------

/**
 * Ψ with a LIE for an end placement: its motions land the hands at beta1, but it
 * claims beta5. Splicing on the claim would join it to material whose props are
 * a quarter turn away — a sequence that closes on paper and teleports in the
 * hands.
 */
const PSI_MISLABELLED_END: StepData = createStepData({
  ...PSI_STEP,
  id: "psi-mislabelled-end",
  endPlacement: GridPlacement.BETA5,
});

/**
 * A genuine 1-turn Ψ: same seams, same hand path, one extra prop rotation. Real
 * vocabulary, and a DIFFERENT bridge from the 0-turn one — a performer feels the
 * turn. The dataframe carries no turns column, so it still letters as Ψ.
 */
const PSI_ONE_TURN: StepData = createStepData({
  ...PSI_STEP,
  id: "psi-one-turn",
  motions: {
    [HandSide.LEFT]: PSI_STEP.motions.left,
    [HandSide.RIGHT]: createMotionData({ ...PSI_STEP.motions.right, turns: 1 }),
  },
});

/**
 * FALG's first step — a verified F, beta5>alpha3 — wearing a Ψ label. The pool
 * filters on the letter it is handed, so this gets in; the splice re-derives
 * from the motions and gets F back. What the result CONTAINS is FL material,
 * and the ingredient list has to say FL.
 */
const F_LABELLED_PSI: StepData = createStepData({
  ...FALG.steps[0]!,
  id: "f-wearing-a-psi-label",
  letter: Letter.PSI,
});

/**
 * Every step of the ΦΨΦΨ loop, offered at its own start seam — so ambient steps
 * CHAIN: Φ beta5>alpha5 is followed by Ψ alpha5>beta1, both of the same base,
 * which is what `maxAmbientRun` has to cap.
 */
const chainable: AmbientOptionProvider = {
  async optionsAt(seam: SeamState) {
    return PHI_PSI_LOOP.steps.filter((step) => step.startPlacement === seam);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ambientBlocks(result: CombinationResult): WalkBlock[] {
  return result.blocks.filter((block) => block.kind === "ambient");
}

function lettersOf(result: CombinationResult): string {
  return result.sequence.steps.map((step) => step.letter ?? "?").join("");
}

/** Every rotation of a loop's word — a closed walk has no canonical entry. */
function wordRotations(word: string): string[] {
  const units = [...word];
  return units.map((_, k) =>
    [...units.slice(k), ...units.slice(0, k)].join("")
  );
}

function matchesUpToRotation(word: string, pattern: RegExp): boolean {
  return wordRotations(word).some((rotation) => pattern.test(rotation));
}

/**
 * The flagship shape: a run of card A, one Ψ across, a run of card B, one Φ
 * back. Derived rather than transcribed — see the AAAAΨHHΦ test below for the
 * seam arithmetic that fixes the run lengths.
 */
const A_PSI_H_PHI = /^A+ΨH+Φ$/;

describe("ambient base material — the ΦΨ pinch", () => {
  it("bridges AAAA and HHHH, which are impossible on card material alone", async () => {
    const withoutAmbient = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: false,
      maxResultLength: 8,
    });
    expect(withoutAmbient.impossible).toBe(true);
    expect(withoutAmbient.gridModeMismatch).toBe(false);
    expect(withoutAmbient.results).toHaveLength(0);

    const withAmbient = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxResultLength: 8,
      maxResults: 500,
    });
    expect(withAmbient.impossible).toBe(false);
    expect(withAmbient.results.length).toBeGreaterThan(0);

    // Every result here needs the bridge — there is no card-only walk.
    for (const result of withAmbient.results) {
      expect(result.usedAmbient, lettersOf(result)).toBe(true);
      expect(result.ambientWords).toContain("ΦΨ");
      expect(result.derivation).toContain("+ ΦΨ");
      expect(ambientBlocks(result).length).toBeGreaterThan(0);
    }

    const bridgeLetters = new Set(
      withAmbient.results.flatMap((result) =>
        ambientBlocks(result).flatMap((block) =>
          block.steps.map((step) => step.letter ?? "?")
        )
      )
    );
    expect(bridgeLetters).toContain("Ψ");
    expect(bridgeLetters).toContain("Φ");
  }, 120_000);

  it("finds Austen's AAAAΨHHΦ shape", async () => {
    // Seam arithmetic fixes the run lengths, so nothing here is guessed:
    //   Φ ENDS at alpha5 and Ψ STARTS at alpha5, so the card-A run between them
    //   leaves alpha5 and returns to it — and AAAA_CCW steps alpha by 90° each
    //   time, so that run is a whole 4-step cycle.
    //   Ψ lands at beta1 and Φ leaves from beta5, so the card-B run is beta1 ->
    //   beta3 -> beta5: two H steps.
    // Total 4 + 1 + 2 + 1 = 8.
    //
    // Measured 2026-08-04 at these options: 336 results, search complete to
    // length 8, and this shape LEADS the page —
    //   AAAAΨHHΦ | SEQUENTIAL | period 2 | = A + H + ΦΨ
    //   blocks: A@3x4 + ambient:ΦΨ + B id@0x2 + ambient:ΦΨ
    // The lead is asserted only as far as the verdict, because presentation
    // order belongs to `walk-classifier`'s ranking tests, not to this one.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxResultLength: 8,
      maxResults: 500,
    });

    const flagship = report.results.find((result) =>
      matchesUpToRotation(result.sequence.word ?? "", A_PSI_H_PHI)
    );
    expect(
      flagship,
      `expected an A+ΨH+Φ loop; got ${report.results
        .map((r) => r.sequence.word)
        .join(", ")}`
    ).toBeDefined();

    expect(flagship!.sequence.steps.length).toBe(8);
    expect(lettersOf(flagship!)).toBe(flagship!.sequence.word);
    // Two card runs, one per card: bridges are excluded from the block count,
    // so a concatenation stays a concatenation however it was stitched.
    expect(flagship!.verdict).toBe("SEQUENTIAL");
    expect(matchesUpToRotation(lettersOf(flagship!), /^AAAAΨHHΦ$/)).toBe(true);

    // Two single-step ambient blocks, one per bridge letter, and both cards
    // present — the bridge is connective tissue, not a third ingredient.
    const bridges = ambientBlocks(flagship!);
    expect(bridges).toHaveLength(2);
    expect(bridges.every((block) => block.steps.length === 1)).toBe(true);
    expect(bridges.every((block) => block.ambientWord === "ΦΨ")).toBe(true);
    expect(bridges.every((block) => block.startStepIndex === -1)).toBe(true);
    expect(flagship!.cardAShare).toBeGreaterThan(0);
    expect(flagship!.cardBShare).toBeGreaterThan(0);
    // Shares divide the CARD steps (4 A + 2 H), not the 8 total.
    expect(flagship!.cardAShare + flagship!.cardBShare).toBeCloseTo(1, 10);
    expect(flagship!.cardAShare).toBeCloseTo(4 / 6, 10);

    // Placement continuity, wrap included, exactly as for a card-only walk.
    const steps = flagship!.sequence.steps;
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.startPlacement).toBe(steps[i - 1]!.endPlacement);
    }
    expect(steps[0]!.startPlacement).toBe(steps.at(-1)!.endPlacement);
  }, 120_000);

  it("keeps proving impossibility when the ambient pool is empty", async () => {
    // Ambient ON, provider present, and it offers nothing: the edge set is
    // unchanged, so the structural proof stands. `allowAmbient` is not a reason
    // to weaken a theorem.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: barren,
      maxResultLength: 8,
    });
    expect(report.impossible).toBe(true);
    expect(report.results).toHaveLength(0);
    expect(report.searchComplete).toBe(true);
    expect(report.budgetExhausted).toBe(false);

    // Same answer with no provider at all.
    const noProvider = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      maxResultLength: 8,
    });
    expect(noProvider.impossible).toBe(true);
  }, 120_000);

  it("refuses to call a one-way bridge impossible, and refuses to call it a result", async () => {
    // Ψ alone reaches the beta world, so card-B seams ARE reachable and the
    // precheck must stay silent. But nothing comes back, so no closed walk
    // exists — and the honest report of that is an empty, COMPLETE search, not
    // an impossibility proof.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: psiOnly,
      maxResultLength: 6,
      maxResults: 500,
      searchBudget: 2_000_000,
    });
    expect(report.impossible).toBe(false);
    expect(report.gridModeMismatch).toBe(false);
    expect(report.results).toHaveLength(0);
    expect(report.searchComplete).toBe(true);
    expect(report.searchedToLength).toBe(6);
    expect(report.budgetExhausted).toBe(false);
  }, 120_000);

  it("never lets ambient material stand in for the second card", async () => {
    // AAAA + GGGG with a one-way Ψ: the alpha card plus all the bridge material
    // in the world still cannot make a loop that contains a G, because nothing
    // returns from the beta world. A result of "card A + ambient" is not a
    // combination and must never be emitted.
    const report = await findCombinations(AAAA_CCW, GGGG_CW, {
      allowAmbient: true,
      ambientProvider: psiOnly,
      maxResultLength: 6,
      maxResults: 500,
      searchBudget: 2_000_000,
    });
    expect(report.impossible).toBe(false);
    expect(report.results).toHaveLength(0);
    expect(report.searchComplete).toBe(true);
  }, 120_000);

  it("caps consecutive ambient steps at maxAmbientRun", async () => {
    const options = {
      allowAmbient: true,
      ambientProvider: chainable,
      maxResultLength: 6,
      maxResults: 500,
    } as const;

    const runOfTwo = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...options,
      maxAmbientRun: 2,
    });
    const chained = runOfTwo.results.find((result) =>
      ambientBlocks(result).some((block) => block.steps.length >= 2)
    );
    expect(
      chained,
      "expected a 2-step ambient run (Φ beta5>alpha5 then Ψ alpha5>beta1)"
    ).toBeDefined();

    const runOfOne = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...options,
      maxAmbientRun: 1,
    });
    expect(runOfOne.results.length).toBeGreaterThan(0);
    for (const result of runOfOne.results) {
      for (const block of ambientBlocks(result)) {
        expect(block.steps.length, lettersOf(result)).toBe(1);
      }
      // A cap of one also forbids two ambient blocks meeting end to end.
      result.blocks.forEach((block, i) => {
        if (block.kind !== "ambient") return;
        const next = result.blocks[(i + 1) % result.blocks.length]!;
        expect(next.kind, lettersOf(result)).not.toBe("ambient");
      });
    }
  }, 120_000);

  it("ranks pure-card results above anything that needed a bridge", async () => {
    // GGGG + HHHH combine on their own material, and the stub's Φ sits right on
    // beta5 — so both kinds of result exist in one page. The card-only answer is
    // the one a performer asked for; the bridge is the fallback.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxResultLength: 6,
      maxResults: 200,
    });

    const pure = report.results.filter((result) => !result.usedAmbient);
    expect(
      pure.length,
      "expected card-only results to survive"
    ).toBeGreaterThan(0);
    // `samplerSlice` fills the page across shapes, so ambient results may appear
    // further down — but the LEAD is always the top-ranked result overall, and
    // ranking key 1 puts ambient last.
    expect(report.results[0]!.usedAmbient).toBe(false);
    for (const result of pure) {
      expect(result.ambientWords).toHaveLength(0);
      expect(result.derivation).not.toContain("Φ");
    }
  }, 120_000);

  it("keeps bridges out of minBlockSize, which is a floor on CARD blocks", async () => {
    // minBlockSize 2 says "do not cut a card into single steps". It says nothing
    // about bridges — their length is `maxAmbientRun`'s business — and applying
    // it to them would delete AAAAΨHHΦ, whose Ψ and Φ are one step each.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: bothWays,
      minBlockSize: 2,
      maxResultLength: 8,
      maxResults: 500,
    });

    const flagship = report.results.find((result) =>
      matchesUpToRotation(result.sequence.word ?? "", A_PSI_H_PHI)
    );
    expect(
      flagship,
      "minBlockSize 2 must not outlaw a one-step bridge"
    ).toBeDefined();
    expect(ambientBlocks(flagship!).every((b) => b.steps.length === 1)).toBe(
      true
    );

    // The card floor is still enforced on card blocks, everywhere.
    for (const result of report.results) {
      for (const block of result.blocks) {
        if (block.kind === "ambient") continue;
        expect(block.steps.length, lettersOf(result)).toBeGreaterThanOrEqual(2);
      }
    }
  }, 120_000);

  it("treats two bridges at the same seams as two bridges", async () => {
    // A 0-turn Ψ and a 1-turn Ψ occupy the same seams and carry the same letter.
    // Keying the walk signature on letter-plus-seams would collapse every
    // combination using one onto the combination using the other; keying it on
    // step CONTENT keeps both, which is why offering both must find strictly
    // more.
    const options = {
      allowAmbient: true,
      maxResultLength: 8,
      maxResults: 2000,
    } as const;

    const oneBridge = await findCombinations(AAAA_CCW, HHHH_CCW, {
      ...options,
      ambientProvider: bothWays,
    });
    const twoBridges = await findCombinations(AAAA_CCW, HHHH_CCW, {
      ...options,
      ambientProvider: {
        async optionsAt(seam: SeamState) {
          if (seam === PSI_STEP.startPlacement) return [PSI_STEP, PSI_ONE_TURN];
          if (seam === PHI_STEP.startPlacement) return [PHI_STEP];
          return [];
        },
      },
    });

    expect(oneBridge.results.length).toBeGreaterThan(0);
    expect(twoBridges.results.length).toBeGreaterThan(oneBridge.results.length);

    // And the same step offered twice is still one bridge — the pool dedups on
    // the same content key, so a duplicated option cannot double the answer.
    const duplicated = await findCombinations(AAAA_CCW, HHHH_CCW, {
      ...options,
      ambientProvider: {
        async optionsAt(seam: SeamState) {
          if (seam === PSI_STEP.startPlacement) return [PSI_STEP, PSI_STEP];
          if (seam === PHI_STEP.startPlacement) return [PHI_STEP, PHI_STEP];
          return [];
        },
      },
    });
    expect(duplicated.results.map((r) => r.sequence.word)).toEqual(
      oneBridge.results.map((r) => r.sequence.word)
    );
  }, 180_000);

  it("rejects a bridge step whose placement labels contradict its own motions", async () => {
    // The mislabelled Ψ claims to end at beta5; its hands land at beta1. Accept
    // it and the walk splices card material onto props that are not there.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: {
        async optionsAt(seam: SeamState) {
          if (seam === PSI_STEP.startPlacement) return [PSI_MISLABELLED_END];
          if (seam === PHI_STEP.startPlacement) return [PHI_STEP];
          return [];
        },
      },
      maxResultLength: 8,
      maxResults: 500,
    });

    // With the only alpha->beta door rejected, the beta world is unreachable
    // again — the same answer as offering nothing at all.
    expect(report.results).toHaveLength(0);
    expect(report.impossible).toBe(true);
  }, 120_000);

  it("names the ingredient the result CONTAINS, not the one the provider claimed", async () => {
    // The provider hands over FALG's F step wearing a Ψ label. The splice
    // re-derives letters from the motions and gets F back, so the honest
    // ingredient is FL — printing the provider's ΦΨ would be a lie about what
    // is in the sequence.
    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: {
        async optionsAt(seam: SeamState) {
          if (seam === PSI_STEP.startPlacement) return [PSI_STEP];
          if (seam === F_LABELLED_PSI.startPlacement) return [F_LABELLED_PSI];
          return [];
        },
      },
      maxResultLength: 8,
      maxResults: 1000,
    });

    const mislabelled = report.results.find((result) =>
      result.ambientWords.includes("FL")
    );
    expect(
      mislabelled,
      `expected an FL-bridged result; got ${[
        ...new Set(report.results.flatMap((r) => r.ambientWords)),
      ].join(", ")}`
    ).toBeDefined();

    // The block still records what the provider said — that is provenance — but
    // the ingredient list and the derivation sentence report the truth.
    const lie = mislabelled!.blocks.find(
      (block) => block.kind === "ambient" && block.ambientWord === "ΦΨ"
    );
    expect(
      lie,
      "the provider's own claim is preserved on the block"
    ).toBeDefined();
    expect(mislabelled!.derivation).toContain("FL");
    expect(lettersOf(mislabelled!)).toContain("F");
  }, 120_000);

  it("survives a broken provider without inventing a proof", async () => {
    // A provider that throws leaves a SMALLER graph than the real one, and a
    // smaller graph can only ever manufacture a false impossibility. So the
    // search degrades to card material and the theorem is withheld.
    const pureCards = await findCombinations(GGGG_CW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: throwing,
      maxResultLength: 6,
      maxResults: 200,
    });
    expect(pureCards.results.length).toBeGreaterThan(0);
    expect(pureCards.results.every((r) => !r.usedAmbient)).toBe(true);
    expect(pureCards.impossible).toBe(false);

    // The sharp case: card material alone cannot bridge these two, and without
    // the failure this would be a true `impossible`. A failed lookup must not
    // be allowed to prove it.
    const unbridgeable = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: throwing,
      maxResultLength: 6,
    });
    expect(unbridgeable.results).toHaveLength(0);
    expect(unbridgeable.impossible).toBe(false);
    expect(unbridgeable.searchComplete).toBe(false);
  }, 120_000);

  it("reports the run cap its claims are relative to", async () => {
    // "Impossible" is never absolute — it holds under the liberties and the
    // bridge length the search actually ran with. The cap rides along so a
    // caller can say which.
    const off = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: false,
      maxResultLength: 6,
    });
    expect(off.impossible).toBe(true);
    expect(off.ambientRunCap).toBe(0);

    // A provider present but ambient disabled is still a card-only claim.
    const disabled = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: false,
      ambientProvider: bothWays,
      maxResultLength: 6,
    });
    expect(disabled.impossible).toBe(true);
    expect(disabled.ambientRunCap).toBe(0);

    // Same pair, same liberties, cap 2 — and the claim flips.
    const on = await findCombinations(AAAA_CCW, HHHH_CCW, {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxAmbientRun: 2,
      maxResultLength: 8,
      maxResults: 50,
    });
    expect(on.impossible).toBe(false);
    expect(on.ambientRunCap).toBe(2);

    // A grid-mode mismatch never consults a bridge, and says so.
    const boxish = { ...HHHH_CCW, gridMode: "box" as never };
    const mismatch = await findCombinations(AAAA_CCW, boxish, {
      allowAmbient: true,
      ambientProvider: bothWays,
    });
    expect(mismatch.gridModeMismatch).toBe(true);
    expect(mismatch.ambientRunCap).toBe(0);
  }, 120_000);

  it("samples bridged and pure answers of the same shape as different answers", async () => {
    // "These two cards concatenate" and "these two cards concatenate IF you drop
    // a ΦΨ between them" are different answers to the user's question. Bucketing
    // the page on (verdict, length) alone would show whichever ranked first and
    // hide the other entirely.
    const options = {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxResultLength: 6,
    } as const;

    const shapeKey = (result: CombinationResult) =>
      `${result.verdict}:${result.sequence.steps.length}`;

    const everything = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...options,
      maxResults: 5000,
    });
    const pureShapes = new Set(
      everything.results.filter((r) => !r.usedAmbient).map(shapeKey)
    );
    const bridgedShapes = new Set(
      everything.results.filter((r) => r.usedAmbient).map(shapeKey)
    );
    const contested = [...pureShapes].filter((key) => bridgedShapes.has(key));
    expect(
      contested.length,
      "no shape exists in both forms — the test would be vacuous"
    ).toBeGreaterThan(0);

    const page = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...options,
      maxResults: 24,
    });
    const onPage = (key: string, bridged: boolean) =>
      page.results.some(
        (r) => shapeKey(r) === key && r.usedAmbient === bridged
      );

    expect(
      contested.some((key) => onPage(key, false) && onPage(key, true)),
      `expected one page to carry both forms of a contested shape (${contested.join(", ")})`
    ).toBe(true);
  }, 180_000);

  it("is deterministic with ambient enabled", async () => {
    const options = {
      allowAmbient: true,
      ambientProvider: bothWays,
      maxResultLength: 8,
      maxResults: 40,
    } as const;

    const first = await findCombinations(AAAA_CCW, HHHH_CCW, options);
    const second = await findCombinations(AAAA_CCW, HHHH_CCW, options);

    expect(second.results.map((r) => r.sequence.word)).toEqual(
      first.results.map((r) => r.sequence.word)
    );
    expect(second.results.map((r) => r.sequence.id)).toEqual(
      first.results.map((r) => r.sequence.id)
    );
    expect(second.results.map((r) => r.usedAmbient)).toEqual(
      first.results.map((r) => r.usedAmbient)
    );
    expect(second.searchedToLength).toBe(first.searchedToLength);
    expect(second.searchComplete).toBe(first.searchComplete);
  }, 120_000);
});
