/**
 * MotionData3D - Extended motion data with plane context
 *
 * Adds plane information to the existing MotionData model.
 */

import type { Plane } from "@austencloud/scene-3d";
import type { GridJoinSpec } from "@tka/render-core";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

/**
 * Simplified motion configuration for testing
 * (Full MotionData has many more fields we don't need for the sandbox)
 */
export interface MotionConfig3D {
  /** The sequence's aligned joined-grid layout, when each hand has a grid. */
  gridJoin?: GridJoinSpec;
  /** Which joined grid carries this motion. */
  hand?: "left" | "right";
  /** Which plane this motion occurs on */
  plane: Plane;
  /** Starting grid location */
  startLocation: GridLocation;
  /** Ending grid location */
  endLocation: GridLocation;
  /** Type of motion (PRO, ANTI, STATIC, DASH, FLOAT) */
  motionType: MotionType;
  /** Rotation direction (CW, CCW, NO_ROTATION) */
  rotationDirection: RotationDirection;
  /** Number of turns (or "fl" for float) */
  turns: number;
  /** Starting orientation */
  startOrientation: Orientation;
  /** Ending orientation */
  endOrientation: Orientation;
  /**
   * Which plane to use for prop ROTATION quaternion calculation.
   * Defaults to `plane` when not specified.
   */
  rotationPlane?: Plane;
  /** Per-step path shape override. Absent = use global setting. */
  pathShape?: "arc" | "linear" | "concave";
  /**
   * Concavity depth for concave paths, 0..1. 0 = natural shallow dip
   * (legacy reflection depth), 1 = dip traces the center. Absent = 0.
   * Written by the wall-plane feasibility solver as a per-step override.
   */
  concaveDepth?: number;
}

/**
 * Create a default motion config for testing
 */
export function createDefaultMotionConfig(plane: Plane): MotionConfig3D {
  return {
    plane,
    startLocation: "n" as GridLocation,
    endLocation: "s" as GridLocation,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 1,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
  };
}

/**
 * Motion presets for quick testing
 */
export const MOTION_PRESETS: Record<string, Partial<MotionConfig3D>> = {
  "PRO N→S CW": {
    startLocation: "n" as GridLocation,
    endLocation: "s" as GridLocation,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 1,
  },
  "ANTI S→N CCW": {
    startLocation: "s" as GridLocation,
    endLocation: "n" as GridLocation,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    turns: 1,
  },
  "STATIC E→W": {
    startLocation: "e" as GridLocation,
    endLocation: "w" as GridLocation,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
  },
  "DASH NE→SW": {
    startLocation: "ne" as GridLocation,
    endLocation: "sw" as GridLocation,
    motionType: MotionType.DASH,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
  },
  "FLOAT W→E": {
    startLocation: "w" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.FLOAT,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
  },
};
