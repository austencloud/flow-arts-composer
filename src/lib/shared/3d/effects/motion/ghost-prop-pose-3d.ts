import type { PropState3D } from "@austencloud/scene-3d";
import type { Vector3 } from "three";

export interface GhostPropPose3D {
  center: [number, number, number];
  propState: PropState3D;
}

function quantize(value: number, step: number): number {
  return Math.round(value / Math.max(step, Number.EPSILON));
}

/** Build a stable key for a rig-local center plus quaternion orientation. */
export function createGhostPropPoseKey3D(
  center: Pick<Vector3, "x" | "y" | "z">,
  propState: PropState3D,
  positionQuantization: number,
  angleQuantization: number
): string {
  const quaternion = propState.worldRotation;
  // q and -q encode the same rotation. Canonicalize the sign before bucketing.
  const sign = quaternion.w < 0 ? -1 : 1;
  const quaternionStep = Math.max(0.002, angleQuantization * 0.5);
  return [
    quantize(center.x, positionQuantization),
    quantize(center.y, positionQuantization),
    quantize(center.z, positionQuantization),
    quantize(quaternion.x * sign, quaternionStep),
    quantize(quaternion.y * sign, quaternionStep),
    quantize(quaternion.z * sign, quaternionStep),
    quantize(quaternion.w * sign, quaternionStep),
  ].join("|");
}

export function captureGhostPropPose3D(
  center: Pick<Vector3, "x" | "y" | "z">,
  propState: PropState3D
): GhostPropPose3D {
  return {
    center: [center.x, center.y, center.z],
    propState: {
      ...propState,
      worldPosition: propState.worldPosition.clone(),
      worldRotation: propState.worldRotation.clone(),
    },
  };
}
