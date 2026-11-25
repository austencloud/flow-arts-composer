/**
 * Walks, runs, crouches and jumps a body, all of it from Mixamo clips.
 *
 * The rules it keeps, because breaking each one was a fault people saw:
 *
 * - One phase drives every step clip, and the ground covered drives the phase,
 *   so the standing foot goes back exactly as fast as the body goes forward.
 * - The pose is the clips'. Between two poses the feet are blended as places,
 *   not as joint angles, so a half-way leg neither dips through the floor nor
 *   needs lifting out of it. On top of that there is only a small hold on the
 *   foot that is down, capped, taken up at touchdown and let go softly.
 * - Every weight moves on a spring, so no bone jumps between two frames.
 * - A move (a jump, a landing, a slide) takes over from whatever the body was
 *   doing, at the speed every bone was going, and gives it back the same way.
 *   A sided move is played for the foot the body is on.
 * - Stopping runs the phase to the moment the feet pass each other, over the
 *   distance the body takes to stop, and the swinging foot comes down beside
 *   the standing one.
 */
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { inSpan, within, type GaitClip, type GaitClipSet, type GaitName, type GaitSide, type IdleName, type MoveName } from "./gait-clips";
import {
  addTurn,
  copyPose,
  hipsHeight,
  makePose,
  poseDifference,
  PoseInertia,
  poseNumbers,
  sampleTurn,
  trackPlace,
  trackTurn,
  turnToward,
  type Part,
  type Pose,
} from "./gait-pose";
import { GaitRig, premultiplyWorld, reach, type ClipFit, type Leg } from "./gait-rig";
import { fadeVector, spring, type Spring } from "./gait-spring";

/** Below this the body is standing (m/s). */
const STANDING_SPEED = 0.03;
/** How quickly the pose follows the body's speed (half-lives, s). */
const WEIGHT_HALF_LIFE = 0.055;
const AIM_RISE_HALF_LIFE = 0.04;
const AIM_FALL_HALF_LIFE = 0.3;
const TIER_HALF_LIFE = 0.08;
const TIER_STOP_HALF_LIFE = 0.12;
/** Going down into a crouch, and up (half-life, s). */
const LOW_HALF_LIFE = 0.09;
/** Crouched, the arms come into the run after the legs do: the hands stay out wide until the knees are down (half-life, s). */
const ARMS_HALF_LIFE = 0.16;
/** How quickly the hips go between the heights of standing up and of standing, walking and running crouched (half-life, s). */
const SETTLE_HALF_LIFE = 0.12;
/** Step length falls with speed to this power; the rest is step rate. */
const STRIDE_POWER = 0.6;
/** In a bend the steps go by the ground under the standing foot, which is more on the outside and less on the inside: at least and at most these shares of the body's, and how softly that comes in (half-life, s). */
const UNDER_LEAST = 0.5;
const UNDER_MOST = 2;
const UNDER_HALF_LIFE = 0.05;
/** The foot hold lets go when it would have to bend the pose further (m): straight on, standing, and in a bend of so many rad/s. */
const HOLD_LIMIT = 0.13;
const HOLD_LIMIT_STANDING = 0.2;
const HOLD_LIMIT_BEND = 0.24;
const HOLD_LIMIT_BEND_LOW = 0.34;
const BEND_FULL = 1.2;
/** How far a planted foot may be turned from the pose before it pivots on its ball (rad). */
const TWIST_LIMIT = 0.85;
const TWIST_LIMIT_STANDING = 0.3;
/** The share of that turn the knee takes. */
const KNEE_SHARE = 0.6;
/** A foot lands ahead by this share of the stride, and in a bend it lands into the bend: so much of what it will trail by, at most (m), and turned so far (rad per rad/s, and the most). */
const LANDS_AHEAD = 0.28;
const INTO_BEND = 0.5;
const INTO_BEND_MAX = 0.1;
const TOE_IN = 0.14;
const TOE_IN_MAX = 0.35;
/** A planted foot this far ahead or more limits how fast the body turns (m), to what it may trail (m), never below so fast (rad/s). */
const TRAILS_FROM = 0.1;
const TRAILS_MOST = 0.15;
const TURNS_LEAST = 0.9;
/** How far the hips come down to keep a planted foot within the leg's reach (m), and how fast. */
const STOOP_MAX = 0.03;
const STOOP_HALF_LIFE = 0.025;
/** The share of the leg's length a planted foot is kept within. */
const STRAIGHT = 0.997;
/** What is left to reach, the heel comes up for, the ball staying down (rad at most). */
const HEEL_MAX = 0.6;
/** How softly a released foot returns to the clip (half-life, s). */
const RELEASE_HALF_LIFE = 0.07;
/** The floor correction under a standing foot, at most (m), and how fast. */
const FLOOR_LIMIT = 0.04;
const FLOOR_HALF_LIFE = 0.04;
/** A ball of the foot this far off the floor is not standing (m). */
const LIFTED = 0.035;
/** How long a stop may take (s), whatever is left of the step. */
const STOP_SECONDS = [0.32, 0.56] as const;
/** The share of the ground a stop covers that its steps would cover at full length. */
const STOP_SHORTENING = 0.75;
/** Leaning into a change of speed or a bend (rad per m/s^2, and the most). */
const LEAN = 0.014;
const LEAN_MAX = 0.1;
const LEAN_HALF_LIFE = 0.12;
/** How far braking sinks the hips (m per m/s^2, and the most). */
const SINK = 0.007;
const SINK_MAX = 0.045;
/** Back from a move to walking or standing (half-life, s). */
const REJOIN_HALF_LIFE = 0.09;
/** A push off the floor takes the body up over this long, not in one frame (half-life, s). */
const HEAVE_HALF_LIFE = 0.03;
/** How long before now a clip is read to see how fast it moves (s). */
const A_MOMENT = 1 / 60;
/** A difference in a foot's speed counts as the ground it covers in this long (s). */
const SPEED_COUNTS = 0.1;
/** Taking up a gesture and letting it go (half-life, s). */
const GESTURE_HALF_LIFE = 0.11;
/** A gesture starts to let go this long before its clip ends (s). */
const GESTURE_TAIL = 0.3;
/** How far up the body a gesture takes hold. The rest of the body keeps walking. */
const GESTURE_SHARE: Record<string, number> = { Hips: 0, Spine: 0.35, Spine1: 0.7 };

/** A move being played: where in it, how fast, and whether the body is off the floor. */
export interface MoveFrame {
  name: MoveName;
  at: number;
  /** How fast `at` goes (1/s). */
  rate: number;
  /** A new one for every move, and for every jump within one. Never 0. */
  serial: number;
  air: boolean;
  /** How quickly it takes over (half-life, s). */
  ease: number;
  /** Left for right, where that is already chosen; else whichever suits the feet. */
  mirrored?: boolean;
}

export interface GaitFrame {
  /** Ground speed along the body's facing (m/s). */
  speed: number;
  /** How fast the body is turning (rad/s, positive to its left). */
  turnRate?: number;
  /** True while the body follows the stop `planStop` gave it. */
  stopping?: boolean;
  crouched?: boolean;
  move?: MoveFrame | null;
  /** How fast the body is going up (m/s). */
  lift?: number;
}

interface Foot extends Leg {
  held: boolean;
  /** Where the ball of the foot is held, in the world. */
  hold: Vector3;
  /** What is being added to the clip's foot, in the world, and its speed. */
  offset: Vector3;
  offsetSpeed: Vector3;
  /** Held this stance already and let go: it waits for the next one. */
  spent: boolean;
  /** How far the hold may bend the pose this stance (m). */
  room: number;
  /** Which way the foot points while it is held, in the world (rad). */
  holdYaw: number;
  /** What is being added to the way the clip's foot points. */
  twist: Spring;
  /** How far the hips should come down for this foot to be within reach (m). */
  need: number;
  /** How far the heel is up beyond the clip's, to reach (rad). */
  heel: Spring;
}

interface Stop {
  from: number;
  by: number;
  distance: number;
  travelled: number;
  /** Phase per share of the ground at the start, against the even rate: less than 1 hurries later. */
  pace: number;
}

interface Gesture {
  clip: GaitClip;
  /** The whole body does it, standing; otherwise only from the waist up. */
  whole: boolean;
  at: number;
  /** How many times through. */
  times: number;
  /** Each bone's share. */
  share: number[];
  ending: boolean;
}

const ARM_BONE = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/;
const LOOPS: readonly GaitName[] = ["walk", "run", "crouchWalk", "crouchRun"];
const IDLES: readonly IdleName[] = ["stand", "crouch"];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap01 = (x: number) => x - Math.floor(x);

/** Speed eases evenly to nothing over `distance`, so a stop takes this long. */
export const stopSeconds = (speed: number, distance: number) => (speed > 0 ? (2 * distance) / speed : 0);

export class GaitAnimator {
  /** Where in the cycle the body is: 0 the left foot lands, 0.5 the right. */
  phase = 0;
  /** How much of the pose is walking rather than standing. */
  readonly weight: Spring = { x: 0, v: 0 };
  /** The speed the clips are chosen for; it trails the body's a little. */
  readonly tier: Spring = { x: 0, v: 0 };
  /** How far down into a crouch. */
  readonly low: Spring = { x: 0, v: 0 };
  /** The speed the crouched clips' arms are chosen for. */
  private readonly arms: Spring = { x: 0, v: 0 };

  private rig: GaitRig | null = null;
  private feet: Foot[] = [];
  private readonly fits = {} as Record<GaitName | IdleName, ClipFit>;
  private readonly speeds: Record<GaitName, number> = { walk: 1.4, run: 3, crouchWalk: 1.5, crouchRun: 2.6 };
  /** How far through each idle, which keeps its own time. */
  private readonly idled: Record<IdleName, number> = { stand: 0, crouch: 0 };
  private parts: Part[] = [];
  /** How fast the phase goes (1/s). */
  private phaseRate = 0;
  /** The share of a full stride the speed asks for; a start asks for all of it at once. */
  private aim = 0;
  private stop: Stop | null = null;
  private standing = true;
  private lastSpeed = 0;
  /** The change of speed this frame (m/s^2). */
  private rise = 0;
  private lift = 0;
  private readonly pitch: Spring = { x: 0, v: 0 };
  private readonly roll: Spring = { x: 0, v: 0 };
  private readonly sink: Spring = { x: 0, v: 0 };
  /** How far the hips are down for the planted feet's sake (m). */
  private readonly stoop: Spring = { x: 0, v: 0 };
  /** How fast the body is turning (rad/s). */
  private turnRate = 0;
  /** How far to the left of the body the feet that stand are (m). */
  private readonly under: Spring = { x: 0, v: 0 };
  /** How far the body still trails a push off the floor (m). */
  private readonly heave: Spring = { x: 0, v: 0 };
  /** How much higher than standing crouched the hips are in everything else (m), how high they are, and how far the pose is from that. */
  private raised: Record<GaitName, number> = { walk: 0, run: 0, crouchWalk: 0, crouchRun: 0 };
  private readonly settled: Spring = { x: 0, v: 0 };
  private unsettled = 0;

  /** The move being played, as the clip for the foot it is on, or null for walking and standing. */
  private move: MoveFrame | null = null;
  private moveClip: GaitClip | null = null;
  private serial = 0;
  private airborne = false;
  /** The steps to come back to from this move are chosen. */
  private rejoined = false;
  private readonly inertia: PoseInertia;
  private readonly now: Pose;
  private readonly then: Pose;
  /** The last two poses drawn, before the feet were held, and the time between them. */
  private last: Pose;
  private before: Pose;
  private between = 0;
  private drawn = 0;
  private readonly rateLast: Float64Array;
  private readonly rateNow: Float64Array;

  private gesture: Gesture | null = null;
  private nextGesture: Gesture | null = null;
  private readonly gesturing: Spring = { x: 0, v: 0 };

  private readonly armBones: boolean[];

  constructor(private readonly clips: GaitClipSet) {
    const bones = clips.skeleton.bones.length;
    this.armBones = clips.skeleton.bones.map((name) => ARM_BONE.test(name));
    this.inertia = new PoseInertia(bones);
    this.now = makePose(bones);
    this.then = makePose(bones);
    this.last = makePose(bones);
    this.before = makePose(bones);
    this.rateLast = new Float64Array(poseNumbers(bones));
    this.rateNow = new Float64Array(poseNumbers(bones));
  }

  get ready(): boolean {
    return this.rig !== null;
  }

  get attachedTo(): Object3D | null {
    return this.rig?.root ?? null;
  }

  /** The speed each clip covers ground at on this body, and one cycle's length. */
  get measured(): { speeds: Record<GaitName, number>; strides: Record<GaitName, number>; passing: Record<GaitSide, number> } {
    const strides = Object.fromEntries(LOOPS.map((name) => [name, this.fits[name].stride])) as Record<GaitName, number>;
    return { speeds: { ...this.speeds }, strides, passing: { ...this.fits.walk.passing } };
  }

  /** For a bench to chart: each foot's hold, its sideways and its floor correction. */
  debug(): number[] {
    return this.feet.flatMap((f) => [f.held ? 1 : 0, Math.hypot(f.offset.x, f.offset.z), f.offset.y]);
  }

  /** Take over a loaded body, standing in its rest pose. Returns false if it is no such skeleton. */
  attach(root: Object3D): boolean {
    if (this.rig?.root === root) this.rig.release();
    this.detach();
    const rig = GaitRig.on(root, this.clips.skeleton);
    if (!rig) return false;
    this.rig = rig;
    this.feet = rig.legs.map((leg) => ({
      ...leg,
      held: false,
      hold: new Vector3(),
      offset: new Vector3(),
      offsetSpeed: new Vector3(),
      spent: false,
      room: HOLD_LIMIT,
      holdYaw: 0,
      twist: { x: 0, v: 0 },
      need: 0,
      heel: { x: 0, v: 0 },
    }));
    for (const name of [...LOOPS, ...IDLES]) this.fits[name] = rig.fit(this.clips[name]);
    for (const name of LOOPS) this.speeds[name] = this.fits[name].stride / this.clips[name].seconds;
    // Standing up, walking and running count as one height: what is between them is the clips' own.
    const [stand, crouchWalk, crouchRun] = (["stand", "crouchWalk", "crouchRun"] as const).map((name) => this.hipsHeight(name) - this.hipsHeight("crouch")) as [number, number, number];
    this.raised = { walk: stand, run: stand, crouchWalk, crouchRun };
    for (const clip of [...Object.values(this.clips.moves), ...Object.values(this.clips.mirrored)]) {
      rig.fit(clip, clip === this.clips.moves.fall ? this.fits.stand.floor : undefined);
    }
    this.reset();
    return true;
  }

  detach(): void {
    this.rig = null;
    this.feet = [];
    this.stop = null;
  }

  /** A teleport: standing, nothing held. */
  reset(): void {
    this.phase = this.fits.walk?.passing.right ?? 0;
    for (const s of [this.weight, this.tier, this.low, this.arms, this.pitch, this.roll, this.sink, this.stoop, this.under, this.heave, this.settled, this.gesturing]) s.x = s.v = 0;
    this.settled.x = this.raised.walk;
    this.idled.stand = this.idled.crouch = 0;
    this.stop = this.move = this.moveClip = this.gesture = this.nextGesture = null;
    this.standing = true;
    this.aim = 0;
    this.lastSpeed = 0;
    this.lift = 0;
    this.serial = 0;
    this.airborne = this.rejoined = false;
    this.drawn = 0;
    this.inertia.clear();
    for (const f of this.feet) {
      f.held = f.spent = false;
      f.offset.set(0, 0, 0);
      f.offsetSpeed.set(0, 0, 0);
      f.twist.x = f.twist.v = f.heel.x = f.heel.v = f.need = 0;
    }
  }

  /**
   * The keys came up at `speed`: how far the body should take to stand. The
   * body slows evenly over that distance and reports `stopping` meanwhile.
   */
  planStop(speed: number): number {
    if (!(speed > STANDING_SPEED)) return 0;
    // A stop straight out of a move starts from the steps the body comes back to.
    if (this.move && !this.rejoined) this.rejoin(speed, Math.min(0.9, this.steady(speed)));
    this.stop = this.bestStop(speed, null);
    return this.stop ? this.stop.distance : (speed * STOP_SECONDS[0]) / 2;
  }

  /** Where the phase ends for a stop from `speed`, over the `given` distance or the one that suits the feet best. */
  private bestStop(speed: number, given: number | null): Stop | null {
    const stride = this.stride(speed) * Math.max(0.35, this.weight.x);
    const { passing } = this.steps;
    // Run the phase to the next moment the feet pass each other, or the one after if that is too close.
    let best: Stop | null = null;
    let cost = Infinity;
    for (const target of [passing.left, passing.right]) {
      for (let by = wrap01(target - this.phase); by < 1.2; by += 1) {
        const wanted = (2 * by * stride * STOP_SHORTENING) / speed;
        const seconds = given === null ? clamp(wanted, STOP_SECONDS[0], STOP_SECONDS[1]) : stopSeconds(speed, given);
        const distance = (speed * seconds) / 2;
        // Hurrying the feet looks worse than taking a moment longer.
        const c = by < 0.04 ? Infinity : Math.abs(Math.log(wanted / seconds)) + seconds * 0.5;
        if (c >= cost) continue;
        cost = c;
        best = { from: this.phase, by, distance, travelled: 0, pace: clamp(distance / (by * stride), 0.45, 1.9) };
      }
    }
    return best;
  }

  /** Do a gesture on top of whatever the body is doing, or with the whole body if it stands. */
  startGesture(clip: GaitClip, whole: boolean, times: number): void {
    const made: Gesture = { clip, whole, at: 0, times, share: this.gestureShare(clip), ending: false };
    if (!this.gesture || this.gesturing.x < 0.02) this.gesture = made;
    else {
      this.gesture.ending = true;
      this.nextGesture = made;
    }
  }

  endGesture(): void {
    this.nextGesture = null;
    if (this.gesture) this.gesture.ending = true;
  }

  get gestureClip(): GaitClip | null {
    return this.nextGesture?.clip ?? (this.gesture && !this.gesture.ending ? this.gesture.clip : null);
  }

  update(dt: number, frame: GaitFrame): void {
    const { rig } = this;
    if (!rig || dt <= 0) return;
    const step = Math.min(dt, 0.1);
    rig.see();
    this.rise = (frame.speed - this.lastSpeed) / step;
    this.lastSpeed = frame.speed;
    this.turnRate = frame.turnRate ?? 0;

    const move = frame.move ?? null;
    const serial = move?.serial ?? 0;
    const changed = serial !== this.serial;
    const fromMove = this.move !== null;
    const tookOff = !!move?.air && this.airborne === false;
    this.airborne = move?.air ?? false;
    this.move = move;
    this.serial = serial;
    if (changed && move) this.moveClip = this.variant(move);
    spring(this.low, frame.crouched ? 1 : 0, LOW_HALF_LIFE, step);
    this.low.x = clamp(this.low.x, 0, 1);
    if (move) {
      this.stop = null;
      this.rejoined = false;
    } else {
      if (changed && fromMove && !this.rejoined) {
        const speed = Math.max(0, frame.speed);
        this.rejoin(speed, this.steady(speed));
      }
      if (changed && fromMove) {
        this.low.x = frame.crouched ? 1 : 0;
        // Braking already, since before the move was over.
        if (frame.stopping && !this.stop && frame.speed > STANDING_SPEED) this.stop = this.bestStop(frame.speed, (frame.speed * frame.speed) / (2 * Math.max(1, -this.rise)));
      }
      this.rejoined = false;
      this.advance(step, frame);
    }
    this.idle(step);
    this.settle(step, changed && fromMove);
    this.stepGesture(step, frame);

    this.parts = this.move ? this.moveParts() : this.locomotionParts(this.phase);
    this.evaluate(this.now, 0);
    const bones = this.clips.skeleton.bones.length;
    const lift = frame.lift ?? 0;
    if ((changed || tookOff) && this.drawn > 1) this.evaluate(this.then, step);
    if (tookOff && !changed && this.drawn > 1) {
      const was = (this.last.hips.y - this.before.hips.y) / this.between;
      const goes = lift + (this.now.hips.y - this.then.hips.y) / step;
      this.heave.v += Math.min(0, was - goes);
    }
    spring(this.heave, 0, HEAVE_HALF_LIFE, step);
    if (changed && this.drawn > 1) {
      poseDifference(this.last, this.before, this.rateLast);
      poseDifference(this.now, this.then, this.rateNow);
      for (let i = 0; i < this.rateLast.length; i++) {
        this.rateLast[i]! /= this.between;
        this.rateNow[i]! /= step;
      }
      // What the fall was doing, the hips still do when the ground stops the body.
      this.rateLast[hipsHeight(bones)]! += this.lift - lift;
      this.inertia.start(this.last, this.rateLast, this.then, this.rateNow, move?.ease ?? REJOIN_HALF_LIFE);
    }
    this.lift = lift;
    this.inertia.apply(this.now, step);
    const kept = this.before;
    this.before = this.last;
    this.last = kept;
    copyPose(this.now, this.last);
    this.now.hips.y += this.heave.x;
    for (const ankle of this.now.ankle) ankle.y += this.heave.x;
    this.between = step;
    this.drawn++;

    spring(this.sink, this.stop ? clamp(-this.rise * SINK, 0, SINK_MAX) : 0, LEAN_HALF_LIFE, step);
    spring(this.stoop, Math.min(STOOP_MAX, Math.max(...this.feet.map((f) => f.need))), STOOP_HALF_LIFE, step);
    rig.write(this.now, this.sink.x + this.stoop.x);
    this.lean(step, frame);
    rig.root.updateWorldMatrix(true, true);
    this.feet.forEach((foot, k) => {
      const side = k as 0 | 1;
      wanted.copy(this.now.ankle[side]).applyMatrix4(rig.frame);
      reach(foot, wanted, blend.copy(this.now.turn[side]).premultiply(rig.frameTurn));
      this.plant(foot, step);
    });
  }

  // ------------------------------------------------------------- the phase

  /** The steps this body is taking: walking ones, or crouched. */
  private get steps(): ClipFit {
    return this.low.x > 0.5 ? this.fits.crouchWalk : this.fits.walk;
  }

  /** The speed at which a step is taken at full length. */
  private get walkingSpeed(): number {
    return this.speeds.walk + (this.speeds.crouchWalk - this.speeds.walk) * this.low.x;
  }

  private steady(speed: number): number {
    return speed > STANDING_SPEED ? Math.min(1, Math.pow(speed / this.walkingSpeed, STRIDE_POWER)) : 0;
  }

  private advance(dt: number, frame: GaitFrame): void {
    const speed = Math.max(0, frame.speed);
    const moving = speed > STANDING_SPEED;
    if (!frame.stopping) this.stop = null;
    if (moving && this.standing && this.weight.x < 0.2) this.chooseFirstFoot();
    this.standing = !moving && !this.stop;

    // Braking steps are walking steps: a stop has no moment with both feet off the floor.
    if (this.stop) spring(this.tier, Math.min(speed, this.speeds.walk), TIER_STOP_HALF_LIFE, dt);
    else spring(this.tier, speed, TIER_HALF_LIFE, dt);
    spring(this.arms, this.tier.x, ARMS_HALF_LIFE, dt);
    if (this.arms.x > this.tier.x) this.follow();
    const steady = this.steady(speed);
    const half = steady > this.aim ? AIM_RISE_HALF_LIFE : AIM_FALL_HALF_LIFE;
    this.aim = moving ? steady + (this.aim - steady) * Math.pow(2, -dt / half) : 0;
    let target = this.aim;
    const was = this.phase;
    if (this.stop && moving) {
      const s = this.stop;
      s.travelled = Math.min(s.distance, s.travelled + speed * dt);
      const u = s.travelled / s.distance;
      this.phase = wrap01(s.from + s.by * (s.pace * u + (1 - s.pace) * u * u));
      // The step length this asks for, as a share of the clip's own.
      const stride = s.distance / (s.by * (s.pace + 2 * (1 - s.pace) * u));
      target = Math.min(target, clamp(stride / this.stride(this.tier.x), 0, 1));
    }
    spring(this.weight, target, WEIGHT_HALF_LIFE, dt);
    this.weight.x = clamp(this.weight.x, 0, 1);
    spring(this.under, this.underLeft(), UNDER_HALF_LIFE, dt);
    if (!this.stop && moving) {
      const stride = this.stride(this.tier.x) * Math.max(0.35, this.aim);
      const ground = clamp(speed - this.turnRate * this.under.x, speed * UNDER_LEAST, speed * UNDER_MOST);
      this.phase = wrap01(this.phase + (ground * dt) / stride);
    }
    this.phaseRate = wrap01(this.phase - was) / dt;
  }

  /** The arms' clips are the legs'. */
  private follow(): void {
    this.arms.x = this.tier.x;
    this.arms.v = this.tier.v;
  }

  /** How far to the left of the body the feet that stand are (m). */
  private underLeft(): number {
    const standing = this.feet.filter((foot) => foot.held);
    scratchM.copy(this.rig!.frame).invert();
    return standing.reduce((sum, foot) => sum + foot.toe.getWorldPosition(scratchA).applyMatrix4(scratchM).x / standing.length, 0);
  }

  /** The idles breathe on their own time, from the start each time they are come back to. */
  private idle(dt: number): void {
    const still = this.move ? 0 : 1 - this.weight.x;
    const seen = { stand: still * (1 - this.low.x), crouch: still * this.low.x };
    for (const name of IDLES) this.idled[name] = seen[name] > 1e-3 ? this.idled[name] + dt / this.clips[name].seconds : 0;
  }

  /** Crouched, the feet come to a stand at once and the hips take their time going down. After a move they are where the pose has them. */
  private settle(dt: number, afterMove: boolean): void {
    const stepping = this.loops(this.tier.x).reduce((sum, [name, share]) => sum + share * this.raised[name], 0);
    const still = (1 - this.low.x) * this.raised.walk;
    const high = this.move ? 0 : still + (stepping - still) * this.weight.x;
    if (this.move || afterMove) {
      this.settled.x = high;
      this.settled.v = 0;
    } else spring(this.settled, high, SETTLE_HALF_LIFE, dt);
    this.unsettled = this.settled.x - high;
  }

  /** How high a clip has the hips, over all of it (m). */
  private hipsHeight(name: GaitName | IdleName): number {
    const clip = this.clips[name];
    let sum = 0;
    for (let i = 0; i < clip.samples; i++) sum += this.rig!.hipsIn(clip, i / clip.samples, this.fits[name].floor, scratchA).y;
    return sum / clip.samples;
  }

  /**
   * Start with the foot that is further back, from the moment of the walk
   * whose standing foot is where this body's standing foot already is.
   */
  private chooseFirstFoot(): void {
    const [left, right] = this.feet as [Foot, Foot];
    const stand = this.backness(left) - this.backness(right) > 0.02 ? 1 : 0;
    const z = -this.backness(this.feet[stand]!);
    const { passing, tracks } = this.steps;
    const middle = passing[stand === 0 ? "left" : "right"];
    let best = Infinity;
    for (let d = -0.12; d <= 0.1; d += 0.01) {
      trackPlace(tracks[stand]!, middle + d, scratchA);
      const gap = Math.abs(scratchA.z - z);
      if (gap < best) {
        best = gap;
        this.phase = wrap01(middle + d);
      }
    }
    this.aim = 1;
  }

  private backness(foot: Foot): number {
    return -foot.ankle.getWorldPosition(scratchA).applyMatrix4(scratchM.copy(this.rig!.frame).invert()).z;
  }

  /** The walking clips at a speed and each one's share, standing up or crouched. */
  private loops(speed: number, crouchedSpeed = speed): Array<[GaitName, number]> {
    const { walk, run, crouchWalk, crouchRun } = this.speeds;
    const low = this.low.x;
    const t = clamp((speed - walk) / (run - walk), 0, 1);
    const c = clamp((crouchedSpeed - crouchWalk) / (crouchRun - crouchWalk), 0, 1);
    const shares: Array<[GaitName, number]> = [
      ["walk", (1 - t) * (1 - low)],
      ["run", t * (1 - low)],
      ["crouchWalk", (1 - c) * low],
      ["crouchRun", c * low],
    ];
    return shares.filter(([, share]) => share > 0);
  }

  /** One cycle's ground at this speed, at the clips' own step length (m). */
  private stride(speed: number): number {
    return this.loops(speed).reduce((s, [name, w]) => s + w * this.fits[name].stride, 0);
  }

  /** Whether a foot whose ball is `height` above the floor is standing on it. */
  private down(side: GaitSide, height: number): boolean {
    if (this.move) {
      const { down } = this.moveClip!;
      if (this.move.air || !down) return false;
      return height < LIFTED * 2 && down[side].some((span) => within(this.move!.at, span));
    }
    if (height > LIFTED) return false;
    if (this.weight.x < 0.25) return true;
    let start = 0;
    let end = 0;
    for (const [name, w] of this.loops(this.tier.x)) {
      const contact = this.clips[name][side];
      if (!contact) continue;
      start += w * contact.grip[0];
      end += w * contact.grip[1];
    }
    return inSpan(this.phase, [start, end]);
  }

  // ------------------------------------------------------------- the moves

  /** The clip for a move, left or right, whichever is nearer what the feet are doing. */
  private variant(move: MoveFrame): GaitClip {
    const plain = this.clips.moves[move.name];
    const other = this.clips.mirrored[move.name];
    if (move.mirrored !== undefined) return (move.mirrored && other) || plain;
    if (!other || this.drawn < 2) return plain;
    const cost = (clip: GaitClip) =>
      this.feetApart([{ clip, weight: 1, floor: 0, at: move.at, rate: move.rate }]);
    return cost(other) < cost(plain) ? other : plain;
  }

  /** How far a move's feet are from the feet last drawn, their speeds counted in (m squared). */
  misfit(name: MoveName, at: number, rate: number, mirrored: boolean): number {
    const clip = (mirrored && this.clips.mirrored[name]) || this.clips.moves[name];
    return this.rig && this.drawn > 1 ? this.feetApart([{ clip, weight: 1, floor: 0, at, rate }]) : 0;
  }

  /** Whether the body is on a foot, or with both off the floor, coming down on it. */
  on(side: GaitSide): boolean {
    if (this.feet.some((foot) => foot.held)) return this.feet.some((foot) => foot.side === side && foot.held);
    return side === (this.phase < 0.5 ? "right" : "left");
  }

  /**
   * How fast the body may turn to its left (`way` 1) or right (-1) at `speed`
   * (rad/s) for the feet that stand to stay where they are: a foot put down
   * well ahead trails out to the side as the body turns over it.
   */
  turnRoom(way: number, speed: number): number {
    let most = Infinity;
    if (this.move || !this.rig) return most;
    scratchM.copy(this.rig.frame).invert();
    for (const foot of this.feet) {
      if (!foot.held) continue;
      const z = foot.toe.getWorldPosition(scratchA).applyMatrix4(scratchM).z;
      if (z < TRAILS_FROM) continue;
      axis.set(1, 0, 0).applyQuaternion(this.rig.frameTurn);
      const trailed = -way * foot.offset.dot(axis);
      most = Math.min(most, (2 * Math.max(0.5, speed) * Math.max(0, TRAILS_MOST - trailed)) / (z * z));
    }
    return Math.max(TURNS_LEAST, most);
  }

  /** The body's size against the clips' own. */
  get scale(): number {
    return this.rig?.scale ?? 1;
  }

  /** How far the feet of some parts are from the feet last drawn, their speeds counted in. */
  private feetApart(parts: readonly Part[]): number {
    let sum = 0;
    for (const k of [0, 1] as const) {
      feetAt.set(0, 0, 0);
      feetWere.set(0, 0, 0);
      for (const { clip, weight, at, rate } of parts) {
        const track = this.rig!.fit(clip).tracks[k];
        feetAt.addScaledVector(trackPlace(track, at, scratchA), weight);
        feetWere.addScaledVector(trackPlace(track, at - rate * A_MOMENT, scratchA), weight);
      }
      feetWere.sub(feetAt).multiplyScalar(-1 / A_MOMENT);
      speedWas.copy(this.last.ankle[k]).sub(this.before.ankle[k]).multiplyScalar(1 / this.between);
      sum += feetAt.distanceToSquared(this.last.ankle[k]) + speedWas.distanceToSquared(feetWere) * SPEED_COUNTS * SPEED_COUNTS;
    }
    return sum;
  }

  /** Back to walking or standing from a move: at full stride for the speed, from the moment whose feet fit best. */
  private rejoin(speed: number, share: number): void {
    this.rejoined = true;
    this.weight.x = this.aim = share;
    this.weight.v = this.tier.v = this.low.v = 0;
    this.tier.x = speed;
    this.follow();
    this.standing = share === 0;
    this.idled.stand = this.idled.crouch = 0;
    if (share === 0) {
      this.phase = this.steps.passing.right;
      return;
    }
    this.phaseRate = speed / (this.stride(speed) * Math.max(0.35, share));
    let best = Infinity;
    for (let i = 0; i < 64; i++) {
      const cost = this.feetApart(this.locomotionParts(i / 64));
      if (cost >= best) continue;
      best = cost;
      this.phase = i / 64;
    }
  }

  // ------------------------------------------------------------- gestures

  /** A bone's share of a gesture: from the waist up, and only the arms that take part. */
  private gestureShare(clip: GaitClip): number[] {
    const { bones, parents } = this.clips.skeleton;
    // An arm takes part where it is nowhere near hanging at the side.
    const busy = (side: string): boolean => {
      const arm = bones.indexOf(`${side}Arm`);
      const fore = bones.indexOf(`${side}ForeArm`);
      let most = 0;
      for (const bone of [arm, fore]) {
        if (bone < 0) continue;
        sampleTurn(this.clips.stand, 0, bone, bones.length, scratchQ);
        for (let n = 0; n < clip.samples; n++) most = Math.max(most, scratchQ.angleTo(sampleTurn(clip, n / clip.samples, bone, bones.length, blend)));
      }
      return most > 0.6;
    };
    const arms = { Left: busy("Left"), Right: busy("Right") };
    const share: number[] = [];
    bones.forEach((name, i) => {
      const side = name.startsWith("Left") ? "Left" : name.startsWith("Right") ? "Right" : null;
      const above = parents[i]! < 0 ? 0 : share[parents[i]!]!;
      const limb = side ? name.slice(side.length) : "";
      if (/^(UpLeg|Leg|Foot|ToeBase)/.test(limb)) share.push(0);
      else if (side && limb === "Shoulder") share.push(arms[side] ? 1 : 0);
      else share.push(GESTURE_SHARE[name] ?? (side ? above : 1));
    });
    return share;
  }

  private stepGesture(dt: number, frame: GaitFrame): void {
    const g = this.gesture;
    if (!g) return;
    // The floor, a jump or a step takes the body back from a whole-body gesture.
    if (this.move || (g.whole && (frame.speed > STANDING_SPEED || frame.crouched))) g.ending = true;
    if (this.move) this.nextGesture = null;
    g.at += dt / g.clip.seconds;
    if ((g.times - g.at) * g.clip.seconds < GESTURE_TAIL) g.ending = true;
    spring(this.gesturing, g.ending ? 0 : 1, GESTURE_HALF_LIFE, dt);
    this.gesturing.x = clamp(this.gesturing.x, 0, 1);
    if (g.ending && this.gesturing.x < 0.015) {
      this.gesture = this.nextGesture;
      this.nextGesture = null;
      this.gesturing.x = this.gesturing.v = 0;
    }
  }

  // -------------------------------------------------------------- the pose

  private moveParts(): Part[] {
    const clip = this.moveClip!;
    const { at, rate } = this.move!;
    return [{ clip, weight: 1, floor: this.rig!.fit(clip).floor, at, rate }];
  }

  private locomotionParts(phase: number): Part[] {
    const w = this.weight.x;
    const low = this.low.x;
    const parts: Part[] = [];
    const add = (name: GaitName | IdleName, weight: number, arms: number, at: number, rate: number) => {
      if (weight > 0 || arms > 0) parts.push({ clip: this.clips[name], weight, arms, floor: this.fits[name].floor, at, rate });
    };
    for (const name of IDLES) {
      const weight = (1 - w) * (name === "crouch" ? low : 1 - low);
      add(name, weight, weight, this.idled[name], 1 / this.clips[name].seconds);
    }
    const legs = new Map(this.loops(this.tier.x));
    const arms = new Map(this.loops(this.tier.x, this.arms.x));
    for (const name of LOOPS) add(name, w * (legs.get(name) ?? 0), w * (arms.get(name) ?? 0), phase, this.phaseRate);
    return parts;
  }

  /** The pose as it is now, or as it was `ago` seconds back in the same clips. */
  private evaluate(into: Pose, ago: number): void {
    const rig = this.rig!;
    const { bones } = this.clips.skeleton;
    let { parts } = this;
    const g = this.gesture && this.gesturing.x > 0 ? this.gesture : null;
    if (g?.whole && this.gesturing.x > 0) {
      const x = this.gesturing.x;
      parts = parts.map((part) => ({ ...part, weight: part.weight * (1 - x), arms: (part.arms ?? part.weight) * (1 - x) }));
      parts.push({ clip: g.clip, weight: x, floor: rig.fit(g.clip).floor, at: g.at, rate: 1 / g.clip.seconds });
    }
    into.hips.set(0, 0, 0);
    for (const k of [0, 1] as const) {
      into.ankle[k].set(0, 0, 0);
      into.turn[k].set(0, 0, 0, 0);
    }
    for (const q of into.q) q.set(0, 0, 0, 0);
    for (const { clip, weight, arms = weight, floor, at, rate } of parts) {
      const u = at - rate * ago;
      into.hips.addScaledVector(rig.hipsIn(clip, u, floor, scratchA), weight);
      into.q.forEach((q, i) => addTurn(q, sampleTurn(clip, u, i, bones.length, scratchQ), this.armBones[i] ? arms : weight));
      const { tracks } = rig.fit(clip);
      for (const k of [0, 1] as const) {
        into.ankle[k].addScaledVector(trackPlace(tracks[k], u, scratchA), weight);
        addTurn(into.turn[k], trackTurn(tracks[k], u, scratchQ), weight);
      }
    }
    into.hips.y += this.unsettled;
    for (const q of into.q) q.normalize();
    for (const k of [0, 1] as const) into.turn[k].normalize();
    if (g && !g.whole) {
      const u = g.at - ago / g.clip.seconds;
      into.q.forEach((q, i) => {
        const share = g.share[i]! * this.gesturing.x;
        if (share > 0) turnToward(q, sampleTurn(g.clip, u, i, bones.length, scratchQ), share);
      });
    }
  }

  /** A little into a change of speed, a little into a bend. */
  private lean(dt: number, frame: GaitFrame): void {
    const rig = this.rig!;
    const bend = -(frame.turnRate ?? 0) * frame.speed;
    const on = this.move ? 0 : 1;
    spring(this.pitch, on * clamp(this.rise * LEAN, -LEAN_MAX * 0.6, LEAN_MAX), LEAN_HALF_LIFE, dt);
    spring(this.roll, on * clamp(bend * LEAN, -LEAN_MAX, LEAN_MAX), LEAN_HALF_LIFE, dt);
    const share = 1 / Math.max(1, rig.spine.length);
    for (const bone of rig.spine) {
      bone.updateWorldMatrix(true, false);
      // About the body's own left-right and front-back axes.
      for (const [x, z, angle] of [
        [1, 0, this.pitch.x],
        [0, 1, this.roll.x],
      ] as const) {
        axis.set(x, 0, z).applyQuaternion(rig.frameTurn);
        premultiplyWorld(bone, scratchQ.setFromAxisAngle(axis, angle * share));
      }
    }
  }

  // -------------------------------------------------------------- the feet

  private plant(foot: Foot, dt: number): void {
    foot.toe.getWorldPosition(toeAt);
    foot.ankle.getWorldPosition(ankleAt);
    foot.thigh.getWorldPosition(hipAt);
    groundAt.setFromMatrixPosition(this.rig!.frame);
    const air = this.move?.air ?? false;
    const down = this.down(foot.side, toeAt.y - foot.toeRest - groundAt.y);
    // Which way the pose points the foot, in the world.
    const points = yawOf(this.rig!.frameTurn) + yawOf(scratchQ.copy(this.now.turn[foot.side === "left" ? 0 : 1]).multiply(blend.copy(foot.turnRest).invert()));
    if (!down) {
      foot.held = false;
      foot.spent = false;
    } else if (!foot.held && !foot.spent) {
      foot.held = true;
      foot.hold.copy(toeAt).add(foot.offset);
      foot.holdYaw = points + foot.twist.x;
      foot.room = HOLD_LIMIT;
    }
    foot.need = 0;
    if (foot.held) {
      wanted.set(foot.hold.x - toeAt.x, 0, foot.hold.z - toeAt.z);
      const still = this.move ? !this.moveClip!.travel : this.weight.x < 0.25;
      const most = HOLD_LIMIT_BEND + (HOLD_LIMIT_BEND_LOW - HOLD_LIMIT_BEND) * this.low.x;
      foot.room = Math.max(foot.room, HOLD_LIMIT + (most - HOLD_LIMIT) * Math.min(1, Math.abs(this.turnRate) / BEND_FULL));
      scratchA.copy(ankleAt).add(wanted);
      // Bending the knees a little keeps the foot within reach.
      const across = Math.hypot(scratchA.x - hipAt.x, scratchA.z - hipAt.z);
      const straight = foot.legLength * STRAIGHT;
      foot.need = across < straight ? Math.max(0, hipAt.y + this.stoop.x - scratchA.y - Math.sqrt(straight * straight - across * across)) : 0;
      if (wanted.length() > (still ? HOLD_LIMIT_STANDING : foot.room) || scratchA.distanceTo(hipAt) > foot.legLength * 1.06) {
        foot.held = false;
        foot.spent = true;
      } else {
        const most = still ? TWIST_LIMIT_STANDING : TWIST_LIMIT;
        const twist = clamp(angle(foot.holdYaw - points), -most, most);
        foot.holdYaw = points + twist;
        foot.twist.v = (twist - foot.twist.x) / dt;
        foot.twist.x = twist;
        foot.offsetSpeed.x = (wanted.x - foot.offset.x) / dt;
        foot.offsetSpeed.z = (wanted.z - foot.offset.z) / dt;
        foot.offset.x = wanted.x;
        foot.offset.z = wanted.z;
      }
    }
    const height = foot.offset.y;
    const rise = foot.offsetSpeed.y;
    if (!foot.held) {
      // Start the fade from rest: the speed of a pulled foot would throw it past the clip.
      foot.offsetSpeed.x = clamp(foot.offsetSpeed.x, -0.4, 0.4);
      foot.offsetSpeed.z = clamp(foot.offsetSpeed.z, -0.4, 0.4);
      // A foot on its way to the floor comes down into the bend the body is in.
      const swings = !down && !this.move;
      const lands = LANDS_AHEAD * this.stride(this.tier.x) * this.weight.x;
      const trails = (this.turnRate * lands * lands) / (2 * Math.max(0.5, this.lastSpeed));
      axis.set(1, 0, 0).applyQuaternion(this.rig!.frameTurn);
      scratchA.copy(axis).multiplyScalar(swings ? clamp(trails * INTO_BEND, -INTO_BEND_MAX, INTO_BEND_MAX) : 0).setY(foot.offset.y);
      foot.offset.sub(scratchA);
      fadeVector(foot.offset, foot.offsetSpeed, RELEASE_HALF_LIFE, dt);
      foot.offset.add(scratchA);
      foot.twist.v = clamp(foot.twist.v, -2, 2);
      spring(foot.twist, swings ? clamp(this.turnRate * TOE_IN, -TOE_IN_MAX, TOE_IN_MAX) : 0, RELEASE_HALF_LIFE, dt);
    }
    // The sole on the floor while it is down; never through it while it is not.
    const sole = Math.min(toeAt.y - foot.toeRest, ankleAt.y - foot.ankleRest) - groundAt.y;
    const floor = air ? 0 : clamp(down ? -sole : Math.max(0, -sole), -FLOOR_LIMIT, FLOOR_LIMIT);
    vertical.x = height;
    vertical.v = rise;
    foot.offset.y = spring(vertical, floor, FLOOR_HALF_LIFE, dt);
    foot.offsetSpeed.y = vertical.v;

    const twist = foot.twist.x;
    if (!foot.held) spring(foot.heel, 0, RELEASE_HALF_LIFE, dt);
    if (foot.offset.lengthSq() < 1e-8 && Math.abs(twist) < 1e-4 && foot.heel.x < 1e-3) return;
    foot.ankle.getWorldQuaternion(blend);
    scratchB.copy(ankleAt);
    if (Math.abs(twist) >= 1e-4) {
      // About the ball of the foot, the knee going some of the way with it.
      scratchQ.setFromAxisAngle(UP, twist);
      scratchB.sub(toeAt).applyQuaternion(scratchQ).add(toeAt);
      blend.premultiply(scratchQ);
      axis.subVectors(hipAt, ankleAt).normalize();
      premultiplyWorld(foot.thigh, scratchQ.setFromAxisAngle(axis, twist * KNEE_SHARE));
      foot.thigh.updateWorldMatrix(false, true);
    }
    scratchB.add(foot.offset);
    scratchA.copy(toeAt).add(foot.offset);
    ahead.subVectors(scratchA, scratchB).setY(0).normalize();
    axis.crossVectors(UP, ahead);
    const raised = (heel: number) => wanted.subVectors(scratchB, scratchA).applyQuaternion(scratchQ.setFromAxisAngle(axis, heel)).add(scratchA);
    if (foot.held) {
      let heel = 0;
      if (raised(0).distanceTo(hipAt) > foot.legLength * STRAIGHT) {
        let most = HEEL_MAX;
        for (let i = 0; i < 8; i++) {
          const half = (heel + most) / 2;
          if (raised(half).distanceTo(hipAt) > foot.legLength * STRAIGHT) heel = half;
          else most = half;
        }
      }
      foot.heel.v = (heel - foot.heel.x) / dt;
      foot.heel.x = heel;
    }
    if (foot.heel.x > 1e-3) {
      raised(foot.heel.x);
      reach(foot, wanted, blend.premultiply(scratchQ));
      premultiplyWorld(foot.toe, scratchQ.invert());
    } else reach(foot, scratchB, blend);
  }
}

/** How far a rotation turns about the upright. */
const yawOf = (q: Quaternion) => 2 * Math.atan2(q.y, q.w);
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const UP = new Vector3(0, 1, 0);
const vertical: Spring = { x: 0, v: 0 };
const scratchA = new Vector3();
const scratchB = new Vector3();
const scratchM = new Matrix4();
const scratchQ = new Quaternion();
const blend = new Quaternion();
const feetAt = new Vector3();
const feetWere = new Vector3();
const speedWas = new Vector3();
const toeAt = new Vector3();
const ankleAt = new Vector3();
const hipAt = new Vector3();
const groundAt = new Vector3();
const wanted = new Vector3();
const ahead = new Vector3();
const axis = new Vector3();
