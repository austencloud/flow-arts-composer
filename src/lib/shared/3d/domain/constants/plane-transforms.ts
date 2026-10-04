/**
 * Plane Transform Constants
 *
 * Defines the mathematical transformations for converting 2D angles
 * to 3D world coordinates based on plane context.
 *
 * Uses Three.js Y-up convention:
 * - X = performer's right (positive)
 * - Y = sky (positive)
 * - Z = toward audience (positive)
 */

import { Vector3, Euler, Quaternion } from "three";
import { Plane } from "@austencloud/scene-3d";

/**
 * Scale: 1 unit = 1 meter (unified meters scale)
 *
 * Grid radius is calculated as: staffLength * HAND_RADIUS_STAFF_RATIO (0.6)
 * For a 34" staff: 34" * 2.54 cm/in * 0.01 m/cm * 0.6 = ~0.52 meters
 *
 * This matches the handPointRadius calculation in user-proportions.ts
 * to ensure props align with grid point markers.
 */

/**
 * Default grid radius in meters.
 * This determines the distance from center to hand points.
 * Matches handPointRadius for default 34" staff (86.4cm * 0.01 * 0.6 ≈ 0.52m)
 *
 * Performers place their hands by their own hand distance
 * (`performer-hand-distance.ts`), which defaults to this. Labs and diagrams
 * that draw their own grids use it directly.
 */
export const GRID_RADIUS_3D = 0.52;

/**
 * Conversion factor from 2D canvas (950x950) to 3D meters
 * ~143px is the 2D hand point radius in canvas coords
 */
export const CANVAS_TO_3D_SCALE = GRID_RADIUS_3D / 143;

// 1/√2 - shared constant for all 45° fusion plane normals
const S2 = 1 / Math.sqrt(2);

/**
 * Unit normals for all 9 planes, pointing toward their canonical viewer.
 *
 * Primary planes align with world axes. Fusion planes are the normalized
 * bisectors of their two parent primaries - each component is 1/√2 so the
 * vector has unit length and bisects the 90° angle exactly.
 */
export const PLANE_NORMALS: Record<Plane, Vector3> = {
  // Primary planes - single axis
  [Plane.WALL]:          new Vector3(0,    0,   1),   // +Z toward audience
  [Plane.WHEEL]:         new Vector3(1,    0,   0),   // +X performer's right
  [Plane.FLOOR]:         new Vector3(0,    1,   0),   // +Y up

  // Fusion planes - bisectors of two primaries
  [Plane.RIGHT_SHIELD]:  new Vector3( S2,  0,   S2),  // Wall ∧ Wheel, right
  [Plane.LEFT_SHIELD]:   new Vector3(-S2,  0,   S2),  // Wall ∧ Wheel, left
  [Plane.FORWARD_RAMP]:  new Vector3(0,    S2, -S2),  // Wall ∧ Floor, top toward audience
  [Plane.BACKWARD_RAMP]: new Vector3(0,    S2,  S2),  // Wall ∧ Floor, top away
  [Plane.RIGHT_WING]:    new Vector3( S2,  S2,  0),   // Wheel ∧ Floor, right
  [Plane.LEFT_WING]:     new Vector3(-S2,  S2,  0),   // Wheel ∧ Floor, left
};

/**
 * Get the normal vector for a plane (points toward canonical viewer).
 * Returns a clone so callers can mutate freely.
 */
export function getPlaneNormal(plane: Plane): Vector3 {
  return (PLANE_NORMALS[plane] ?? PLANE_NORMALS[Plane.WALL]).clone();
}

/**
 * Derive orthonormal up/right basis vectors from any plane normal.
 *
 * When the normal is nearly parallel to world-Y (i.e. the floor plane and
 * wings) we use world-Z as the reference instead so the cross products
 * stay well-conditioned.
 */
function deriveUpRight(normal: Vector3): { up: Vector3; right: Vector3 } {
  const worldUp = new Vector3(0, 1, 0);
  // If normal is nearly parallel to world-up, use -Z as the reference axis
  // to avoid a degenerate cross product (|dot| > 0.9 ≈ within ~26° of parallel)
  const ref = Math.abs(normal.dot(worldUp)) > 0.9
    ? new Vector3(0, 0, -1)
    : worldUp;
  const right = new Vector3().crossVectors(ref, normal).normalize();
  const up    = new Vector3().crossVectors(normal, right).normalize();
  return { up, right };
}

/**
 * Convert a 2D path angle to a 3D world position on the specified plane.
 *
 * The angle follows the existing 2D convention:
 * - E = 0, S = π/2, W = π, N = -π/2 (canvas Y-down)
 *
 * This function maps those angles to 3D positions where:
 * - Each plane interprets N/E/S/W relative to its canonical viewpoint
 * - Y-axis inversion is applied (canvas Y-down → Three.js Y-up)
 *
 * Primary planes use sign-corrected hardcoded axes (tuned for the
 * screen-space camera orientation). Fusion planes use the generic
 * deriveUpRight helper so they always stay mathematically consistent
 * with their normal.
 *
 * @param plane - Which plane the position is on
 * @param angle - Path angle in radians (uses LOCATION_ANGLES convention)
 * @param radius - Distance from center (default: GRID_RADIUS_3D)
 * @returns Vector3 world position
 */
export function planeAngleToWorldPosition(
  plane: Plane,
  angle: number,
  radius: number = GRID_RADIUS_3D
): Vector3 {
  const cos_a = Math.cos(angle);
  const sin_a = Math.sin(angle);

  switch (plane) {
    case Plane.WALL:
      // XY plane. Learn camera at -Z: +X = screen LEFT (right-handed).
      // Negate X so east(0) → -X → screen RIGHT from -Z camera.
      return new Vector3(-cos_a * radius, -sin_a * radius, 0);

    case Plane.WHEEL:
      // YZ plane: X=0, Y=up, Z mirrored so positions match the pictograph
      // when viewed from the performer's right side (-X direction).
      return new Vector3(0, -sin_a * radius, cos_a * radius);

    case Plane.FLOOR:
      // X negated like wall; Z negated so NORTH (-π/2) maps to +Z (downstage)
      return new Vector3(-cos_a * radius, 0, -sin_a * radius);

    default: {
      // Fusion planes: project angle onto derived up/right basis.
      // Negations mirror the primary conventions (canvas Y-down → Y-up).
      const { up, right } = deriveUpRight(PLANE_NORMALS[plane]);
      return new Vector3()
        .addScaledVector(right, -cos_a * radius)
        .addScaledVector(up,    -sin_a * radius);
    }
  }
}

/**
 * Get the "up" direction within a plane (what direction is "N")
 */
export function getPlaneUp(plane: Plane): Vector3 {
  switch (plane) {
    case Plane.WALL:
      return new Vector3(0, 1, 0);    // N = up
    case Plane.WHEEL:
      return new Vector3(0, 1, 0);    // N = up
    case Plane.FLOOR:
      return new Vector3(0, 0, 1);    // N = downstage (+Z toward audience)
    default:
      return deriveUpRight(PLANE_NORMALS[plane]).up;
  }
}

/**
 * Get the "right" direction within a plane (what direction is "E")
 */
export function getPlaneRight(plane: Plane): Vector3 {
  switch (plane) {
    case Plane.WALL:
      return new Vector3(1, 0, 0);    // E = performer's right
    case Plane.WHEEL:
      return new Vector3(0, 0, -1);   // E = toward audience
    case Plane.FLOOR:
      return new Vector3(1, 0, 0);    // E = performer's right
    default:
      return deriveUpRight(PLANE_NORMALS[plane]).right;
  }
}

/**
 * Get the Euler rotation to orient an object to lie flat on a plane.
 *
 * Primary planes use tuned, exact rotations. Fusion planes derive their
 * rotation by aligning the default forward (+Z) with the plane's normal.
 */
export function getPlaneRotation(plane: Plane): Euler {
  switch (plane) {
    case Plane.WALL:
      return new Euler(0, 0, 0);
    case Plane.WHEEL:
      return new Euler(0, Math.PI / 2, 0);
    case Plane.FLOOR:
      return new Euler(-Math.PI / 2, 0, 0);
    default: {
      const normal = PLANE_NORMALS[plane];
      const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
      return new Euler().setFromQuaternion(quat);
    }
  }
}

/**
 * Get the quaternion to orient an object to lie flat on a plane
 */
export function getPlaneQuaternion(plane: Plane): Quaternion {
  const euler = getPlaneRotation(plane);
  return new Quaternion().setFromEuler(euler);
}

/**
 * Calculate prop/staff rotation quaternion.
 * Combines plane orientation with staff angle rotation.
 *
 * IMPORTANT: Staff angles use 2D canvas convention (Y-down, CW = positive).
 * Three.js uses Y-up convention where positive rotation = CCW.
 * We negate the angle to convert from canvas to Three.js convention.
 *
 * @param plane - The plane the prop is on
 * @param staffAngle - Staff rotation angle in radians (canvas convention)
 * @returns Quaternion for prop orientation
 */
export function calculatePropQuaternion(
  plane: Plane,
  staffAngle: number
): Quaternion {
  // staffAngle is computed in the 2D canvas coordinate system (wall plane's
  // local frame where Z is the normal). We spin around Z in this local frame,
  // then transform to world space using planeQuat.
  //
  const planeQuat = getPlaneQuaternion(plane);
  const staffQuat = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    staffAngle
  );
  return planeQuat.clone().multiply(staffQuat);
}
