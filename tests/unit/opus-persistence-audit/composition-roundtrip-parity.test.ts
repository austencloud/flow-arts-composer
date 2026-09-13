/**
 * AUDIT BASELINE — what the persistence round trip DOES preserve.
 *
 * This file records the negative results of the audit so a later change cannot
 * quietly undo them. Every assertion here passes against the current tree; none
 * is quarantined.
 *
 * The round trip modelled is the real one:
 *   author steps -> `ensureComposition` -> drop `steps` (the owner document
 *   shape, `library-repository.ts:592-600`) -> `hydrate` on read.
 *
 * Comparison is semantic, over `MOTION_IDENTITY_FIELDS`. It is deliberately not
 * a byte or deep-equality comparison: `deriveSteps` legitimately mints new step
 * ids, rebuilds placement data, and re-derives `gridMode` and the reversal
 * flags, all of which the V2/V3 hash basis already excludes as derived.
 */
import { describe, expect, it } from "vitest";

import { ensureComposition, hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { normalizeLegacySequence } from "@tka/tka-types";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

import {
  asStoredDocument,
  diffMotionIdentity,
  realCorpusSequences,
} from "./fixtures";

describe("composition round trip over the real LOOP corpus", () => {
  const corpus = realCorpusSequences();

  it("preserves every motion-identity field, on every beat, in every fixture", () => {
    expect(corpus.length).toBeGreaterThan(20);

    const losses: string[] = [];
    for (const { label, sequence } of corpus) {
      const back = hydrate(asStoredDocument(ensureComposition(sequence)));
      losses.push(...diffMotionIdentity(sequence, back).map((l) => `${label}: ${l}`));
    }

    expect(losses).toEqual([]);
  });

  it("preserves the per-beat letter, which the wire format does not", () => {
    for (const { sequence } of corpus) {
      const back = hydrate(asStoredDocument(ensureComposition(sequence)));
      expect(back.steps.map((s) => s.letter)).toEqual(sequence.steps.map((s) => s.letter));
    }
  });

  it("preserves the authored plane, which the wire format does not", () => {
    const planes = new Set<unknown>();
    for (const { sequence } of corpus) {
      const back = hydrate(asStoredDocument(ensureComposition(sequence)));
      for (const step of back.steps) {
        planes.add(step.motions.left.plane);
        planes.add(step.motions.right.plane);
      }
    }
    // The whole corpus is wall-plane; the point is that the value arrives at
    // all, since the V3 identity hash reads it.
    expect([...planes]).toEqual(["wall"]);
  });
});

describe("legacy hand-identity migration at ingress", () => {
  it("maps blue/red motion keys onto left/right without losing metadata", () => {
    const legacy = {
      id: "legacy",
      blueSoloProp: { id: "b" },
      redSoloProp: { id: "r" },
      bluePathHash: "bp",
      redPathHash: "rp",
      steps: [
        {
          letter: "A",
          blueReversal: true,
          redReversal: false,
          customField: "kept",
          motions: {
            blue: { color: "blue", startLocation: "n", turns: 1 },
            red: { color: "red", startLocation: "s", turns: 0 },
          },
        },
      ],
      stepPairings: [{ letter: "A", blueReversal: true, redReversal: false }],
      intendedProp: { bluePropType: "staff", redPropType: "club", catDogMode: true },
      creatorIntent: { propConfig: { bluePropType: "staff", redPropType: "club" } },
    };

    const out = normalizeLegacySequence(legacy) as Record<string, never>;

    expect(out["leftSoloProp"]).toEqual({ id: "b" });
    expect(out["rightSoloProp"]).toEqual({ id: "r" });
    expect(out["leftPathHash"]).toBe("bp");
    expect(out["blueSoloProp"]).toBeUndefined();

    const step = (out["steps"] as unknown as Record<string, never>[])[0]!;
    expect(step["leftReversal"]).toBe(true);
    expect(step["rightReversal"]).toBe(false);
    expect(step["blueReversal"]).toBeUndefined();
    // Unknown application metadata is retained, as the normalizer documents.
    expect(step["customField"]).toBe("kept");

    const motions = step["motions"] as unknown as Record<string, Record<string, unknown>>;
    expect(motions[HandSide.LEFT]!["hand"]).toBe(HandSide.LEFT);
    expect(motions[HandSide.LEFT]!["color"]).toBeUndefined();
    expect(motions[HandSide.LEFT]!["turns"]).toBe(1);
    expect(motions[HandSide.RIGHT]!["hand"]).toBe(HandSide.RIGHT);

    const pairing = (out["stepPairings"] as unknown as Record<string, never>[])[0]!;
    expect(pairing["leftReversal"]).toBe(true);
    expect(pairing["blueReversal"]).toBeUndefined();

    expect(out["intendedProp"]).toEqual({
      leftPropType: "staff",
      rightPropType: "club",
      catDogMode: true,
    });
    expect(
      (out["creatorIntent"] as unknown as Record<string, unknown>)["propConfig"]
    ).toEqual({ leftPropType: "staff", rightPropType: "club" });
  });

  it("is idempotent: re-normalizing an already-canonical document changes nothing", () => {
    const canonical = {
      leftSoloProp: { id: "l" },
      steps: [
        {
          letter: "A",
          leftReversal: false,
          rightReversal: true,
          motions: { left: { hand: HandSide.LEFT }, right: { hand: HandSide.RIGHT } },
        },
      ],
    };
    expect(normalizeLegacySequence(normalizeLegacySequence(canonical))).toEqual(
      normalizeLegacySequence(canonical)
    );
  });
});
