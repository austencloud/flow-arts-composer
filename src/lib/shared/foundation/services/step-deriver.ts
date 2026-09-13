import type { ViewerPreferences } from "./types";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { StepPairingData } from "../domain/models/step-pairing-data";
import type { SoloPropStepData } from "../domain/models/solo-prop-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { calculateHandpathDirection } from "$lib/shared/pictograph/arrow/positioning/calculation/services/handpath-direction-calculator";

const CARDINAL = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const INTERCARDINAL = new Set<GridLocation>([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);

function deriveStepGridMode(
  leftStart: GridLocation,
  leftEnd: GridLocation,
  rightStart: GridLocation,
  rightEnd: GridLocation
): GridMode {
  const locations = [leftStart, leftEnd, rightStart, rightEnd];

  if (locations.includes(GridLocation.CENTER)) {
    return GridMode.CENTRIC;
  }

  const allCardinal = locations.every((loc) => CARDINAL.has(loc));
  if (allCardinal) return GridMode.DIAMOND;

  const allIntercardinal = locations.every((loc) => INTERCARDINAL.has(loc));
  if (allIntercardinal) return GridMode.BOX;

  return GridMode.SKEWED;
}

function derivePrefloatRotation(
  prefloatMotionType: MotionType | undefined,
  startLocation: GridLocation,
  endLocation: GridLocation
): RotationDirection | undefined {
  if (!prefloatMotionType) return undefined;
  const handpath = calculateHandpathDirection(startLocation, endLocation);
  if (handpath === "cw") {
    return prefloatMotionType === MotionType.PRO
      ? RotationDirection.CLOCKWISE
      : RotationDirection.COUNTER_CLOCKWISE;
  }
  if (handpath === "ccw") {
    return prefloatMotionType === MotionType.PRO
      ? RotationDirection.COUNTER_CLOCKWISE
      : RotationDirection.CLOCKWISE;
  }
  return undefined;
}

/**
 * Canonical solo-step → motion rehydration. Exported because Fuse composes its
 * two hands in their own per-hand grid frames (a 45° adjustment can leave one
 * source on Box while its partner stays on Diamond) and so cannot go through
 * `deriveSteps`, which resolves one frame per step. Everything else about the
 * motion — prefloat provenance, handPath, skew, plane, arrow seed — must stay
 * identical to the two-hand path, so the fuser reuses this instead of building
 * its own motions.
 */
export function rehydrateMotion(
  step: SoloPropStepData,
  color: HandSide,
  gridMode: GridMode,
  propType: PropType
): MotionData {
  const prefloatRotationDirection = derivePrefloatRotation(
    step.prefloatMotionType,
    step.startLocation,
    step.endLocation
  );

  return createMotionData({
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    motionType: step.motionType,
    rotationDirection: step.rotationDirection,
    turns: step.turns,
    handPath: step.handPath ?? null,
    skewSteps: step.skewSteps ?? null,
    skewDir: step.skewDir ?? null,
    hand: color,
    propType,
    isVisible: true,
    gridMode,
    arrowLocation: step.startLocation,
    ...(step.plane && { plane: step.plane }),
    ...(step.prefloatMotionType && {
      prefloatMotionType: step.prefloatMotionType,
    }),
    ...(prefloatRotationDirection && { prefloatRotationDirection }),
  });
}

export function deriveSteps(
  leftSoloProp: SoloPropData,
  rightSoloProp: SoloPropData,
  stepPairings: readonly StepPairingData[],
  viewerPrefs?: ViewerPreferences
): StepData[] {
  const leftPropType = viewerPrefs?.leftPropType ?? PropType.STAFF;
  const rightPropType = viewerPrefs?.catDogMode
    ? (viewerPrefs.rightPropType ?? PropType.STAFF)
    : leftPropType;
  const count = stepPairings.length;

  if (
    leftSoloProp.steps.length !== count ||
    rightSoloProp.steps.length !== count
  ) {
    throw new Error(
      `deriveSteps: step array length mismatch - ` +
        `blue=${leftSoloProp.steps.length}, ` +
        `red=${rightSoloProp.steps.length}, ` +
        `pairings=${count}`
    );
  }

  return stepPairings.map((pairing, i) => {
    const leftStep = leftSoloProp.steps[i] as SoloPropStepData;
    const rightStep = rightSoloProp.steps[i] as SoloPropStepData;

    const gridMode = deriveStepGridMode(
      leftStep.startLocation,
      leftStep.endLocation,
      rightStep.startLocation,
      rightStep.endLocation
    );

    const leftMotion = rehydrateMotion(
      leftStep,
      HandSide.LEFT,
      gridMode,
      leftPropType
    );
    const rightMotion = rehydrateMotion(
      rightStep,
      HandSide.RIGHT,
      gridMode,
      rightPropType
    );

    const stepData: StepData = {
      id: crypto.randomUUID(),
      letter: pairing.letter,
      startPosition: pairing.startPosition,
      endPosition: pairing.endPosition,
      motions: { left: leftMotion, right: rightMotion },
      gridMode,
      stepNumber: i + 1,
      duration: leftStep.duration,
      leftReversal: pairing.leftReversal,
      rightReversal: pairing.rightReversal,
      isBlank: false,
    };

    return stepData;
  });
}

export function deriveStartPosition(
  leftSoloProp: SoloPropData,
  rightSoloProp: SoloPropData
): StartPositionData {
  const gridMode = deriveStepGridMode(
    leftSoloProp.startLocation,
    leftSoloProp.startLocation,
    rightSoloProp.startLocation,
    rightSoloProp.startLocation
  );

  const leftMotion = createMotionData({
    startLocation: leftSoloProp.startLocation,
    endLocation: leftSoloProp.startLocation,
    startOrientation: leftSoloProp.startOrientation,
    endOrientation: leftSoloProp.startOrientation,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    hand: HandSide.LEFT,
    propType: PropType.STAFF,
    isVisible: true,
    gridMode,
    arrowLocation: leftSoloProp.startLocation,
  });

  const rightMotion = createMotionData({
    startLocation: rightSoloProp.startLocation,
    endLocation: rightSoloProp.startLocation,
    startOrientation: rightSoloProp.startOrientation,
    endOrientation: rightSoloProp.startOrientation,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    hand: HandSide.RIGHT,
    propType: PropType.STAFF,
    isVisible: true,
    gridMode,
    arrowLocation: rightSoloProp.startLocation,
  });

  return {
    id: crypto.randomUUID(),
    isStartPosition: true,
    motions: { left: leftMotion, right: rightMotion },
    gridMode,
    gridPosition: null,
  };
}
