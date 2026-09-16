import { describe, it, expect } from "vitest";
import {
  computeHash,
  HASH_VERSION_V1,
  HASH_VERSION_V2,
} from "$lib/shared/library/services/sequence-content-hasher";
import {
  createSequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation, GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

function makeStep(overrides: Partial<StepData> = {}): StepData {
  const base: StepData = {
    id: "step-1",
    letter: null,
    startPlacement: null,
    endPlacement: null,
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        gridMode: GridMode.DIAMOND,
        hand: HandSide.LEFT,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 1,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.IN,
        gridMode: GridMode.DIAMOND,
        hand: HandSide.RIGHT,
      }),
    },
    ...overrides,
  };
  return base;
}

describe("SequenceContentHasher", () => {
  it("produces a deterministic 64-character hex hash (SHA-256)", async () => {
    const sequence = createSequenceData({
      name: "TEST",
      word: "TEST",
      steps: [makeStep()],
    });

    const hash1 = await computeHash(sequence);
    const hash2 = await computeHash(sequence);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different hash when turns change from 1 to 2", async () => {
    const step1Turn = makeStep();
    const step2Turns = makeStep({
      motions: {
        [HandSide.LEFT]: createMotionData({
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          turns: 2, // changed
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT,
          gridMode: GridMode.DIAMOND,
          hand: HandSide.LEFT,
        }),
        [HandSide.RIGHT]: createMotionData({
          motionType: MotionType.ANTI,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
          turns: 1,
          startOrientation: Orientation.OUT,
          endOrientation: Orientation.IN,
          gridMode: GridMode.DIAMOND,
          hand: HandSide.RIGHT,
        }),
      },
    });

    const seq1 = createSequenceData({ word: "A", steps: [step1Turn] });
    const seq2 = createSequenceData({ word: "A", steps: [step2Turns] });

    const hash1 = await computeHash(seq1);
    const hash2 = await computeHash(seq2);

    expect(hash1).not.toBe(hash2);
  });

  it("produces the same hash regardless of name, tags, or thumbnails", async () => {
    const step = makeStep();

    const seqA = createSequenceData({
      name: "Original Name",
      word: "WORD",
      steps: [step],
      tags: ["favorite", "performance"],
      thumbnails: ["https://example.com/thumb1.jpg"],
      notes: "My favorite sequence",
    });

    const seqB = createSequenceData({
      name: "Completely Different Name",
      word: "WORD",
      steps: [step],
      tags: [],
      thumbnails: [],
      notes: undefined,
    });

    const hashA = await computeHash(seqA);
    const hashB = await computeHash(seqB);

    expect(hashA).toBe(hashB);
  });

  it("produces a different hash when step order is swapped", async () => {
    const stepA = makeStep({ stepNumber: 1 });
    const stepB = makeStep({
      stepNumber: 2,
      motions: {
        [HandSide.LEFT]: createMotionData({
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: GridLocation.EAST,
          endLocation: GridLocation.WEST,
          turns: 0,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.COUNTER,
          gridMode: GridMode.DIAMOND,
          hand: HandSide.LEFT,
        }),
        [HandSide.RIGHT]: createMotionData({
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.NORTH,
          turns: 0,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          gridMode: GridMode.DIAMOND,
          hand: HandSide.RIGHT,
        }),
      },
    });

    const seqAB = createSequenceData({ word: "AB", steps: [stepA, stepB] });
    const seqBA = createSequenceData({ word: "AB", steps: [stepB, stepA] });

    const hashAB = await computeHash(seqAB);
    const hashBA = await computeHash(seqBA);

    expect(hashAB).not.toBe(hashBA);
  });

  it("grid mode is V1 identity but excluded from V2 (re-derived on hydrate)", async () => {
    const diamondStep = makeStep({ gridMode: GridMode.DIAMOND });
    const boxStep = makeStep({
      gridMode: GridMode.BOX,
      motions: {
        [HandSide.LEFT]: createMotionData({
          ...((makeStep().motions[HandSide.LEFT]) as ReturnType<typeof createMotionData>),
          gridMode: GridMode.BOX,
        }),
        [HandSide.RIGHT]: createMotionData({
          ...((makeStep().motions[HandSide.RIGHT]) as ReturnType<typeof createMotionData>),
          gridMode: GridMode.BOX,
        }),
      },
    });

    const seqDiamond = createSequenceData({
      word: "TEST",
      gridMode: GridMode.DIAMOND,
      steps: [diamondStep],
    });

    const seqBox = createSequenceData({
      word: "TEST",
      gridMode: GridMode.BOX,
      steps: [boxStep],
    });

    // V1: grid mode contributes to identity at seq/step/motion levels.
    expect(await computeHash(seqDiamond, HASH_VERSION_V1)).not.toBe(
      await computeHash(seqBox, HASH_VERSION_V1)
    );
    // V2: gridMode is re-derived on hydrate at every level, so it is dropped;
    // with identical locations these are the same physical identity.
    expect(await computeHash(seqDiamond, HASH_VERSION_V2)).toBe(
      await computeHash(seqBox, HASH_VERSION_V2)
    );
  });
});
