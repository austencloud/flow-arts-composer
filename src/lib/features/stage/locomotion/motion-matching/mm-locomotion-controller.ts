
import { Quaternion } from "three";
import type { Bone } from "three";
import { Vector3 } from "three";
import { startInertialize, applyInertialize, type Inertializer } from "./inertialization";
import { solveLegIK } from "#lib/shared/3d/services/hinge-constrained-leg-ik-solver.js";
import { computeKneeHingeAxis } from "#lib/shared/3d/services/knee-hinge-axis-calibrator.js";
import type { RigBinding, LegChain } from "./rig-binding";

/**
 * Drop-in shape mirroring locomotion-controller.ts so call sites that read the
 * legacy controller's `state` work unchanged against this controller.
 */
export interface LocomotionState {
  position: Vector3;
  facing: number;
  speed: number;
  isMoving: boolean;
}

/**
 * Bones smoothed across a clip switch by inertialization: spine (upper-body
 * coherence) and legs (the visible stepping). The HIPS is EXCLUDED: the seam
 * yaw bank is INSTANT (it cancels the hips' yaw reset in the same frame, keeping
 * visible facing continuous); inertializing the hips through this rig's X-rotated
 * Armature + baked rest pitch makes yaw non-linear and swings it instead.
 */
const INERTIALIZED_BONES = [
  "Spine", "Spine1", "Spine2",
  "LeftUpLeg", "LeftLeg", "LeftFoot",
  "RightUpLeg", "RightLeg", "RightFoot",
] as const;

/** Leg/spine pose blend duration on a clip switch. */
const INERTIALIZE_SEC = 0.2;
/** Settle deadzone (rad, ~2.9°). Sits above idle breathing sway (~1°) so the
 *  controller does not hunt between turn and idle at rest. */
const STOP_TOL = 0.05;
/** Minimum commit time (sec) before re-triggering the SAME one-shot turn clip,
 *  so a finished pivot does not re-fire every frame. Family changes (including
 *  the settle to idle) are not gated, so stopping is prompt. */
const MIN_DWELL_SEC = 0.12;
/** A sign flip of remaining-to-target only counts as "arrived" (settle) when
 *  the body was already within this of the target (rad, ~34°). Beyond it a flip
 *  is a genuine re-target, not an overshoot to clamp. */
const CROSS_NEAR = 0.6;

/** Foot is "planted" when its ankle world Y is within this of the rest ankle
 *  height. Measured: planted ≈0.088m, lifted ≥0.097m for these clips — a clean
 *  ~1cm separation. */
const PLANT_BAND = 0.012;
/** IK weight ramp on plant (fast) and release (slower, eases the foot off the
 *  lock back onto the clip trajectory so there is no release pop). */
const FOOT_LOCK_ATTACK_SEC = 0.04;
const FOOT_LOCK_RELEASE_SEC = 0.12;

/** Max root translation speed (m/s) while stepping to a target position. */
const STEP_SPEED = 0.6;
/** Arrived-at-position tolerance (m). */
const POS_TOL = 0.01;

interface FootLockState {
  chain: LegChain;
  hinge: Vector3;
  /** World position the planted foot is pinned to; null when airborne. */
  lock: Vector3 | null;
  /** Body forward captured at touchdown — the foot keeps this ground aim while
   *  planted instead of twisting to follow the turning body. */
  lockForward: Vector3 | null;
  /** Current IK weight (ramps 0→1 on plant, 1→0 on release). */
  weight: number;
}

/** Turn clips are one-shot pivots (play once, hold at end); idle/walk loop. */
function isOneShot(clipId: string): boolean {
  return clipId.startsWith("turn");
}

/** Shortest-arc signed difference a-b, wrapped to [-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Reorient-in-place locomotion controller — seam-matched root motion.
 *
 * The visible turn is produced by the authored turn clip (the hips bone carries
 * the body rotation; the legs step). The rig root stays CONSTANT during a clip;
 * at every clip switch the root yaw is adjusted by
 * `(visibleYaw_before - visibleYaw_after)` so the body's world yaw is continuous
 * across the seam. This banks each clip's authored rotation into the root, so
 * when the turn clip hands off to idle (whose hips return to neutral) there is
 * no discontinuity — the rotation already lives in the root.
 *
 * Visible facing is read from the HIPS bone's WORLD matrix (atan2 of the world
 * Z basis), which is robust; the package RootMotionExtractor derives yaw from a
 * single Euler component and is unreliable for large turn clips (measured 24°
 * for a 90° clip), so it is not used for rotation here.
 *
 * Arbitrary angles fall out for free: a partial target consumes only part of a
 * turn clip then settles; a target beyond one clip re-triggers the turn clip
 * (seam-matched, no pop) until the target is reached. The settle switch lands
 * the body EXACTLY on the requested facing.
 *
 * Depends only on the {@link RigBinding} interface plus the inertialization
 * unit, so any rig provider can drive it.
 */
export class MmLocomotionController {
  private current: { clipId: string; time: number } | null = null;
  private idleClipId = "idle";
  private leftClipId = "turn-left";
  private rightClipId = "turn-right";
  private hips: Bone | null = null;
  private readonly restHipsPos = new Vector3();
  private footLocks: FootLockState[] = [];
  private restAnkleY = 0.088;
  private readonly _footWorld = new Vector3();
  private readonly _forward = new Vector3(0, 0, 1);
  private readonly _groundNormal = new Vector3(0, 1, 0);
  private readonly _qFootBefore = new Quaternion();
  private readonly _qParent = new Quaternion();
  private readonly inertBones = new Map<string, Bone>();
  private readonly inert = new Map<string, Inertializer>();
  private readonly durations = new Map<string, number>();
  /** Seconds played on the current clip since the last clip switch. */
  private timeSinceSwitch = 0;
  /** Hips world yaw at rest (the idle frame-0 facing); the relative target zero. */
  private restVis = 0;

  private readonly _state: LocomotionState = {
    position: new Vector3(),
    facing: 0,
    speed: 0,
    isMoving: false,
  };
  /** Absolute world yaw to reach, in the same metric as {@link visYaw}. */
  private targetFacing = 0;
  /** World XZ the root steps toward; null = stay in place (pure reorient). */
  private targetPos: { x: number; z: number } | null = null;
  private origin = { facing: 0 };
  /** Signed remaining-to-target last frame; used to detect the frame the body
   *  CROSSES the target so it settles instead of stepping over the deadzone and
   *  running the clip to completion (which overshoots, then reverses). */
  private lastRemaining = 0;
  private hasLastRemaining = false;

  constructor(private readonly rig: RigBinding) {}

  get state(): LocomotionState {
    return this._state;
  }

  /** Pose a clip; applyClip updates the rig's world matrices internally. */
  private pose(clipId: string, time: number): void {
    this.rig.applyClip(clipId, time);
  }

  /** The body's VISIBLE facing = hips world yaw, from the world Z basis vector.
   *  Robust under the rig's bone rest orientations (unlike Euler decomposition). */
  private visYaw(): number {
    const h = this.hips;
    if (!h) return this._state.facing;
    const e = h.matrixWorld.elements;
    return Math.atan2(e[8]!, e[10]!);
  }

  /**
   * Cache clip durations + bones, resolve idle/turn clips, seed playback on
   * idle, and record the rest facing (the relative-target zero + step-back
   * origin).
   */
  async initialize(): Promise<void> {
    const specs = this.rig.clipSpecs();
    for (const s of specs) this.durations.set(s.clipId, s.durationSec);

    this.idleClipId = specs.find((s) => s.clipId.includes("idle"))?.clipId ?? specs[0]?.clipId ?? "idle";
    this.leftClipId = specs.find((s) => s.clipId.includes("left"))?.clipId ?? "turn-left";
    this.rightClipId = specs.find((s) => s.clipId.includes("right"))?.clipId ?? "turn-right";

    this.hips = this.rig.getBone("Hips");
    for (const name of INERTIALIZED_BONES) {
      const b = this.rig.getBone(name);
      if (b) this.inertBones.set(name, b);
    }

    // Foot-lock chains + per-leg hinge axes (derived once at build time).
    const leftChain = this.rig.getLeftLegChain();
    const rightChain = this.rig.getRightLegChain();
    this.footLocks = [leftChain, rightChain].map((chain) => ({
      chain,
      hinge: computeKneeHingeAxis(chain.rootRestDir, chain.middleRestDir),
      lock: null,
      lockForward: null,
      weight: 0,
    }));

    // Seed on idle frame 0 and capture the rest facing.
    this.rig.root.rotation.y = 0;
    this.pose(this.idleClipId, 0);
    this.rig.root.updateMatrixWorld(true);
    this.restVis = this.visYaw();
    if (this.hips) this.restHipsPos.copy(this.hips.position);

    // Capture rest ankle height (both feet planted at idle) as the plant datum.
    const ankleY: number[] = [];
    for (const fl of this.footLocks) {
      fl.chain.effector.getWorldPosition(this._footWorld);
      ankleY.push(this._footWorld.y);
    }
    if (ankleY.length) this.restAnkleY = Math.min(...ankleY);

    this._state.facing = this.restVis;
    this.targetFacing = this.restVis;
    this.current = { clipId: this.idleClipId, time: 0 };
    this.origin = { facing: this.restVis };
  }

  /** Request a turn of `rad` relative to rest-forward (0 = face forward). */
  setTargetFacing(rad: number): void {
    this.targetFacing = this.restVis + rad;
    this.hasLastRemaining = false; // new maneuver: don't cross-detect across it
  }

  /** Request a step so the avatar's root reaches world (x, z). */
  setTargetPosition(x: number, z: number): void {
    this.targetPos = { x, z };
  }

  /** Re-aim back at the recorded spawn facing. */
  stepBackToOrigin(): void {
    this.targetFacing = this.origin.facing;
    this.hasLastRemaining = false;
  }

  update(dt: number): void {
    if (!this.current || !this.hips) return;
    const root = this.rig.root;

    // Advance the current clip's playhead. One-shot turns hold at their end;
    // looping clips (idle/walk) wrap.
    const dur = this.durations.get(this.current.clipId) ?? 1;
    const oneShot = isOneShot(this.current.clipId);
    this.current.time += dt;
    let finished = false;
    if (this.current.time >= dur) {
      if (oneShot) {
        this.current.time = dur;
        finished = true;
      } else {
        this.current.time -= dur;
      }
    }
    this.timeSinceSwitch += dt;

    // Pose the current clip and read the body's visible facing from it.
    this.pose(this.current.clipId, this.current.time);
    const vis = this.visYaw();
    const remaining = angleDelta(this.targetFacing, vis);

    // CROSSING: the body passed the target this frame (sign of `remaining`
    // flipped while already near it). The steep clip finish can step clean over
    // the narrow deadzone; without this, settle never fires, the one-shot clip
    // runs to completion (overshooting the target), `remaining` flips sign and
    // the OPPOSITE turn clip fires to correct — the intermittent end-of-step
    // twitch. Treating a near-target crossing as arrival settles instead.
    const crossed =
      this.hasLastRemaining &&
      Math.sign(remaining) !== Math.sign(this.lastRemaining) &&
      Math.abs(this.lastRemaining) < CROSS_NEAR;

    const turning = Math.abs(remaining) > STOP_TOL && !crossed;

    // Desired clip by INTENT: turn toward the target while outside the deadzone,
    // idle once settled (or just crossed).
    const desired = turning
      ? remaining > 0
        ? this.leftClipId
        : this.rightClipId
      : this.idleClipId;

    // Switch on a family change (prompt — not dwell-gated, so settling is
    // immediate and exact), or re-trigger a finished pivot that still needs to
    // turn further (dwell-gated so it cannot re-fire every frame).
    const familyChange = desired !== this.current.clipId;
    const retrigger = finished && oneShot && turning && this.timeSinceSwitch >= MIN_DWELL_SEC;

    if (familyChange || retrigger) {
      // Capture leg/spine pose for inertialization (NOT hips — see header).
      const oldQ = new Map<string, Quaternion>();
      for (const [name, bone] of this.inertBones) oldQ.set(name, bone.quaternion.clone());

      const visBefore = vis;
      this.pose(desired, 0);
      const visAfter = this.visYaw();

      // Land the body without a yank. A clean in-deadzone settle lands EXACTLY
      // on target (no overshoot to correct). A CROSSING settle stops at the
      // current facing (≤ one frame-step past target) rather than snapping back
      // to exact target. A turn->turn / idle->turn switch preserves continuity.
      const landYaw =
        desired === this.idleClipId
          ? crossed
            ? visBefore
            : this.targetFacing
          : visBefore;

      // Bank the root INSTANTLY so it cancels the hips' yaw reset in this same
      // frame — that is what keeps the visible facing continuous across the seam
      // (an eased bank lets the hips reset show as a yaw jump). The planted-foot
      // swing this would otherwise cause is absorbed by the foot-lock below.
      root.rotation.y += angleDelta(landYaw, visAfter);
      root.updateMatrixWorld(true);

      for (const [name, bone] of this.inertBones) {
        const q = oldQ.get(name)!; // populated in the loop directly above
        this.inert.set(name, startInertialize(q, bone.quaternion, INERTIALIZE_SEC));
      }

      this.current = { clipId: desired, time: 0 };
      this.timeSinceSwitch = 0;
    }

    // Apply the decaying inertialization offset on the hips/spine/legs.
    for (const [name, bone] of this.inertBones) {
      const it = this.inert.get(name);
      if (it) {
        bone.quaternion.copy(applyInertialize(it, bone.quaternion, dt));
        if (it.remaining <= 0) this.inert.delete(name);
      }
    }

    // Strip the hips' horizontal root-motion translation back to rest each frame
    // (in-place reorient). The turn clips displace the hips ~8cm during the step;
    // idle resets it — that mismatch is the "body lands in a different place"
    // snap. Keep local Z (vertical bob in this Mixamo→GLB axis mapping).
    if (this.hips) {
      this.hips.position.x = this.restHipsPos.x;
      this.hips.position.y = this.restHipsPos.y;
    }

    // Translational step: move the root toward the target XZ at a capped speed.
    // The world-space foot-lock below keeps planted feet put, so the body steps
    // over them; feet lifted during the pivot re-plant at the new location.
    if (this.targetPos) {
      const dx = this.targetPos.x - root.position.x;
      const dz = this.targetPos.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= POS_TOL) {
        root.position.x = this.targetPos.x;
        root.position.z = this.targetPos.z;
      } else {
        const stepLen = Math.min(dist, STEP_SPEED * dt);
        root.position.x += (dx / dist) * stepLen;
        root.position.z += (dz / dist) * stepLen;
      }
    }

    root.updateMatrixWorld(true);

    // Foot-lock: pin each planted foot to its touchdown world position so it
    // cannot swing when the seam bank rotates the body about the root origin
    // (the mid-step settle snap), nor slide during the step.
    this.applyFootLock(dt);

    const stepping =
      !!this.targetPos &&
      Math.hypot(
        this.targetPos.x - root.position.x,
        this.targetPos.z - root.position.z
      ) > POS_TOL;

    this._state.facing = this.visYaw();
    this._state.speed = turning || stepping ? 1 : 0;
    this._state.isMoving = turning || stepping;
    this._state.position.copy(root.position);

    this.lastRemaining = remaining;
    this.hasLastRemaining = true;
  }

  /**
   * Hold each planted foot at the world position it touched down on, via the
   * analytic hinge-constrained leg IK. Plant is detected from ankle world Y
   * (lifted feet rise ~1cm+ above the rest datum in these clips). The IK weight
   * ramps in on plant and out on lift so there is no acquire/release pop.
   */
  private applyFootLock(dt: number): void {
    const h = this.hips;
    if (!h || !this.footLocks.length) return;

    // Body forward (horizontal) from the hips world Z basis — drives the foot's
    // toe alignment and the knee pole.
    const e = h.matrixWorld.elements;
    this._forward.set(e[8]!, 0, e[10]!);
    if (this._forward.lengthSq() < 1e-8) this._forward.set(0, 0, 1);
    else this._forward.normalize();

    const plantThresh = this.restAnkleY + PLANT_BAND;

    for (const fl of this.footLocks) {
      fl.chain.effector.getWorldPosition(this._footWorld);
      const planted = this._footWorld.y < plantThresh;

      if (planted) {
        if (!fl.lock) {
          // Capture touchdown world position AND ground aim — the planted foot
          // holds both; it must not twist to follow the turning body.
          fl.lock = this._footWorld.clone();
          fl.lockForward = this._forward.clone();
        }
        fl.weight = Math.min(1, fl.weight + dt / FOOT_LOCK_ATTACK_SEC);
      } else {
        fl.weight = Math.max(0, fl.weight - dt / FOOT_LOCK_RELEASE_SEC);
        if (fl.weight <= 0) {
          fl.lock = null;
          fl.lockForward = null;
        }
      }

      if (fl.lock && fl.weight > 0) {
        const forward = fl.lockForward ?? this._forward;
        const foot = fl.chain.effector;
        // Foot-lock pins POSITION only. solveLegIK also forces the foot's world
        // orientation to a ground basis whose axis convention does not match
        // this Mixamo foot bone (it folds/twists the foot). Capture the clip's
        // natural foot orientation, solve for position, then restore it.
        foot.getWorldQuaternion(this._qFootBefore);
        solveLegIK({
          chain: fl.chain,
          footTarget: fl.lock,
          groundNormal: this._groundNormal,
          footForward: forward,
          kneeHingeAxis: fl.hinge,
          poleDirection: forward,
          weight: fl.weight,
        });
        if (foot.parent) {
          foot.parent.getWorldQuaternion(this._qParent);
          foot.quaternion.copy(this._qParent.invert()).multiply(this._qFootBefore);
        } else {
          foot.quaternion.copy(this._qFootBefore);
        }
        foot.updateMatrixWorld(true);
      }
    }
  }
}
