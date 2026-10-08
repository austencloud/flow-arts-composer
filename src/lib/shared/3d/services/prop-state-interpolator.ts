/**
 * Prop state interpolator — calculates PropState3D from MotionConfig3D and
 * progress [0-1]. Handles all motion types and plane transformations.
 */

import type { Vector3 } from "three";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { LOCATION_ANGLES } from "$lib/shared/foundation/domain/math-constants";
import type { PropState3D } from "@austencloud/scene-3d";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import {
  planeAngleToWorldPosition,
  calculatePropQuaternion,
} from "../domain/constants/plane-transforms";
import {
  DEFAULT_HAND_DISTANCE,
  type HandDistance,
} from "../domain/performer-hand-distance";
import { normalizeAngle, lerpAngle, lerp } from "./angle-math-calculator";
import { mapOrientationToAngle } from "./orientation-mapper";
import { concaveRadiusProfile } from "./petal-path";
import { calculateTargetStaffAngle } from "./motion-calculator";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { gridJoinOffset3D } from "./grid-join-3d";

/**
 * The concave petal path was built to give future teaching avatars a route
 * that ducks inside an anti-spin. It makes multi-turn anti motions visibly
 * split into separate dips, so 3D playback currently keeps every hand on the
 * normal grid arc. Keep the interpolator below intact while that teaching
 * work remains parked.
 */
const CONCAVE_PATHS_ENABLED_IN_3D = false;

type ResolvedPathType = "arc" | "linear" | "concave";

/** Grid center is carried so contact retraction can keep joined grids fixed. */
export type GridPropState3D = PropState3D & { gridCenter?: Vector3 };

/**
 * Interpolate center path angle (position on grid).
 * Center path ALWAYS uses shortest-path interpolation.
 */
function interpolateCenterPath(
  startAngle: number,
  endAngle: number,
  progress: number
): number {
  return lerpAngle(startAngle, endAngle, progress);
}

/**
 * Interpolate DASH motion in Cartesian space (straight line through center).
 */
function interpolateDashPosition(
  config: MotionConfig3D,
  startAngle: number,
  endAngle: number,
  progress: number,
  handDistance: HandDistance
): { worldPosition: Vector3; centerPathAngle: number } {
  const startX = Math.cos(startAngle);
  const startY = Math.sin(startAngle);
  const endX = Math.cos(endAngle);
  const endY = Math.sin(endAngle);

  const currentX = lerp(startX, endX, progress);
  const currentY = lerp(startY, endY, progress);

  const radius = Math.sqrt(currentX * currentX + currentY * currentY);
  const centerPathAngle = Math.atan2(currentY, currentX);

  const worldPosition = planeAngleToWorldPosition(
    config.plane,
    centerPathAngle,
    radius * handDistance.toward(config.plane, centerPathAngle)
  );

  return { worldPosition, centerPathAngle };
}

function resolvePathType(
  motionType: MotionType,
  motionPathShape?: ResolvedPathType
): ResolvedPathType {
  if (motionPathShape) {
    return !CONCAVE_PATHS_ENABLED_IN_3D && motionPathShape === "concave"
      ? "arc"
      : motionPathShape;
  }
  if (motionType === MotionType.DASH) return "linear";
  if (motionType === MotionType.STATIC) return "arc";

  const vm = getAnimationVisibilityManager();
  if (CONCAVE_PATHS_ENABLED_IN_3D && vm.getMotionAwarePaths()) {
    if (motionType === MotionType.PRO) return "arc";
    if (motionType === MotionType.ANTI) return "concave";
  }

  const globalPathShape = vm.getPathShape();
  return !CONCAVE_PATHS_ENABLED_IN_3D && globalPathShape === "concave"
    ? "arc"
    : globalPathShape;
}

function interpolateConcavePosition(
  config: MotionConfig3D,
  startAngle: number,
  endAngle: number,
  progress: number,
  handDistance: HandDistance
): { worldPosition: Vector3; centerPathAngle: number } {
  // Angle rides the arc; the petal model modulates radius only. The old
  // chord-reflection produced one mid-step dip regardless of turns — the
  // petal profile dips once per petal (petalsPerStep = 1 + turns).
  const centerPathAngle = lerpAngle(startAngle, endAngle, progress);
  const turns = typeof config.turns === "number" ? config.turns : 0;
  const radius = concaveRadiusProfile(
    progress,
    turns,
    config.concaveDepth ?? 0
  );

  const worldPosition = planeAngleToWorldPosition(
    config.plane,
    centerPathAngle,
    radius * handDistance.toward(config.plane, centerPathAngle)
  );

  return { worldPosition, centerPathAngle };
}

/**
 * Calculate PropState3D from config and progress.
 *
 * `handDistance` is how far this hand sits from its grid center. Performers
 * pass their own; labs and diagrams that draw their own grids take the fixed
 * default.
 */
export function calculatePropState(
  config: MotionConfig3D,
  progress: number,
  handDistance: HandDistance = DEFAULT_HAND_DISTANCE
): GridPropState3D {
  const gridCenter =
    config.gridJoin && config.hand
      ? gridJoinOffset3D(
          config.gridJoin,
          config.hand,
          config.plane,
          handDistance
        )
      : undefined;
  const joinedPosition = (position: Vector3): Vector3 =>
    gridCenter ? position.add(gridCenter) : position;
  const startCenterAngle = LOCATION_ANGLES[config.startLocation] ?? 0;
  const endCenterAngle = LOCATION_ANGLES[config.endLocation] ?? 0;

  const startStaffAngle = mapOrientationToAngle(
    config.startOrientation,
    startCenterAngle
  );

  const targetStaffAngle = calculateTargetStaffAngle(
    config,
    startStaffAngle,
    startCenterAngle,
    endCenterAngle
  );

  const hasTurns = config.turns > 0;
  const staffRotationAngle = hasTurns
    ? normalizeAngle(
        startStaffAngle + (targetStaffAngle - startStaffAngle) * progress
      )
    : lerpAngle(startStaffAngle, targetStaffAngle, progress);

  const worldRotation = calculatePropQuaternion(
    config.rotationPlane ?? config.plane,
    staffRotationAngle
  );

  const pathType = resolvePathType(config.motionType, config.pathShape);

  if (pathType === "linear") {
    const { worldPosition, centerPathAngle } = interpolateDashPosition(
      config,
      startCenterAngle,
      endCenterAngle,
      progress,
      handDistance
    );

    return {
      plane: config.plane,
      centerPathAngle,
      staffRotationAngle,
      worldPosition: joinedPosition(worldPosition),
      ...(gridCenter && { gridCenter }),
      worldRotation,
    };
  }

  if (pathType === "concave") {
    const { worldPosition, centerPathAngle } = interpolateConcavePosition(
      config,
      startCenterAngle,
      endCenterAngle,
      progress,
      handDistance
    );

    return {
      plane: config.plane,
      centerPathAngle,
      staffRotationAngle,
      worldPosition: joinedPosition(worldPosition),
      ...(gridCenter && { gridCenter }),
      worldRotation,
    };
  }

  const centerPathAngle = interpolateCenterPath(
    startCenterAngle,
    endCenterAngle,
    progress
  );

  const worldPosition = planeAngleToWorldPosition(
    config.plane,
    centerPathAngle,
    handDistance.toward(config.plane, centerPathAngle)
  );

  return {
    plane: config.plane,
    centerPathAngle,
    staffRotationAngle,
    worldPosition: joinedPosition(worldPosition),
    ...(gridCenter && { gridCenter }),
    worldRotation,
  };
}

/**
 * Compute the start-position PropState3D (progress = 0).
 */
export function getStartPropState(
  config: MotionConfig3D,
  handDistance: HandDistance = DEFAULT_HAND_DISTANCE
): PropState3D {
  return calculatePropState(config, 0, handDistance);
}
