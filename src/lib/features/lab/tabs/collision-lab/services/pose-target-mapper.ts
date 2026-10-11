import type { OptimizerBounds, OptimizerInput } from "./types";
import type { SimPropTarget } from "./types";
import type { DiamondPosition, PoseDefinition } from "../domain/types";
import type { Plane } from "@austencloud/scene-3d";
import {
  gridLocationToPosition3D,
  calculatePropRotation,
} from "#lib/shared/3d/services/plane-coordinate-mapper.js";
import { mapOrientationToAngle } from "#lib/shared/3d/services/orientation-mapper.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import { STAGE } from "@austencloud/scene-3d";
import { STANCE_BOUNDS } from "../domain/types";
import { Vector3, Quaternion, Euler } from "three";
import type { HandOrientation } from "../domain/types";

export const POSITION_TO_GRID: Record<DiamondPosition, GridLocation> = {
  N: GridLocation.NORTH,
  E: GridLocation.EAST,
  S: GridLocation.SOUTH,
  W: GridLocation.WEST,
};

const STAFF_HALF_LENGTH = 0.43;
const STAFF_RADIUS = 0.012;

const STAFF_HORIZONTAL_QUAT = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);

export function handToPropTarget(
  plane: Plane,
  position: DiamondPosition,
  orientation: HandOrientation
): SimPropTarget {
  const loc = POSITION_TO_GRID[position];
  const centerPathAngle = LOCATION_ANGLES[loc];
  const staffAngle = mapOrientationToAngle(
    orientation === "in" ? Orientation.IN : Orientation.OUT,
    centerPathAngle
  );
  const local = gridLocationToPosition3D(plane, loc);
  const worldRotation = calculatePropRotation(plane, staffAngle);

  const axis = new Vector3(0, 1, 0)
    .applyQuaternion(STAFF_HORIZONTAL_QUAT)
    .applyQuaternion(worldRotation)
    .multiplyScalar(STAFF_HALF_LENGTH);

  const grip = new Vector3(
    local.x,
    local.y,
    local.z + STAGE.AVATAR_GRID_OFFSET
  );
  return {
    gripWorld: grip,
    tipAWorld: grip.clone().add(axis),
    tipBWorld: grip.clone().sub(axis),
    radius: STAFF_RADIUS,
  };
}

export function poseToOptimizerInput(pose: PoseDefinition): OptimizerInput {
  return {
    left: handToPropTarget(
      pose.leftHand.plane,
      pose.leftHand.position,
      pose.leftHand.orientation
    ),
    right: handToPropTarget(
      pose.rightHand.plane,
      pose.rightHand.position,
      pose.rightHand.orientation
    ),
  };
}

export const OPTIMIZER_BOUNDS: OptimizerBounds = {
  footOffsetX: {
    min: STANCE_BOUNDS.footOffset.min,
    max: STANCE_BOUNDS.footOffset.max,
  },
  footOffsetZ: {
    min: STANCE_BOUNDS.footOffset.min,
    max: STANCE_BOUNDS.footOffset.max,
  },
  rootYawRad: {
    min: (STANCE_BOUNDS.rootYawDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.rootYawDeg.max * Math.PI) / 180,
  },
  spinePitchRad: {
    min: (STANCE_BOUNDS.spinePitchDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.spinePitchDeg.max * Math.PI) / 180,
  },
  torsoTwistRad: {
    min: (STANCE_BOUNDS.torsoTwistDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.torsoTwistDeg.max * Math.PI) / 180,
  },
};
