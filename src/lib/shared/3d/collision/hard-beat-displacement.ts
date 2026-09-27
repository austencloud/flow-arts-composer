/**
 * Hard beats: where a staff may move so the hand can hold it.
 *
 * Some grid points are out of reach from a square stance (the far cross-body
 * point is 78-81 cm from the shoulder; arm plus hand is about 60 cm), and
 * crossed or stacked hands need room to pass each other. Pulling the hands
 * apart would take them off their staffs, so this module moves the staff and
 * the hand together, within a cap, in the only two directions that keep the
 * staff where the score puts it:
 *
 * - **Radial**: along the staff's own line out of the grid centre, so an east
 *   staff stays east. Inward only; `radialOutMaxM` is reserved.
 * - **Depth**: toward or away from the audience, and only for a prop on the
 *   wall plane. On the wheel and floor planes depth lies inside the plane, so
 *   moving along it would change the staff's angle; there the unmet need is
 *   reported as `depthUnavailable` instead.
 *
 * Everything is a pure function of score time and the sequence. The track is
 * built once per sequence from the whole score, so a displacement can ramp in
 * ahead of the beat that needs it, and every displaced beat is listed in cm in
 * `track.report`.
 *
 * Frame: origin at the hand's grid centre, the frame of a prop's
 * `worldPosition`. +x is the performer's left, +y is up, +z points the way the
 * performer faces, toward the audience. A positive `depthM` moves the staff
 * toward the audience.
 */

import { Vector3 } from "three";
import {
  GRID_OFFSETS,
  Plane,
  PlaneMode,
  type PropState3D,
} from "@austencloud/scene-3d";
import {
  planUpperBodyStanceYawTarget,
  stanceSideBlend,
  stanceTargetsForPropStates,
} from "./upper-body-stance-planner";
import {
  resolveTrackedUpperBodyStance,
  type StanceYawTrack,
} from "./stance-yaw-track";

export type HardBeatCause =
  | "reach"
  | "crossed-lane"
  | "beta-lane"
  | "adjacent-lane"
  | "stance-corridor";

/**
 * Which hand goes downstage in a depth lane, and why.
 *
 * - `corridor-side`: the chest is turning side-on, so the lane takes the side
 *   the stance corridor will take.
 * - `default-left-downstage`: a beta pair (both hands near one point). Which
 *   hand belongs downstage depends on orientation, which is not mapped yet, so
 *   the left (blue) hand goes downstage until it is.
 * - `over-hand-downstage`: crossed or across-the-body pairs. The hand that
 *   routes over (the higher one, the animator's elbow-routing rule) goes
 *   downstage, so lanes and elbow routing agree.
 */
export type LaneRule =
  | "over-hand-downstage"
  | "default-left-downstage"
  | "corridor-side";

export interface HardBeatLimits {
  /** Largest inward move along the staff's radial line. */
  radialInMaxM: number;
  /** Reserved: nothing moves outward yet. */
  radialOutMaxM: number;
  /** Largest depth lane for one hand, either direction. */
  laneDepthMaxM: number;
}

/** Lanes are split between the hands by default (`laneForwardShare` 0.5), so
 *  the widest lane, 0.18 m, needs 0.09 m of each hand's 0.10 m. */
export const DEFAULT_HARD_BEAT_LIMITS: Readonly<HardBeatLimits> = {
  radialInMaxM: 0.25,
  radialOutMaxM: 0,
  laneDepthMaxM: 0.1,
};

/**
 * The open-loop body the planner reasons about. It cannot see solved elbows,
 * clavicle raise or head dodge, so the scoreboard, not this model, decides
 * whether a beat is actually held.
 */
export interface HardBeatBodyModel {
  /** Grid centre in front of the performer origin. Not scaled with height. */
  gridOffsetM: number;
  /** Shoulder joint (upper-arm root) half-span at rest. */
  shoulderHalfWidthM: number;
  /** Shoulder height relative to the grid centre. */
  shoulderDyM: number;
  /** Shoulder depth relative to the performer origin. */
  shoulderDzM: number;
  /** Shoulder to palm centre with the arm straight. */
  reachM: number;
  /** Kept in hand so the solve does not have to lock the elbow straight. */
  reachMarginM: number;
}

const CALIBRATION_HEIGHT_M = 1.905;

/**
 * Measured on ch07 and ch18 at 1.905 m (bind pose, upper-arm root; palm centre
 * from `getPalmWorldPoint`):
 *
 *   ch07: shoulders (±0.199, -0.038, -0.307) from the grid centre, arm chain
 *         0.514 m plus palm 0.090-0.092 m = 0.604-0.607 m
 *   ch18: shoulders (±0.223, -0.028, -0.331), chain 0.521 m plus palm
 *         0.104-0.105 m = 0.625 m
 *
 * The model is ch07, the shorter reach, so a displacement sized for it also
 * brings the staff within ch18's arm. The furthest palm-to-shoulder distance
 * either rig reached over the full corpus was 0.600 and 0.621 m.
 */
export function defaultHardBeatBodyModel(
  heightM: number = CALIBRATION_HEIGHT_M
): HardBeatBodyModel {
  const scale =
    Number.isFinite(heightM) && heightM > 0
      ? heightM / CALIBRATION_HEIGHT_M
      : 1;
  return {
    gridOffsetM: GRID_OFFSETS[PlaneMode.WALL],
    shoulderHalfWidthM: 0.199 * scale,
    shoulderDyM: -0.038 * scale,
    shoulderDzM: -0.007 * scale,
    reachM: 0.604 * scale,
    reachMarginM: 0.02 * scale,
  };
}

/** One hand's displacement at one score time. */
export interface HandDisplacement {
  /** Inward along the staff's radial line from the grid centre. */
  radialInM: number;
  /** Positive is toward the audience (+rig Z). Applied to wall-plane props only. */
  depthM: number;
}

export interface HardBeatSample {
  left: HandDisplacement;
  right: HandDisplacement;
  downstageHand: "left" | "right" | null;
}

export interface DisplacedBeat {
  /** Score-time step, 0-based: 0.00-0.99 is step 0. */
  step: number;
  hand: "left" | "right";
  radialInMaxM: number;
  radialOutMaxM: number;
  laneTowardAudienceMaxM: number;
  laneAwayMaxM: number;
  /** The existing side-on stance corridor. Reported here, not planned here. */
  corridorDepthMaxAbsM: number;
  causes: HardBeatCause[];
  laneRule: LaneRule | null;
  /** How far the model still leaves the palm short after the displacement. */
  shortfallMaxM: number;
  /** A cap, or the minimum radius, stopped the radial move short. */
  capped: boolean;
  /** A lane was needed but the prop is not on the wall plane. */
  depthUnavailable: boolean;
}

export interface HardBeatTrack {
  readonly stepCount: number;
  readonly loop: boolean;
  readonly samplesPerStep: number;
  readonly limits: Readonly<HardBeatLimits>;
  readonly body: Readonly<HardBeatBodyModel>;
  /** Share of the lane width the downstage hand takes toward the audience. */
  readonly laneForwardShare: number;
  readonly report: readonly DisplacedBeat[];
  /** Dense curves; sample i sits at score time i / samplesPerStep. */
  readonly leftRadialIn: Float64Array;
  readonly rightRadialIn: Float64Array;
  readonly leftDepth: Float64Array;
  readonly rightDepth: Float64Array;
  /** 1 left downstage, -1 right downstage, 0 no lane. */
  readonly downstage: Int8Array;
  readonly leftShortfall: Float64Array;
  readonly rightShortfall: Float64Array;
  readonly leftCapped: Uint8Array;
  readonly rightCapped: Uint8Array;
  readonly leftDepthUnavailable: Uint8Array;
  readonly rightDepthUnavailable: Uint8Array;
  /** Index into `LANE_RULES`, or -1. */
  readonly laneRule: Int8Array;
  /** Index into `LANE_KINDS`, or -1. */
  readonly laneKind: Int8Array;
}

export type HardBeatProp = Pick<PropState3D, "worldPosition" | "plane">;

/**
 * Anything that can say where the props are at an arbitrary score time.
 * Structural, so `CharacterInstanceState` satisfies it directly.
 */
export interface HardBeatScoreSource {
  readonly motionStepCount: number;
  readonly loop: boolean;
  propStatesAtScoreTime(scoreTime: number): {
    left: HardBeatProp | null;
    right: HardBeatProp | null;
  };
}

export interface HardBeatTrackOptions {
  source: HardBeatScoreSource | null;
  stanceTrack: StanceYawTrack | null;
  heightM: number;
  /** Only the wall mode is planned; every other mode gets no track. */
  planeMode?: PlaneMode;
  limits?: Partial<HardBeatLimits>;
  body?: HardBeatBodyModel;
  /**
   * Share of a lane's width given to the downstage hand moving toward the
   * audience; the rest moves the other hand away. 0.5, the default, splits it
   * evenly; 1 moves only the downstage hand, twice as far.
   */
  laneForwardShare?: number;
}

export const HARD_BEAT_SAMPLES_PER_STEP = 48;
/** The scoreboard's frames per step; the report reads each of them. */
const REPORT_SAMPLES_PER_STEP = 60;
/** Half-width of the ramp kernel: displacement starts this far ahead. */
export const HARD_BEAT_RAMP_STEPS = 0.25;
/** Inward moves stop this far from the grid centre. */
export const HARD_BEAT_MIN_RADIUS_M = 0.15;
export const DEFAULT_LANE_FORWARD_SHARE = 0.5;
/** Hands this close in the audience view count as a beta pair. */
const BETA_DISTANCE_M = 0.12;
/** Arm lines (shoulder to target, audience view) closer than this need a lane. */
const ARM_LINE_NEAR_M = 0.04;
/** ...and farther than this need none. */
const ARM_LINE_FAR_M = 0.16;
const BETA_LANE_TOTAL_M = 0.12;
const CROSSED_LANE_TOTAL_M = 0.18;
/** Above this side blend the corridor owns the lane's sign. */
const SIDE_BLEND_EPS = 0.01;
/** A lane changes sign only where the chest is at least this far side-on. */
const LANE_FLIP_SIDE_BLEND = 0.5;
/** Lanes against the stance corridor fade out this far ahead of the chest
 *  committing side-on: a full ramp, so no widened lane reaches a committed
 *  sample. */
const CORRIDOR_LEAD_STEPS = HARD_BEAT_RAMP_STEPS;
/** The upstage hand's radial move fades out only half a ramp ahead: a full
 *  ramp leaves it short of its staff for longer than the torso clearance
 *  gains (scoreboard: more palms off their staffs and a higher p90 gap). */
const CORRIDOR_RADIAL_LEAD_STEPS = HARD_BEAT_RAMP_STEPS / 2;
/** The animator's elbow-routing dead zone for which hand is over. */
const OVER_HAND_DEAD_ZONE_M = 0.04;
/** The animator routes a pair's elbows once this crossed, measured against
 *  this shoulder half-width (`ElbowPoleComputer.computePairRouting`). */
const PAIR_CROSS_ENGAGE = 0.25;
const ROUTING_SHOULDER_HALF_WIDTH_M = 0.2;
/** Displacements below this are not reported. */
const REPORT_EPS_M = 0.001;

export const LANE_RULES: readonly LaneRule[] = [
  "over-hand-downstage",
  "default-left-downstage",
  "corridor-side",
];
export const LANE_KINDS = [
  "beta-lane",
  "crossed-lane",
  "adjacent-lane",
] as const;
type LaneKind = (typeof LANE_KINDS)[number];

const ZERO_HAND: Readonly<HandDisplacement> = Object.freeze({
  radialInM: 0,
  depthM: 0,
});

/** What an untracked host applies: nothing. */
export const NO_HARD_BEAT_DISPLACEMENT: Readonly<HardBeatSample> =
  Object.freeze({
    left: ZERO_HAND,
    right: ZERO_HAND,
    downstageHand: null,
  });

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function wrapTime(time: number, period: number): number {
  return ((time % period) + period) % period;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Shoulder joints in the grid frame for a chest turned by `chestRad`. A
 *  positive yaw swings the left shoulder upstage, as the corridor assumes. */
function shoulders(body: HardBeatBodyModel, chestRad: number) {
  const h = body.shoulderHalfWidthM;
  const cos = Math.cos(chestRad);
  const sin = Math.sin(chestRad);
  const z = body.shoulderDzM - body.gridOffsetM;
  return {
    left: { x: h * cos, y: body.shoulderDyM, z: z - h * sin },
    right: { x: -h * cos, y: body.shoulderDyM, z: z + h * sin },
  };
}

function orient(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq > 1e-12
      ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1)
      : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance between two segments in the audience view; exactly 0 when they
 *  cross or touch. */
function armLineDistance(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3): number {
  const o1 = orient(a0.x, a0.y, a1.x, a1.y, b0.x, b0.y);
  const o2 = orient(a0.x, a0.y, a1.x, a1.y, b1.x, b1.y);
  const o3 = orient(b0.x, b0.y, b1.x, b1.y, a0.x, a0.y);
  const o4 = orient(b0.x, b0.y, b1.x, b1.y, a1.x, a1.y);
  const collinear = o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0;
  if (!collinear && o1 * o2 <= 0 && o3 * o4 <= 0) return 0;
  return Math.min(
    pointSegmentDistance(b0.x, b0.y, a0.x, a0.y, a1.x, a1.y),
    pointSegmentDistance(b1.x, b1.y, a0.x, a0.y, a1.x, a1.y),
    pointSegmentDistance(a0.x, a0.y, b0.x, b0.y, b1.x, b1.y),
    pointSegmentDistance(a1.x, a1.y, b0.x, b0.y, b1.x, b1.y)
  );
}

/**
 * How far to move a target inward along its radial line so the palm reaches
 * it: the smallest r with |T - r·u - S| <= R. Returns the closest approach
 * along the line when no r reaches, so the remainder shows up as shortfall.
 */
function radialReach(target: Vec3, unit: Vec3, shoulder: Vec3, reach: number) {
  const vx = target.x - shoulder.x;
  const vy = target.y - shoulder.y;
  const vz = target.z - shoulder.z;
  const b = unit.x * vx + unit.y * vy + unit.z * vz;
  const c = vx * vx + vy * vy + vz * vz - reach * reach;
  if (c <= 0) return 0;
  if (b * b >= c) return b - Math.sqrt(b * b - c);
  return b;
}

/**
 * In a crossed pair the animator routes the higher hand's elbow over, the left
 * on a tie within `OVER_HAND_DEAD_ZONE_M` (`ElbowPoleComputer`). Each hand's
 * radial move lowers or raises it by its own amount, so a hand that needs far
 * more reach than its partner can drop below it and swap the routing the score
 * implies. Where it would, the needier hand's move is cut back toward its
 * partner's, just far enough to keep the routing, and no further than the
 * partner's; what that leaves short is reported as shortfall.
 */
function holdPairRouting(
  left: Vec3,
  right: Vec3,
  leftIn: number,
  rightIn: number
): { left: number; right: number } {
  const crossing = Math.min(
    clamp(-left.x / ROUTING_SHOULDER_HALF_WIDTH_M, 0, 1),
    clamp(right.x / ROUTING_SHOULDER_HALF_WIDTH_M, 0, 1)
  );
  const leftRadius = Math.hypot(left.x, left.y, left.z);
  const rightRadius = Math.hypot(right.x, right.y, right.z);
  if (crossing < PAIR_CROSS_ENGAGE || leftRadius < 1e-9 || rightRadius < 1e-9)
    return { left: leftIn, right: rightIn };
  const leftUp = left.y / leftRadius;
  const rightUp = right.y / rightRadius;
  const rise = (a: number, b: number) =>
    left.y - a * leftUp - (right.y - b * rightUp);
  const leftOver = (a: number, b: number) =>
    rise(a, b) >= -OVER_HAND_DEAD_ZONE_M;
  const authored = leftOver(0, 0);
  if (leftOver(leftIn, rightIn) === authored)
    return { left: leftIn, right: rightIn };
  // The height difference is linear in each move: solve for the move that
  // puts the pair just inside the authored side of the dead zone's edge.
  const edge = -OVER_HAND_DEAD_ZONE_M + (authored ? 1e-6 : -1e-6);
  if (leftIn >= rightIn) {
    const a = leftUp !== 0 ? (rise(0, rightIn) - edge) / leftUp : Number.NaN;
    return {
      left: a >= rightIn && a <= leftIn ? a : rightIn,
      right: rightIn,
    };
  }
  const b = rightUp !== 0 ? (edge - rise(leftIn, 0)) / rightUp : Number.NaN;
  return {
    left: leftIn,
    right: b >= leftIn && b <= rightIn ? b : leftIn,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Ramp a raw curve in and out with a max over kernels:
 * w_i = max_j raw_j·(1 - smoothstep(|t_i - t_j| / RAMP)). The result is at
 * least the raw value everywhere, never above the raw maximum, and its slope is
 * bounded by the kernel's, whatever the raw curve does. Distance wraps at the
 * loop seam when the sequence loops.
 */
function widen(
  raw: Float64Array,
  samplesPerStep: number,
  loop: boolean
): Float64Array {
  const n = raw.length;
  const out = new Float64Array(n);
  const radius = Math.ceil(HARD_BEAT_RAMP_STEPS * samplesPerStep);
  for (let j = 0; j < n; j++) {
    const value = raw[j]!;
    if (value <= 0) continue;
    for (let k = -radius; k <= radius; k++) {
      let i = j + k;
      if (loop) i = ((i % n) + n) % n;
      else if (i < 0 || i >= n) continue;
      const weight =
        1 - smoothstep01(Math.abs(k) / samplesPerStep / HARD_BEAT_RAMP_STEPS);
      const candidate = value * weight;
      if (candidate > out[i]!) out[i] = candidate;
    }
  }
  return out;
}

/**
 * 1 minus the largest of `blend` within `lead` steps of each sample: a factor
 * that reaches 0 wherever `blend` is 1 and starts falling `lead` ahead of it.
 * The default lead is a full ramp, the widening kernel's reach, so a raw
 * curve scaled by it and then widened stays at or below (1 - blend) times its
 * peak at every sample, and is 0 wherever `blend` is 1. A shorter lead lets
 * the widened curve reach into those samples.
 */
function fadeAhead(
  blend: Float64Array,
  samplesPerStep: number,
  loop: boolean,
  lead: number = CORRIDOR_LEAD_STEPS
): Float64Array {
  const n = blend.length;
  const out = new Float64Array(n).fill(1);
  const radius = Math.ceil(lead * samplesPerStep);
  for (let j = 0; j < n; j++) {
    const value = blend[j]!;
    if (value <= 0) continue;
    for (let k = -radius; k <= radius; k++) {
      let i = j + k;
      if (loop) i = ((i % n) + n) % n;
      else if (i < 0 || i >= n) continue;
      out[i] = Math.min(out[i]!, 1 - value);
    }
  }
  return out;
}

/** Maximal runs of positive samples, as index lists in time order. A run
 *  that crosses the loop seam is one episode. */
function episodes(values: Float64Array, loop: boolean): number[][] {
  const n = values.length;
  const runs: number[][] = [];
  let current: number[] | null = null;
  for (let i = 0; i < n; i++) {
    if (values[i]! > 0) {
      (current ??= []).push(i);
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  if (loop && runs.length > 1 && values[0]! > 0 && values[n - 1]! > 0) {
    const tail = runs.pop()!;
    runs[0] = [...tail, ...runs[0]!];
  }
  return runs;
}

interface HandInput {
  prop: HardBeatProp | null;
  corridorM: number;
}

export function buildHardBeatTrack(
  options: HardBeatTrackOptions
): HardBeatTrack | null {
  const { source } = options;
  if (!source) return null;
  if ((options.planeMode ?? PlaneMode.WALL) !== PlaneMode.WALL) return null;
  const stepCount = Math.floor(source.motionStepCount);
  if (!(stepCount > 0)) return null;

  const limits: HardBeatLimits = {
    ...DEFAULT_HARD_BEAT_LIMITS,
    ...options.limits,
  };
  const body = options.body ?? defaultHardBeatBodyModel(options.heightM);
  const forwardShare = clamp(
    options.laneForwardShare ?? DEFAULT_LANE_FORWARD_SHARE,
    0,
    1
  );
  const reach = body.reachM - body.reachMarginM;
  const perStep = HARD_BEAT_SAMPLES_PER_STEP;
  const loop = source.loop;
  // A looping score wraps, so its last sample is followed by the first. A
  // score that plays once also samples its closing pose.
  const n = stepCount * perStep + (loop ? 0 : 1);

  const hands: { left: HandInput; right: HandInput }[] = new Array(n);
  const chest = new Float64Array(n);
  const sideBlend = new Float64Array(n);
  const need = new Float64Array(n);
  const laneRaw = new Float64Array(n);
  const betaWeight = new Float64Array(n);
  const crossing = new Uint8Array(n);
  const overLeft = new Uint8Array(n);
  const laneWidth = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / perStep;
    const { left, right } = source.propStatesAtScoreTime(t);
    const stance = resolveTrackedUpperBodyStance(
      options.stanceTrack,
      t,
      PlaneMode.WALL,
      left,
      right,
      null
    );
    const chestRad = stance.segments.chestRad;
    chest[i] = chestRad;
    sideBlend[i] = stanceSideBlend(
      chestRad,
      planUpperBodyStanceYawTarget(
        stanceTargetsForPropStates(PlaneMode.WALL, left, right)
      )
    );
    hands[i] = {
      left: { prop: left, corridorM: stance.leftDepthOffsetM },
      right: { prop: right, corridorM: stance.rightDepthOffsetM },
    };
    if (!left || !right) continue;

    // Lane need, from the two arm lines as the audience sees them. Crossed,
    // one-hand-across and stacked pairs bring the lines together; hands on
    // opposite sides (E/W uncrossed, N/S) keep them apart and get no lane.
    const s = shoulders(body, chestRad);
    const tl = left.worldPosition;
    const tr = right.worldPosition;
    const d2 = armLineDistance(s.left, tl, s.right, tr);
    const rawNeed =
      1 -
      smoothstep01((d2 - ARM_LINE_NEAR_M) / (ARM_LINE_FAR_M - ARM_LINE_NEAR_M));
    const beta =
      1 - smoothstep01(Math.hypot(tl.x - tr.x, tl.y - tr.y) / BETA_DISTANCE_M);
    const width =
      CROSSED_LANE_TOTAL_M + (BETA_LANE_TOTAL_M - CROSSED_LANE_TOTAL_M) * beta;
    need[i] = rawNeed;
    betaWeight[i] = beta;
    crossing[i] = d2 === 0 ? 1 : 0;
    overLeft[i] = tl.y - tr.y >= -OVER_HAND_DEAD_ZONE_M ? 1 : 0;
    laneWidth[i] = width * rawNeed;
    // Once the chest is side-on the corridor separates the hands instead, and
    // past the point where a lane may change sign it has none of its own, so
    // a changing lane never ramps in against the one ramping out. Crossed
    // pairs keep the full width (see the lane shares below).
    laneRaw[i] =
      sideBlend[i]! >= LANE_FLIP_SIDE_BLEND
        ? 0
        : width * rawNeed * (1 - sideBlend[i]!);
  }

  const needWide = widen(need, perStep, loop);

  // Each sample's lane sign: 1 sends the left hand downstage, -1 the right.
  // Where the chest is committed side-on the corridor owns the sign. A looping
  // pass can turn the chest both ways, so the sign changes as the chest
  // commits to the other side. Between stretches the sign holds, and an
  // episode the chest never commits in keeps one sign, so its lane never
  // flips mid-pass.
  const laneSign = new Int8Array(n);
  const laneRule = new Int8Array(n).fill(-1);
  const laneKind = new Int8Array(n).fill(-1);
  const corridorSign = (i: number) => (chest[i]! > 0 ? -1 : 1);
  for (const run of episodes(needWide, loop)) {
    let peak = run[0]!;
    let sideAt = -1;
    let crossed = false;
    for (const i of run) {
      if (need[i]! > need[peak]!) peak = i;
      if (crossing[i] === 1) crossed = true;
      if (
        sideBlend[i]! > SIDE_BLEND_EPS &&
        (sideAt < 0 || sideBlend[i]! > sideBlend[sideAt]!)
      ) {
        sideAt = i;
      }
    }
    // Need saturates before the arm lines meet, so the peak is often a
    // sample where they have not crossed yet: any crossing in the pass
    // makes it a crossed pair.
    const kind: LaneKind =
      betaWeight[peak]! >= 0.5
        ? "beta-lane"
        : crossed
          ? "crossed-lane"
          : "adjacent-lane";
    let rule: LaneRule;
    let sign: number;
    if (sideAt >= 0) {
      rule = "corridor-side";
      sign = corridorSign(sideAt);
    } else if (betaWeight[peak]! >= 0.5) {
      rule = "default-left-downstage";
      sign = 1;
    } else {
      rule = "over-hand-downstage";
      sign = overLeft[peak] === 1 ? 1 : -1;
    }
    const committed = (i: number) => sideBlend[i]! >= LANE_FLIP_SIDE_BLEND;
    const marks = run.filter(committed);
    if (marks.length > 0) {
      // Before the first committed sample, a pass that wraps the whole loop
      // continues from the last one; any other pass starts on the first.
      const wraps = loop && run.length === n;
      sign = corridorSign(wraps ? marks.at(-1)! : marks[0]!);
    }
    for (const i of run) {
      if (committed(i)) sign = corridorSign(i);
      laneSign[i] = sign;
      laneRule[i] = LANE_RULES.indexOf(rule);
      laneKind[i] = LANE_KINDS.indexOf(kind);
    }
  }

  // Where the corridor turns a hand upstage, that staff sits beside the spine,
  // so moving it inward drives it into the torso or head, and a lane sending
  // the upstage hand toward the audience or the downstage hand away fights
  // the corridor. Each gate is 0 wherever the chest is committed side-on and
  // is applied before widening. The lane gates lead by a full ramp, so no
  // widened lane opposes the corridor at a committed sample; a crossed pair's
  // lane is not gated and takes the corridor's sign there instead. The radial
  // gate leads by half a ramp (CORRIDOR_RADIAL_LEAD_STEPS). The upstage hand's
  // move away goes the corridor's way and is not gated: gating it put more
  // staffs through the body on the scoreboard, not fewer.
  const upstageBlend = {
    left: new Float64Array(n),
    right: new Float64Array(n),
  };
  const downstageBlend = {
    left: new Float64Array(n),
    right: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const { left, right } = hands[i]!;
    const engaged = clamp(sideBlend[i]! / LANE_FLIP_SIDE_BLEND, 0, 1);
    if (left.corridorM < right.corridorM) {
      upstageBlend.left[i] = engaged;
      downstageBlend.right[i] = engaged;
    } else if (right.corridorM < left.corridorM) {
      upstageBlend.right[i] = engaged;
      downstageBlend.left[i] = engaged;
    }
  }
  const keepUp = {
    left: fadeAhead(upstageBlend.left, perStep, loop),
    right: fadeAhead(upstageBlend.right, perStep, loop),
  };
  const keepDown = {
    left: fadeAhead(downstageBlend.left, perStep, loop),
    right: fadeAhead(downstageBlend.right, perStep, loop),
  };
  const keepUpRadial = {
    left: fadeAhead(
      upstageBlend.left,
      perStep,
      loop,
      CORRIDOR_RADIAL_LEAD_STEPS
    ),
    right: fadeAhead(
      upstageBlend.right,
      perStep,
      loop,
      CORRIDOR_RADIAL_LEAD_STEPS
    ),
  };

  // Each hand's share of the lane, toward and away from the audience, widened
  // on its own: where the sign changes one ramps out while the other ramps in,
  // so neither hand jumps. Arms crossed in front of the chest stay crossed
  // when it turns side-on, and the corridor alone does not keep them apart,
  // so a crossed pair keeps its whole lane there, ungated. Wherever the chest
  // is committed its lane takes the corridor's sign and adds to the corridor.
  // On the scoreboard this put far fewer staffs through the torso.
  const laneParts = {
    leftToward: new Float64Array(n),
    leftAway: new Float64Array(n),
    rightToward: new Float64Array(n),
    rightAway: new Float64Array(n),
  };
  const crossedKind = LANE_KINDS.indexOf("crossed-lane");
  for (let i = 0; i < n; i++) {
    const crossedPair = laneKind[i] === crossedKind;
    const lane = crossedPair ? laneWidth[i]! : laneRaw[i]!;
    const up = crossedPair
      ? { left: 1, right: 1 }
      : { left: keepUp.left[i]!, right: keepUp.right[i]! };
    const down = crossedPair
      ? { left: 1, right: 1 }
      : { left: keepDown.left[i]!, right: keepDown.right[i]! };
    if (laneSign[i] === 1) {
      laneParts.leftToward[i] = forwardShare * lane * up.left;
      laneParts.rightAway[i] = (1 - forwardShare) * lane * down.right;
    } else if (laneSign[i] === -1) {
      laneParts.rightToward[i] = forwardShare * lane * up.right;
      laneParts.leftAway[i] = (1 - forwardShare) * lane * down.left;
    }
  }
  const capped = (values: Float64Array) =>
    widen(values, perStep, loop).map((v) => Math.min(limits.laneDepthMaxM, v));
  const leftToward = capped(laneParts.leftToward);
  const leftAway = capped(laneParts.leftAway);
  const rightToward = capped(laneParts.rightToward);
  const rightAway = capped(laneParts.rightAway);

  const downstage = new Int8Array(n);
  const leftDepth = new Float64Array(n);
  const rightDepth = new Float64Array(n);
  const leftDepthUnavailable = new Uint8Array(n);
  const rightDepthUnavailable = new Uint8Array(n);
  const radialRaw = { left: new Float64Array(n), right: new Float64Array(n) };
  const clampedRaw = { left: new Uint8Array(n), right: new Uint8Array(n) };

  for (let i = 0; i < n; i++) {
    const lanes = {
      left: leftToward[i]! - leftAway[i]!,
      right: rightToward[i]! - rightAway[i]!,
    };
    downstage[i] =
      lanes.left > lanes.right
        ? 1
        : lanes.right > lanes.left
          ? -1
          : laneSign[i]!;
    const s = shoulders(body, chest[i]!);
    for (const side of ["left", "right"] as const) {
      const hand = hands[i]![side];
      const prop = hand.prop;
      if (!prop) continue;
      let depth = lanes[side];
      if (depth !== 0 && prop.plane !== Plane.WALL) {
        (side === "left" ? leftDepthUnavailable : rightDepthUnavailable)[i] = 1;
        depth = 0;
      }
      (side === "left" ? leftDepth : rightDepth)[i] = depth;

      const wp = prop.worldPosition;
      const radius = Math.hypot(wp.x, wp.y, wp.z);
      if (radius < 1e-9) continue;
      const unit = { x: wp.x / radius, y: wp.y / radius, z: wp.z / radius };
      const target = { x: wp.x, y: wp.y, z: wp.z + hand.corridorM + depth };
      const wanted = Math.max(0, radialReach(target, unit, s[side], reach));
      const bound = Math.min(
        limits.radialInMaxM,
        Math.max(0, radius - HARD_BEAT_MIN_RADIUS_M)
      );
      radialRaw[side][i] = Math.min(wanted, bound);
      clampedRaw[side][i] = wanted > bound + 1e-9 ? 1 : 0;
    }
    const { left, right } = hands[i]!;
    if (left.prop && right.prop) {
      const held = holdPairRouting(
        left.prop.worldPosition,
        right.prop.worldPosition,
        radialRaw.left[i]!,
        radialRaw.right[i]!
      );
      radialRaw.left[i] = held.left;
      radialRaw.right[i] = held.right;
    }
    radialRaw.left[i] = radialRaw.left[i]! * keepUpRadial.left[i]!;
    radialRaw.right[i] = radialRaw.right[i]! * keepUpRadial.right[i]!;
  }

  const leftRadialIn = widen(radialRaw.left, perStep, loop);
  const rightRadialIn = widen(radialRaw.right, perStep, loop);

  // Whatever the model still leaves the palm short after the displacement
  // that will actually render (widened, and limited by the minimum radius).
  const leftShortfall = new Float64Array(n);
  const rightShortfall = new Float64Array(n);
  const leftCapped = new Uint8Array(n);
  const rightCapped = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = shoulders(body, chest[i]!);
    for (const side of ["left", "right"] as const) {
      const hand = hands[i]![side];
      const prop = hand.prop;
      if (!prop) continue;
      const wp = prop.worldPosition;
      const radius = Math.hypot(wp.x, wp.y, wp.z);
      const radial = side === "left" ? leftRadialIn : rightRadialIn;
      const r = appliedRadialIn(radius, radial[i]!);
      const scale = radius < 1e-9 ? 1 : 1 - r / radius;
      const depth = (side === "left" ? leftDepth : rightDepth)[i]!;
      const shoulder = s[side];
      const short = Math.max(
        0,
        Math.hypot(
          wp.x * scale - shoulder.x,
          wp.y * scale - shoulder.y,
          wp.z * scale + hand.corridorM + depth - shoulder.z
        ) - reach
      );
      (side === "left" ? leftShortfall : rightShortfall)[i] = short;
      (side === "left" ? leftCapped : rightCapped)[i] =
        short > REPORT_EPS_M && clampedRaw[side][i] === 1 ? 1 : 0;
    }
  }

  const track: HardBeatTrack = {
    stepCount,
    loop,
    samplesPerStep: perStep,
    limits,
    body,
    laneForwardShare: forwardShare,
    report: [],
    leftRadialIn,
    rightRadialIn,
    leftDepth,
    rightDepth,
    downstage,
    leftShortfall,
    rightShortfall,
    leftCapped,
    rightCapped,
    leftDepthUnavailable,
    rightDepthUnavailable,
    laneRule,
    laneKind,
  };
  return {
    ...track,
    report: buildReport(track, source, options.stanceTrack),
  };
}

// ---------------------------------------------------------------------------
// Sampling and applying
// ---------------------------------------------------------------------------

/** The inward move a prop at `radius` actually takes: never past the
 *  minimum radius, so it cannot cross the centre or change side. */
function appliedRadialIn(radius: number, radialInM: number): number {
  if (radius < 1e-9) return 0;
  return Math.min(
    Math.max(0, radialInM),
    Math.max(0, radius - HARD_BEAT_MIN_RADIUS_M)
  );
}

function appliedDepth(prop: HardBeatProp, depthM: number): number {
  return prop.plane === Plane.WALL ? depthM : 0;
}

interface Neighbours {
  i0: number;
  i1: number;
  w: number;
}

function locate(track: HardBeatTrack, scoreTime: number): Neighbours {
  const n = track.downstage.length;
  const time = Number.isFinite(scoreTime) ? scoreTime : 0;
  if (track.loop) {
    const x = wrapTime(time, track.stepCount) * track.samplesPerStep;
    const i0 = Math.min(n - 1, Math.floor(x));
    return { i0, i1: (i0 + 1) % n, w: clamp(x - i0, 0, 1) };
  }
  const x = clamp(time, 0, track.stepCount) * track.samplesPerStep;
  const i0 = Math.min(n - 1, Math.floor(x));
  return { i0, i1: Math.min(n - 1, i0 + 1), w: clamp(x - i0, 0, 1) };
}

function lerpAt(values: Float64Array, at: Neighbours): number {
  return values[at.i0]! + (values[at.i1]! - values[at.i0]!) * at.w;
}

/**
 * The displacement at a score time: linear between dense samples, so it stays
 * within its neighbours (the caps hold) and is continuous across the loop seam.
 */
export function sampleHardBeatTrack(
  track: HardBeatTrack | null,
  scoreTime: number
): HardBeatSample {
  if (!track) return NO_HARD_BEAT_DISPLACEMENT;
  const at = locate(track, scoreTime);
  const nearest = at.w < 0.5 ? at.i0 : at.i1;
  const down =
    track.downstage[nearest] ||
    track.downstage[at.i0] ||
    track.downstage[at.i1];
  return {
    left: {
      radialInM: lerpAt(track.leftRadialIn, at),
      depthM: lerpAt(track.leftDepth, at),
    },
    right: {
      radialInM: lerpAt(track.rightRadialIn, at),
      depthM: lerpAt(track.rightDepth, at),
    },
    downstageHand: down === 1 ? "left" : down === -1 ? "right" : null,
  };
}

/**
 * Move one prop by one hand's displacement: inward along its own radial line
 * (never past the minimum radius, so it stays on its side of the grid) and, on
 * the wall plane only, in depth. Returns the same object when nothing moves,
 * and a copy otherwise; the source state is never mutated.
 */
export function displaceProp<P extends HardBeatProp>(
  prop: P | null,
  hand: HandDisplacement
): P | null {
  if (!prop) return prop;
  const wp = prop.worldPosition;
  const radius = Math.hypot(wp.x, wp.y, wp.z);
  const r = appliedRadialIn(radius, hand.radialInM);
  const depth = appliedDepth(prop, hand.depthM);
  if (r === 0 && depth === 0) return prop;
  // A prop at the grid centre has no radial line; only depth applies.
  const scale = radius < 1e-9 ? 1 : 1 - r / radius;
  return {
    ...prop,
    worldPosition: new Vector3(
      wp.x * scale,
      wp.y * scale,
      wp.z * scale + depth
    ),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface BeatAccumulator {
  beat: DisplacedBeat;
  causes: Set<HardBeatCause>;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * Every (step, hand) that renders a displacement above 1 mm, built from the
 * same samples and the same application rules as `displaceProp`. It reads
 * every scoreboard frame and every knot of the dense track; the track is linear
 * between knots, so its maxima are the rendered maxima. Each step also takes
 * its closing boundary, so a displacement that rises into the next beat is
 * listed under the beat it starts in.
 */
function buildReport(
  track: HardBeatTrack,
  source: HardBeatScoreSource,
  stanceTrack: StanceYawTrack | null
): DisplacedBeat[] {
  const beats = new Map<string, BeatAccumulator>();
  const grid =
    (REPORT_SAMPLES_PER_STEP * track.samplesPerStep) /
    greatestCommonDivisor(REPORT_SAMPLES_PER_STEP, track.samplesPerStep);
  const frameEvery = grid / REPORT_SAMPLES_PER_STEP;
  const knotEvery = grid / track.samplesPerStep;
  const total = track.stepCount * grid;
  for (let k = 0; k <= total; k++) {
    if (k % frameEvery !== 0 && k % knotEvery !== 0) continue;
    const t = k / grid;
    const steps: number[] = [];
    if (k < total) steps.push(Math.floor(k / grid));
    if (k > 0 && k % grid === 0) steps.push(k / grid - 1);
    const sampleTime = !track.loop && k === total ? t - 1e-6 : t;
    const { left, right } = source.propStatesAtScoreTime(sampleTime);
    const stance = resolveTrackedUpperBodyStance(
      stanceTrack,
      sampleTime,
      PlaneMode.WALL,
      left,
      right,
      null
    );
    const sample = sampleHardBeatTrack(track, sampleTime);
    const at = locate(track, sampleTime);
    for (const side of ["left", "right"] as const) {
      const prop = side === "left" ? left : right;
      if (!prop) continue;
      const hand = sample[side];
      const wp = prop.worldPosition;
      const radialIn = appliedRadialIn(
        Math.hypot(wp.x, wp.y, wp.z),
        hand.radialInM
      );
      const depth = appliedDepth(prop, hand.depthM);
      const corridor = Math.abs(
        side === "left" ? stance.leftDepthOffsetM : stance.rightDepthOffsetM
      );
      if (
        radialIn <= REPORT_EPS_M &&
        Math.abs(depth) <= REPORT_EPS_M &&
        corridor <= REPORT_EPS_M
      ) {
        continue;
      }
      const shortfall =
        side === "left" ? track.leftShortfall : track.rightShortfall;
      const capped = side === "left" ? track.leftCapped : track.rightCapped;
      const unavailable =
        side === "left"
          ? track.leftDepthUnavailable
          : track.rightDepthUnavailable;
      const laneAt =
        track.laneRule[at.i0]! >= 0
          ? at.i0
          : track.laneRule[at.i1]! >= 0
            ? at.i1
            : -1;
      for (const step of steps) {
        const key = `${step}|${side}`;
        let entry = beats.get(key);
        if (!entry) {
          entry = {
            beat: {
              step,
              hand: side,
              radialInMaxM: 0,
              radialOutMaxM: 0,
              laneTowardAudienceMaxM: 0,
              laneAwayMaxM: 0,
              corridorDepthMaxAbsM: 0,
              causes: [],
              laneRule: null,
              shortfallMaxM: 0,
              capped: false,
              depthUnavailable: false,
            },
            causes: new Set(),
          };
          beats.set(key, entry);
        }
        const beat = entry.beat;
        beat.radialInMaxM = Math.max(beat.radialInMaxM, radialIn);
        beat.radialOutMaxM = Math.max(beat.radialOutMaxM, -radialIn);
        beat.laneTowardAudienceMaxM = Math.max(
          beat.laneTowardAudienceMaxM,
          depth
        );
        beat.laneAwayMaxM = Math.max(beat.laneAwayMaxM, -depth);
        beat.corridorDepthMaxAbsM = Math.max(
          beat.corridorDepthMaxAbsM,
          corridor
        );
        beat.shortfallMaxM = Math.max(
          beat.shortfallMaxM,
          shortfall[at.i0]!,
          shortfall[at.i1]!
        );
        beat.capped ||= capped[at.i0] === 1 || capped[at.i1] === 1;
        beat.depthUnavailable ||=
          unavailable[at.i0] === 1 || unavailable[at.i1] === 1;
        if (radialIn > REPORT_EPS_M) entry.causes.add("reach");
        if (Math.abs(depth) > REPORT_EPS_M && laneAt >= 0) {
          const kind = LANE_KINDS[track.laneKind[laneAt]!];
          if (kind) entry.causes.add(kind);
          beat.laneRule ??= LANE_RULES[track.laneRule[laneAt]!] ?? null;
        }
        if (corridor > REPORT_EPS_M) entry.causes.add("stance-corridor");
      }
    }
  }

  const order: HardBeatCause[] = [
    "reach",
    "crossed-lane",
    "beta-lane",
    "adjacent-lane",
    "stance-corridor",
  ];
  return [...beats.values()]
    .map(({ beat, causes }) => ({
      ...beat,
      causes: order.filter((cause) => causes.has(cause)),
    }))
    .sort((a, b) =>
      a.step !== b.step ? a.step - b.step : a.hand === "left" ? -1 : 1
    );
}

const cm = (metres: number) => (metres * 100).toFixed(1);

/**
 * One line per displaced beat, for logs and reviews:
 * "step 3 left: in 20.4 cm radial, +7.0 cm depth (reach, crossed-lane,
 * over-hand-downstage)".
 */
export function describeHardBeatTrack(track: HardBeatTrack | null): string {
  if (!track) return "no hard-beat track";
  if (track.report.length === 0) return "no displaced beats";
  return track.report
    .map((beat) => {
      const parts: string[] = [];
      if (beat.radialInMaxM > REPORT_EPS_M) {
        parts.push(`in ${cm(beat.radialInMaxM)} cm radial`);
      }
      if (beat.laneTowardAudienceMaxM > REPORT_EPS_M) {
        parts.push(`+${cm(beat.laneTowardAudienceMaxM)} cm depth`);
      }
      if (beat.laneAwayMaxM > REPORT_EPS_M) {
        parts.push(`-${cm(beat.laneAwayMaxM)} cm depth`);
      }
      if (beat.corridorDepthMaxAbsM > REPORT_EPS_M) {
        parts.push(`corridor ${cm(beat.corridorDepthMaxAbsM)} cm`);
      }
      if (beat.shortfallMaxM > REPORT_EPS_M) {
        parts.push(
          `${beat.capped ? "capped, " : ""}short ${cm(beat.shortfallMaxM)} cm`
        );
      }
      if (beat.depthUnavailable)
        parts.push("depth unavailable off the wall plane");
      const why = [...beat.causes, ...(beat.laneRule ? [beat.laneRule] : [])];
      return `step ${beat.step} ${beat.hand}: ${parts.join(", ")} (${why.join(", ")})`;
    })
    .join("\n");
}
