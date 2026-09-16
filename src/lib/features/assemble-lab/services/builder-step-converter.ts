/**
 * Builder Step Converter
 *
 * Converts visual builder's BuilderStep model into PictographData/MotionData.
 * Shared conversion boundary for Assemble's builder and sequence document.
 */

import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
  HandMotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  calculateHandPath,
  calculateMotionType,
  calculateRotationDirection,
} from "$lib/features/create/assemble/services/hand-path-motion-calculator";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
import type {
  BuilderStartPose,
  BuilderStep,
} from "../state/assemble-state.svelte";

/** Derive MotionType (PRO/ANTI/DASH/STATIC) from step data */
export function resolveMotionType(
  step: BuilderStep,
  gridMode: GridMode
): MotionType {
  const handMotionType = calculateMotionType(
    step.startPlacement,
    step.endPlacement,
    gridMode
  );
  switch (handMotionType) {
    case HandMotionType.STATIC:
      return MotionType.STATIC;
    case HandMotionType.DASH:
      return MotionType.DASH;
    // Hash motions use the same rotation behavior as dash (straight line, no arc)
    case HandMotionType.HASH_IN:
    case HandMotionType.HASH_OUT:
      return MotionType.DASH;
    case HandMotionType.SHIFT: {
      // Float: -0.5 turns cancels the arc rotation so the prop appears to float
      if (step.turnCount === -0.5) return MotionType.FLOAT;

      const handPathDir = calculateRotationDirection(
        step.startPlacement,
        step.endPlacement,
        gridMode
      );
      return handPathDir === step.rotationDirection
        ? MotionType.PRO
        : MotionType.ANTI;
    }
    default:
      return MotionType.STATIC;
  }
}

export interface BuilderHydration {
  readonly leftSteps: BuilderStep[];
  readonly rightSteps: BuilderStep[];
  readonly gridMode: GridMode;
  readonly startPoses: Partial<Record<HandSide, BuilderStartPose>>;
}

/** Recover the builder's editable motion fields without dropping sequence-only metadata. */
export function motionToBuilderStep(motion: MotionData): BuilderStep {
  return {
    startPlacement: motion.startLocation,
    endPlacement: motion.endLocation,
    rotationDirection: motion.rotationDirection,
    turnCount: motion.turns === "fl" ? -0.5 : motion.turns,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
  };
}

/**
 * Rebuild the per-hand builder model from the editable sequence document.
 * Invisible placeholder motions remain absent from the corresponding hand.
 */
export function sequenceToBuilderHydration(
  sequence: SequenceData
): BuilderHydration {
  const leftSteps: BuilderStep[] = [];
  const rightSteps: BuilderStep[] = [];

  for (const step of sequence.steps) {
    const left = step.motions[HandSide.LEFT];
    const right = step.motions[HandSide.RIGHT];
    if (isVisibleMotion(left)) leftSteps.push(motionToBuilderStep(left));
    if (isVisibleMotion(right)) rightSteps.push(motionToBuilderStep(right));
  }

  const startPoses: Partial<Record<HandSide, BuilderStartPose>> = {};
  const start = sequence.startingPlacement ?? sequence.startPlacement;
  const startLeft = start?.motions?.[HandSide.LEFT];
  const startRight = start?.motions?.[HandSide.RIGHT];

  if (isVisibleMotion(startLeft)) {
    startPoses[HandSide.LEFT] = {
      location: startLeft.startLocation,
      orientation: startLeft.startOrientation,
    };
  } else if (leftSteps[0]) {
    startPoses[HandSide.LEFT] = {
      location: leftSteps[0].startPlacement,
      orientation: leftSteps[0].startOrientation,
    };
  }

  if (isVisibleMotion(startRight)) {
    startPoses[HandSide.RIGHT] = {
      location: startRight.startLocation,
      orientation: startRight.startOrientation,
    };
  } else if (rightSteps[0]) {
    startPoses[HandSide.RIGHT] = {
      location: rightSteps[0].startPlacement,
      orientation: rightSteps[0].startOrientation,
    };
  }

  const firstVisibleMotion = sequence.steps
    .flatMap((step) => [
      step.motions[HandSide.LEFT],
      step.motions[HandSide.RIGHT],
    ])
    .find(isVisibleMotion);

  return {
    leftSteps,
    rightSteps,
    gridMode:
      sequence.gridMode ??
      start?.gridMode ??
      firstVisibleMotion?.gridMode ??
      GridMode.DIAMOND,
    startPoses,
  };
}

export function stepToMotion(
  step: BuilderStep,
  color: HandSide,
  gridMode: GridMode
): MotionData {
  const motionType = resolveMotionType(step, gridMode);
  const hasNoBaseRotation =
    motionType === MotionType.DASH || motionType === MotionType.STATIC;
  const resolvedRotation =
    motionType === MotionType.FLOAT ||
    (hasNoBaseRotation && step.turnCount === 0)
      ? RotationDirection.NO_ROTATION
      : step.rotationDirection;
  const resolvedTurns = motionType === MotionType.FLOAT ? "fl" : step.turnCount;

  const motion = createMotionData({
    hand: color,
    startLocation: step.startPlacement,
    endLocation: step.endPlacement,
    motionType,
    rotationDirection: resolvedRotation,
    turns: resolvedTurns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    gridMode,
    arrowLocation: step.startPlacement,
    handPath: calculateHandPath(step.startPlacement, step.endPlacement, gridMode),
    isVisible: true,
  });

  return withCalculatedArrowLocations({
    id: "builder-motion",
    motions: { [color]: motion },
    gridMode,
  }).motions[color]!;
}

/** Keep persisted arrow locations aligned with the canonical pictograph pipeline. */
export function withCalculatedArrowLocations<T extends PictographData>(
  pictograph: T
): T {
  const left = pictograph.motions[HandSide.LEFT];
  const right = pictograph.motions[HandSide.RIGHT];

  return {
    ...pictograph,
    motions: {
      ...(left && {
        [HandSide.LEFT]: {
          ...left,
          arrowLocation: arrowLocationCalculator.calculateLocation(
            left,
            pictograph
          ),
        },
      }),
      ...(right && {
        [HandSide.RIGHT]: {
          ...right,
          arrowLocation: arrowLocationCalculator.calculateLocation(
            right,
            pictograph
          ),
        },
      }),
    },
  } as T;
}

export function createStaticMotion(
  position: GridLocation,
  orientation: Orientation,
  color: HandSide,
  gridMode: GridMode
): MotionData {
  return createMotionData({
    hand: color,
    startLocation: position,
    endLocation: position,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    startOrientation: orientation,
    endOrientation: orientation,
    gridMode,
    arrowLocation: position,
    isVisible: true,
  });
}

export function convertToPictographs(
  leftSteps: BuilderStep[],
  rightSteps: BuilderStep[],
  gridMode: GridMode
): PictographData[] {
  const totalSteps = Math.max(leftSteps.length, rightSteps.length);
  const result: PictographData[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const leftStep = leftSteps[i];
    const rightStep = rightSteps[i];

    const motions: PictographData["motions"] = {};
    if (leftStep)
      motions[HandSide.LEFT] = stepToMotion(
        leftStep,
        HandSide.LEFT,
        gridMode
      );
    if (rightStep)
      motions[HandSide.RIGHT] = stepToMotion(
        rightStep,
        HandSide.RIGHT,
        gridMode
      );

    result.push(
      withCalculatedArrowLocations({
        id: `builder-step-${i}`,
        motions,
        gridMode,
      })
    );
  }

  return result;
}

export function convertToStartPlacement(
  startPoses: Partial<Record<HandSide, BuilderStartPose>>,
  leftSteps: BuilderStep[],
  rightSteps: BuilderStep[],
  gridMode: GridMode
): PictographData | null {
  const firstLeft = leftSteps[0];
  const firstRight = rightSteps[0];

  const leftPose =
    startPoses[HandSide.LEFT] ??
    (firstLeft
      ? {
          location: firstLeft.startPlacement,
          orientation: firstLeft.startOrientation,
        }
      : null);
  const rightPose =
    startPoses[HandSide.RIGHT] ??
    (firstRight
      ? {
          location: firstRight.startPlacement,
          orientation: firstRight.startOrientation,
        }
      : null);

  if (!leftPose && !rightPose) return null;

  const motions: PictographData["motions"] = {};
  if (leftPose)
    motions[HandSide.LEFT] = createStaticMotion(
      leftPose.location,
      leftPose.orientation,
      HandSide.LEFT,
      gridMode
    );
  if (rightPose)
    motions[HandSide.RIGHT] = createStaticMotion(
      rightPose.location,
      rightPose.orientation,
      HandSide.RIGHT,
      gridMode
    );

  return {
    id: "builder-start",
    motions,
    gridMode,
  };
}

export async function lookupLetter(
  leftMotion: MotionData,
  rightMotion: MotionData,
  gridMode: GridMode
): Promise<Letter | null> {
  const letter = await motionQueryHandler.findLetterByMotionConfiguration(
    leftMotion,
    rightMotion,
    gridMode
  );
  return (letter as Letter) ?? null;
}
