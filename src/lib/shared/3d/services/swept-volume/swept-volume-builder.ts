import { Vector3, Quaternion, Euler } from "three";
import { STAGE } from "@austencloud/scene-3d";
import { calculatePropState } from "$lib/shared/3d/services/prop-state-interpolator";
import type { PropState3D } from "@austencloud/scene-3d";
import type { MotionConfig3D } from "$lib/shared/3d/domain/models/motion-data-3d";
import type { SweptVolume, SweepSample } from "./types";

// Canonical staff geometry — must match pose-target-mapper.ts so the solver and
// the live collision agree (STAFF_HALF_LENGTH 0.43, STAFF_RADIUS 0.012 there).
const STAFF_HALF_LENGTH = 0.43;
const STAFF_RADIUS = 0.012;
const STAFF_HORIZONTAL_QUAT = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);
const UP = new Vector3(0, 1, 0);

/**
 * Sample a hand's motion into a swept volume: N staff instants, each a
 * SimPropTarget (grip + shaft segment) in the StanceSimulator's frame.
 *
 * The sweep is driven through `calculatePropState` — the SAME function the
 * renderer uses — so the swept volume matches what is drawn. The grip Z is
 * shifted by STAGE.AVATAR_GRID_OFFSET to move from the grid's center frame into
 * the avatar's shoulder-centered frame, exactly as pose-target-mapper.ts does;
 * that shift is what makes the swept volume align with the collision frame.
 */
export function buildSweptVolume(
  config: MotionConfig3D,
  sampleCount = 24
): SweptVolume {
  const samples: SweepSample[] = [];
  const n = Math.max(2, sampleCount);
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    const state = calculatePropState(config, progress);

    samples.push(propStateToStaffTarget(state));
  }
  return { samples };
}

/**
 * Convert a renderer-owned prop state to the rigid staff segment used by the
 * offline collision model. Consumers with score-time states use this instead
 * of recreating the avatar-frame translation or staff orientation.
 */
export function propStateToStaffTarget(
  state: PropState3D
): SweptVolume["samples"][number] {
  const grip = new Vector3(
    state.worldPosition.x,
    state.worldPosition.y,
    state.worldPosition.z + STAGE.AVATAR_GRID_OFFSET
  );
  const axis = UP.clone()
    .applyQuaternion(STAFF_HORIZONTAL_QUAT)
    .applyQuaternion(state.worldRotation)
    .multiplyScalar(STAFF_HALF_LENGTH);
  return {
    gripWorld: grip,
    tipAWorld: grip.clone().add(axis),
    tipBWorld: grip.clone().sub(axis),
    radius: STAFF_RADIUS,
  };
}
