import { Quaternion, Vector3 } from "three";
import { Plane, type PropState3D } from "@austencloud/scene-3d";

export type IsolationHand = "left" | "right";

// Dimensions authored by scripts/build-fire-double-staff-model.py.
export const ISOLATION_STAFF_CONTACT = {
  lengthM: 0.9,
  // The helical wrap rises 7.5% above the nominal 19 mm grip diameter.
  radiusM: (0.019 / 2) * 1.075,
} as const;
export const ISOLATION_ENDPOINT = [0, -0.15, 0.2] as const;
const AXIS = new Vector3(0, 0, 1);

export function wrapStaffIsolationPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return ((phase % 4) + 4) % 4;
}

/** One rigid staff rotating around its thumb end. Coordinates are grid-local;
 * PerformerRig owns the fixed grid-to-world transform. */
export function sampleStaffIsolation(phase: number): PropState3D {
  const angle = (wrapStaffIsolationPhase(phase) * Math.PI) / 2;
  const shaftRotation = new Quaternion().setFromAxisAngle(AXIS, -angle);
  // Prop3D lays its +Y model along -X before applying PropState3D rotation.
  // Keep the authored endpoint in model-axis space, then cancel that base tilt.
  const worldRotation = new Quaternion().setFromAxisAngle(
    AXIS,
    -angle - Math.PI / 2
  );
  const worldPosition = new Vector3(...ISOLATION_ENDPOINT).sub(
    new Vector3(0, ISOLATION_STAFF_CONTACT.lengthM / 2, 0).applyQuaternion(
      shaftRotation
    )
  );
  return {
    plane: Plane.WALL,
    centerPathAngle: angle + Math.PI / 2,
    staffRotationAngle: -angle - Math.PI / 2,
    worldPosition,
    worldRotation,
  };
}
