/**
 * AUDIT REPRO — "this hand is not really there" does not survive persistence.
 *
 * Since the both-required Step flip, an absent hand is an invisible static
 * placeholder (`motion-data.ts:createPlaceholderMotion`, `isVisibleMotion`).
 * `getSequenceMotionProfile` reads exactly that flag to decide whether a
 * sequence is solo choreography or paired choreography, and
 * `getSequenceMotionVisibility` uses the answer to decide which prop the viewer
 * renders.
 *
 * The persistence round trip does not carry the flag:
 *   - `sequence-decomposer.ts:136-148` turns an invisible motion into a STATIC
 *     placeholder solo-prop step (locations collapsed to the start location);
 *   - `step-deriver.ts:88-109` rebuilds every motion with `isVisible: true`.
 *
 * `StepPairingData` has no presence field, so there is nowhere for the flag to
 * live. The normalizer refuses `isBlank` steps for the structurally identical
 * reason (`BLANK_STEPS_UNSUPPORTED`: "the persistence layer cannot round-trip
 * the blank flag yet (stepPairings does not carry it)") but has no equivalent
 * gate for an invisible hand.
 *
 * Reachable today: a printed solo-prop card resolves through
 * `hydrateSoloShortCodePayload` → `soloPropToSequence` (one hand, the other an
 * invisible placeholder) and is saved to the library by
 * `ScanCardSheet.svelte:214` / `intake-router.ts:267`, which runs
 * `ensureComposition` at `library-repository.ts:574`.
 *
 * QUARANTINE: `it.fails` marks the assertions that should pass once presence is
 * persisted (or the save refuses). This file is green while the defect is live.
 */
import { describe, expect, it } from "vitest";

import { ensureComposition, hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { extractLeftSoloProp } from "$lib/shared/foundation/services/sequence-decomposer";
import { soloPropToSequence } from "$lib/shared/foundation/services/solo-prop-sequence-adapter";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import { asStoredDocument, realCorpusSequences } from "./fixtures";

/** A real one-hand sequence: a solo prop lifted out of a corpus sequence. */
function soloSequence(): SequenceData {
  const paired = realCorpusSequences()[0]!.sequence;
  const soloProp = extractLeftSoloProp(paired);
  return soloPropToSequence({ ...soloProp, authoredHand: "left" }, "left");
}

const roundTrip = (sequence: SequenceData) =>
  hydrate(asStoredDocument(ensureComposition(sequence)));

describe("solo (one-hand) choreography through the persistence round trip", () => {
  it("measured: the source sequence really is solo", () => {
    const solo = soloSequence();
    expect(getSequenceMotionProfile(solo).kind).toBe("solo");
    expect(solo.steps.every((step) => step.motions.right.isVisible === false)).toBe(true);
  });

  it("measured: after save + read the absent hand is a visible static prop", () => {
    const back = roundTrip(soloSequence());

    expect(back.steps.every((step) => step.motions.right.isVisible)).toBe(true);
    // It is parked at the start location for the whole sequence, so the viewer
    // shows a second prop that never moves.
    expect(
      back.steps.every(
        (step) =>
          step.motions.right.motionType === MotionType.STATIC &&
          step.motions.right.startLocation === step.motions.right.endLocation
      )
    ).toBe(true);
  });

  it("measured: the sequence is therefore reclassified as paired choreography", () => {
    expect(getSequenceMotionProfile(roundTrip(soloSequence())).kind).toBe("paired");
  });

  it.fails(
    "SHOULD PASS AFTER FIX: a solo sequence is still solo after save + read",
    () => {
      expect(getSequenceMotionProfile(roundTrip(soloSequence())).kind).toBe("solo");
    }
  );

  it.fails(
    "SHOULD PASS AFTER FIX: the absent hand stays absent after save + read",
    () => {
      const back = roundTrip(soloSequence());
      expect(back.steps.every((step) => step.motions.right.isVisible === false)).toBe(true);
    }
  );
});
