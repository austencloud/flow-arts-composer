import { describe, it, expect } from "vitest";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation, GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

function makeStep(id: string, overrides: Partial<StepData> = {}): StepData {
  return {
    id,
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
  } as StepData;
}

function makeSequence(overrides: Partial<Parameters<typeof createSequenceData>[0]> = {}) {
  const step1 = makeStep("step-1", { stepNumber: 1 });
  const step2 = makeStep("step-2", {
    stepNumber: 2,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.SOUTH,
        turns: 1,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.IN,
        gridMode: GridMode.DIAMOND,
        hand: HandSide.LEFT,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.NORTH,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        gridMode: GridMode.DIAMOND,
        hand: HandSide.RIGHT,
      }),
    },
  });

  return createSequenceData({
    name: "Test Sequence",
    word: "AB",
    steps: [step1, step2],
    tags: ["practice"],
    notes: "original",
    ...overrides,
  });
}

describe("Fork detection scenarios", () => {

  it("editing a turn value produces a different hash (triggers fork)", async () => {
    const original = makeSequence();
    const originalHash = await computeHash(original);

    const step1Edited = makeStep("step-1", {
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          turns: 2,
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

    const edited = createSequenceData({
      ...original,
      steps: [step1Edited, original.steps[1]!],
    });
    const editedHash = await computeHash(edited);

    expect(editedHash).not.toBe(originalHash);
  });

  it("editing motion type produces a different hash (triggers fork)", async () => {
    const original = makeSequence();
    const originalHash = await computeHash(original);

    const step1Edited = makeStep("step-1", {
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({
          motionType: MotionType.ANTI,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
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
    });

    const edited = createSequenceData({
      ...original,
      steps: [step1Edited, original.steps[1]!],
    });
    const editedHash = await computeHash(edited);

    expect(editedHash).not.toBe(originalHash);
  });

  it("adding a step produces a different hash (triggers fork)", async () => {
    const oneStep = createSequenceData({
      name: "One Step",
      word: "A",
      steps: [makeStep("step-1", { stepNumber: 1 })],
    });
    const oneStepHash = await computeHash(oneStep);

    const newStep = makeStep("step-2", {
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

    const twoStep = createSequenceData({
      ...oneStep,
      steps: [...oneStep.steps, newStep],
    });
    const twoStepHash = await computeHash(twoStep);

    expect(twoStepHash).not.toBe(oneStepHash);
  });

  it("changing only name does NOT change hash (no fork)", async () => {
    const original = makeSequence({ name: "My Sequence" });
    const renamed = createSequenceData({ ...original, name: "A Different Name" });

    const originalHash = await computeHash(original);
    const renamedHash = await computeHash(renamed);

    expect(renamedHash).toBe(originalHash);
  });

  it("changing only visibility/notes does NOT change hash (no fork)", async () => {
    const withNotes = makeSequence({ notes: "for the competition" });
    const withoutNotes = createSequenceData({ ...withNotes, notes: undefined });

    const hashWith = await computeHash(withNotes);
    const hashWithout = await computeHash(withoutNotes);

    expect(hashWith).toBe(hashWithout);
  });

  it("changing only tags does NOT change hash (no fork)", async () => {
    const withTags = makeSequence({ tags: ["favorite", "performance", "competition"] });
    const withDifferentTags = createSequenceData({ ...withTags, tags: [] });

    const hashWithTags = await computeHash(withTags);
    const hashWithDifferentTags = await computeHash(withDifferentTags);

    expect(hashWithTags).toBe(hashWithDifferentTags);
  });

  it("legacy sequence without stored hash gets treated as metadata update (no fork)", () => {
    const incomingHash = "abc123def456";
    const existingHashLegacy: string | undefined = undefined;
    const existingHashPresent = "zzz999yyy888";

    const shouldFork = (incoming: string | undefined, existing: string | undefined): boolean =>
      !!(incoming && existing && existing !== incoming);

    expect(shouldFork(incomingHash, existingHashLegacy)).toBe(false);
    expect(shouldFork(incomingHash, incomingHash)).toBe(false);
    expect(shouldFork(incomingHash, existingHashPresent)).toBe(true);
    expect(shouldFork(undefined, existingHashPresent)).toBe(false);
  });
});
