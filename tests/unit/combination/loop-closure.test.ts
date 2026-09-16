/**
 * Stage 3 (Closure) in isolation — the stage the 2026-08-04 engine never had.
 *
 * These assertions are about the CLOSURE VOCABULARY, not about search results:
 * which transforms the app admits for a given realized placement pair, at which
 * period, and how many passes each takes. `oracle-agreement.test.ts` checks the
 * whole pipeline against the published bucket profile.
 */

import { describe, expect, it } from "vitest";

// The ENGINE's enums, not the app-side copy in `circular-models` — the app's
// copy spells rewound `strict_rewound` and would silently miss it.
import { LOOPType, Period } from "@tka/sequence-engine/loop";
import {
  admissibleClosures,
  isFreeformPair,
} from "$lib/shared/combination/services/loop-closure";

const idsOf = (start: string, end: string, options = {}) =>
  admissibleClosures(start, end, options).map((closure) => closure.id);

describe("Stage 3 — closure", () => {
  it("finds the quartered rotations on alpha3 -> alpha5 that a halved-only query hides", () => {
    // The footgun in one assertion. `validate_loop_options` defaults its period
    // to "halved", and every call that omits it gets a halved-only answer — on
    // this exact pair that answer is `rewound` alone. Quartered is where the
    // rotations live, and with them A+G's entire 16-count bucket.
    const closures = admissibleClosures("alpha3", "alpha5");
    const quartered = closures.filter(
      (closure) => closure.period === Period.QUARTERED
    );

    expect(quartered.map((closure) => closure.loopType)).toEqual(
      expect.arrayContaining([
        LOOPType.ROTATED,
        LOOPType.ROTATED_INVERTED,
        LOOPType.ROTATED_SWAPPED,
      ])
    );
    for (const closure of quartered) {
      expect(closure.circleMultiplier).toBe(4);
    }

    const halved = closures.filter((c) => c.period === Period.HALVED);
    expect(halved.map((c) => c.loopType)).not.toContain(LOOPType.ROTATED);
  });

  it("calls a pair that ends where it started plain, and closes it in one pass", () => {
    const closures = admissibleClosures("alpha3", "alpha3");
    const plain = closures.find((closure) => closure.family === "plain");

    expect(plain).toBeDefined();
    expect(plain?.circleMultiplier).toBe(1);
    // Every A+G 4-count word is a 4-step unit closing this way — which is only
    // possible because "plain" exists. The app's LOOP catalogue has no identity
    // type (its nearest, INVERTED, is a two-pass transform), so without this
    // family the bucket would be empty.
    expect(closures.find((c) => c.loopType === LOOPType.INVERTED)).toBeDefined();
  });

  it("emits no closure at all for a pair nothing closes", () => {
    // alpha3 -> beta1 is neither the same placement, nor a rotation, reflection
    // or colour swap of it. This is the freeform case, and Stage 3 says so by
    // answering with nothing.
    expect(admissibleClosures("alpha3", "beta1")).toEqual([]);
    expect(isFreeformPair("alpha3", "beta1")).toBe(true);
  });

  it("leaves rewound out, because it would make the discard rule vacuous", () => {
    // `isLOOPValidForPlacementPair` returns true for REWOUND at EVERY pair — any
    // sequence can be played backwards — so counting it would mean no walk is
    // ever freeform.
    expect(idsOf("alpha3", "beta1")).toEqual([]);
    expect(idsOf("alpha3", "beta1", { includeRewound: true })).toEqual([
      `${LOOPType.REWOUND}@${Period.HALVED}`,
    ]);
  });

  it("does not re-ask a period-blind type at the quartered period", () => {
    // MIRRORED's validation set is period-independent, so a second query returns
    // the identical boolean while the expansion multiplier doubles. Emitting it
    // would assert a quartered circle the validator never checked.
    const mirrored = admissibleClosures("alpha3", "alpha7").filter(
      (closure) => closure.loopType === LOOPType.MIRRORED
    );
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.period).toBe(Period.HALVED);
    expect(mirrored[0]?.circleMultiplier).toBe(2);

    const opened = admissibleClosures("alpha3", "alpha7", {
      quarteredPeriodBlindTypes: true,
    }).filter((closure) => closure.loopType === LOOPType.MIRRORED);
    expect(opened).toHaveLength(2);
    expect(opened.map((closure) => closure.circleMultiplier)).toEqual([2, 4]);
  });

  it("admits the diagonal reflection axes the app ships no validation set for", () => {
    // alpha1 is (blue s, red n) and alpha3 is (blue w, red e); reflecting s and
    // n across the NE-SW diagonal gives exactly w and e. TKA canon holds all
    // four axes equally valid; the engine's placement-pair sets cover only
    // north-south and east-west, so the diagonals are composed from its own
    // placement maps.
    const diagonals = admissibleClosures("alpha1", "alpha3").filter(
      (closure) => closure.family === "reflection"
    );
    expect(diagonals.map((closure) => closure.reflectionAxis)).toEqual([
      "northeast-southwest",
    ]);
    expect(diagonals[0]?.circleMultiplier).toBe(2);

    expect(
      admissibleClosures("alpha1", "alpha3", {
        includeDiagonalReflections: false,
      }).filter((closure) => closure.family === "reflection")
    ).toEqual([]);
  });

  it("keeps compound multi-expansion LOOP types out of the single-transform model", () => {
    // MIRRORED_ROTATED is admitted as a CONJUNCTION of two conditions and
    // executed as a pass per combination, so its circle is a product of
    // expansions rather than the order of one transform. The bucket law is the
    // one-transform model, so it is opt-in.
    // alpha3 -> alpha7 is BOTH the vertical mirror of alpha3 and its 180
    // rotation, which is what makes the conjunction admissible at all.
    const pair = ["alpha3", "alpha7"] as const;
    expect(
      admissibleClosures(...pair).some(
        (closure) => closure.loopType === LOOPType.MIRRORED_ROTATED
      )
    ).toBe(false);

    const compound = admissibleClosures(...pair, {
      includeCompoundLOOPs: true,
    }).find((closure) => closure.loopType === LOOPType.MIRRORED_ROTATED);
    expect(compound?.circleMultiplier).toBe(4);
  });
});
