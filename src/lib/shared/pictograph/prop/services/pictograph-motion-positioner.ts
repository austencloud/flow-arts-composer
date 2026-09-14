import { calculateMotionEndpoints } from "$lib/shared/animation-engine/services/endpoint-calculator";
import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { calculatePropCenter } from "$lib/shared/animation-engine/services/prop-position-calculator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  GridLocation,
  type GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { pictographRequiresStrictHandpoints } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import type { PropPosition } from "$lib/shared/pictograph/prop/domain/models/prop-position";
import { DefaultPropPositioner } from "$lib/shared/pictograph/prop/services/default-prop-positioner";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HAND_SIDES, type HandSide } from "@tka/tka-types";

type PropPositions = Partial<Record<HandSide, PropPosition>>;

interface PictographMotionPositionInput {
  step: StepData;
  progress: number;
  gridMode: GridMode;
  leftPropType: string;
  rightPropType: string;
  startPositions: PropPositions;
  endPositions: PropPositions;
}

const PICTOGRAPH_SIZE = 950;
const PICTOGRAPH_CENTER = PICTOGRAPH_SIZE / 2;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function nearestEquivalentAngle(angle: number, reference: number): number {
  return angle + Math.round((reference - angle) / 360) * 360;
}

function resolveGridRadius(
  gridMode: GridMode,
  leftPropType: string,
  rightPropType: string
): number {
  const north = DefaultPropPositioner.calculatePosition(
    GridLocation.NORTH,
    gridMode,
    pictographRequiresStrictHandpoints(leftPropType, rightPropType)
  );
  return Math.hypot(north.x - PICTOGRAPH_CENTER, north.y - PICTOGRAPH_CENTER);
}

function calculateBasePosition(
  state: PropState,
  gridRadius: number
): Pick<PropPosition, "x" | "y"> {
  return calculatePropCenter(state, {
    canvasSize: PICTOGRAPH_SIZE,
    gridHalfwayOffset: gridRadius,
    propDimensions: { width: 0, height: 0 },
  });
}

/**
 * Maps animation-engine interpolation into the pictograph's exact SVG geometry.
 * Prepared start/end positions supply the endpoint corrections, so progress 0
 * and 1 are pixel-identical to the static pictographs rendered on either side.
 */
export function calculatePictographMotionPositions({
  step,
  progress,
  gridMode,
  leftPropType,
  rightPropType,
  startPositions,
  endPositions,
}: PictographMotionPositionInput): PropPositions {
  const clampedProgress = clampProgress(progress);
  const interpolation = interpolatePropAngles(step, clampedProgress);
  const startInterpolation = interpolatePropAngles(step, 0);
  const endInterpolation = interpolatePropAngles(step, 1);
  const gridRadius = resolveGridRadius(gridMode, leftPropType, rightPropType);
  const positions: PropPositions = {};

  for (const hand of HAND_SIDES) {
    const motion = step.motions[hand];
    const currentState = interpolation[`${hand}Angles`];
    const startState = startInterpolation[`${hand}Angles`];
    const endState = endInterpolation[`${hand}Angles`];
    const preparedStart = startPositions[hand];
    const preparedEnd = endPositions[hand];

    if (
      !isVisibleMotion(motion) ||
      !currentState ||
      !startState ||
      !endState ||
      !preparedEnd
    ) {
      continue;
    }

    if (clampedProgress === 0 && preparedStart) {
      positions[hand] = { ...preparedStart };
      continue;
    }

    if (clampedProgress === 1) {
      positions[hand] = { ...preparedEnd };
      continue;
    }

    const baseCurrent = calculateBasePosition(currentState, gridRadius);
    const baseStart = calculateBasePosition(startState, gridRadius);
    const baseEnd = calculateBasePosition(endState, gridRadius);
    const startPosition = preparedStart ?? {
      ...baseStart,
      rotation: startState.staffRotationAngle * RADIANS_TO_DEGREES,
    };

    const endpoints = calculateMotionEndpoints(motion);
    const unwrappedRotation =
      (endpoints.startStaffAngle +
        endpoints.staffRotationDelta * clampedProgress) *
      RADIANS_TO_DEGREES;
    const unwrappedStartRotation =
      endpoints.startStaffAngle * RADIANS_TO_DEGREES;
    const unwrappedEndRotation =
      (endpoints.startStaffAngle + endpoints.staffRotationDelta) *
      RADIANS_TO_DEGREES;
    const correctedStartRotation = nearestEquivalentAngle(
      startPosition.rotation,
      unwrappedStartRotation
    );
    const correctedEndRotation = nearestEquivalentAngle(
      preparedEnd.rotation,
      unwrappedEndRotation
    );

    positions[hand] = {
      x:
        baseCurrent.x +
        lerp(
          startPosition.x - baseStart.x,
          preparedEnd.x - baseEnd.x,
          clampedProgress
        ),
      y:
        baseCurrent.y +
        lerp(
          startPosition.y - baseStart.y,
          preparedEnd.y - baseEnd.y,
          clampedProgress
        ),
      // Match the 2D animator: hand symbols travel upright, unlike rotating props.
      rotation:
        (hand === "left" ? leftPropType : rightPropType).toLowerCase() ===
        "hand"
          ? 0
          : unwrappedRotation +
            lerp(
              correctedStartRotation - unwrappedStartRotation,
              correctedEndRotation - unwrappedEndRotation,
              clampedProgress
            ),
    };
  }

  return positions;
}
