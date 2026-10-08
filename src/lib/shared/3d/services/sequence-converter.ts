/**
 * Converts SequenceData steps to MotionConfig3D.
 * Bridges the gap between 2D sequence data model and 3D animation system.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import {
  isVisibleMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import { Plane } from "@austencloud/scene-3d";
import {
  HandSide,
  MotionType,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PlaneModeConfig } from "@austencloud/scene-3d";
import type { GridJoinSpec } from "@tka/render-core";
import { resolveGridJoin3D } from "./grid-join-3d";

export interface StepMotionConfigs {
  stepNumber: number;
  left: MotionConfig3D | null;
  right: MotionConfig3D | null;
}

export function motionDataToConfig3D(
  motion: MotionData,
  fallbackPlane: Plane = Plane.WALL
): MotionConfig3D {
  const turns = motion.turns === "fl" ? 0 : (motion.turns as number);
  const plane = motion.plane ?? fallbackPlane;

  return {
    plane,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    turns,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    pathShape: motion.pathShape,
  };
}

/** Extract motion configs from a StepData or StartPlacementData object */
export function stepDataToConfigs(
  step: StepData | StartPlacementData,
  plane: Plane = Plane.WALL,
  modeConfig?: PlaneModeConfig,
  gridJoin?: GridJoinSpec | null
): StepMotionConfigs {
  const leftMotion = step.motions?.[HandSide.LEFT];
  const rightMotion = step.motions?.[HandSide.RIGHT];

  const stepNumber =
    "isStartPlacement" in step && step.isStartPlacement
      ? 0
      : ((step as StepData).stepNumber ?? 0);

  // @austencloud/scene-3d still exposes its legacy color-named boundary.
  // Normalize immediately into performer-relative locals.
  const leftPlane = modeConfig?.bluePlane ?? plane;
  const rightPlane = modeConfig?.redPlane ?? plane;
  const rotPlane = modeConfig?.rotationPlane;

  return {
    stepNumber,
    left: isVisibleMotion(leftMotion)
      ? {
          ...motionDataToConfig3D(leftMotion, leftPlane),
          rotationPlane: rotPlane,
          ...(gridJoin && { gridJoin, hand: "left" as const }),
        }
      : null,
    right: isVisibleMotion(rightMotion)
      ? {
          ...motionDataToConfig3D(rightMotion, rightPlane),
          rotationPlane: rotPlane,
          ...(gridJoin && { gridJoin, hand: "right" as const }),
        }
      : null,
  };
}

/** Derive a static start placement config from a motion step's starting angles. */
function deriveStartConfigFromStep(
  step: StepData | StartPlacementData,
  plane: Plane,
  modeConfig?: PlaneModeConfig,
  gridJoin?: GridJoinSpec | null
): StepMotionConfigs {
  const leftMotion = step.motions?.[HandSide.LEFT];
  const rightMotion = step.motions?.[HandSide.RIGHT];

  const leftPlane = modeConfig?.bluePlane ?? plane;
  const rightPlane = modeConfig?.redPlane ?? plane;

  return {
    stepNumber: 0,
    left: isVisibleMotion(leftMotion)
      ? {
          plane: leftMotion.plane ?? leftPlane,
          startLocation: leftMotion.startLocation,
          endLocation: leftMotion.startLocation,
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          turns: 0,
          startOrientation: leftMotion.startOrientation,
          endOrientation: leftMotion.startOrientation,
          ...(gridJoin && { gridJoin, hand: "left" as const }),
        }
      : null,
    right: isVisibleMotion(rightMotion)
      ? {
          plane: rightMotion.plane ?? rightPlane,
          startLocation: rightMotion.startLocation,
          endLocation: rightMotion.startLocation,
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          turns: 0,
          startOrientation: rightMotion.startOrientation,
          endOrientation: rightMotion.startOrientation,
          ...(gridJoin && { gridJoin, hand: "right" as const }),
        }
      : null,
  };
}

/**
 * Convert an entire sequence to an array of step motion configs.
 * Filters out step 0 (start placement).
 */
export function sequenceToMotionConfigs(
  sequence: SequenceData,
  plane: Plane = Plane.WALL,
  modeConfig?: PlaneModeConfig
): StepMotionConfigs[] {
  if (!sequence.steps || sequence.steps.length === 0) {
    return [];
  }
  const gridJoin = resolveGridJoin3D(sequence);

  return sequence.steps
    .filter((step) => step.stepNumber !== 0)
    .map((step) => stepDataToConfigs(step, plane, modeConfig, gridJoin))
    .sort((a, b) => a.stepNumber - b.stepNumber);
}

/** Get start placement configs from sequence */
export function getStartPlacementConfigs(
  sequence: SequenceData,
  plane: Plane = Plane.WALL,
  modeConfig?: PlaneModeConfig
): StepMotionConfigs | null {
  const gridJoin = resolveGridJoin3D(sequence);
  if (sequence.startPlacement) {
    return stepDataToConfigs(
      sequence.startPlacement,
      plane,
      modeConfig,
      gridJoin
    );
  }

  const step0 = sequence.steps?.find((step) => step.stepNumber === 0);
  if (step0) {
    return stepDataToConfigs(step0, plane, modeConfig, gridJoin);
  }

  if (sequence.startingPlacement) {
    return stepDataToConfigs(
      sequence.startingPlacement,
      plane,
      modeConfig,
      gridJoin
    );
  }

  const firstStep = sequence.steps?.find((step) => step.stepNumber !== 0);
  if (firstStep) {
    return deriveStartConfigFromStep(firstStep, plane, modeConfig, gridJoin);
  }

  return null;
}

/** Create default motion config */
export function createDefaultConfig(plane: Plane = Plane.WALL): MotionConfig3D {
  return {
    plane,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.NORTH,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  };
}
