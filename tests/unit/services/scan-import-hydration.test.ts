/**
 * Scan-import hydration round-trip.
 *
 * Repro for the "scanned card files a husk" bug (2026-07-05): a printed card
 * whose shortcode record only carries the encoded blob resolves through
 * decodeSequence, gets saved as a private copy, and then renders EMPTY in the
 * viewer. saveSequence never persists steps — it derives compositional fields
 * (ensureComposition) at write time and re-derives steps from them at read
 * time (hydrate). If that derivation chain breaks for decoded sequences, the
 * stored doc has neither steps nor a way to rebuild them.
 *
 * This test walks the exact production pipeline:
 *   encode → decode (resolveForImport's encoded-blob path)
 *   → ensureComposition (saveSequence write path)
 *   → strip steps (the Firestore write shape)
 *   → hydrate (the read path)
 * and asserts the steps survive.
 */
import { describe, expect, it } from "vitest";
import {
  encodeSequence,
  decodeSequence,
} from "$lib/shared/navigation/services/sequence-encoder";
import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function makeStep(
  stepNumber: number,
  left: Partial<Parameters<typeof createMotionData>[0]>,
  right: Partial<Parameters<typeof createMotionData>[0]>
): StepData {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({ ...left, hand: HandSide.LEFT }),
      right: createMotionData({ ...right, hand: HandSide.RIGHT }),
    },
  };
}

function buildSourceSequence(): SequenceData {
  const startPos = makeStep(
    0,
    {
      motionType: MotionType.STATIC,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.NORTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 0,
      propType: PropType.STAFF,
    },
    {
      motionType: MotionType.STATIC,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 0,
      propType: PropType.STAFF,
    }
  );

  const step1 = makeStep(
    1,
    {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      turns: 1,
      propType: PropType.STAFF,
    },
    {
      motionType: MotionType.ANTI,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.WEST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      turns: 1,
      propType: PropType.STAFF,
    }
  );

  const step2 = makeStep(
    2,
    {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.OUT,
      endOrientation: Orientation.IN,
      turns: 1,
      propType: PropType.STAFF,
    },
    {
      motionType: MotionType.ANTI,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.NORTH,
      startOrientation: Orientation.OUT,
      endOrientation: Orientation.IN,
      turns: 1,
      propType: PropType.STAFF,
    }
  );

  return createSequenceData({
    word: "AB",
    name: "AB",
    steps: [step1, step2],
    startPlacement: {
      id: startPos.id,
      letter: startPos.letter,
      gridPlacement: startPos.startPlacement,
      startPlacement: startPos.startPlacement,
      endPlacement: startPos.endPlacement,
      motions: startPos.motions,
    },
  });
}

describe("scan-import save/read round-trip (decoded blob → library copy → viewer)", () => {
  it("a decoded sequence survives ensureComposition", () => {
    const decoded = decodeSequence(encodeSequence(buildSourceSequence()));
    expect(decoded.steps.length).toBe(2);

    // saveSequence wraps this in try/catch and silently continues on throw —
    // which is exactly how a husk gets written. It must not throw.
    const composed = ensureComposition(decoded);
    expect(composed.stepPairings?.length).toBe(2);
    expect(composed.leftSoloProp).toBeTruthy();
    expect(composed.rightSoloProp).toBeTruthy();
  });

  it("steps re-derive after the Firestore write shape strips them", () => {
    const decoded = decodeSequence(encodeSequence(buildSourceSequence()));
    const composed = ensureComposition(decoded);

    // saveSequence persists WITHOUT steps (they re-derive on read).
    const storedShape = {
      ...composed,
      steps: [] as StepData[],
    } as SequenceData;

    const rehydrated = hydrate(storedShape);
    expect(rehydrated.steps.length).toBe(2);
    // The rebuilt motions must be real, not blank placeholders.
    expect(rehydrated.steps[0]?.motions?.left?.motionType).toBe(MotionType.PRO);
    expect(rehydrated.steps[0]?.motions?.right?.motionType).toBe(MotionType.ANTI);
  });

  it("collection member mapping hydrates a steps-less doc", async () => {
    // Regression for the actual sink of the bug: getCollectionSequences maps
    // docs through mapDocToSequence, which didn't hydrate — so a member saved
    // under the steps-stripped write shape reached the grid and viewer with no
    // steps at all. (Import lives at the bottom so the module's transitive
    // firebase deps only load in the test that needs them.)
    const { mapDocToSequence } = await import(
      "$lib/shared/library/services/collection-firestore-mapper"
    );

    const decoded = decodeSequence(encodeSequence(buildSourceSequence()));
    const composed = ensureComposition(decoded);
    const { steps: _steps, ...docShape } = composed as SequenceData &
      Record<string, unknown>;

    const member = mapDocToSequence(
      { ...docShape, createdAt: new Date(), updatedAt: new Date() },
      "X6DK"
    );
    expect(member.steps.length).toBe(2);
    expect(member.steps[0]?.motions?.left?.motionType).toBe(MotionType.PRO);
    // This test pays the one-time cost of transforming the mapper's transitive
    // firebase dep graph (~1.3s alone). Under a loaded parallel full-suite run
    // that overruns the 5s default and fails a green build, so give the import
    // headroom. Later tests reuse the cached module and stay fast.
  }, 20_000);

  it("collection member mapping converts birthday Timestamps to Dates", async () => {
    // The card renderer calls birthday.getFullYear() for the footer date; a
    // raw Firestore Timestamp there crashed every live thumbnail render in a
    // collection (cards stuck on the word placeholder).
    const { mapDocToSequence } = await import(
      "$lib/shared/library/services/collection-firestore-mapper"
    );

    const fakeTimestamp = { toDate: () => new Date("2024-03-01T00:00:00Z") };
    const member = mapDocToSequence(
      {
        word: "AB",
        createdAt: fakeTimestamp,
        updatedAt: fakeTimestamp,
        birthday: fakeTimestamp,
      },
      "doc-1"
    );
    expect(member.birthday).toBeInstanceOf(Date);
    expect((member.birthday as Date).getFullYear()).toBe(2024);

    // Absent stays absent — the renderer falls back to createdAt.
    const noBirthday = mapDocToSequence(
      { word: "AB", createdAt: fakeTimestamp, updatedAt: fakeTimestamp },
      "doc-2"
    );
    expect(noBirthday.birthday).toBeUndefined();
  });
});
