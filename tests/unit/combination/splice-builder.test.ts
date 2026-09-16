/**
 * The splice builder — where a graph walk becomes something performable.
 *
 * The payoff this suite exists to prove: a spliced walk over TWO DIFFERENT
 * cards has a valid orientation chain end to end. The search only guarantees
 * placements; `buildResult` re-derives orientations from the walk's own start
 * hold, and `validateSequence` (the create module's orientation-continuity
 * validator) is the independent check that it worked.
 *
 * `validateSequence` is imported from `features/` deliberately and ONLY here —
 * `shared/` source may never import from `features/`, but a test may reach for
 * the app's own validator rather than re-deriving the rule it enforces.
 *
 * What `validateSequence` does and does NOT prove: it checks ADJACENCY only —
 * every step's start orientation equals its predecessor's end orientation, with
 * step 1 measured against the start hold. It cannot tell a correct chain from a
 * consistently-wrong one, because it never recomputes what an end orientation
 * OUGHT to be. The pinned chain in the wrap test and the oracle-style
 * assertions below (exact letters, exact dot positions, exact period) are what
 * carry correctness; adjacency is the cheap invariant on top.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { validateSequence } from "$lib/features/create/spell/services/orientation-continuity-validator";
import type { WalkBlock } from "$lib/shared/combination/domain/types";
import { findCombinations } from "$lib/shared/combination/services/sequence-combinator";
import { buildResult } from "$lib/shared/combination/services/splice-builder";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

import { GGGG_CW, HHHH_CCW } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

/** Letter re-derivation and the twin sources both read the real dataframe. */
beforeAll(async () => {
  await loadPictographDatasetForTests();
}, 60_000);

const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

/**
 * The hand-assembled 2-block walk: all of GGGG, then all of HHHH_CCW.
 *
 * Both loops run beta1 -> beta3 -> beta5 -> beta7 -> beta1, so joining them at
 * beta1 is a legal closed walk — the same SEQUENTIAL shape the search finds,
 * built here by hand so the builder is tested without the search in the frame.
 */
function gThenH(): WalkBlock[] {
  return [
    {
      sourceId: "A",
      kind: "cardA",
      startStepIndex: 0,
      steps: GGGG_CW.steps,
      rotationFaithful: false,
    },
    {
      sourceId: "B id",
      kind: "cardB",
      startStepIndex: 0,
      steps: HHHH_CCW.steps,
      rotationFaithful: false,
    },
  ];
}

describe("splice builder", () => {
  it("splices two cards into one closed, orientation-valid sequence", async () => {
    const result = await buildResult(gThenH(), GGGG_CW);

    expect(result.steps.length).toBe(8);
    expect(result.steps.map((s) => s.stepNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(result.word.length).toBe(8);
    expect(result.gridMode).toBe(GGGG_CW.gridMode);

    // The canonical deriver's start hold — same one the sequence-hydrator
    // builds. Its id is derived from the placement (deterministic), and it
    // carries the α/β/Γ static letter a hand-rolled hold would have dropped.
    expect(result.startPlacement).toBeDefined();
    expect(result.startPlacement!.gridPlacement).toBe(
      GGGG_CW.steps[0]!.startPlacement
    );
    expect(result.startPlacement!.id).toBe("derived-start-beta1");
    expect(result.startPlacement!.letter).toBe("β");

    // MEASURED, not asserted: this splice really does close in orientation as
    // well as placement, so it earns the app's seamless-loop flag. See the
    // period test for the case where it would not.
    expect(result.isCircular).toBe(true);
    expect(result.period).toBe(1);

    // Placement closure: every seam meets, including the wrap.
    for (let i = 1; i < result.steps.length; i++) {
      expect(result.steps[i]!.startPlacement).toBe(
        result.steps[i - 1]!.endPlacement
      );
    }
    expect(result.steps.at(-1)!.endPlacement).toBe(
      result.steps[0]!.startPlacement
    );

    // THE PAYOFF. Step 1 is checked against the rebuilt start hold, every other
    // step against its predecessor — across the G/H seam included.
    expect(validateSequence(result)).toEqual([]);
  });

  it("is deterministic — the same blocks build the same sequence", async () => {
    const [first, second] = await Promise.all([
      buildResult(gThenH(), GGGG_CW),
      buildResult(gThenH(), GGGG_CW),
    ]);
    // Deep equality including every id: a `crypto.randomUUID()` anywhere in the
    // builder would fail here, and would silently break the search's own
    // determinism guarantee one layer up.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("keeps the source letters through the splice", async () => {
    // Letters are orientation-INDEPENDENT (dataframe rows carry no orientation),
    // so re-deriving them after the orientation pass is normalization, not
    // correction — it must return exactly what the blocks brought in.
    const result = await buildResult(gThenH(), GGGG_CW);
    expect(result.steps.map((s) => s.letter)).toEqual([
      "G",
      "G",
      "G",
      "G",
      "H",
      "H",
      "H",
      "H",
    ]);
    expect(result.word).toBe("GGGGHHHH");
    expect(result.name).toBe("GGGGHHHH");
  });

  it("really re-derives letters rather than carrying them", async () => {
    // `deriveSequenceLetters` KEEPS the existing letter when a lookup fails, so
    // the assertion above would stay green against a dead dataframe handler.
    // Blanking the blocks' letters first makes the derivation load-bearing.
    const blanked = gThenH().map((block) => ({
      ...block,
      steps: block.steps.map((step) => ({ ...step, letter: null })),
    }));
    const result = await buildResult(blanked, GGGG_CW);
    expect(result.word).toBe("GGGGHHHH");
  });

  it("recomputes reversal flags over the new step order", async () => {
    const result = await buildResult(gThenH(), GGGG_CW);

    for (const step of result.steps) {
      expect(typeof step.leftReversal).toBe("boolean");
      expect(typeof step.rightReversal).toBe("boolean");
    }

    // A closed walk is cyclic by construction, so the dots are computed WITH
    // the wrap. Both hands move identically in these two cards, so every dot is
    // on both hands, and the material puts one at each of the two seams:
    //
    //   step 5 — the G->H seam. GGGG is pro CW, HHHH_CCW is anti CCW: the prop
    //            reverses direction on the first H.
    //   step 1 — the WRAP seam. Step 8 is anti CCW and step 1 is pro CW, so the
    //            prop reverses again on the way round. Suppressing this (which
    //            `processReversals` would, since it gates the wrap on
    //            `loopType` and a combination carries none) would hide a real
    //            reversal a performer has to make.
    const dotted = result.steps
      .filter((s) => s.leftReversal || s.rightReversal)
      .map((s) => s.stepNumber);
    expect(dotted).toEqual([1, 5]);
    for (const i of [0, 4]) {
      expect(result.steps[i]!.leftReversal).toBe(true);
      expect(result.steps[i]!.rightReversal).toBe(true);
    }
  });

  it("closes its orientation chain in one pass for GGGG + HHHH", async () => {
    // OBSERVED, not required. Placement closure is guaranteed; orientation
    // closure is a property of the material, and a walk that does NOT return to
    // its start orientation is simply a period > 1 loop.
    //
    // This splice happens to close in one pass, and the arithmetic says why:
    // pro at 0 turns preserves orientation, so the four G steps are the
    // identity; anti at 0 turns flips it, and four flips are also the identity.
    // in -> in -> in -> in -> in -> out -> in -> out -> in.
    //
    // Pinning the observation guards the claim in both directions — if the
    // orientation pass ever stopped running, or started forcing closure, the
    // chain below would no longer read as computed values.
    const result = await buildResult(gThenH(), GGGG_CW);
    const hold = result.startPlacement!;
    expect(result.period).toBe(1);

    for (const hand of HANDS) {
      expect(hold.motions[hand]!.endOrientation).toBe(
        GGGG_CW.steps[0]!.motions[hand].startOrientation
      );
      expect(result.steps.at(-1)!.motions[hand].endOrientation).toBe(
        hold.motions[hand]!.endOrientation
      );
    }

    expect(result.steps.map((s) => s.motions.left.startOrientation)).toEqual([
      "in",
      "in",
      "in",
      "in",
      "in",
      "out",
      "in",
      "out",
    ]);
  });

  it("reports a period-2 loop honestly instead of calling it circular", async () => {
    // Three G steps then one H step: beta1 -> beta3 -> beta5 -> beta7 -> beta1.
    // The walk closes AT THE PLACEMENT LEVEL — deliberately, so that `isCircular: false`
    // isolates the orientation failure and nothing else. Pro at 0 turns
    // preserves orientation and anti flips it, so an ODD number of anti steps
    // (one, here) leaves the props inverted at the wrap. Playing it twice
    // returns them: a period-2 loop, a real performable sequence, and calling
    // it `isCircular` would be a lie the app's seamless-loop definition does
    // not permit.
    const threeGOneH: WalkBlock[] = [
      {
        sourceId: "A",
        kind: "cardA",
        startStepIndex: 0,
        steps: GGGG_CW.steps.slice(0, 3),
        rotationFaithful: false,
      },
      {
        sourceId: "B id",
        kind: "cardB",
        startStepIndex: 3,
        steps: [HHHH_CCW.steps[3]!],
        rotationFaithful: false,
      },
    ];
    const result = await buildResult(threeGOneH, GGGG_CW);

    expect(result.steps).toHaveLength(4);

    // Placement closure holds, including the wrap — this walk is a closed loop.
    for (let i = 1; i < result.steps.length; i++) {
      expect(result.steps[i]!.startPlacement).toBe(
        result.steps[i - 1]!.endPlacement
      );
    }
    expect(result.steps.at(-1)!.endPlacement).toBe(
      result.steps[0]!.startPlacement
    );

    // Only the ORIENTATION chain fails to close in one pass.
    expect(result.period).toBe(2);
    expect(result.isCircular).toBe(false);
    // Closure was NOT forced: the last step really does end `out` against a
    // hold that started `in`.
    expect(result.startPlacement!.motions.left!.endOrientation).toBe("in");
    expect(result.steps.at(-1)!.motions.left.endOrientation).toBe("out");
  });

  it("flags an incomplete word rather than emitting a plausible short one", async () => {
    // A step whose motions are not a dataframe row at all: a PRO that never
    // moves. `deriveSequenceLetters` cannot resolve it and leaves the letter
    // null, so the word silently loses a token — the exact "GI" defect
    // `word-deriver`'s strict API exists to stop.
    const stuck = (hand: HandSide) =>
      createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns: 0,
        hand,
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

    const blocks: WalkBlock[] = [
      {
        sourceId: "A",
        kind: "cardA",
        startStepIndex: 0,
        steps: [GGGG_CW.steps[0]!, unresolvable],
        rotationFaithful: false,
      },
    ];
    const result = await buildResult(blocks, GGGG_CW);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]!.letter).toBeNull();
    // The partial word is still emitted — it is the honest best label — but the
    // mismatch is DETECTABLE, and the flag says so without arithmetic.
    expect(result.word).toBe("G");
    expect(result.word.length).not.toBe(result.steps.length);
    expect(result.metadata.incompleteWord).toBe(true);
  });

  it("refuses to build a sequence from an empty walk", async () => {
    // The search never emits one (a recorded walk has at least two steps), so
    // an empty block list is a caller bug. A stepless "sequence" would be a
    // silently useless object with no start placement and no word.
    await expect(buildResult([], GGGG_CW)).rejects.toThrow(/no steps/);
  });

  it("every searched combination of GGGG + HHHH is orientation-valid", async () => {
    // The end-to-end claim: the real builder now runs inside the pipeline, so
    // the search's results are not merely placement-continuous walks — they are
    // performable sequences.
    // 200 results, not a default page: the classifier ranks period-1 above
    // period-2, so a small page is all period-1 by construction and the
    // distribution assertion at the bottom would be measuring the ranking
    // rather than the material.
    const report = await findCombinations(GGGG_CW, HHHH_CCW, {
      allowAmbient: false,
      maxResultLength: 6,
      maxResults: 200,
    });
    expect(report.results.length).toBeGreaterThan(0);

    for (const result of report.results) {
      const seq = result.sequence;
      expect(seq.startPlacement, result.canonicalHash).toBeDefined();
      expect(
        validateSequence(seq).map((e) => e.message),
        result.canonicalHash
      ).toEqual([]);

      // Placement closure survives the post-processing pass.
      for (let i = 1; i < seq.steps.length; i++) {
        expect(seq.steps[i]!.startPlacement, result.canonicalHash).toBe(
          seq.steps[i - 1]!.endPlacement
        );
      }
      expect(seq.steps.at(-1)!.endPlacement, result.canonicalHash).toBe(
        seq.steps[0]!.startPlacement
      );
      expect(seq.startPlacement!.gridPlacement, result.canonicalHash).toBe(
        seq.steps[0]!.startPlacement
      );

      // Every result carries a word for every step — this material is all real
      // dataframe rows, so nothing should be flagged.
      expect(seq.metadata.incompleteWord, result.canonicalHash).toBeUndefined();
      expect(seq.word.length, result.canonicalHash).toBe(seq.steps.length);

      // isCircular and period are two views of the same measurement, because a
      // combination closes at the placement level by construction: the seamless-loop flag
      // holds EXACTLY when the orientation chain also closes in one pass.
      expect(seq.period, result.canonicalHash).toBeDefined();
      expect(seq.isCircular, result.canonicalHash).toBe(seq.period === 1);
    }

    // The real distribution over a wide result set: this pair splits roughly
    // evenly. Some walks close in one pass, some take two — pinned so a future
    // change that quietly forced closure (or stopped measuring) shows up as a
    // number, not as a vibe.
    const periods = report.results.map((r) => r.sequence.period);
    expect(periods.filter((p) => p === 1).length).toBeGreaterThan(0);
    expect(periods.filter((p) => p === 2).length).toBeGreaterThan(0);
    expect(periods.every((p) => p === 1 || p === 2)).toBe(true);
  }, 60_000);
});
