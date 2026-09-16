/**
 * Layer 2 — verdicts, content dedup and ranking.
 *
 * The search hands over closed walks; this layer decides what they MEAN and
 * which of them a human should see first. Three claims carry the suite:
 *
 *   1. The verdict is read off the block shape against each card's REPEAT UNIT,
 *      so "two G steps" (GGGG's unit is one step) and "two FALG steps" (unit
 *      four) are labelled differently even though both are two-step blocks.
 *      Alternation is judged around the CYCLE, because a combination is a loop.
 *   2. Dedup is on CONTENT and is PHASE-INVARIANT — the same loop entered at a
 *      different step is the same loop. `SequenceCanonicalizer` is not
 *      phase-invariant (three defects cited on `contentDedupKey`), which is why
 *      its hash is carried as a label and never deduped on.
 *   3. The presentation order is NOT the search's shortest-first order. That
 *      was a measured problem at Task 6: the shortest walks of GGGG + HHHH are
 *      two-step "one G, one H" loops, and a default page of 24 filled up with
 *      them.
 *
 * Every expected string here is DISPLAY-layer output (`simplifyRepeatedWord`),
 * so "GGGG" reads as "G" — the data layer's full expansion still lives on
 * `sequence.word`.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  COMBINATOR_DEFAULTS,
  type CombinationResult,
  type WalkBlock,
  type WalkSource,
} from "$lib/shared/combination/domain/types";
import { findCombinations } from "$lib/shared/combination/services/sequence-combinator";
import {
  classifyAndRank,
  classifyBlocks,
  contentDedupKey,
  rankResults,
  type RawWalk,
} from "$lib/shared/combination/services/walk-classifier";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

import { FALG, GGGG_CW, GHGH, HHHH_CCW } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

/** Letter re-derivation and the twin sources both read the real dataframe. */
beforeAll(async () => {
  await loadPictographDatasetForTests();
}, 60_000);

const NO_AMBIENT = { allowAmbient: false } as const;

/** `cardA:1+cardB:2` — the block shape, for readable failure messages. */
function shapeOf(result: CombinationResult): string {
  return result.blocks.map((b) => `${b.kind}:${b.steps.length}`).join("+");
}

function cardBlocks(result: CombinationResult): readonly WalkBlock[] {
  return result.blocks.filter((b) => b.kind !== "ambient");
}

/** A block of arbitrary material, for exercising `classifyBlocks` directly. */
function block(kind: "cardA" | "cardB", steps: readonly StepData[]): WalkBlock {
  return {
    sourceId: kind === "cardA" ? "A" : "B id",
    kind,
    startStepIndex: 0,
    steps,
    rotationFaithful: false,
  };
}

/** `n` steps of FALG material, cycling — the content is irrelevant to shape. */
function falgSteps(n: number): StepData[] {
  return Array.from(
    { length: n },
    (_, i) => FALG.steps[i % FALG.steps.length]!
  );
}

function gSteps(n: number): StepData[] {
  return Array.from(
    { length: n },
    (_, i) => GGGG_CW.steps[i % GGGG_CW.steps.length]!
  );
}

describe("walk classifier — verdicts", () => {
  it("labels a two-run walk SEQUENTIAL and a whole-unit interleave FUSED", async () => {
    // GGGG and HHHH each simplify to a one-letter word, so their repeat unit is
    // ONE step: every single-step block is already a whole unit, and the only
    // thing separating these two verdicts is how many runs the walk has.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...NO_AMBIENT,
      maxResultLength: 4,
      maxResults: 200,
    });
    expect(report.results.length).toBeGreaterThan(0);

    const sequential = report.results.find((r) => r.verdict === "SEQUENTIAL");
    expect(sequential, "expected a SEQUENTIAL result").toBeDefined();
    expect(cardBlocks(sequential!)).toHaveLength(2);

    const fused = report.results.find((r) => r.verdict === "FUSED");
    expect(fused, "expected a FUSED result").toBeDefined();
    expect(cardBlocks(fused!).length).toBeGreaterThan(2);

    // Every result carries one of the four verdicts — no stub label survives.
    for (const result of report.results) {
      expect(
        ["SEQUENTIAL", "FUSED", "BRAIDED", "HYBRID"],
        result.canonicalHash
      ).toContain(result.verdict);
    }
  }, 120_000);

  it("requires alternation around the WRAP, not just along the list", () => {
    // Austen's DJDJ + GGGG -> DJGGDJGG: two steps of card A, two of card B,
    // twice round. It alternates at every seam INCLUDING the one from the last
    // GG back into the first DJ, so it is FUSED. GHGH (unit 2) + GGGG (unit 1)
    // stands in for DJ here — same shape, fixtures we already trust.
    const djggdjgg = [
      block("cardA", gSteps(2)),
      block("cardB", gSteps(2)),
      block("cardA", gSteps(2)),
      block("cardB", gSteps(2)),
    ];
    expect(classifyBlocks(djggdjgg, 2, 1)).toBe("FUSED");

    // A, B, A alternates along the list and NOT around the cycle: the last A
    // run hands straight back to the first A run, which a performer plays as
    // one long A. Odd card-block counts can never two-colour a cycle, so this
    // is HYBRID however the runs are sized.
    const reentry = [
      block("cardA", gSteps(2)),
      block("cardB", gSteps(2)),
      block("cardA", gSteps(2)),
    ];
    expect(classifyBlocks(reentry, 2, 1)).toBe("HYBRID");

    // Every FUSED result a real search emits obeys the cyclic rule.
    // (Checked against the search in the ranking suite below too.)
    expect(classifyBlocks([...djggdjgg].reverse(), 2, 1)).toBe("FUSED");
  });

  it("labels a cut inside FALG's repeat unit BRAIDED", async () => {
    // FALG's word does not repeat, so its unit is its four letters — a one- or
    // two-step FALG block is a cut INSIDE the unit, which is exactly what
    // BRAIDED names. GGGG's unit is one step, so the G side can never trigger
    // it; the label here is about card A alone.
    const report = await findCombinations(FALG, GGGG_CW, {
      ...NO_AMBIENT,
      maxResultLength: 5,
      maxResults: 200,
    });

    const braided = report.results.filter((r) => r.verdict === "BRAIDED");
    expect(braided.length, "expected a BRAIDED result").toBeGreaterThan(0);

    for (const result of braided) {
      const cut = result.blocks.filter(
        (b) => b.kind === "cardA" && b.steps.length % 4 !== 0
      );
      expect(cut.length, shapeOf(result)).toBeGreaterThan(0);
    }
  }, 120_000);

  it("calls FIVE steps of a unit-four card BRAIDED, not merely short ones", () => {
    // The predicate is "not a whole number of units", not "shorter than one
    // unit". A 5-step FALG block runs one whole unit and then stops one step
    // into the second — the same mid-unit cut a 1-step block makes, and the
    // same thing `wholeUnitsOnly` filters out. Reading it as "long enough,
    // therefore fine" would let the two disagree.
    const fiveAgainstFour = [
      block("cardA", falgSteps(5)),
      block("cardB", gSteps(1)),
      block("cardA", falgSteps(5)),
      block("cardB", gSteps(1)),
    ];
    expect(classifyBlocks(fiveAgainstFour, 4, 1)).toBe("BRAIDED");

    // Eight steps IS two whole units, and the same shape is then FUSED — so
    // the verdict really is tracking the modulus, not the length.
    const eightAgainstFour = [
      block("cardA", falgSteps(8)),
      block("cardB", gSteps(1)),
      block("cardA", falgSteps(8)),
      block("cardB", gSteps(1)),
    ];
    expect(classifyBlocks(eightAgainstFour, 4, 1)).toBe("FUSED");

    // And a two-run walk is SEQUENTIAL regardless — "how many runs" is asked
    // before "how were they cut".
    expect(
      classifyBlocks(
        [block("cardA", falgSteps(5)), block("cardB", gSteps(1))],
        4,
        1
      )
    ).toBe("SEQUENTIAL");
  });
});

describe("walk classifier — content dedup", () => {
  it("gives every surfaced result a distinct content key", async () => {
    const report = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);
    const keys = report.results.map((r) => contentDedupKey(r.sequence));
    expect(new Set(keys).size).toBe(keys.length);
  }, 120_000);

  it("collapses two walks over different sources that build the same sequence", async () => {
    // GGGG and HHHH are 4-fold symmetric, so a variant of card B can contain
    // literally the same steps as the identity — and the search cannot see
    // that, because its dedup key is `sourceId#stepIndex`. Same steps, two
    // source labels: the search reports two walks, the classifier must report
    // one result.
    const steps = [
      ...GGGG_CW.steps.slice(0, 2), // beta1 -> beta3 -> beta5
      ...HHHH_CCW.steps.slice(2, 4), // beta5 -> beta7 -> beta1
    ];

    const walkVia = (bSourceId: string, signature: string): RawWalk => ({
      blocks: [
        {
          sourceId: "A",
          kind: "cardA",
          startStepIndex: 0,
          steps: steps.slice(0, 2),
          rotationFaithful: false,
        },
        {
          sourceId: bSourceId,
          kind: "cardB",
          startStepIndex: 2,
          steps: steps.slice(2),
          rotationFaithful: false,
        },
      ],
      totalSteps: 4,
      signature,
    });

    const both = await classifyAndRank(
      [walkVia("B id", "w1"), walkVia("B mirror", "w2")],
      GGGG_CW,
      HHHH_CCW,
      SOURCES,
      COMBINATOR_DEFAULTS
    );
    const alone = await classifyAndRank(
      [walkVia("B id", "w1")],
      GGGG_CW,
      HHHH_CCW,
      SOURCES,
      COMBINATOR_DEFAULTS
    );

    expect(both).toHaveLength(1);
    // The survivor is the FIRST walk — the search emits shortest-first, so
    // "first" is the representative worth keeping.
    expect(both[0]!.blocks[1]!.sourceId).toBe("B id");
    expect(contentDedupKey(both[0]!.sequence)).toBe(
      contentDedupKey(alone[0]!.sequence)
    );
  }, 60_000);

  it("collapses the same loop entered at a different PHASE", async () => {
    // THE case `SequenceCanonicalizer` leaks, reproduced exactly.
    //
    // GHGH's two halves are each closed at beta5, so `[0,1] + [2,3]` and
    // `[2,3] + [0,1]` are the same four-step loop entered two steps apart. It
    // closes in one pass, so both builds carry the identical per-step material
    // — one is literally a rotation of the other.
    //
    // The canonicalizer cannot see that. Both phases spell "GHGH", so
    // `findCircularOffset` returns 0 for BOTH (sequence-canonicalizer.ts:117)
    // and no rotation is applied to the beat signatures — which then differ,
    // because GHGH's two G steps are a cw and a ccw pro. Two entries, one loop.
    const phase = (start: number, signature: string): RawWalk => ({
      blocks: [
        {
          sourceId: "A",
          kind: "cardA",
          startStepIndex: start,
          steps: GHGH.steps.slice(start, start + 2),
          rotationFaithful: false,
        },
        {
          sourceId: "B id",
          kind: "cardB",
          startStepIndex: (start + 2) % 4,
          steps: GHGH.steps.slice((start + 2) % 4, ((start + 2) % 4) + 2),
          rotationFaithful: false,
        },
      ],
      totalSteps: 4,
      signature,
    });

    const run = (walks: RawWalk[]) =>
      classifyAndRank(walks, GHGH, GHGH, SOURCES, COMBINATOR_DEFAULTS);

    const [atZero] = await run([phase(0, "phase-0")]);
    const [atTwo] = await run([phase(2, "phase-2")]);

    // Same loop, same word, both seamless — genuinely two phases of one thing.
    expect(atZero!.sequence.word).toBe("GHGH");
    expect(atTwo!.sequence.word).toBe("GHGH");
    expect(atZero!.sequence.period).toBe(1);
    expect(atTwo!.sequence.period).toBe(1);

    // The label disagrees. This pins CURRENT upstream behavior: if
    // `SequenceCanonicalizer` is ever made phase-invariant, this line starts
    // failing — that is the signal to delete it, not to loosen the dedup key.
    expect(
      atZero!.canonicalHash,
      "canonicalizer became phase-invariant; see contentDedupKey's defect list"
    ).not.toBe(atTwo!.canonicalHash);

    // The dedup key agrees, so the user sees the loop once.
    expect(contentDedupKey(atZero!.sequence)).toBe(
      contentDedupKey(atTwo!.sequence)
    );
    expect(await run([phase(0, "phase-0"), phase(2, "phase-2")])).toHaveLength(
      1
    );
  }, 60_000);
});

describe("walk classifier — unlabelable results", () => {
  it("drops a walk whose spliced material has no dataframe letter", async () => {
    // A PRO that never moves is not a dataframe row at all, so `buildResult`
    // flags the sequence `metadata.incompleteWord`. Such a result cannot be
    // labelled, saved or turned into a shortcode — surfacing it would only
    // offer the user something that breaks downstream.
    const stuck = (color: HandSide) =>
      createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns: 0,
        hand: color,
        arrowLocation: GridLocation.NORTH,
      });
    const unresolvable = createStepData({
      id: "unresolvable",
      stepNumber: 1,
      letter: null,
      startPlacement: GGGG_CW.steps[0]!.startPlacement,
      endPlacement: GGGG_CW.steps[0]!.startPlacement,
      motions: {
        [HandSide.LEFT]: stuck(HandSide.LEFT),
        [HandSide.RIGHT]: stuck(HandSide.RIGHT),
      },
    });

    const walk = (blocks: WalkBlock[], signature: string): RawWalk => ({
      blocks,
      totalSteps: blocks.reduce((n, b) => n + b.steps.length, 0),
      signature,
    });

    const good = walk(
      [
        {
          sourceId: "A",
          kind: "cardA",
          startStepIndex: 0,
          steps: GGGG_CW.steps.slice(0, 2),
          rotationFaithful: false,
        },
        {
          sourceId: "B id",
          kind: "cardB",
          startStepIndex: 2,
          steps: HHHH_CCW.steps.slice(2, 4),
          rotationFaithful: false,
        },
      ],
      "good"
    );
    const broken = walk(
      [
        {
          sourceId: "A",
          kind: "cardA",
          startStepIndex: 0,
          steps: [GGGG_CW.steps[0]!, unresolvable],
          rotationFaithful: false,
        },
        {
          sourceId: "B id",
          kind: "cardB",
          startStepIndex: 1,
          steps: HHHH_CCW.steps.slice(1, 4),
          rotationFaithful: false,
        },
      ],
      "broken"
    );

    const results = await classifyAndRank(
      [broken, good],
      GGGG_CW,
      HHHH_CCW,
      SOURCES,
      COMBINATOR_DEFAULTS
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.sequence.metadata.incompleteWord).toBeUndefined();
    expect(results[0]!.sequence.word.length).toBe(
      results[0]!.sequence.steps.length
    );
    // Real sources are supplied above, so the documented `variantsB` invariant
    // holds here as it does on a real search — passing `[]` would have faked a
    // state the search never produces.
    expect(results[0]!.variantsB.length).toBeGreaterThan(0);
  }, 60_000);
});

describe("walk classifier — ranking", () => {
  it("does not let trivial two-step walks head the default page", async () => {
    // THE measured Task-6 problem. The search finds the two-step loops first
    // (they are the shortest closed walks there are) and there are dozens of
    // them; ranked by shape instead, a real interleave leads.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);
    expect(report.results.length).toBe(COMBINATOR_DEFAULTS.maxResults);

    // The sampler changes what comes after the leader, never the leader.
    const first = report.results[0]!;
    expect(first.sequence.steps.length).toBeGreaterThan(2);
    expect(first.verdict).toBe("FUSED");
    expect(first.sequence.period).toBe(1);

    // Two-steppers may well appear — they are a real WAY these cards combine,
    // and the sampler's whole job is to show the ways. What must not happen is
    // one leading, or the front of the page being made of them.
    const leadingTrivial = report.results
      .slice(0, 3)
      .filter((r) => r.sequence.steps.length === 2);
    expect(leadingTrivial).toHaveLength(0);
  }, 120_000);

  it("samples the WAYS to combine rather than clones of the best way", async () => {
    // The page answers "what ways can these two cards combine?", so a page of
    // 24 near-identical results is the wrong answer even when every one of them
    // outranks the alternatives. Both of these were present before the sampler
    // and both were cut off below the fold by six-step FUSED results that
    // differed only in which G they started on.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);

    const verdicts = new Set(report.results.map((r) => r.verdict));
    const lengths = new Set(report.results.map((r) => r.sequence.steps.length));
    expect(verdicts.size, [...verdicts].join(",")).toBeGreaterThanOrEqual(2);
    expect(lengths.size, [...lengths].join(",")).toBeGreaterThanOrEqual(2);

    // "Within a way, best first": each (verdict, length) bucket keeps its
    // ranked order, so the sampler reorders ACROSS shapes and never inside one.
    const buckets = new Map<string, CombinationResult[]>();
    for (const result of report.results) {
      const key = `${result.verdict}:${result.sequence.steps.length}`;
      buckets.set(key, [...(buckets.get(key) ?? []), result]);
    }
    for (const [key, members] of buckets) {
      expect(rankResults(members, 8).map(shapeOf), key).toEqual(
        members.map(shapeOf)
      );
    }

    // Bucket order is each bucket's best member's rank, so the verdict of the
    // first result in each bucket still climbs FUSED -> SEQUENTIAL -> ...
    const order = ["FUSED", "SEQUENTIAL", "HYBRID", "BRAIDED"];
    const firstSeen = [...buckets.keys()].map((key) =>
      order.indexOf(key.split(":")[0]!)
    );
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
  }, 120_000);

  it("orders verdicts FUSED, SEQUENTIAL, HYBRID, BRAIDED", async () => {
    // Asserted on `rankResults` over REAL results, not on the page: the page is
    // a sampler over the ranking (by design), so the comparator's own ordering
    // axioms are tested where they live.
    const order = ["FUSED", "SEQUENTIAL", "HYBRID", "BRAIDED"];

    const gh = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...NO_AMBIENT,
      maxResultLength: 4,
      maxResults: 200,
    });
    const ghRanks = rankResults(gh.results, 8).map((r) =>
      order.indexOf(r.verdict)
    );
    expect(ghRanks).toEqual([...ghRanks].sort((a, b) => a - b));
    expect(new Set(ghRanks).size).toBeGreaterThan(1);

    // FALG's unit is four steps, so mid-unit cuts — and therefore BRAIDED —
    // exist on this pair, and sort last.
    const fg = await findCombinations(FALG, GGGG_CW, {
      ...NO_AMBIENT,
      maxResultLength: 5,
      maxResults: 200,
    });
    const fgRanks = rankResults(fg.results, 12).map((r) =>
      order.indexOf(r.verdict)
    );
    expect(fgRanks).toEqual([...fgRanks].sort((a, b) => a - b));
    expect(fg.results.some((r) => r.verdict === "BRAIDED")).toBe(true);

    // FUSED above BRAIDED directly, on real results from those two reports —
    // no single pair produces both verdicts at these lengths, so the comparator
    // is exercised on the mixed list instead of a synthetic one.
    const fused = gh.results.find((r) => r.verdict === "FUSED")!;
    const braided = fg.results.find((r) => r.verdict === "BRAIDED")!;
    expect(rankResults([braided, fused], 8).map((r) => r.verdict)).toEqual([
      "FUSED",
      "BRAIDED",
    ]);
  }, 120_000);

  it("puts period-1 loops above period-2 within the same verdict", async () => {
    const report = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...NO_AMBIENT,
      maxResultLength: 4,
      maxResults: 200,
    });
    const fusedPeriods = rankResults(report.results, 8)
      .filter((r) => r.verdict === "FUSED")
      .map((r) => r.sequence.period);

    // Both periods really are present — otherwise the ordering claim is vacuous.
    expect(fusedPeriods).toContain(1);
    expect(fusedPeriods).toContain(2);
    expect(fusedPeriods).toEqual(
      [...fusedPeriods].sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
    );
  }, 120_000);

  it("names every card-B variant it drew on", async () => {
    // The documented `variantsB` invariant: empty only for a result with no
    // card-B block, which the search never emits.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);
    expect(report.results.length).toBeGreaterThan(0);
    for (const result of report.results) {
      expect(result.cardBShare, shapeOf(result)).toBeGreaterThan(0);
      expect(result.variantsB.length, shapeOf(result)).toBeGreaterThan(0);
      expect(result.variantsB.length).toBeLessThanOrEqual(
        result.blocks.filter((b) => b.kind === "cardB").length
      );
    }
  }, 120_000);
});

describe("walk classifier — derivation", () => {
  it("names the ingredients in display words", async () => {
    const report = await findCombinations(FALG, GGGG_CW, {
      ...NO_AMBIENT,
      maxResultLength: 5,
      maxResults: 40,
    });
    expect(report.results.length).toBeGreaterThan(0);

    // DISPLAY layer: GGGG simplifies to G, FALG does not repeat so it stays
    // whole. Pinned exactly — `simplifyRepeatedWord` on both operands is the
    // whole contract, and a raw "GGGG" here would be the defect
    // `simplified-word-display.md` exists to catch.
    for (const result of report.results) {
      expect(result.derivation, result.canonicalHash).toMatch(
        /^= FALG \+ G(?: · rotation-faithful seams)?$/
      );
    }
    expect(report.results.some((r) => r.derivation === "= FALG + G")).toBe(
      true
    );

    // The marker is not decoration: it appears exactly when a block came from a
    // rotation-faithful twin source.
    for (const result of report.results) {
      expect(
        result.derivation.includes("rotation-faithful"),
        result.canonicalHash
      ).toBe(result.rotationFaithfulBlocks > 0);
    }
  }, 120_000);

  it("names both single-letter cards", async () => {
    const report = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);
    for (const result of report.results) {
      expect(result.derivation, result.canonicalHash).toMatch(
        /^= G \+ H(?: · rotation-faithful seams)?$/
      );
      // No ambient layer yet (Task 9), so nothing extends the sentence.
      expect(result.usedAmbient).toBe(false);
      expect(result.ambientWords).toEqual([]);
    }
  }, 120_000);
});

describe("walk classifier — wholeUnitsOnly", () => {
  it("is a no-op for GGGG + HHHH, whose unit is a single step", async () => {
    // Both cards simplify to one letter, so every block is already a whole
    // number of units and the flag can remove nothing. The claim worth pinning
    // is that it removes nothing — a filter that quietly dropped whole-unit
    // walks would show up here as a shorter list.
    const unrestricted = await findCombinations(GGGG_CW, HHHH_CCW, NO_AMBIENT);
    const restricted = await findCombinations(GGGG_CW, HHHH_CCW, {
      ...NO_AMBIENT,
      wholeUnitsOnly: true,
    });

    expect(restricted.results.length).toBeGreaterThan(0);
    expect(restricted.results.map((r) => contentDedupKey(r.sequence))).toEqual(
      unrestricted.results.map((r) => contentDedupKey(r.sequence))
    );
  }, 120_000);

  it("actually removes sub-unit blocks when a card's unit is bigger than one", async () => {
    // GHGH's unit is two steps, so this is where the flag has teeth.
    const options = {
      ...NO_AMBIENT,
      maxResultLength: 5,
      maxResults: 200,
    };
    const unrestricted = await findCombinations(GHGH, GGGG_CW, options);
    const restricted = await findCombinations(GHGH, GGGG_CW, {
      ...options,
      wholeUnitsOnly: true,
    });

    expect(restricted.results.length).toBeGreaterThan(0);
    expect(
      unrestricted.results.some((r) =>
        r.blocks.some((b) => b.kind === "cardA" && b.steps.length % 2 !== 0)
      ),
      "the unrestricted search must contain what the flag removes"
    ).toBe(true);

    for (const result of restricted.results) {
      for (const b of result.blocks) {
        if (b.kind === "cardA") {
          expect(b.steps.length % 2, shapeOf(result)).toBe(0);
        }
      }
      // A mid-unit cut is what BRAIDED means, so the flag rules it out — the
      // filter and the verdict share one predicate.
      expect(result.verdict, shapeOf(result)).not.toBe("BRAIDED");
    }
  }, 120_000);
});

describe("walk classifier — determinism", () => {
  it("labels, dedups and ranks identically across runs", async () => {
    const options = {
      ...NO_AMBIENT,
      maxResultLength: 6,
      maxResults: 24,
    };
    const [first, second] = [
      await findCombinations(GGGG_CW, HHHH_CCW, options),
      await findCombinations(GGGG_CW, HHHH_CCW, options),
    ];

    const fingerprint = (report: { results: readonly CombinationResult[] }) =>
      report.results.map((r) => ({
        key: contentDedupKey(r.sequence),
        hash: r.canonicalHash,
        verdict: r.verdict,
        derivation: r.derivation,
        word: r.sequence.word,
        period: r.sequence.period,
        shape: shapeOf(r),
      }));

    expect(fingerprint(second)).toEqual(fingerprint(first));
  }, 120_000);
});

/**
 * The source table a hand-built walk is classified against. Real entries, so
 * `variantsB` resolves — `variantsUsed` silently skips blocks whose source is
 * unknown, and an empty table would fake a state the search never produces.
 */
const SOURCES: WalkSource[] = [
  {
    kind: "cardA",
    id: "A",
    variant: {
      rotation: 0,
      mirrored: false,
      handsSwapped: false,
      rotationFaithful: false,
    },
    sequence: GGGG_CW,
  },
  {
    kind: "cardB",
    id: "B id",
    variant: {
      rotation: 0,
      mirrored: false,
      handsSwapped: false,
      rotationFaithful: false,
    },
    sequence: HHHH_CCW,
  },
  {
    kind: "cardB",
    id: "B mirror",
    variant: {
      rotation: 0,
      mirrored: true,
      handsSwapped: false,
      rotationFaithful: false,
    },
    sequence: HHHH_CCW,
  },
];
