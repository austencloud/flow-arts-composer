/**
 * Carried props: the approved carry poses, for anyone walking or standing
 * with a prop they are not spinning (Flow Fest attendees, villagers).
 *
 * Austen approved three poses from the 2026-10-21 carry mockups, and the
 * Unreal build carries the same three:
 *
 * - S1, staff while walking: upright just outside the right hip, gripped at
 *   its balance point at waist height, both ends clear of the ground.
 * - S2, staff while standing: nearly vertical beside the right foot, lower end
 *   resting on the ground, the hand at waist height.
 * - H1, big hoop over the shoulder: the right hand holds the upper front arc
 *   beside the shoulder, elbow down, and the hoop hangs in a vertical plane
 *   along the body's right side. Same walking and standing.
 *
 * This module owns only the arithmetic, in the body frame: origin on the
 * ground under the character, +Y up, +Z forward, and the character's left at
 * +X (so the right hand works at -X). The Three.js half, which finds the
 * bones and writes the right arm after locomotion, is `prop-carry-rig.ts`.
 */

import { Vector3 } from "three";

export type CarryKind = "staff" | "hoop";

export interface CarryAssignment {
  kind: CarryKind;
  color: "blue" | "red";
}

/**
 * The canonical prop each carry renders. Staff is the app's staff
 * (`createStaffObject`), hoop is the app's big hoop.
 */
export const CARRY_PROP_TYPES: Readonly<
  Record<CarryKind, "staff" | "bighoop">
> = Object.freeze({ staff: "staff", hoop: "bighoop" });

/** A long single staff, end to end. */
export const CARRY_STAFF_LENGTH_M = 1.45;
/** Shaft radius; the end caps are spheres of the same radius. */
export const CARRY_STAFF_RADIUS_M = 0.0125;

/**
 * Centreline radius of the app's big hoop: the 18.5 in hoop's outer diameter
 * less its tube, times the big-prop scale of 1.4, exactly as
 * `worker-procedural-props.ts` builds it. 0.66 m outer diameter.
 */
export const CARRY_HOOP_RADIUS_M = (0.4699 / 2 - 0.015875 / 2) * 1.4;

/**
 * The few body measurements the poses scale to, in metres above the ground
 * and to the side of the body centreline. The rig measures them from the
 * loaded skeleton; the defaults are the Mixamo `ch01` proportions.
 */
export interface CarryBodyMetrics {
  /** Height of the right shoulder joint (the upper-arm bone's origin). */
  shoulderHeight: number;
  /** Distance of the right shoulder joint from the centreline. */
  shoulderLateral: number;
  /** Height of the hips bone, the pelvis centre. */
  hipHeight: number;
}

export const CARRY_DEFAULT_METRICS: Readonly<CarryBodyMetrics> = Object.freeze({
  shoulderHeight: 1.42,
  shoulderLateral: 0.17,
  hipHeight: 0.98,
});

/** Seconds to blend between S1 and S2 when the person starts or stops. */
export const CARRY_STAND_BLEND_SECONDS = 0.5;

/** The lowest the S1 staff's lower end may ride above the ground. */
export const CARRY_S1_MIN_CLEARANCE_M = 0.15;

/**
 * One carry pose in the body frame.
 *
 * The prop frame is the same for both props: its origin is where the fist
 * closes on the prop. For the staff, `propUp` runs along the shaft from the
 * lower end to the upper end. For the hoop, `propUp` points from the grip to
 * the hoop's centre and `propNormal` is the normal of the hoop's plane.
 */
export interface CarryPose {
  grip: Vector3;
  propUp: Vector3;
  propNormal: Vector3;
  /** Staff only: shaft length from the lower end to the grip. */
  gripFromLowerEnd: number;
  /** Wrist to middle knuckle, the direction the fingers point. */
  handForward: Vector3;
  /** Index knuckle to little-finger knuckle. */
  handAcross: Vector3;
  /** Which way the elbow points. */
  elbowPole: Vector3;
}

export function createCarryPose(): CarryPose {
  return {
    grip: new Vector3(),
    propUp: new Vector3(0, 1, 0),
    propNormal: new Vector3(1, 0, 0),
    gripFromLowerEnd: 0,
    handForward: new Vector3(0, 0, 1),
    handAcross: new Vector3(0, -1, 0),
    elbowPole: new Vector3(0, -1, 0),
  };
}

/**
 * Advance the walk-to-stand weight: 0 is S1, 1 is S2. Linear in time; the
 * pose eases it with a smoothstep so neither end starts or stops abruptly.
 */
export function advanceCarryStandWeight(
  weight: number,
  isMoving: boolean,
  deltaSeconds: number
): number {
  const step = Math.max(0, deltaSeconds) / CARRY_STAND_BLEND_SECONDS;
  return isMoving ? Math.max(0, weight - step) : Math.min(1, weight + step);
}

// Module scratch. The solver writes only into its `out` pose and these.
const s1Grip = new Vector3();
const s1Axis = new Vector3();
const s2Grip = new Vector3();
const s2Axis = new Vector3();
const s2Lower = new Vector3();
const scratch = new Vector3();

/** Height of the waistband the staff hand rests at. */
function waistHeight(metrics: CarryBodyMetrics): number {
  return metrics.hipHeight - 0.01;
}

function staffS1(metrics: CarryBodyMetrics): number {
  const half = CARRY_STAFF_LENGTH_M / 2;
  // Upright with the top a few degrees forward and out, the way a staff
  // settles when it swings a little with the walk.
  s1Axis.set(-Math.sin(0.03), 1, Math.sin(0.06)).normalize();
  const gripY = Math.max(
    waistHeight(metrics),
    half * s1Axis.y + CARRY_S1_MIN_CLEARANCE_M
  );
  // A hand's length in front of the hip line, so the upper arm can hang
  // close to the torso while the forearm reaches forward and down to it.
  s1Grip.set(-(metrics.shoulderLateral + 0.09), gripY, 0.2);
  return half;
}

function staffS2(metrics: CarryBodyMetrics): number {
  // The lower cap sits on the ground beside the right foot; the shaft leans a
  // few degrees out and forward so it reads as resting, not planted.
  s2Lower.set(-(metrics.shoulderLateral + 0.08), CARRY_STAFF_RADIUS_M, 0.1);
  s2Axis.set(-Math.sin(0.05), 1, Math.sin(0.08)).normalize();
  // The hand stays at waist height; how far up the shaft that is follows
  // from where the lower end rests. The staff slides through the loosened
  // fist on the way down from S1.
  const gripFromLower = (waistHeight(metrics) - s2Lower.y) / s2Axis.y;
  s2Grip.copy(s2Lower).addScaledVector(s2Axis, gripFromLower);
  return gripFromLower;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * The staff pose for a walk-to-stand weight: S1 at 0, S2 at 1. Every output
 * is a smooth function of the weight, so a start or stop never pops.
 */
export function solveStaffCarryPose(
  metrics: CarryBodyMetrics,
  standWeight: number,
  out: CarryPose
): CarryPose {
  const t = smoothstep(standWeight);
  const s1Offset = staffS1(metrics);
  const s2Offset = staffS2(metrics);

  out.grip.copy(s1Grip).lerp(s2Grip, t);
  out.propUp.copy(s1Axis).lerp(s2Axis, t).normalize();
  out.gripFromLowerEnd = s1Offset + (s2Offset - s1Offset) * t;
  // Any normal to the shaft; the staff is round. Kept horizontal.
  out.propNormal.set(0, 0, 1).cross(out.propUp).normalize();

  // A hammer grip with the wrist in line with the forearm: the fingers point
  // forward, a little inward and down, and the shaft crosses the palm on a
  // slight diagonal with the thumb on top.
  out.handForward.set(0.2, -0.6, 1).normalize();
  out.handAcross.copy(out.propUp).negate();
  orthogonalize(out.handAcross, out.handForward);
  // The elbow hangs down, a little back and out, so the upper arm stays
  // close to the torso.
  out.elbowPole.set(-0.3, -1, -0.4).normalize();
  return out;
}

/** Angle from the top of the hoop to the grip, toward the front. */
const HOOP_GRIP_ARC_RADIANS = (25 * Math.PI) / 180;

/**
 * H1. The hoop's plane clears the shoulder by the hand's width, and the grip
 * sits at shoulder height a hand's length in front of it, so the forearm
 * rises from an elbow that points down.
 */
export function solveHoopCarryPose(
  metrics: CarryBodyMetrics,
  out: CarryPose
): CarryPose {
  const planeX = -(metrics.shoulderLateral + 0.13);
  out.grip.set(planeX, metrics.shoulderHeight, 0.16);
  const cos = Math.cos(HOOP_GRIP_ARC_RADIANS);
  const sin = Math.sin(HOOP_GRIP_ARC_RADIANS);
  // From the grip down and back to the centre, so the rear arc hangs behind
  // the shoulder and hip and the lower arc reaches the thigh.
  out.propUp.set(0, -cos, -sin);
  out.propNormal.set(1, 0, 0);
  out.gripFromLowerEnd = 0;

  // The fist closes over the tube with the fingers pointing out of the hoop
  // (radially) and the knuckles following the tube forward and down. With the
  // elbow below, that keeps the wrist straight.
  out.handForward.set(0, cos, sin);
  out.handAcross.set(0, -sin, cos);
  out.elbowPole.set(-0.3, -1, 0).normalize();
  return out;
}

export function solveCarryPose(
  kind: CarryKind,
  metrics: CarryBodyMetrics,
  standWeight: number,
  out: CarryPose
): CarryPose {
  return kind === "staff"
    ? solveStaffCarryPose(metrics, standWeight, out)
    : solveHoopCarryPose(metrics, out);
}

/** The staff's two shaft end points for a staff pose. */
export function carryStaffEnds(
  pose: CarryPose,
  lower: Vector3,
  upper: Vector3
): void {
  lower.copy(pose.grip).addScaledVector(pose.propUp, -pose.gripFromLowerEnd);
  upper.copy(lower).addScaledVector(pose.propUp, CARRY_STAFF_LENGTH_M);
}

/**
 * How far along `propUp` the rendered prop's own origin sits from the grip.
 * The staff mesh is centred on its shaft; the hoop mesh is built with its
 * grip at the origin.
 */
export function carryPropOriginOffset(
  kind: CarryKind,
  pose: CarryPose
): number {
  return kind === "staff"
    ? CARRY_STAFF_LENGTH_M / 2 - pose.gripFromLowerEnd
    : 0;
}

/** The hoop's centre for a hoop pose. */
export function carryHoopCentre(
  pose: CarryPose,
  out: Vector3,
  hoopRadius = CARRY_HOOP_RADIUS_M
): Vector3 {
  return out.copy(pose.grip).addScaledVector(pose.propUp, hoopRadius);
}

/** Remove `axis` from `vector` and renormalize. `axis` must be unit length. */
function orthogonalize(vector: Vector3, axis: Vector3): Vector3 {
  return vector.addScaledVector(axis, -vector.dot(axis)).normalize();
}

/**
 * Analytic two-bone solve for an arm: where the elbow and wrist go.
 *
 * The elbow lies in the plane of the shoulder, the target, and the pole,
 * on the pole's side. A target out of reach is pulled in to 99.9 percent of
 * full extension along the same line, so the arm never snaps straight.
 * Returns the reach ratio (distance over total length) before clamping.
 * Allocation-free; the outputs may not alias the inputs.
 */
export function solveArmElbow(
  shoulder: Vector3,
  target: Vector3,
  upperLength: number,
  lowerLength: number,
  pole: Vector3,
  outElbow: Vector3,
  outWrist: Vector3
): number {
  const total = upperLength + lowerLength;
  scratch.subVectors(target, shoulder);
  const rawDistance = scratch.length();
  const minimum = Math.abs(upperLength - lowerLength) + 1e-4;
  const distance = Math.min(Math.max(rawDistance, minimum), total * 0.999);
  if (rawDistance < 1e-6) scratch.set(0, -1, 0);
  else scratch.multiplyScalar(1 / rawDistance);

  const cosShoulder =
    (upperLength * upperLength +
      distance * distance -
      lowerLength * lowerLength) /
    (2 * upperLength * distance);
  const shoulderAngle = Math.acos(Math.min(1, Math.max(-1, cosShoulder)));

  // The bend direction: the pole with its component along the reach removed.
  outElbow.copy(pole).addScaledVector(scratch, -pole.dot(scratch));
  if (outElbow.lengthSq() < 1e-10) {
    outElbow.set(0, 0, -1).addScaledVector(scratch, -scratch.z);
  }
  outElbow.normalize();

  outWrist.copy(shoulder).addScaledVector(scratch, distance);
  outElbow
    .multiplyScalar(upperLength * Math.sin(shoulderAngle))
    .addScaledVector(scratch, upperLength * Math.cos(shoulderAngle))
    .add(shoulder);
  return rawDistance / total;
}
