/**
 * StanceSimulator
 *
 * Kinematic upper-body model. Given a stance (foot offset + yaw + pitch)
 * and two prop targets, it computes where every joint lands and whether
 * the resulting configuration is physically acceptable.
 *
 * Coordinate convention (matches Mixamo + Avatar3D):
 *   +X = character's RIGHT
 *   +Y = up
 *   +Z = character's forward (facing direction)
 *   So leftShoulder.x < 0 and rightShoulder.x > 0 in rest pose.
 *
 * How it works:
 *
 *   1. Start from the rest-pose joint offsets in the avatar's LOCAL frame.
 *   2. Apply the spine pitch - rotate every joint above Spine1 forward
 *      around the local X axis passing through Spine1.
 *   3. Apply the root yaw - rotate the entire upper body around the local
 *      Y axis passing through the hips.
 *   4. Translate by the foot offset - every joint shifts by (footX, 0, footZ).
 *   5. Solve analytic two-bone IK for each arm. Given the shoulder's current
 *      world position and the prop's world grip target, find where the elbow
 *      must go so that |shoulder→elbow| = upperArmLength and |elbow→hand| =
 *      forearmLength. If the target is further than upperArm+forearm, the
 *      hand falls short - that's a reach failure.
 *   6. Run the same sphere + segment collision primitives the live
 *      CollisionDetector uses, producing a list of violations.
 *   7. Compute the balance margin - project the center of mass onto the
 *      ground and check it lies inside the feet's base of support.
 *   8. Compute joint violations - elbow hyperextension, shoulder flexion
 *      past healthy range.
 *
 * The simulator never touches Three.js. It's pure math over Vector3s, so
 * it runs in microseconds per evaluation. The optimizer can call it
 * hundreds of times per pose without dropping frames.
 *
 * Domain: Collision Lab - automated stance search
 */

import { Vector3 } from "three";
import type {
  RestPoseGeometry,
  SimPropTarget,
  SimResult,
  SimCollision,
} from "./types";
import type { StancePose } from "../domain/types";

// --- Collision radii - mirror the live CollisionDetector exactly so the
// simulator and the live readout agree on whether a stance is clear.
const PROP_BODY_THRESHOLD = 0.02;
const ARM_ARM_THRESHOLD = 0.06;
const NECK_RADIUS = 0.07;

// --- Joint comfort ranges (radians). Beyond these, we flag the pose as
// "uncomfortable" - not physically impossible but visibly strained.
const ELBOW_HYPEREXTENSION_LIMIT = 0.17; // ~10° past straight
const SHOULDER_FLEXION_LIMIT = (170 * Math.PI) / 180; // 170° = raised arm
const SHOULDER_ABDUCTION_LIMIT = (170 * Math.PI) / 180;

// --- Balance check - we treat each foot as a 15 × 30 cm rectangle centered
// on the hips' XZ projection (shifted by footHalfWidth). The base of support
// is the convex hull of both rectangles, which is itself a larger rectangle.
const FOOT_LENGTH_FORWARD = 0.3; // toes forward of ankle
const FOOT_LENGTH_BACKWARD = 0.1; // heel behind ankle

// --- Forearm wrist exclusion - when checking the forearm against a prop,
// we ignore the final WRIST_EXCLUSION_FRACTION of the segment (the wrist end)
// because the hand is, by definition, on the prop. Without this, every
// legitimate grip fires a "prop-through-arm" false positive of ~1 cm.
const WRIST_EXCLUSION_FRACTION = 0.22; // exclude last 22% of forearm

// --- Reach feasibility tolerance - how close the hand has to get to the
// grip before we consider the pose "reachable". The simulator is a rigid
// 4-DoF model (foot XZ, yaw, pitch) so it can't capture everything the
// live rig can do: clavicle elevation (shoulder shrug, ~5 cm of Y lift),
// thoracic spine extension, subtle hip tilt. Any of those can easily
// close a 1-2 cm gap. We therefore accept a 3 cm shortfall as "still
// physically reachable in practice" so the simulator doesn't report
// genuinely-solvable overhead poses as infeasible.
export const REACH_FEASIBILITY_TOLERANCE = 0.03;

/**
 * A simple container for all the joint positions that get updated each
 * evaluation. Reusing one instance per simulator avoids per-eval allocation.
 */
interface Skeleton {
  hips: Vector3;
  spine1: Vector3;
  spine2: Vector3;
  neck: Vector3;
  head: Vector3;
  face: Vector3;
  leftShoulder: Vector3;
  rightShoulder: Vector3;
  leftElbow: Vector3;
  rightElbow: Vector3;
  leftHand: Vector3;
  rightHand: Vector3;
}

function makeSkeleton(): Skeleton {
  return {
    hips: new Vector3(),
    spine1: new Vector3(),
    spine2: new Vector3(),
    neck: new Vector3(),
    head: new Vector3(),
    face: new Vector3(),
    leftShoulder: new Vector3(),
    rightShoulder: new Vector3(),
    leftElbow: new Vector3(),
    rightElbow: new Vector3(),
    leftHand: new Vector3(),
    rightHand: new Vector3(),
  };
}

export class StanceSimulator {
  readonly restPose: RestPoseGeometry;

  private skeleton = makeSkeleton();

  // Scratch vectors - reused every evaluation so we don't allocate inside
  // the hot path. The optimizer calls evaluate() hundreds of times per pose.
  private readonly _tmp1 = new Vector3();
  private readonly _tmp2 = new Vector3();
  private readonly _tmp3 = new Vector3();
  private readonly _elbowAxis = new Vector3();
  private readonly _poleDir = new Vector3();
  private readonly _worldUp = new Vector3(0, 1, 0);
  // Torso oriented-slab scratch: basis (right/forward) recomputed per collision
  // pass from the current shoulder line, plus closest-point + separation temps.
  private readonly _torsoRight = new Vector3();
  private readonly _torsoForward = new Vector3();
  private readonly _segClosest = new Vector3();
  private readonly _sep = new Vector3();
  private readonly _leftUpperBodyStart = new Vector3();
  private readonly _rightUpperBodyStart = new Vector3();

  constructor(restPose: RestPoseGeometry) {
    this.restPose = restPose;
  }

  evaluate(
    stance: StancePose,
    leftTarget: SimPropTarget,
    rightTarget: SimPropTarget
  ): SimResult {
    // 1. Place joints from the rest pose, then apply stance transforms.
    this.applyStance(stance);

    // 2. Solve IK for each arm and record reach outcomes.
    const leftReach = this.solveArmIK(
      this.skeleton.leftShoulder,
      leftTarget.gripWorld,
      this.skeleton.leftElbow,
      this.skeleton.leftHand,
      /* isLeft */ true
    );
    const rightReach = this.solveArmIK(
      this.skeleton.rightShoulder,
      rightTarget.gripWorld,
      this.skeleton.rightElbow,
      this.skeleton.rightHand,
      /* isLeft */ false
    );

    // 3. Derive the face collision sphere center - same 8 cm forward +
    //    5 cm up offset the live detector uses, so the simulator and live
    //    detector agree on face collisions.
    this.computeFaceCenter();

    // 4. Collision checks.
    const collisions = this.detectCollisions(leftTarget, rightTarget);

    // 5. Balance check.
    const balanceMargin = this.computeBalanceMargin(stance);

    // 6. Joint limit check.
    const jointViolation = this.computeJointViolations();

    // Aggregate scalars.
    let totalDepth = 0;
    for (const c of collisions) totalDepth += c.depth;

    // Hard feasibility: the things that make a stance physically impossible
    // or visually catastrophic. Soft violations (max-extended arms, expected
    // prop overlap at a shared grip, forearms crossing) are captured in the
    // loss function but don't disqualify. The user's rule: "no situation is
    // truly impossible in real life".
    let hardFaceOrBodyDepth = 0;
    for (const c of collisions) {
      if (
        c.zone === "prop-through-head" ||
        c.zone === "prop-through-torso" ||
        c.zone === "arm-through-face" ||
        c.zone === "arm-through-neck" ||
        c.zone === "arm-through-torso"
      ) {
        if (c.depth > hardFaceOrBodyDepth) hardFaceOrBodyDepth = c.depth;
      }
    }

    const feasible =
      leftReach.shortfall <= REACH_FEASIBILITY_TOLERANCE &&
      rightReach.shortfall <= REACH_FEASIBILITY_TOLERANCE &&
      balanceMargin > -0.005 &&
      hardFaceOrBodyDepth <= 0.01; // < 1 cm of head/torso/face intrusion OK

    return {
      reachShortfall: {
        left: leftReach.shortfall,
        right: rightReach.shortfall,
      },
      reachStretch: {
        left: leftReach.stretch,
        right: rightReach.stretch,
      },
      collisions,
      balanceMargin,
      jointViolationRad: jointViolation,
      feasible,
      totalCollisionDepth: totalDepth,
    };
  }

  /**
   * Evaluate a FIXED stance against a swept volume: arrays of paired staff
   * instants for each hand. Returns one SimResult whose collision/reach fields
   * are the worst (max) across all instants, so a stance is "clear" only if it
   * clears EVERY instant. Balance is stance-only, so it is taken from the first
   * sample. Reuses evaluate() per instant — no duplicated primitives.
   */
  evaluateSweep(
    stance: StancePose,
    leftSweep: SimPropTarget[],
    rightSweep: SimPropTarget[]
  ): SimResult {
    const n = Math.min(leftSweep.length, rightSweep.length);
    if (n === 0) {
      // Degenerate: nothing to hit. Evaluate at the stance with whatever single
      // target exists so balance/joints are still reported.
      return this.evaluate(
        stance,
        leftSweep[0] ?? rightSweep[0]!,
        rightSweep[0] ?? leftSweep[0]!
      );
    }

    let merged: SimResult | null = null;
    const worstByZone = new Map<SimCollision["zone"], SimCollision>();

    for (let i = 0; i < n; i++) {
      const r = this.evaluate(stance, leftSweep[i]!, rightSweep[i]!);
      if (!merged) {
        merged = {
          reachShortfall: { ...r.reachShortfall },
          reachStretch: { ...r.reachStretch },
          collisions: [],
          balanceMargin: r.balanceMargin, // stance-only — constant across sweep
          jointViolationRad: r.jointViolationRad,
          feasible: true,
          totalCollisionDepth: 0,
        };
      } else {
        merged.reachShortfall.left = Math.max(
          merged.reachShortfall.left,
          r.reachShortfall.left
        );
        merged.reachShortfall.right = Math.max(
          merged.reachShortfall.right,
          r.reachShortfall.right
        );
        merged.reachStretch.left = Math.max(
          merged.reachStretch.left,
          r.reachStretch.left
        );
        merged.reachStretch.right = Math.max(
          merged.reachStretch.right,
          r.reachStretch.right
        );
        merged.jointViolationRad = Math.max(
          merged.jointViolationRad,
          r.jointViolationRad
        );
      }
      for (const c of r.collisions) {
        const prev = worstByZone.get(c.zone);
        if (!prev || c.depth > prev.depth) worstByZone.set(c.zone, { ...c });
      }
    }

    const result = merged!;
    result.collisions = [...worstByZone.values()];
    let total = 0;
    let hardBodyDepth = 0;
    for (const c of result.collisions) {
      total += c.depth;
      if (
        c.zone === "prop-through-head" ||
        c.zone === "prop-through-torso" ||
        c.zone === "arm-through-face" ||
        c.zone === "arm-through-neck" ||
        c.zone === "arm-through-torso"
      ) {
        if (c.depth > hardBodyDepth) hardBodyDepth = c.depth;
      }
    }
    result.totalCollisionDepth = total;
    result.feasible =
      result.reachShortfall.left <= REACH_FEASIBILITY_TOLERANCE &&
      result.reachShortfall.right <= REACH_FEASIBILITY_TOLERANCE &&
      result.balanceMargin > -0.005 &&
      hardBodyDepth <= 0.01;
    return result;
  }

  // Stance application - turns (footX, footZ, yaw, pitch) into world joint
  // positions by transforming the rest pose.

  private applyStance(stance: StancePose): void {
    const rest = this.restPose;
    const sk = this.skeleton;

    // Yaw rotation matrix components (hips + lower spine).
    const cy = Math.cos(stance.rootYawRad);
    const sy = Math.sin(stance.rootYawRad);

    // Twisted yaw for the UPPER body. Torso twist is an extra rotation about the
    // body centerline (the same Y axis as yaw) applied only above spine1, so it
    // composes additively with rootYaw into a single angle. This turns the
    // shoulders/chest edge-on without moving the hips or feet.
    const yawT = stance.rootYawRad + (stance.torsoTwistRad ?? 0);
    const cyt = Math.cos(yawT);
    const syt = Math.sin(yawT);

    // Pitch rotation matrix components - applied around a local X axis
    // that passes through Spine1, so the spine can hinge forward without
    // translating the hips. This matches how the AvatarAnimator's external
    // spine pitch works in the live rig.
    const cp = Math.cos(stance.spinePitchRad);
    const sp = Math.sin(stance.spinePitchRad);
    const pivotY = rest.spine1.y;

    // Hips don't pitch and aren't relative to spine1 - they just translate
    // with the foot offset and rotate with yaw around their own Y axis.
    this.placeLocalJoint(sk.hips, 0, rest.hipsY, 0, cy, sy, stance);

    // Lower spine: pitch + plain yaw (no twist - the twist pivots above here).
    this.transformAndPlace(
      sk.spine1,
      rest.spine1,
      pivotY,
      cp,
      sp,
      cy,
      sy,
      stance
    );

    // Upper body (mid-torso up): pitch + twisted yaw, so the shoulder line and
    // everything attached to it turns by rootYaw + torsoTwist.
    this.transformAndPlace(
      sk.spine2,
      rest.spine2,
      pivotY,
      cp,
      sp,
      cyt,
      syt,
      stance
    );
    this.transformAndPlace(
      sk.neck,
      rest.neck,
      pivotY,
      cp,
      sp,
      cyt,
      syt,
      stance
    );
    this.transformAndPlace(
      sk.head,
      rest.head,
      pivotY,
      cp,
      sp,
      cyt,
      syt,
      stance
    );
    this.transformAndPlace(
      sk.leftShoulder,
      rest.leftShoulder,
      pivotY,
      cp,
      sp,
      cyt,
      syt,
      stance
    );
    this.transformAndPlace(
      sk.rightShoulder,
      rest.rightShoulder,
      pivotY,
      cp,
      sp,
      cyt,
      syt,
      stance
    );
  }

  /**
   * Place a joint that doesn't inherit the spine pitch (hips). Just yaws
   * around Y and translates by foot offset.
   */
  private placeLocalJoint(
    out: Vector3,
    lx: number,
    ly: number,
    lz: number,
    cy: number,
    sy: number,
    stance: StancePose
  ): void {
    const rx = cy * lx + sy * lz;
    const rz = -sy * lx + cy * lz;
    out.set(rx + stance.footOffsetX, ly, rz + stance.footOffsetZ);
  }

  /**
   * Place a joint that inherits the spine pitch (everything above spine1).
   * Applies:
   *    1. Pitch around local X passing through pivotY
   *    2. Yaw around local Y at origin
   *    3. Translate by foot offset
   */
  private transformAndPlace(
    out: Vector3,
    local: Vector3,
    pivotY: number,
    cp: number,
    sp: number,
    cy: number,
    sy: number,
    stance: StancePose
  ): void {
    // Pitch around X passing through (any x, pivotY, 0): subtract pivot,
    // rotate around X, add pivot back.
    const dy = local.y - pivotY;
    const dz = local.z;
    const py = cp * dy - sp * dz + pivotY;
    const pz = sp * dy + cp * dz;

    // Yaw around Y at origin.
    const rx = cy * local.x + sy * pz;
    const rz = -sy * local.x + cy * pz;

    out.set(rx + stance.footOffsetX, py, rz + stance.footOffsetZ);
  }

  // Analytic two-bone IK. Given a shoulder and a hand target, figure out
  // where the elbow goes so |shoulder→elbow| = a and |elbow→hand| = b.
  //
  // The mathematical trick: the elbow lies on a circle centered on the
  // midpoint of shoulder→target, perpendicular to that direction, at a
  // radius determined by the law of cosines. We pick the point on that
  // circle using a "pole vector" that biases the elbow outward from the
  // body (matching ElbowPoleComputer in the live rig).

  private solveArmIK(
    shoulder: Vector3,
    target: Vector3,
    elbowOut: Vector3,
    handOut: Vector3,
    isLeft: boolean
  ): { shortfall: number; stretch: number } {
    const a = this.restPose.upperArmLength;
    const b = this.restPose.forearmLength;

    // Distance from shoulder to target.
    this._tmp1.subVectors(target, shoulder);
    const d = this._tmp1.length();

    // If the target is beyond reach, the hand lands at max extension
    // along the shoulder→target line, and we report the shortfall.
    const maxReach = a + b;
    if (d > maxReach) {
      const shortfall = d - maxReach;
      const dir = this._tmp1.normalize();
      elbowOut.copy(shoulder).addScaledVector(dir, a);
      handOut.copy(shoulder).addScaledVector(dir, maxReach);
      return { shortfall, stretch: maxReach };
    }

    // If the target is absurdly close (inside the shoulder), just put the
    // hand on the target and the elbow off to the side. This keeps the
    // math numerically stable without a special-case codebase.
    if (d < 0.01) {
      handOut.copy(target);
      // Elbow pushed outward: left → −X, right → +X (Mixamo convention).
      elbowOut.copy(shoulder).add(new Vector3(isLeft ? -a : a, 0, 0));
      return { shortfall: 0, stretch: 0 };
    }

    // Unit direction shoulder → target.
    this._tmp1.subVectors(target, shoulder);
    const dirX = this._tmp1.x / d;
    const dirY = this._tmp1.y / d;
    const dirZ = this._tmp1.z / d;

    // Law of cosines: distance along shoulder→target where the elbow
    // projects, and the perpendicular distance from that projection
    // to the actual elbow.
    //   a² = t² + h²            (from shoulder, project onto line)
    //   b² = (d-t)² + h²
    // Solving: t = (d² + a² − b²) / (2d), h = sqrt(a² − t²)
    const t = (d * d + a * a - b * b) / (2 * d);
    const hSq = a * a - t * t;
    const h = hSq > 0 ? Math.sqrt(hSq) : 0;

    // Elbow projection onto the shoulder→target line.
    const px = shoulder.x + dirX * t;
    const py = shoulder.y + dirY * t;
    const pz = shoulder.z + dirZ * t;

    // Pole direction - where we want the elbow to bend toward. For the
    // left arm we want it to bend outward (character's left = −X) and
    // for the right arm outward to +X. Adding a small downward component
    // (−Y) keeps the elbow below the shoulder for overhead reaches,
    // which matches the natural human bend instead of "flying elbow".
    const poleDirX = isLeft ? -1 : 1;
    const poleDirY = -0.35;
    const poleDirZ = 0;
    const poleLen = Math.hypot(poleDirX, poleDirY, poleDirZ);
    const pX = poleDirX / poleLen;
    const pY = poleDirY / poleLen;
    const pZ = poleDirZ / poleLen;

    // Project the pole direction onto the plane perpendicular to the
    // shoulder→target line:
    //   perp = pole − (pole · unitDir) * unitDir
    // This gives a vector that lies in the plane of possible elbow
    // positions and points as close to the pole direction as possible.
    const poleDotDir = pX * dirX + pY * dirY + pZ * dirZ;
    let perpX = pX - poleDotDir * dirX;
    let perpY = pY - poleDotDir * dirY;
    let perpZ = pZ - poleDotDir * dirZ;
    let perpLen = Math.hypot(perpX, perpY, perpZ);

    // Degenerate case: reach direction is parallel to the pole (shouldn't
    // happen with the Y component in the pole, but guard anyway). Fall
    // back to the world-down direction as a last resort.
    if (perpLen < 1e-4) {
      perpX = 0;
      perpY = -1;
      perpZ = 0;
      perpLen = 1;
    }

    perpX /= perpLen;
    perpY /= perpLen;
    perpZ /= perpLen;

    elbowOut.set(px + perpX * h, py + perpY * h, pz + perpZ * h);
    handOut.copy(target);

    // Stretch metric: how close is the arm to max extension. 0 = fully
    // folded, 1 = fully extended. Used for comfort scoring.
    const stretch = d / maxReach;
    return { shortfall: 0, stretch };
  }

  // Face center derivation - the same formula and 8 cm forward + 5 cm up
  // offset as the package's computeFaceCenter. Every body this simulator
  // gets (restPoseFromHeight, DodgeDriver's measured rig) puts the right
  // shoulder at +X, so right x up points forward here. The shipped rigs put
  // the left shoulder at +X, where the package's copy points backward and
  // puts the face 8 cm behind the head (performer-contact-review.md). Do not
  // copy the sign across.

  private computeFaceCenter(): void {
    const sk = this.skeleton;
    // right = rightShoulder − leftShoulder
    this._tmp1.subVectors(sk.rightShoulder, sk.leftShoulder);
    if (this._tmp1.lengthSq() > 1e-6) {
      this._tmp1.normalize();
      // forward = cross(right, up)
      this._tmp2.crossVectors(this._tmp1, this._worldUp).normalize();
    } else {
      this._tmp2.set(0, 0, 1);
    }
    sk.face.copy(sk.head).addScaledVector(this._tmp2, 0.08);
    sk.face.y += 0.05;
  }

  // Collision detection - sphere + line-segment primitives, same radii as
  // the live CollisionDetector. Writes into a fresh array each call; the
  // optimizer only keeps the best result so there's no hot-path array churn.

  private detectCollisions(
    leftTarget: SimPropTarget,
    rightTarget: SimPropTarget
  ): SimCollision[] {
    const collisions: SimCollision[] = [];
    const sk = this.skeleton;
    const rp = this.restPose;

    const propPairs: Array<{ label: "Left" | "Right"; prop: SimPropTarget }> = [
      { label: "Left", prop: leftTarget },
      { label: "Right", prop: rightTarget },
    ];

    // 1. Prop shaft through face.
    for (const { label, prop } of propPairs) {
      const d = this.pointToSegmentDistance(
        sk.face,
        prop.tipAWorld,
        prop.tipBWorld
      );
      const threshold = rp.headRadius + prop.radius;
      if (d < threshold) {
        collisions.push({
          zone: "prop-through-head",
          depth: threshold - d,
          description: `${label} staff → face`,
        });
      }
    }

    // 2. Prop shaft through torso - oriented ellipsoid per spine point.
    //    The torso is wide along the shoulder line and thin front-to-back, so
    //    turning it edge-on (torsoTwist) presents the thin axis to a prop and
    //    lets a staff skim past that a face-on torso would clip.
    const torsoHalfWidth = rp.torsoHalfWidth ?? rp.torsoRadius;
    const torsoHalfDepth = rp.torsoHalfDepth ?? rp.torsoRadius;
    const torsoHalfHeight = rp.torsoHalfHeight ?? rp.torsoRadius;
    // Torso basis from the (already twisted) shoulder line: right = L→R
    // shoulder, forward = right × up. Falls back to world axes if the shoulders
    // are coincident (degenerate).
    this._torsoRight.subVectors(sk.rightShoulder, sk.leftShoulder);
    if (this._torsoRight.lengthSq() > 1e-6) {
      this._torsoRight.normalize();
      this._torsoForward
        .crossVectors(this._torsoRight, this._worldUp)
        .normalize();
    } else {
      this._torsoRight.set(1, 0, 0);
      this._torsoForward.set(0, 0, 1);
    }
    const spinePoints = [sk.hips, sk.spine1, sk.spine2, sk.neck];
    for (const { label, prop } of propPairs) {
      let worstDepth = 0;
      for (const p of spinePoints) {
        const depth = this.ellipsoidSegmentDepth(
          p,
          prop.tipAWorld,
          prop.tipBWorld,
          torsoHalfWidth + prop.radius,
          torsoHalfHeight + prop.radius,
          torsoHalfDepth + prop.radius
        );
        if (depth > worstDepth) worstDepth = depth;
      }
      if (worstDepth > 0) {
        collisions.push({
          zone: "prop-through-torso",
          depth: worstDepth,
          description: `${label} staff → torso`,
        });
      }
    }

    // 3. Prop shaft through arm segments. Forearms are truncated at the
    //    wrist so a legitimate grip (hand on staff) doesn't register as
    //    a forearm-through-staff collision.
    const leftForearmWrist = this._tmp1
      .lerpVectors(sk.leftElbow, sk.leftHand, 1 - WRIST_EXCLUSION_FRACTION)
      .clone();
    const rightForearmWrist = this._tmp2
      .lerpVectors(sk.rightElbow, sk.rightHand, 1 - WRIST_EXCLUSION_FRACTION)
      .clone();
    const armSegs: Array<{ a: Vector3; b: Vector3; name: string }> = [
      { name: "L upper arm", a: sk.leftShoulder, b: sk.leftElbow },
      { name: "L forearm", a: sk.leftElbow, b: leftForearmWrist },
      { name: "R upper arm", a: sk.rightShoulder, b: sk.rightElbow },
      { name: "R forearm", a: sk.rightElbow, b: rightForearmWrist },
    ];
    for (const { label, prop } of propPairs) {
      for (const arm of armSegs) {
        const d = this.segmentToSegmentDistance(
          prop.tipAWorld,
          prop.tipBWorld,
          arm.a,
          arm.b
        );
        const threshold = rp.armRadius + prop.radius;
        if (d < threshold) {
          collisions.push({
            zone: "prop-through-arm",
            depth: threshold - d,
            description: `${label} staff → ${arm.name}`,
          });
          break;
        }
      }
    }

    // 4. Prop through prop.
    const pp = this.segmentToSegmentDistance(
      leftTarget.tipAWorld,
      leftTarget.tipBWorld,
      rightTarget.tipAWorld,
      rightTarget.tipBWorld
    );
    const ppThresh =
      leftTarget.radius + rightTarget.radius + PROP_BODY_THRESHOLD;
    if (pp < ppThresh) {
      collisions.push({
        zone: "prop-through-prop",
        depth: ppThresh - pp,
        description: "Left/right staffs cross",
      });
    }

    // 5. Arms through face.
    const leftArmD = this.pointToSegmentDistance(
      sk.face,
      sk.leftElbow,
      sk.leftHand
    );
    const leftArmThresh = rp.headRadius + rp.armRadius + PROP_BODY_THRESHOLD;
    if (leftArmD < leftArmThresh) {
      collisions.push({
        zone: "arm-through-face",
        depth: leftArmThresh - leftArmD,
        description: "L forearm → face",
      });
    }
    const rightArmD = this.pointToSegmentDistance(
      sk.face,
      sk.rightElbow,
      sk.rightHand
    );
    if (rightArmD < leftArmThresh) {
      collisions.push({
        zone: "arm-through-face",
        depth: leftArmThresh - rightArmD,
        description: "R forearm → face",
      });
    }

    // 5b. Arms through neck/torso. Match the live detector's padded sphere
    // chain and ignore the shoulder-adjacent 35% of each upper arm.
    this._leftUpperBodyStart.lerpVectors(sk.leftShoulder, sk.leftElbow, 0.35);
    this._rightUpperBodyStart.lerpVectors(
      sk.rightShoulder,
      sk.rightElbow,
      0.35
    );
    const bodyArmSegs: Array<{ name: string; a: Vector3; b: Vector3 }> = [
      { name: "L upper arm", a: this._leftUpperBodyStart, b: sk.leftElbow },
      { name: "L forearm", a: sk.leftElbow, b: sk.leftHand },
      { name: "R upper arm", a: this._rightUpperBodyStart, b: sk.rightElbow },
      { name: "R forearm", a: sk.rightElbow, b: sk.rightHand },
    ];
    const neckThreshold = NECK_RADIUS + rp.armRadius + PROP_BODY_THRESHOLD;
    const torsoThreshold = rp.torsoRadius + rp.armRadius;
    const torsoCenters = [sk.spine1, sk.spine2];
    for (const arm of bodyArmSegs) {
      const neckDistance = this.pointToSegmentDistance(sk.neck, arm.a, arm.b);
      if (neckDistance < neckThreshold) {
        collisions.push({
          zone: "arm-through-neck",
          depth: neckThreshold - neckDistance,
          description: `${arm.name} → neck`,
        });
      }

      let worstTorsoDepth = 0;
      for (const center of torsoCenters) {
        const distance = this.pointToSegmentDistance(center, arm.a, arm.b);
        worstTorsoDepth = Math.max(worstTorsoDepth, torsoThreshold - distance);
      }
      if (worstTorsoDepth > 0) {
        collisions.push({
          zone: "arm-through-torso",
          depth: worstTorsoDepth,
          description: `${arm.name} → torso`,
        });
      }
    }

    // 6. Arms through each other (forearms).
    const foreD = this.segmentToSegmentDistance(
      sk.leftElbow,
      sk.leftHand,
      sk.rightElbow,
      sk.rightHand
    );
    if (foreD < ARM_ARM_THRESHOLD) {
      collisions.push({
        zone: "arms-through-each-other",
        depth: ARM_ARM_THRESHOLD - foreD,
        description: "Forearms intersect",
      });
    }
    // Upper arms.
    const upperD = this.segmentToSegmentDistance(
      sk.leftShoulder,
      sk.leftElbow,
      sk.rightShoulder,
      sk.rightElbow
    );
    if (upperD < ARM_ARM_THRESHOLD) {
      collisions.push({
        zone: "arms-through-each-other",
        depth: ARM_ARM_THRESHOLD - upperD,
        description: "Upper arms intersect",
      });
    }

    return collisions;
  }

  // -----------------------------------------------------------------------
  // Balance check. Project the center of mass onto the ground and check
  // it lies inside the rectangle formed by the feet. We use weighted joint
  // positions as an approximation of the true CoM.
  //
  // Weights come from Winter 2009 (Biomechanics and Motor Control of Human
  // Movement), Dempster's segment parameters:
  //   Head + neck:      8.1% of body mass
  //   Trunk:           49.7%
  //   Arms (both):     10.0%
  //   Legs (not modeled - assumed centered on hips for simplicity)
  // -----------------------------------------------------------------------

  private computeBalanceMargin(stance: StancePose): number {
    const sk = this.skeleton;
    const wHead = 0.081;
    const wTrunk = 0.497;
    const wArms = 0.1;
    const wLegs = 0.322; // remainder - centered on hips since we don't model legs

    const headPos = sk.head;
    const trunkMid = this._tmp1
      .copy(sk.hips)
      .add(sk.spine2)
      .multiplyScalar(0.5);
    const armsMid = this._tmp2
      .copy(sk.leftHand)
      .add(sk.rightHand)
      .multiplyScalar(0.5);
    const legsPos = this._tmp3.copy(sk.hips);
    // Feet are on the ground at the foot offset - approximate legs CoM
    // as midway between hips and ground directly below hips.
    legsPos.y *= 0.5;

    const comX =
      headPos.x * wHead +
      trunkMid.x * wTrunk +
      armsMid.x * wArms +
      legsPos.x * wLegs;
    const comZ =
      headPos.z * wHead +
      trunkMid.z * wTrunk +
      armsMid.z * wArms +
      legsPos.z * wLegs;

    // Base of support: rectangle centered on the foot offset, extending
    // from −footHalfWidth to +footHalfWidth in X and from −heel to +toes
    // in Z. This is in WORLD coordinates after foot translation.
    const feetCx = stance.footOffsetX;
    const feetCz = stance.footOffsetZ;
    const halfX = this.restPose.footHalfWidth + 0.075; // 7.5 cm per foot width
    // If the body is yawed, the foot rectangle rotates with it.
    const cy = Math.cos(stance.rootYawRad);
    const sy = Math.sin(stance.rootYawRad);

    // Transform (comX, comZ) into the foot's local frame (origin at feetC,
    // axes rotated by −yaw).
    const dx = comX - feetCx;
    const dz = comZ - feetCz;
    const localX = cy * dx - sy * dz;
    const localZ = sy * dx + cy * dz;

    // Distance to the nearest edge of the rectangle. Positive = inside,
    // negative = outside.
    const marginX = halfX - Math.abs(localX);
    const marginZ = Math.min(
      FOOT_LENGTH_FORWARD - localZ,
      FOOT_LENGTH_BACKWARD + localZ
    );

    return Math.min(marginX, marginZ);
  }

  // -----------------------------------------------------------------------
  // Joint limits. Sum of angle-past-healthy in radians.
  // -----------------------------------------------------------------------

  private computeJointViolations(): number {
    const sk = this.skeleton;
    let violation = 0;

    // Elbow angle = angle between (shoulder→elbow) and (elbow→hand).
    // A fully extended arm has this angle near π (180°). Hyperextension
    // = angle > π + limit (which can't happen in our IK because the
    // triangle inequality prevents it), so in practice we check full
    // extension as a comfort penalty: arm too straight = strained.
    const leftElbow = this.elbowAngle(
      sk.leftShoulder,
      sk.leftElbow,
      sk.leftHand
    );
    const rightElbow = this.elbowAngle(
      sk.rightShoulder,
      sk.rightElbow,
      sk.rightHand
    );
    const leftStrain = Math.max(
      0,
      leftElbow - (Math.PI - ELBOW_HYPEREXTENSION_LIMIT)
    );
    const rightStrain = Math.max(
      0,
      rightElbow - (Math.PI - ELBOW_HYPEREXTENSION_LIMIT)
    );
    violation += leftStrain + rightStrain;

    // Shoulder flexion (arm raised forward from side) - angle between
    // (hips→spine2) and (shoulder→elbow). Above ~170° the joint hits its
    // passive limit. We model it as the angle from "down at side" to the
    // current upper-arm direction.
    const leftShoulderAngle = this.shoulderFlexion(
      sk.leftShoulder,
      sk.leftElbow,
      sk.hips,
      sk.spine2
    );
    const rightShoulderAngle = this.shoulderFlexion(
      sk.rightShoulder,
      sk.rightElbow,
      sk.hips,
      sk.spine2
    );
    if (leftShoulderAngle > SHOULDER_FLEXION_LIMIT) {
      violation += leftShoulderAngle - SHOULDER_FLEXION_LIMIT;
    }
    if (rightShoulderAngle > SHOULDER_ABDUCTION_LIMIT) {
      violation += rightShoulderAngle - SHOULDER_ABDUCTION_LIMIT;
    }

    return violation;
  }

  private elbowAngle(shoulder: Vector3, elbow: Vector3, hand: Vector3): number {
    this._tmp1.subVectors(shoulder, elbow).normalize();
    this._tmp2.subVectors(hand, elbow).normalize();
    const dot = Math.max(-1, Math.min(1, this._tmp1.dot(this._tmp2)));
    return Math.acos(dot);
  }

  private shoulderFlexion(
    shoulder: Vector3,
    elbow: Vector3,
    hips: Vector3,
    spine2: Vector3
  ): number {
    // Upper arm direction (shoulder → elbow).
    this._tmp1.subVectors(elbow, shoulder).normalize();
    // Torso "down" direction (spine2 → hips), which is what a relaxed
    // arm is parallel to.
    this._tmp2.subVectors(hips, spine2).normalize();
    const dot = Math.max(-1, Math.min(1, this._tmp1.dot(this._tmp2)));
    return Math.acos(dot);
  }

  // -----------------------------------------------------------------------
  // Geometric helpers - same formulas as CollisionDetector but operating
  // on our local Vector3 scratches.
  // -----------------------------------------------------------------------

  /**
   * Penetration depth of a prop segment into an oriented torso ellipsoid
   * centered on `center`, with half-axes (halfRight, halfUp, halfForward) along
   * the torso basis (_torsoRight, world up, _torsoForward). Returns 0 when the
   * closest point on the segment lies outside the ellipsoid. Reduces exactly to
   * the old isotropic sphere test when the three half-axes are equal.
   *
   * Method: take the closest point Q on the segment to the ellipsoid center
   * (Euclidean — a good approximation for the modest anisotropy here), express
   * the separation in the torso basis, and compare its length to the ellipsoid
   * radius in that direction (e = 1/√Σ(componentCos/halfAxis)²).
   */
  private ellipsoidSegmentDepth(
    center: Vector3,
    segA: Vector3,
    segB: Vector3,
    halfRight: number,
    halfUp: number,
    halfForward: number
  ): number {
    this.closestPointOnSegment(center, segA, segB, this._segClosest);
    this._sep.subVectors(this._segClosest, center);
    const dist = this._sep.length();
    if (dist < 1e-6) return Math.min(halfRight, halfUp, halfForward);
    const cr = this._sep.dot(this._torsoRight) / dist; // direction cosines
    const cu = this._sep.dot(this._worldUp) / dist;
    const cf = this._sep.dot(this._torsoForward) / dist;
    const nx = cr / halfRight;
    const ny = cu / halfUp;
    const nz = cf / halfForward;
    const e = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    return dist < e ? e - dist : 0;
  }

  /** Closest point on segment [segA,segB] to `point`, written into `out`. */
  private closestPointOnSegment(
    point: Vector3,
    segA: Vector3,
    segB: Vector3,
    out: Vector3
  ): void {
    const abX = segB.x - segA.x;
    const abY = segB.y - segA.y;
    const abZ = segB.z - segA.z;
    const abLenSq = abX * abX + abY * abY + abZ * abZ;
    if (abLenSq < 1e-8) {
      out.copy(segA);
      return;
    }
    let t =
      ((point.x - segA.x) * abX +
        (point.y - segA.y) * abY +
        (point.z - segA.z) * abZ) /
      abLenSq;
    t = Math.max(0, Math.min(1, t));
    out.set(segA.x + abX * t, segA.y + abY * t, segA.z + abZ * t);
  }

  private pointToSegmentDistance(
    point: Vector3,
    segA: Vector3,
    segB: Vector3
  ): number {
    const abX = segB.x - segA.x;
    const abY = segB.y - segA.y;
    const abZ = segB.z - segA.z;
    const apX = point.x - segA.x;
    const apY = point.y - segA.y;
    const apZ = point.z - segA.z;
    const abLenSq = abX * abX + abY * abY + abZ * abZ;
    if (abLenSq < 1e-8) {
      const dx = point.x - segA.x;
      const dy = point.y - segA.y;
      const dz = point.z - segA.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    let t = (apX * abX + apY * abY + apZ * abZ) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = segA.x + abX * t;
    const cy = segA.y + abY * t;
    const cz = segA.z + abZ * t;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dz = point.z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Approximate segment-to-segment distance by sampling both segments
   * at 4 points each and taking the minimum point-to-segment distance.
   * Matches the approach in CollisionDetector so both agree.
   */
  private segmentToSegmentDistance(
    a0: Vector3,
    a1: Vector3,
    b0: Vector3,
    b1: Vector3
  ): number {
    let minDist = Infinity;
    const scratch = this._tmp3;
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      scratch.lerpVectors(a0, a1, t);
      const d = this.pointToSegmentDistance(scratch, b0, b1);
      if (d < minDist) minDist = d;
    }
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      scratch.lerpVectors(b0, b1, t);
      const d = this.pointToSegmentDistance(scratch, a0, a1);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }
}

/**
 * Build a rest-pose geometry from a target body height. Uses standard
 * anthropometric ratios (Winter 2009 / Dempster) so the optimizer can
 * work immediately without needing a loaded Three.js skeleton.
 *
 * Frame convention - this must match the state factory's prop world
 * positions so targets can be passed in without Y shifting:
 *
 *   Y = 0 at the shoulder line (NOT the feet)
 *   Hips sit below at approximately −28% of body height
 *   Head top sits above at approximately +17% of body height
 *
 * The shoulder-centered frame matches the TKA grid geometry: the wall
 * plane grid is centered on the performer's upper body, so its local
 * origin is at shoulder height, not at the ground.
 *
 * Coordinate convention: character's right = +X, forward = +Z, up = +Y.
 */
export function restPoseFromHeight(heightMeters: number): RestPoseGeometry {
  const h = heightMeters;
  // Shoulder line at Y=0. Measurements below/above as % of body height.
  const hipsY = -0.28 * h;
  const spine1Y = -0.2 * h;
  const spine2Y = -0.1 * h;
  const neckY = 0;
  const headBoneY = 0.04 * h; // base of skull, slightly above shoulder line
  const shoulderHalfWidth = 0.129 * h;

  return {
    hipsY,
    spine1: new Vector3(0, spine1Y, 0),
    spine2: new Vector3(0, spine2Y, 0),
    neck: new Vector3(0, neckY, 0),
    head: new Vector3(0, headBoneY, 0),
    // Mixamo convention: character's right = +X, left = -X.
    leftShoulder: new Vector3(-shoulderHalfWidth, 0, 0),
    rightShoulder: new Vector3(shoulderHalfWidth, 0, 0),
    upperArmLength: 0.186 * h,
    forearmLength: 0.146 * h,
    footHalfWidth: 0.1,
    headRadius: 0.09,
    torsoRadius: 0.12,
    // Oriented slab: wide across the shoulders, thin front-to-back. Scaled off
    // body height (≈ 0.078 h wide / 0.053 h deep / 0.067 h tall → 0.14/0.095/0.12
    // at 1.8 m). The thin depth axis is what edge-on twist exposes to a prop.
    torsoHalfWidth: 0.078 * h,
    torsoHalfDepth: 0.053 * h,
    torsoHalfHeight: 0.067 * h,
    armRadius: 0.04,
  };
}
