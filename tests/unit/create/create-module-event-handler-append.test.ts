import { describe, expect, it } from "vitest";
import { CreateModuleEventHandler } from "$lib/features/create/shared/services/create-module-event-handler";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { buildAppendedOptionSequence } from "$lib/features/create/construct/option-picker/services/build-appended-option-sequence";

const PLACEMENT_BY_LOCATION = {
  [GridLocation.NORTH]: GridPlacement.BETA1,
  [GridLocation.EAST]: GridPlacement.BETA3,
  [GridLocation.SOUTH]: GridPlacement.BETA5,
  [GridLocation.WEST]: GridPlacement.BETA7,
} as const;

function pictograph(
  id: string,
  start: GridLocation,
  end: GridLocation,
  direction = RotationDirection.CLOCKWISE
): PictographData {
  const createMotion = (color: HandSide) =>
    createMotionData({
      hand: color,
      motionType: MotionType.PRO,
      rotationDirection: direction,
      startLocation: start,
      endLocation: end,
      turns: 0.5,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      arrowLocation: start,
      gridMode: GridMode.DIAMOND,
    });

  return {
    id,
    letter: null,
    startPlacement: PLACEMENT_BY_LOCATION[start],
    endPlacement: PLACEMENT_BY_LOCATION[end],
    motions: {
      left: createMotion(HandSide.LEFT),
      right: createMotion(HandSide.RIGHT),
    },
  };
}

function sequenceFixture(): SequenceData {
  const startPictograph = pictograph(
    "start",
    GridLocation.NORTH,
    GridLocation.NORTH
  );
  const start = createStartPlacementData(startPictograph);
  const steps = [
    pictograph("one", GridLocation.NORTH, GridLocation.EAST),
    pictograph("two", GridLocation.EAST, GridLocation.SOUTH),
    pictograph("three", GridLocation.SOUTH, GridLocation.WEST),
  ].map((item, index) =>
    createStepData({
      ...item,
      stepNumber: index + 1,
    })
  );

  return createSequenceData({
    id: "sequence",
    name: "Append preview",
    startPlacement: start,
    startingPlacement: start,
    steps,
  });
}

describe("CreateModuleEventHandler option append", () => {
  it("reports the successful append without entering a workspace preview", async () => {
    const handler = new CreateModuleEventHandler();
    let current = sequenceFixture();
    const updates: SequenceData[] = [];
    const appliedOptions: Array<{
      sequence: SequenceData;
      stepNumber: number;
    }> = [];

    handler.setSequenceStateCallbacks(
      () => current,
      (sequence) => {
        updates.push(sequence);
        current = sequence;
      }
    );
    handler.setOptionAppliedCallback((sequence, stepNumber) => {
      appliedOptions.push({ sequence, stepNumber });
    });

    const candidate = pictograph("four", GridLocation.WEST, GridLocation.NORTH);
    const audition = buildAppendedOptionSequence(current, candidate);
    await handler.handleOptionSelected(candidate);

    expect(updates).toHaveLength(1);
    expect(current.steps).toHaveLength(4);
    expect(appliedOptions).toEqual([{ sequence: current, stepNumber: 4 }]);
    expect(current).toEqual(audition.sequence);
  });

  it("waits for an in-flight sequence creation instead of failing the tap", async () => {
    const handler = new CreateModuleEventHandler();
    let current: SequenceData | null = null;
    const updates: SequenceData[] = [];

    // Mirrors the construct flow: the option picker is already up while
    // createSequence() is still settling, so the sync getter returns null.
    const creation = new Promise<void>((resolve) => {
      setTimeout(() => {
        current = sequenceFixture();
        resolve();
      }, 0);
    });

    handler.setSequenceStateCallbacks(
      () => current,
      (sequence) => {
        updates.push(sequence);
        current = sequence;
      },
      async () => {
        await creation;
        return current;
      }
    );

    const candidate = pictograph("four", GridLocation.WEST, GridLocation.NORTH);
    await handler.handleOptionSelected(candidate);

    expect(updates).toHaveLength(1);
    expect(current!.steps).toHaveLength(4);
  });
});
