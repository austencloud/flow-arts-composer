import { Vector3 } from "three";
import type { RestPoseGeometry } from "#lib/features/lab/tabs/collision-lab/services/types.js";
import { STANCE_BOUNDS } from "#lib/features/lab/tabs/collision-lab/domain/types.js";
import { SweptTube } from "./swept-tube";
import type { BodyPlacement, DodgeKnob } from "./dodge-types";

const STAFF_RADIUS = 0.012; // matches swept-volume-builder.ts
const CLEAR_MARGIN = 0.04; // m of air we want between torso slab and the staff
const STEP_MAX = 1.2; // m — hard cap on how far the feet travel
const STEP_STEPS = 24; // back-off search resolution
const REACH_SLACK = 0.12; // m of shrug/lean the live reach-assist can still add
const COMFORT_OVERSHOOT = 0.3; // m past the just-clearing step at full aggression

const TWIST_MIN = (STANCE_BOUNDS.torsoTwistDeg.min * Math.PI) / 180;
const TWIST_MAX = (STANCE_BOUNDS.torsoTwistDeg.max * Math.PI) / 180;

export interface VacateResult {
  placement: BodyPlacement;
  worstBodyDepth: number;
  feasible: boolean;
}

/** Horizontal (XZ) unit normal to a horizontal vector (rotate −90° about Y). */
function perpXZ(v: Vector3): Vector3 {
  return new Vector3(v.z, 0, -v.x).normalize();
}

/**
 * Torso half-extent (m) presented along horizontal direction `dir`, given the
 * oriented slab whose thin axis points along `forward`. Ellipsoid radius in the
 * plane: wide along the shoulder axis, thin along forward. Matches the
 * StanceSimulator oriented-slab convention.
 */
function torsoHalfExtent(body: RestPoseGeometry, forward: Vector3, dir: Vector3): number {
  const halfW = body.torsoHalfWidth ?? body.torsoRadius;
  const halfD = body.torsoHalfDepth ?? body.torsoRadius;
  const right = new Vector3(forward.z, 0, -forward.x).normalize(); // shoulder axis
  const cd = Math.abs(dir.dot(right)) / Math.max(halfW, 1e-6);
  const cf = Math.abs(dir.dot(forward)) / Math.max(halfD, 1e-6);
  const denom = Math.sqrt(cd * cd + cf * cf);
  return denom > 1e-6 ? 1 / denom : Math.max(halfW, halfD);
}

/**
 * Analytic vacate: step the body into the open quadrant beside the prop sweep,
 * face grid center, turn edge-on, and back off until the torso slab clears the
 * swept tube — bounded by arm reach (hands never leave the staves). Deterministic
 * (same input → same output → no frame-to-frame jitter).
 */
export function planVacate(
  left: SweptTube,
  right: SweptTube,
  body: RestPoseGeometry,
  knob: DodgeKnob,
): VacateResult {
  const cLeft = left.centroid();
  const cRight = right.centroid();
  const center = cLeft.clone().add(cRight).multiplyScalar(0.5);
  const axis = left.principalAxis() ?? right.principalAxis();

  const reach = body.upperArmLength + body.forearmLength + REACH_SLACK;
  const shoulderY = body.leftShoulder.y;
  const spineYs = [body.spine1.y, body.spine2.y, body.neck.y];

  /**
   * At foot (fx,fz) facing center: worst torso penetration into either tube
   * (positive = overlap) and whether both grips stay within arm reach.
   */
  const evalFoot = (fx: number, fz: number): { worst: number; reachable: boolean } => {
    const forward = new Vector3(-fx, 0, -fz);
    if (forward.lengthSq() < 1e-9) forward.set(0, 0, 1);
    forward.normalize();
    let worst = -Infinity;
    for (const tube of [left, right]) {
      for (const y of spineYs) {
        const p = new Vector3(fx, y, fz);
        const near = tube.minDistanceToSegments(p);
        const dir = new Vector3(near.nearestPoint.x - fx, 0, near.nearestPoint.z - fz);
        if (dir.lengthSq() < 1e-9) dir.copy(forward);
        else dir.normalize();
        const penetration = torsoHalfExtent(body, forward, dir) + STAFF_RADIUS - near.dist;
        worst = Math.max(worst, penetration);
      }
    }
    const lsh = new Vector3(fx + body.leftShoulder.x, shoulderY, fz);
    const rsh = new Vector3(fx + body.rightShoulder.x, shoulderY, fz);
    const grips = [cLeft, cRight];
    const worstReach = Math.max(
      ...grips.map((g) => Math.min(lsh.distanceTo(g), rsh.distanceTo(g))),
    );
    return { worst, reachable: worstReach <= reach };
  };

  // Vacate direction (unit, from the body origin). Sideways normal to the sweep
  // axis; for a static prop, straight away from where it sits.
  let dir: Vector3;
  if (axis) {
    dir = perpXZ(axis);
  } else {
    const away = center.clone().setY(0).negate();
    dir = away.lengthSq() > 1e-6 ? away.normalize() : new Vector3(0, 0, -1);
  }

  // Resolve side. `auto`: probe both normals and keep the one that clears with
  // less penetration; ties → the −Z escape (toward quadrant 3, off a front sweep).
  const sideSign = (() => {
    if (knob.side === "left") return -1;
    if (knob.side === "right") return 1;
    const probe = (sign: number) => evalFoot(dir.x * sign * 0.6, dir.z * sign * 0.6).worst;
    const plus = probe(1);
    const minus = probe(-1);
    if (Math.abs(plus - minus) < 1e-3) return dir.z < 0 ? 1 : -1;
    return plus < minus ? 1 : -1;
  })();
  const vac = dir.clone().multiplyScalar(sideSign);

  // Back-off scan from the origin: smallest step that clears within reach, and
  // the largest step still within reach (the hard ceiling — hands win).
  let clearStep = STEP_MAX;
  let foundClear = false;
  let maxReachStep = 0;
  for (let i = 1; i <= STEP_STEPS; i++) {
    const step = (i / STEP_STEPS) * STEP_MAX;
    const e = evalFoot(vac.x * step, vac.z * step);
    if (e.reachable) maxReachStep = step;
    if (!foundClear && e.worst <= -CLEAR_MARGIN && e.reachable) {
      clearStep = step;
      foundClear = true;
    }
  }
  if (!foundClear) clearStep = maxReachStep; // can't fully clear → step as far as reach allows
  // aggression interpolates from just-clearing to a comfortable overshoot, all
  // clamped to the reach ceiling so a grip never leaves the hand.
  const comfortable = Math.min(clearStep + COMFORT_OVERSHOOT, maxReachStep || clearStep);
  const step = Math.min(
    clearStep + (comfortable - clearStep) * Math.max(0, Math.min(1, knob.aggression)),
    maxReachStep || clearStep,
  );

  const fx = vac.x * step;
  const fz = vac.z * step;
  const rootYawRad = Math.atan2(-fx, -fz);

  // Edge-on twist: turn the torso's thin axis toward the nearest staff approach.
  const forward = new Vector3(-fx, 0, -fz);
  if (forward.lengthSq() < 1e-9) forward.set(0, 0, 1);
  forward.normalize();
  const nearLeft = left.minDistanceToSegments(new Vector3(fx, body.spine2.y, fz));
  const nearRight = right.minDistanceToSegments(new Vector3(fx, body.spine2.y, fz));
  const near = nearLeft.dist < nearRight.dist ? nearLeft : nearRight;
  const toStaff = new Vector3(near.nearestPoint.x - fx, 0, near.nearestPoint.z - fz);
  let torsoTwistRad = 0;
  if (toStaff.lengthSq() > 1e-9) {
    toStaff.normalize();
    const cross = forward.x * toStaff.z - forward.z * toStaff.x;
    const dot = forward.dot(toStaff);
    const bearing = Math.atan2(cross, dot);
    // Rotate ~90° off the staff bearing to present the thin side; clamp to DOF.
    const target = bearing - Math.sign(bearing || 1) * (Math.PI / 2);
    torsoTwistRad = Math.max(TWIST_MIN, Math.min(TWIST_MAX, target));
  }

  const finalEval = evalFoot(fx, fz);
  const worstBodyDepth = Math.max(0, finalEval.worst);

  const placement: BodyPlacement = {
    footOffsetX: fx,
    footOffsetZ: fz,
    rootYawRad,
    torsoTwistRad,
    spinePitchRad: 0,
  };
  return { placement, worstBodyDepth, feasible: worstBodyDepth <= 0.01 };
}
