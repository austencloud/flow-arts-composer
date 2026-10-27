/**
 * Body response: how the whole body turns, shifts, ducks and steps so both
 * hands stay on their staffs and the staffs stay out of the body.
 *
 * Since every performer keeps the Composer's full 0.52 m grid, a hand from a
 * square chest falls short of its staff on wide, high, low and crossing beats,
 * and crossing staffs run through the chest. A performer answers that with the
 * whole body: turns side-on, steps toward or away, ducks under an overhead
 * spin. This module plans that answer over the score
 * (docs/superpowers/specs/active/2026-10-23-body-response.md, design B). A
 * host applies it only when it asks; nothing here changes a pose on its own.
 *
 * Owner: this extends the body-clearance planner (`body-clearance.ts`) rather
 * than starting a second one. It reuses that planner's torso table, staff
 * points, interval chain, hands and ramp, and adds what clearance alone lacks:
 * a reach cost, a body yaw, the head, a duck, every plane mode, and feet.
 * Searched for: body offset, body yaw, step planner, foot plant, plantLeg,
 * FootPlanter, duck, facing, stance yaw, reach deficit. Closest matches:
 * `body-clearance.ts` (extended), `stance-yaw-track.ts` (the chest twist this
 * replaces in part), the locomotion owner's `FootPlanter` and exact-step plans
 * (walking, not standing reach; the spec's option A, not built). The steps
 * here are a reach adjustment while standing, not travel.
 *
 * At each score time the planner picks a body yaw (15 degree candidates, kept
 * within 45 degrees of the cheapest yaw so far, the host's facing or the
 * stance, and at most 15 degrees from the previous plan sample's) and a
 * floor move (12 directions, each at its best length up to the cap). It
 * charges, per sample: staff left inside the pelvis, waist, chest or head;
 * each grip's distance beyond the arm's reach from its moved, turned
 * shoulder; the move; the chest twist the body has not taken over; and the
 * yaw's distance from the facing the host wants. Between
 * samples it charges for a change of move and of yaw. A staff through the
 * head may be answered by a duck instead, when that is cheaper than leaving it
 * there and no floor move or turn clears it for less.
 *
 * The body yaw turns the hips; the chest keeps whatever twist the stance still
 * asks on top of it. A body turn in the stance's own direction replaces that
 * much twist instead of stacking on it; past the stance, or against it, the
 * chest goes with the body.
 *
 * Feet: after the hips are planned, a step pair starts wherever the hips have
 * left the feet by more than a trigger distance, or the body has turned past
 * the feet by more than a trigger angle, for a quarter step. One foot lifts,
 * travels on a sine arc and lands under the new hips and facing, then the
 * other; between pairs the feet hold where they landed and the body shifts and
 * turns over them.
 *
 * Frame: the performer's own, as body-clearance: +x the performer's left, +y
 * up, +z toward the audience; heights from the grid centre. Every offset is in
 * that frame; the grid does not turn with the body.
 */

import { PlaneMode } from "@austencloud/scene-3d";
import type { PerformerReachMeasurements } from "../domain/performer-reach-measurements";
import { MAX_STANCE_YAW_RAD } from "./upper-body-stance-planner";
import {
  displaceProp,
  lerpDenseSample,
  locateDenseSample,
  sampleHardBeatTrack,
  widen,
  type DenseSampleNeighbours,
  type HardBeatTrack,
} from "./hard-beat-displacement";
import {
  resolveTrackedUpperBodyStance,
  SPINE1_SHARE,
  type StanceYawTrack,
} from "./stance-yaw-track";
import {
  BODY_CLEARANCE_RAMP_STEPS,
  BODY_CLEARANCE_SAMPLES_PER_STEP,
  DEFAULT_BODY_CLEARANCE_MAX_M,
  defaultBodyClearanceModel,
  LEFT_INSIDE_COST,
  MOVE_COST,
  MOVE_DIRECTIONS,
  MOVE_RING,
  prepareStaffPoints,
  reachHands,
  RECORD_STRIDE,
  STAFF_STEP_M,
  staffIntervals,
  staffLine,
  TURN_COST,
  type BodyClearanceModel,
  type BodyClearanceScoreSource,
  type ReachHand,
  type StaffLine,
  type StaffPoints,
} from "./body-clearance";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** The programme plans every fourth dense sample (12 a step); the chosen
 *  moves are interpolated between, then ramped as body-clearance ramps. At
 *  every sample it took about four times as long for the same choices. */
export const BODY_RESPONSE_PLAN_STRIDE = 4;
/** Body yaw candidates are this far apart, from -180 to +180 degrees. */
export const BODY_YAW_STEP_RAD = 15 * DEG;
/** Each plan sample considers the yaws within this of the previous plan
 *  sample's cheapest yaw, of the host's facing and of the stance's twist,
 *  rather than all twenty-five, which keeps the programme small. */
export const BODY_YAW_WINDOW_RAD = 45 * DEG;
/** The body turns at most this far either side of square to its grid. The
 *  grid stays where the score put it while the body turns under it, so past
 *  about a right angle one hand's grip falls behind its shoulder; the stage
 *  measured the hips swinging to 180 degrees without this, the staffs behind
 *  the back, before the behind-the-shoulder reach below existed. */
export const BODY_YAW_LIMIT_RAD = 90 * DEG;
/** A grip may sit this far behind its shoulder, along the chest's facing,
 *  before the reach counts it short: an arm reaches a little behind the
 *  shoulder line at the side, not round the back. */
export const GRIP_BEHIND_ALLOWANCE_M = 0.1;
/** Each metre further behind costs this many metres beyond the arm's length:
 *  an arm stretched forward still holds, one bent round the back does not. */
export const GRIP_BEHIND_WEIGHT = 4;
/** Per metre of grip beyond the arm's reach, summed over the hands: between
 *  staff left inside (20) and the move itself (1), so the body moves or turns
 *  toward a grip but never into a staff to do it. */
export const REACH_DEFICIT_COST = 8;
/** Per radian of change in yaw between plan samples. A turn held for less
 *  than about a beat costs more than it saves; the spread over the beat comes
 *  from the yaw ramp below. */
export const YAW_RATE_COST = 1;
/** Per radian of chest twist the body has not taken over, per sample: twice
 *  the facing cost, so a side-on stance held for about a beat turns the whole
 *  body toward the hands rather than the chest alone, and a body turned away
 *  from the stance pays for the twist it keeps. */
export const TWIST_COST = 0.2;
/** Per radian between the body yaw and the facing the host wants (the
 *  audience when it wants none), per sample: turning 90 degrees away costs
 *  what 2 cm of reach deficit does, so a body turns for a grip or a staff it
 *  cannot step off, not to slip a staff a short step would clear. */
export const FACE_COST = 0.1;
/** Per metre of duck, per sample: twice a floor move, so stepping aside is
 *  preferred when it clears the head as well. */
export const DUCK_COST = 2;
/** The deepest duck: a knee bend that still reads as standing. */
export const BODY_DUCK_MAX_M = 0.25;
/** The furthest the body turns from one plan sample to the next (a twelfth
 *  of a step): 180 degrees a step at most, so a 90 degree turn takes half a
 *  step. The plan holds this itself, so the rendered turn is the planned one;
 *  only its corners are rounded. */
export const BODY_YAW_TURN_RAD = 15 * DEG;
/** The chest twist left on top of the body yaw never exceeds the stance
 *  track's own cap. */
export const CHEST_RESIDUAL_CAP_RAD = MAX_STANCE_YAW_RAD;

/** The hips leave the feet by more than this before a step: below it the
 *  knees take the shift, as step 5 does today. */
export const STEP_TRIGGER_M = 0.1;
/** The body turns past the feet by more than this before a step: a 30 degree
 *  twist at the hips over planted feet still reads as a pivot, not a strain. */
export const STEP_TURN_RAD = 30 * DEG;
/** Either trigger must hold this long, so a passing reach does not step. */
export const STEP_DWELL_STEPS = 0.25;
/** One foot's swing, in score steps (rounded to an even sample count so the
 *  arc peaks on a sample). */
export const STEP_BEATS = 0.35;
/** The swinging foot's highest point: a clear lift that is not a march. */
export const STEP_LIFT_M = 0.07;
/** No step pair starts within this of the last landing, so the weight
 *  settles between pairs. */
export const STEP_REST_BEATS = 0.5;

/**
 * The head, as one ellipsoid above the chest table, at the 1.905 m
 * calibration height. Measured 2026-10-23 on ch07 and ch18 against their
 * skinned head zone (`tests/unit/3d/performer-body-mesh.ts`, bind pose, grid
 * centre at 0.82 of the height): the head proper spans 0.12-0.35 m above the
 * grid centre on both, -0.115 to +0.195 m in depth (ch18's face reaches
 * furthest forward), and 0.095 m to either side. The brief's starting guess
 * (centre 0.16 m, half-height 0.12 m) sat 7 cm low and missed the crown; the
 * neck below 0.12 m is left to the rig's head dodge and the chest table.
 */
export const BODY_RESPONSE_HEAD = Object.freeze({
  centreYM: 0.235,
  centreZM: 0.04,
  halfWidthM: 0.095,
  halfDepthM: 0.155,
  halfHeightM: 0.115,
});

const YAW_CANDIDATES = Math.round((2 * Math.PI) / BODY_YAW_STEP_RAD) + 1;
const YAW_ZERO_INDEX = (YAW_CANDIDATES - 1) / 2;
const YAW_WINDOW = Math.round(BODY_YAW_WINDOW_RAD / BODY_YAW_STEP_RAD);
const YAW_LIMIT = Math.round(BODY_YAW_LIMIT_RAD / BODY_YAW_STEP_RAD);
const YAW_MIN_INDEX = YAW_ZERO_INDEX - YAW_LIMIT;
const YAW_MAX_INDEX = YAW_ZERO_INDEX + YAW_LIMIT;
/** The host's facing and the stance's twist each bring the two candidates
 *  either side of them into reach as well. */
const GOAL_WINDOW = 1;
const YAW_TURN = Math.round(BODY_YAW_TURN_RAD / BODY_YAW_STEP_RAD);
/** Floor move lengths tried along each direction, as shares of the cap; the
 *  exact clearing and reaching lengths are tried as well. */
const MOVE_SHARES = [1 / 3, 2 / 3, 1];
/** The programme samples each staff this often: twice the clearance
 *  planner's spacing, under the staff's own radius of error, for half the
 *  work. The duck is re-measured at the clearance spacing. */
const PLAN_STAFF_STEP_M = 0.02;
/** Moves beyond the cap are never chosen; a stretch this far out only
 *  matters to how much staff a capped move leaves inside. */
const PLAN_HORIZON_SHARE = 1.5;
/** Each plan sample also keeps out the staffs this many dense samples either
 *  side, so a staff that passes through the body between plan samples is
 *  seen; of the staff the plan samples alone left inside on the corpus,
 *  about nine in ten was between plan samples. */
const SWEEP_OFFSETS = [-2, 2];
/** Move lengths are binned this finely when measuring what a move leaves
 *  inside: costs to the half centimetre, and a clearing move errs long by
 *  less than that. */
const COVER_BIN_M = 0.005;
/** Each yaw keeps its standing state and its cheapest few moves: the next
 *  sample's same few hold a move cheaply, and the programme shrinks from 25
 *  states a yaw to 7. */
const MOVES_KEPT = 6;
/** The programme tries every other one of the clearance planner's move
 *  directions (30 degrees apart): the body's own turn covers the angles
 *  between, and a 15 degree miss lengthens a move by under 4 percent. */
const PLAN_DIRECTION_STRIDE = 2;
const REPORT_EPS_M = 0.001;
const REPORT_EPS_RAD = 1 * DEG;
const FEET_EPS = 1e-6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BodyResponseTrackOptions {
  source: BodyClearanceScoreSource | null;
  /** The wall stance; other plane modes plan with the chest square. */
  stanceTrack: StanceYawTrack | null;
  hardBeatTrack?: HardBeatTrack | null;
  heightM: number;
  staffLengthM: number;
  measurements?: PerformerReachMeasurements | null;
  planeMode?: PlaneMode;
  maxM?: number;
  model?: BodyClearanceModel;
  /** A body yaw the host wants at a score time, radians; null for none. */
  facingHint?: ((scoreTime: number) => number | null) | null;
}

export interface FootTrack {
  /** The planted foot's offset from where the clip puts it, performer frame. */
  x: Float64Array;
  z: Float64Array;
  /** The body yaw the foot was planted at. */
  yaw: Float64Array;
  /** Metres above the ground while it swings, 0 while planted. */
  lift: Float64Array;
}

export interface BodyStep {
  foot: "left" | "right";
  /** Score time the foot lifts and lands. */
  startStep: number;
  endStep: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  yawFrom: number;
  yawTo: number;
  liftM: number;
}

export interface BodyResponseBeat {
  /** Score-time step, 0-based. */
  step: number;
  /** The furthest the hips move in this beat, ramp included. */
  moveMaxM: number;
  offsetXM: number;
  offsetZM: number;
  /** The body yaw furthest from square in this beat. */
  yawRad: number;
  /** The deepest duck in this beat, positive metres. */
  duckM: number;
  /** Steps that start in this beat. */
  steps: BodyStep[];
  /** A chosen pose left some staff inside the body somewhere in this beat. */
  capped: boolean;
}

export interface BodyResponseTrack {
  readonly stepCount: number;
  readonly loop: boolean;
  readonly samplesPerStep: number;
  readonly model: Readonly<BodyClearanceModel>;
  readonly staffHalfLengthM: number;
  readonly maxM: number;
  readonly planeMode: PlaneMode;
  /** The move chosen at each sample, before ramping. */
  readonly rawX: Float64Array;
  readonly rawZ: Float64Array;
  /** The yaw chosen at each sample, before ramping. */
  readonly rawYaw: Float64Array;
  /** The hips as rendered: ramped and capped; y is 0 or a duck (negative). */
  readonly offsetX: Float64Array;
  readonly offsetY: Float64Array;
  readonly offsetZ: Float64Array;
  /** The rendered floor move's length. */
  readonly clearance: Float64Array;
  /** The chosen pose leaves some staff inside the body. */
  readonly capped: Uint8Array;
  /** The body's facing about the vertical through the hips, radians. */
  readonly yaw: Float64Array;
  /** The chest twist left on top of the body yaw. */
  readonly chestYaw: Float64Array;
  readonly feet: { readonly left: FootTrack; readonly right: FootTrack };
  readonly steps: readonly BodyStep[];
  readonly report: readonly BodyResponseBeat[];
  /** Plan samples and yaw states per sample at most, for the report. */
  readonly planSamples: number;
  readonly maxStatesPerSample: number;
}

export interface BodyResponseFoot {
  x: number;
  z: number;
  yaw: number;
  lift: number;
}

export interface BodyResponseSample {
  offset: { x: number; y: number; z: number; yaw: number };
  chestYawRad: number;
  feet: { left: BodyResponseFoot; right: BodyResponseFoot };
}

/** What an untracked host applies: nothing. */
export const NO_BODY_RESPONSE: Readonly<BodyResponseSample> = Object.freeze({
  offset: Object.freeze({ x: 0, y: 0, z: 0, yaw: 0 }),
  chestYawRad: 0,
  feet: Object.freeze({
    left: Object.freeze({ x: 0, z: 0, yaw: 0, lift: 0 }),
    right: Object.freeze({ x: 0, z: 0, yaw: 0, lift: 0 }),
  }),
}) as Readonly<BodyResponseSample>;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The chest twist left on top of a body yaw. A body turn in the stance's own
 * direction takes over that much of the twist; past the stance, or against
 * it, the chest goes with the body rather than twisting back.
 */
export function residualChestYaw(
  stanceRad: number,
  bodyYawRad: number
): number {
  const taken = clamp(
    bodyYawRad,
    Math.min(0, stanceRad),
    Math.max(0, stanceRad)
  );
  return clamp(
    stanceRad - taken,
    -CHEST_RESIDUAL_CAP_RAD,
    CHEST_RESIDUAL_CAP_RAD
  );
}

/** The body's pose at one yaw: each part's absolute yaw. */
interface TurnedBody {
  pelvisRad: number;
  waistRad: number;
  chestRad: number;
  residualRad: number;
}

function turnBody(
  stanceChestRad: number,
  stanceSpine1Rad: number,
  bodyYawRad: number
): TurnedBody {
  const residualRad = residualChestYaw(stanceChestRad, bodyYawRad);
  const waistShare =
    Math.abs(stanceChestRad) > 1e-6
      ? stanceSpine1Rad / stanceChestRad
      : SPINE1_SHARE;
  return {
    pelvisRad: bodyYawRad,
    waistRad: bodyYawRad + residualRad * waistShare,
    chestRad: bodyYawRad + residualRad,
    residualRad,
  };
}

/** The head ellipsoid for a model, grown by the staff radius. */
interface HeadShape {
  cy: number;
  cz: number;
  hu: number;
  hv: number;
  hh: number;
}

function headShape(model: BodyClearanceModel): HeadShape {
  const s = model.heightScale;
  const r = model.staffRadiusM;
  return {
    cy: BODY_RESPONSE_HEAD.centreYM * s,
    cz: BODY_RESPONSE_HEAD.centreZM * s,
    hu: BODY_RESPONSE_HEAD.halfWidthM * s + r,
    hv: BODY_RESPONSE_HEAD.halfDepthM * s + r,
    hh: BODY_RESPONSE_HEAD.halfHeightM * s + r,
  };
}

function forEachStaffPoint(
  staffs: readonly (StaffLine | null)[],
  stepM: number,
  visit: (x: number, y: number, z: number) => void
): void {
  for (const staff of staffs) {
    if (!staff) continue;
    const { a, b } = staff;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const count = Math.max(2, Math.ceil(length / stepM));
    for (let k = 0; k <= count; k++) {
      const s = k / count;
      visit(
        a.x + (b.x - a.x) * s,
        a.y + (b.y - a.y) * s,
        a.z + (b.z - a.z) * s
      );
    }
  }
}

/**
 * Staff points against the head's horizontal section at their height, in the
 * record layout `prepareStaffPoints` uses, so the same interval chain measures
 * a floor move off the head.
 */
function prepareHeadPoints(
  staffs: readonly (StaffLine | null)[],
  headRad: number,
  head: HeadShape,
  horizonM: number
): StaffPoints {
  const c = Math.cos(headRad);
  const sn = Math.sin(headRad);
  const out: number[] = [];
  let inside = false;
  forEachStaffPoint(staffs, PLAN_STAFF_STEP_M, (px, py, pz) => {
    const dy = (py - head.cy) / head.hh;
    if (dy <= -1 || dy >= 1) return;
    const k = Math.sqrt(1 - dy * dy);
    const halfU = head.hu * k;
    const halfV = head.hv * k;
    const u = px * c - pz * sn;
    const v = px * sn + pz * c;
    const x0 = u / halfU;
    const y0 = (v - head.cz) / halfV;
    const qc = x0 * x0 + y0 * y0 - 1;
    if ((Math.sqrt(qc + 1) - 1) * Math.min(halfU, halfV) > horizonM) return;
    if (qc < 0) inside = true;
    out.push(x0, y0, qc, c / halfU, sn / halfU, sn / halfV, c / halfV);
  });
  return {
    count: out.length / RECORD_STRIDE,
    data: Float64Array.from(out),
    inside,
  };
}

/**
 * How far the body ducks so no staff point is left inside the head, after a
 * floor move of `(dx, dz)`; null when ducking cannot clear it within the cap
 * (a staff the head would come down onto, or one too low). Zero when nothing
 * is inside.
 */
function headDuckNeed(
  staffs: readonly (StaffLine | null)[],
  headRad: number,
  head: HeadShape,
  dx: number,
  dz: number,
  stepM: number = PLAN_STAFF_STEP_M
): number | null {
  const c = Math.cos(headRad);
  const sn = Math.sin(headRad);
  let need = 0;
  let block = Infinity;
  forEachStaffPoint(staffs, stepM, (px, py, pz) => {
    const x = px - dx;
    const z = pz - dz;
    const u = (x * c - z * sn) / head.hu;
    const v = (x * sn + z * c - head.cz) / head.hv;
    const rho2 = u * u + v * v;
    if (rho2 >= 1) return;
    const top = head.hh * Math.sqrt(1 - rho2);
    const rel = py - head.cy;
    // Ducking by d lifts every point by d against the head.
    if (rel >= top) return;
    if (rel > -top) need = Math.max(need, top - rel);
    else block = Math.min(block, -top - rel);
  });
  if (need <= 0) return 0;
  if (need > BODY_DUCK_MAX_M || need >= block) return null;
  return need;
}

/**
 * Which lengths of a move along one direction leave some staff inside, as
 * bins of `COVER_BIN_M` set to 1 where covered, from the stretches
 * `staffIntervals` leaves in `scratch`. A difference array marks them
 * without sorting; a bin a stretch touches at all counts as covered, so a
 * clearing length errs long, never short.
 */
function coverBins(scratch: Float64Array, m: number, bins: Int32Array): void {
  const count = bins.length;
  bins.fill(0);
  for (let k = 0; k < m; k += 2) {
    const from = Math.floor(scratch[k]! / COVER_BIN_M);
    if (from >= count) continue;
    const to = Math.min(count, Math.ceil(scratch[k + 1]! / COVER_BIN_M));
    if (to <= from) continue;
    bins[from]!++;
    if (to < count) bins[to]!--;
  }
  let open = 0;
  for (let b = 0; b < count; b++) {
    open += bins[b]!;
    bins[b] = open > 0 ? 1 : 0;
  }
}

/** How much further a body stopped at `t` must move to leave every covered
 *  bin; at least the rest of the horizon when the cover runs past it. */
function leftAt(bins: Int32Array, t: number): number {
  let b = Math.floor(t / COVER_BIN_M + 1e-9);
  if (b >= bins.length || !bins[b]) return 0;
  while (b < bins.length && bins[b]) b++;
  return b * COVER_BIN_M - t;
}

/** Grip beyond reach, summed over the hands, after a floor move. */
/** A hand for the reach cost: its grip less its shoulder, and the chest's
 *  facing on the floor, so a grip behind the shoulder line reads short. */
interface FacingReachHand extends ReachHand {
  fx: number;
  fz: number;
}

function facingReachHands(
  staffs: readonly (StaffLine | null)[],
  chestRad: number,
  model: BodyClearanceModel
): FacingReachHand[] {
  const fx = Math.sin(chestRad);
  const fz = Math.cos(chestRad);
  return reachHands(staffs, chestRad, model).map((hand) => ({
    ...hand,
    fx,
    fz,
  }));
}

function reachDeficit(
  hands: readonly FacingReachHand[],
  reachM: number,
  dx: number,
  dz: number
): number {
  let deficit = 0;
  for (const hand of hands) {
    const ex = hand.vx - dx;
    const ez = hand.vz - dz;
    const d = Math.sqrt(ex * ex + hand.vy * hand.vy + ez * ez);
    if (d > reachM) deficit += d - reachM;
    const behind = -(ex * hand.fx + ez * hand.fz) - GRIP_BEHIND_ALLOWANCE_M;
    if (behind > 0) deficit += GRIP_BEHIND_WEIGHT * behind;
  }
  return deficit;
}

// ---------------------------------------------------------------------------
// One plan sample
// ---------------------------------------------------------------------------

/** What the planner sees at a plan sample. */
interface PlanInput {
  /** The staffs at the plan sample, for reach. */
  staffs: (StaffLine | null)[];
  /** Those and the staffs at the dense samples either side, for what must
   *  stay out of the body until the next plan sample. */
  sweep: (StaffLine | null)[];
  stanceChestRad: number;
  stanceSpine1Rad: number;
  hintRad: number;
}

/** States at one plan sample: a yaw and a floor move each. */
interface PlanStates {
  count: number;
  yaw: Int16Array;
  x: Float64Array;
  z: Float64Array;
  cost: Float64Array;
  /** The duck the head cost assumed; 0 when none. */
  duck: Float64Array;
  /** Staff left inside the torso or head (not ducked), metres. */
  left: Float64Array;
}

interface Scratch {
  torso: Float64Array;
  head: Float64Array;
  /** Covered move lengths, one bin per `COVER_BIN_M` to the horizon. */
  torsoBins: Int32Array;
  headBins: Int32Array;
  /** Move lengths tried along one direction. */
  lengths: Float64Array;
  /** The best length along each direction, and what it costs. */
  moves: {
    length: Float64Array;
    cost: Float64Array;
    duck: Float64Array;
    left: Float64Array;
  };
}

function newScratch(horizonM: number): Scratch {
  const bins = Math.ceil(horizonM / COVER_BIN_M) + 1;
  return {
    torso: new Float64Array(64),
    head: new Float64Array(64),
    torsoBins: new Int32Array(bins),
    headBins: new Int32Array(bins),
    lengths: new Float64Array(MOVE_SHARES.length + 8),
    moves: {
      length: new Float64Array(MOVE_DIRECTIONS),
      cost: new Float64Array(MOVE_DIRECTIONS),
      duck: new Float64Array(MOVE_DIRECTIONS),
      left: new Float64Array(MOVE_DIRECTIONS),
    },
  };
}

function ensure(buffer: Float64Array, size: number): Float64Array {
  return buffer.length >= size ? buffer : new Float64Array(size * 2);
}

function evaluateSample(
  input: PlanInput,
  yawIndices: readonly number[],
  model: BodyClearanceModel,
  head: HeadShape,
  maxM: number,
  stride: number,
  scratch: Scratch
): PlanStates {
  const horizonM = PLAN_HORIZON_SHARE * maxM;
  const capacity = yawIndices.length * (MOVES_KEPT + 1);
  const states: PlanStates = {
    count: 0,
    yaw: new Int16Array(capacity),
    x: new Float64Array(capacity),
    z: new Float64Array(capacity),
    cost: new Float64Array(capacity),
    duck: new Float64Array(capacity),
    left: new Float64Array(capacity),
  };
  const push = (
    yawIndex: number,
    x: number,
    z: number,
    cost: number,
    duck: number,
    left: number
  ) => {
    const k = states.count++;
    states.yaw[k] = yawIndex;
    states.x[k] = x;
    states.z[k] = z;
    states.cost[k] = cost * stride;
    states.duck[k] = duck;
    states.left[k] = left;
  };
  const reachM = model.gripReachM;
  for (const yi of yawIndices) {
    const yaw = (yi - YAW_ZERO_INDEX) * BODY_YAW_STEP_RAD;
    const body = turnBody(input.stanceChestRad, input.stanceSpine1Rad, yaw);
    const base =
      TWIST_COST * Math.abs(body.residualRad) +
      FACE_COST * Math.abs(wrapAngle(yaw - input.hintRad));
    const torso = prepareStaffPoints(
      input.sweep,
      {
        chestRad: body.chestRad,
        spine1Rad: body.waistRad,
        pelvisRad: body.pelvisRad,
      },
      model,
      horizonM,
      PLAN_STAFF_STEP_M
    );
    const headPoints = prepareHeadPoints(
      input.sweep,
      body.chestRad,
      head,
      horizonM
    );
    const hands = facingReachHands(input.staffs, body.chestRad, model);
    const deficit0 = reachDeficit(hands, reachM, 0, 0);
    if (!torso.inside && !headPoints.inside && deficit0 <= 0) {
      push(yi, 0, 0, base, 0, 0);
      continue;
    }
    const duck0 = headPoints.inside
      ? headDuckNeed(input.sweep, body.chestRad, head, 0, 0)
      : null;
    // Staff left in the head costs as the cheaper of leaving it or ducking.
    const duckWins = (left: number) =>
      left > 1e-9 &&
      duck0 !== null &&
      DUCK_COST * duck0 < LEFT_INSIDE_COST * left;
    scratch.torso = ensure(scratch.torso, torso.count * 2);
    scratch.head = ensure(scratch.head, headPoints.count * 2);
    const { torsoBins, headBins, lengths, moves } = scratch;
    let torsoLeft0 = torso.inside ? horizonM : 0;
    let headLeft0 = headPoints.inside ? horizonM : 0;
    MOVE_RING.forEach((dir, d) => {
      if (d % PLAN_DIRECTION_STRIDE !== 0) {
        moves.cost[d] = Infinity;
        return;
      }
      const mT = torso.count
        ? staffIntervals(torso, dir.x, dir.z, scratch.torso)
        : 0;
      const mH = headPoints.count
        ? staffIntervals(headPoints, dir.x, dir.z, scratch.head)
        : 0;
      coverBins(scratch.torso, mT, torsoBins);
      coverBins(scratch.head, mH, headBins);
      const needT = leftAt(torsoBins, 0);
      const needH = leftAt(headBins, 0);
      if (torso.inside) torsoLeft0 = Math.min(torsoLeft0, needT);
      if (headPoints.inside) headLeft0 = Math.min(headLeft0, needH);
      let count = 0;
      for (const share of MOVE_SHARES) lengths[count++] = share * maxM;
      if (needT > 0 && needT <= maxM) lengths[count++] = needT;
      if (needH > 0 && needH <= maxM) lengths[count++] = needH;
      if (needT > 0 && needH > 0 && Math.max(needT, needH) <= maxM) {
        lengths[count++] = Math.max(needT, needH);
      }
      for (const hand of hands) {
        // Where the grip comes back within reach along this direction.
        const b = hand.vx * dir.x + hand.vz * dir.z;
        const c0 =
          hand.vx * hand.vx +
          hand.vy * hand.vy +
          hand.vz * hand.vz -
          reachM * reachM;
        const disc = b * b - c0;
        if (c0 > 0 && disc >= 0) {
          const t = b - Math.sqrt(disc);
          if (t > 0 && t <= maxM) lengths[count++] = t;
        }
      }
      moves.cost[d] = Infinity;
      for (let k = 0; k < count; k++) {
        const t = lengths[k]!;
        const torsoLeft = Math.min(leftAt(torsoBins, t), horizonM);
        const headLeft = Math.min(leftAt(headBins, t), horizonM);
        const ducks = duckWins(headLeft);
        const cost =
          base +
          LEFT_INSIDE_COST * torsoLeft +
          (ducks ? DUCK_COST * duck0! : LEFT_INSIDE_COST * headLeft) +
          REACH_DEFICIT_COST *
            reachDeficit(hands, reachM, dir.x * t, dir.z * t) +
          MOVE_COST * t;
        if (cost < moves.cost[d]!) {
          moves.cost[d] = cost;
          moves.length[d] = t;
          moves.duck[d] = ducks ? duck0! : 0;
          moves.left[d] = torsoLeft + (ducks ? 0 : headLeft);
        }
      }
    });
    const ducks0 = duckWins(headLeft0);
    push(
      yi,
      0,
      0,
      base +
        LEFT_INSIDE_COST * torsoLeft0 +
        (ducks0 ? DUCK_COST * duck0! : LEFT_INSIDE_COST * headLeft0) +
        REACH_DEFICIT_COST * deficit0,
      ducks0 ? duck0! : 0,
      torsoLeft0 + (ducks0 ? 0 : headLeft0)
    );
    // The cheapest few directions, in order.
    for (let kept = 0; kept < MOVES_KEPT; kept++) {
      let d = -1;
      for (let e = 0; e < MOVE_DIRECTIONS; e++) {
        if (d < 0 || moves.cost[e]! < moves.cost[d]!) d = e;
      }
      if (d < 0 || moves.cost[d] === Infinity) break;
      const dir = MOVE_RING[d]!;
      push(
        yi,
        dir.x * moves.length[d]!,
        dir.z * moves.length[d]!,
        moves.cost[d]!,
        moves.duck[d]!,
        moves.left[d]!
      );
      moves.cost[d] = Infinity;
    }
  }
  return states;
}

// ---------------------------------------------------------------------------
// The programme
// ---------------------------------------------------------------------------

interface Chosen {
  x: Float64Array;
  z: Float64Array;
  yaw: Float64Array;
  duck: Float64Array;
  left: Float64Array;
  maxStates: number;
}

/** The yaw candidate nearest an angle, within the turn limit. */
function yawIndexOf(rad: number): number {
  return clamp(
    Math.round(wrapAngle(rad) / BODY_YAW_STEP_RAD) + YAW_ZERO_INDEX,
    YAW_MIN_INDEX,
    YAW_MAX_INDEX
  );
}

/**
 * The cheapest path through the plan samples, one state each. Each sample
 * considers the yaws within the window of three centres: the previous
 * sample's cheapest state, the facing the host wants, and the yaw that takes
 * over the stance's whole twist. Consecutive samples turn at most the
 * window's width apart.
 */
function choosePath(
  inputs: readonly PlanInput[],
  order: readonly number[],
  startYawIndex: number,
  model: BodyClearanceModel,
  head: HeadShape,
  maxM: number,
  stride: number,
  loop: boolean
): Chosen {
  const p = inputs.length;
  const statesAt: PlanStates[] = new Array(p);
  const best: Float64Array[] = new Array(p);
  const from: Int32Array[] = new Array(p);
  const scratch = newScratch(PLAN_HORIZON_SHARE * maxM);
  const wanted = new Uint8Array(YAW_CANDIDATES);
  let centre = startYawIndex;
  let prev = -1;
  let maxStates = 0;
  for (const j of order) {
    const input = inputs[j]!;
    wanted.fill(0);
    for (const [c, reach] of [
      [centre, YAW_WINDOW],
      [yawIndexOf(input.hintRad), GOAL_WINDOW],
      [yawIndexOf(input.stanceChestRad), GOAL_WINDOW],
    ] as const) {
      const lo = Math.max(YAW_MIN_INDEX, c - reach);
      const hi = Math.min(YAW_MAX_INDEX, c + reach);
      for (let yi = lo; yi <= hi; yi++) wanted[yi] = 1;
    }
    const yawIndices: number[] = [];
    wanted.forEach((on, yi) => {
      if (on) yawIndices.push(yi);
    });
    const states = evaluateSample(
      input,
      yawIndices,
      model,
      head,
      maxM,
      stride,
      scratch
    );
    maxStates = Math.max(maxStates, states.count);
    const acc = new Float64Array(states.count);
    const back = new Int32Array(states.count);
    const before = prev >= 0 ? statesAt[prev]! : null;
    const beforeBest = prev >= 0 ? best[prev]! : null;
    let argmin = 0;
    for (let k = 0; k < states.count; k++) {
      let value = states.cost[k]!;
      if (before && beforeBest) {
        let min = Infinity;
        let arg = 0;
        for (let q = 0; q < before.count; q++) {
          const dYaw = Math.abs(states.yaw[k]! - before.yaw[q]!);
          if (dYaw > YAW_TURN) continue;
          const ex = states.x[k]! - before.x[q]!;
          const ez = states.z[k]! - before.z[q]!;
          const candidate =
            beforeBest[q]! +
            TURN_COST * Math.sqrt(ex * ex + ez * ez) +
            YAW_RATE_COST * dYaw * BODY_YAW_STEP_RAD;
          if (candidate < min) {
            min = candidate;
            arg = q;
          }
        }
        value += min;
        back[k] = arg;
      } else if (loop) {
        // A loop starts facing where the host wants, so it can end there.
        if (states.yaw[k] !== startYawIndex) value = Infinity;
      } else {
        value +=
          YAW_RATE_COST *
          Math.abs(states.yaw[k]! - startYawIndex) *
          BODY_YAW_STEP_RAD;
      }
      acc[k] = value;
      if (value < acc[argmin]!) argmin = k;
    }
    statesAt[j] = states;
    best[j] = acc;
    from[j] = back;
    centre = states.yaw[argmin]!;
    prev = j;
  }
  const chosen: Chosen = {
    x: new Float64Array(p),
    z: new Float64Array(p),
    yaw: new Float64Array(p),
    duck: new Float64Array(p),
    left: new Float64Array(p),
    maxStates,
  };
  // A loop's last sample turns back to the first within one plan sample.
  const last = statesAt[prev]!;
  const closing = (q: number) => {
    if (!loop) return best[prev]![q]!;
    const dYaw = Math.abs(last.yaw[q]! - startYawIndex);
    return dYaw > YAW_TURN
      ? Infinity
      : best[prev]![q]! + YAW_RATE_COST * dYaw * BODY_YAW_STEP_RAD;
  };
  let k = 0;
  for (let q = 1; q < last.count; q++) {
    if (closing(q) < closing(k)) k = q;
  }
  for (let step = p - 1; step >= 0; step--) {
    const j = order[step]!;
    const states = statesAt[j]!;
    chosen.x[j] = states.x[k]!;
    chosen.z[j] = states.z[k]!;
    chosen.yaw[j] = (states.yaw[k]! - YAW_ZERO_INDEX) * BODY_YAW_STEP_RAD;
    chosen.duck[j] = states.duck[k]!;
    chosen.left[j] = states.left[k]!;
    k = from[j]![k]!;
  }
  return chosen;
}

/** Plan samples back to dense samples, linear between them (and across the
 *  seam of a loop). */
function upsample(
  values: Float64Array,
  planIndex: readonly number[],
  n: number,
  loop: boolean
): Float64Array {
  const out = new Float64Array(n);
  const p = planIndex.length;
  for (let j = 0; j < p; j++) {
    const i0 = planIndex[j]!;
    const last = j === p - 1;
    if (last && !loop) {
      out[i0] = values[j]!;
      continue;
    }
    const i1 = last ? n : planIndex[j + 1]!;
    const v0 = values[j]!;
    const v1 = values[last ? 0 : j + 1]!;
    for (let i = i0; i < i1; i++) {
      out[i] = v0 + ((v1 - v0) * (i - i0)) / (i1 - i0);
    }
  }
  return out;
}

/**
 * The chosen moves as rendered: unchanged wherever the plan moves the body,
 * and eased out of and into each stretch of rest over the clearance ramp, so
 * the body is already there when the staff arrives. Two moves either side of
 * a short rest blend across it. Body-clearance's `rampMoves` widens each axis
 * on its own instead; with the yaw changing under it, that hull is a move the
 * programme never chose, and on the corpus it put the head into a staff on 22
 * wall samples the plan had clear.
 */
function rampFromRest(
  rawX: Float64Array,
  rawZ: Float64Array,
  rampSamples: number,
  loop: boolean
): { x: Float64Array; z: Float64Array } {
  const n = rawX.length;
  const x = rawX.slice();
  const z = rawZ.slice();
  const atRest = (i: number) => rawX[i] === 0 && rawZ[i] === 0;
  let anyMove = false;
  for (let i = 0; i < n && !anyMove; i++) anyMove = !atRest(i);
  if (!anyMove || rampSamples < 1) return { x, z };
  // Walk each stretch of rest from the move before it to the move after.
  const startAt = loop ? rawX.findIndex((_, i) => !atRest(i)) : 0;
  for (let step = 0; step < n; ) {
    const i = (startAt + step) % n;
    if (!atRest(i)) {
      step++;
      continue;
    }
    let length = 0;
    while (step + length < n && atRest((startAt + step + length) % n)) length++;
    const before = loop || i > 0 ? (i - 1 + n) % n : -1;
    const afterStep = step + length;
    const after = loop || afterStep < n ? (startAt + afterStep) % n : -1;
    const reach = Math.min(rampSamples, length);
    for (let d = 1; d <= length; d++) {
      const k = (startAt + step + d - 1) % n;
      const out = before >= 0 ? smoothstep01(1 - d / (reach + 1)) : 0;
      const into =
        after >= 0 ? smoothstep01(1 - (length + 1 - d) / (reach + 1)) : 0;
      x[k] =
        (before >= 0 ? rawX[before]! * out : 0) +
        (after >= 0 ? rawX[after]! * into : 0);
      z[k] =
        (before >= 0 ? rawZ[before]! * out : 0) +
        (after >= 0 ? rawZ[after]! * into : 0);
    }
    step = afterStep;
  }
  return { x, z };
}

/** A triangular average over `halfWidth` samples either side (wrapping on a
 *  loop, held at the ends otherwise): rounds the corners where a turn starts
 *  and stops without moving the turn. */
function smooth(
  values: Float64Array,
  halfWidth: number,
  loop: boolean
): Float64Array {
  const n = values.length;
  if (halfWidth < 1) return values.slice();
  return values.map((_, i) => {
    let sum = 0;
    let weight = 0;
    for (let d = -halfWidth; d <= halfWidth; d++) {
      const w = halfWidth + 1 - Math.abs(d);
      const k = loop ? (((i + d) % n) + n) % n : clamp(i + d, 0, n - 1);
      sum += w * values[k]!;
      weight += w;
    }
    return sum / weight;
  });
}

// ---------------------------------------------------------------------------
// Feet
// ---------------------------------------------------------------------------

interface FeetPlan {
  left: FootTrack;
  right: FootTrack;
  steps: BodyStep[];
}

interface FootPose {
  x: number;
  z: number;
  yaw: number;
}

function newFootTrack(n: number): FootTrack {
  return {
    x: new Float64Array(n),
    z: new Float64Array(n),
    yaw: new Float64Array(n),
    lift: new Float64Array(n),
  };
}

function writePose(track: FootTrack, i: number, pose: FootPose, lift = 0) {
  track.x[i] = pose.x;
  track.z[i] = pose.z;
  track.yaw[i] = pose.yaw;
  track.lift[i] = lift;
}

/**
 * Step pairs over the planned hips. The feet start under the hips at the
 * first sample; on a loop they come back there by the seam, so the loop plays
 * on without a jump.
 */
function planFeet(
  hipX: Float64Array,
  hipZ: Float64Array,
  yaw: Float64Array,
  perStep: number,
  loop: boolean
): FeetPlan {
  const n = hipX.length;
  const left = newFootTrack(n);
  const right = newFootTrack(n);
  const steps: BodyStep[] = [];
  const swing = Math.max(2, 2 * Math.round((STEP_BEATS * perStep) / 2));
  const dwell = Math.round(STEP_DWELL_STEPS * perStep);
  const rest = Math.round(STEP_REST_BEATS * perStep);
  const start: FootPose = { x: hipX[0]!, z: hipZ[0]!, yaw: yaw[0]! };
  let planted: FootPose = { ...start };
  // A loop keeps its last two swings for the way back to the start.
  const returnStart = loop ? n - 2 * swing : n;
  let lastLanding = -Infinity;
  let exceedSince = -1;

  const swingFoot = (
    track: FootTrack,
    other: FootTrack,
    foot: "left" | "right",
    from: FootPose,
    to: FootPose,
    otherPose: FootPose,
    at: number
  ) => {
    for (let k = 0; k < swing; k++) {
      const i = at + k;
      if (i >= n) break;
      const phase = k / swing;
      const e = smoothstep01(phase);
      writePose(
        track,
        i,
        {
          x: from.x + (to.x - from.x) * e,
          z: from.z + (to.z - from.z) * e,
          yaw: from.yaw + (to.yaw - from.yaw) * e,
        },
        STEP_LIFT_M * Math.sin(Math.PI * phase)
      );
      writePose(other, i, otherPose);
    }
    steps.push({
      foot,
      startStep: at / perStep,
      endStep: (at + swing) / perStep,
      from: { x: from.x, z: from.z },
      to: { x: to.x, z: to.z },
      yawFrom: from.yaw,
      yawTo: to.yaw,
      liftM: STEP_LIFT_M,
    });
  };

  const stepPair = (at: number, to: FootPose) => {
    const dx = to.x - planted.x;
    const dz = to.z - planted.z;
    const dYaw = to.yaw - planted.yaw;
    const moveShare = Math.hypot(dx, dz) / STEP_TRIGGER_M;
    const turnShare = Math.abs(dYaw) / STEP_TURN_RAD;
    // The foot on the side of the move leads; for a turn, the outside foot
    // (a turn to the performer's left swings the right foot round first).
    const across = dx * Math.cos(planted.yaw) - dz * Math.sin(planted.yaw);
    const first: "left" | "right" =
      turnShare > moveShare
        ? dYaw > 0
          ? "right"
          : "left"
        : across >= 0
          ? "left"
          : "right";
    const [lead, trail] = first === "left" ? [left, right] : [right, left];
    const second = first === "left" ? "right" : "left";
    swingFoot(lead, trail, first, planted, to, planted, at);
    swingFoot(trail, lead, second, planted, to, to, at + swing);
    planted = { ...to };
    lastLanding = at + 2 * swing;
  };

  let i = 0;
  while (i < n) {
    if (loop && i >= returnStart) {
      const away =
        Math.hypot(planted.x - start.x, planted.z - start.z) > FEET_EPS ||
        Math.abs(planted.yaw - start.yaw) > FEET_EPS;
      if (away) {
        stepPair(returnStart, start);
        break;
      }
      writePose(left, i, planted);
      writePose(right, i, planted);
      i++;
      continue;
    }
    writePose(left, i, planted);
    writePose(right, i, planted);
    const exceed =
      Math.hypot(hipX[i]! - planted.x, hipZ[i]! - planted.z) > STEP_TRIGGER_M ||
      Math.abs(yaw[i]! - planted.yaw) > STEP_TURN_RAD;
    if (!exceed) {
      exceedSince = -1;
      i++;
      continue;
    }
    if (exceedSince < 0) exceedSince = i;
    const end = i + 2 * swing;
    if (i < lastLanding + rest) {
      i++;
      continue;
    }
    if (i - exceedSince >= dwell && end <= returnStart) {
      // Land where the hips will be when the second foot comes down.
      const at = Math.min(end, n - 1);
      stepPair(i, { x: hipX[at]!, z: hipZ[at]!, yaw: yaw[at]! });
      exceedSince = -1;
      i = end;
      continue;
    }
    i++;
  }
  return { left, right, steps };
}

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------

export function buildBodyResponseTrack(
  options: BodyResponseTrackOptions
): BodyResponseTrack | null {
  const { source } = options;
  if (!source) return null;
  const stepCount = Math.floor(source.motionStepCount);
  if (!(stepCount > 0)) return null;
  const halfLength = options.staffLengthM / 2;
  if (!(Number.isFinite(halfLength) && halfLength > 0)) return null;

  const planeMode = options.planeMode ?? PlaneMode.WALL;
  const wall = planeMode === PlaneMode.WALL;
  const measurements = options.measurements ?? null;
  const model =
    options.model ??
    defaultBodyClearanceModel({
      heightM: options.heightM,
      shoulderHalfWidthM: measurements ? measurements.shoulderWidthM / 2 : null,
    });
  const maxM = options.maxM ?? DEFAULT_BODY_CLEARANCE_MAX_M;
  const perStep = BODY_CLEARANCE_SAMPLES_PER_STEP;
  const stride = BODY_RESPONSE_PLAN_STRIDE;
  const loop = source.loop;
  const n = stepCount * perStep + (loop ? 0 : 1);
  const head = headShape(model);

  // What the body sees at every dense sample: the stance it would twist to,
  // and the staffs where the renderer puts them.
  const stanceChest = new Float64Array(n);
  const stanceSpine1 = new Float64Array(n);
  const staffsAt = new Array<(StaffLine | null)[]>(n);
  const hintAt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / perStep;
    const { left, right } = source.propStatesAtScoreTime(t);
    const stance = wall
      ? resolveTrackedUpperBodyStance(
          options.stanceTrack,
          t,
          PlaneMode.WALL,
          left,
          right,
          measurements
        )
      : null;
    const chest = stance?.segments.chestRad ?? 0;
    const spine1 = stance?.segments.spine1Rad ?? 0;
    stanceChest[i] = Number.isFinite(chest) ? chest : 0;
    stanceSpine1[i] = Number.isFinite(spine1) ? spine1 : 0;
    const shift = sampleHardBeatTrack(options.hardBeatTrack ?? null, t);
    staffsAt[i] = [
      staffLine(
        displaceProp(left, shift.left),
        stance?.leftDepthOffsetM ?? 0,
        halfLength
      ),
      staffLine(
        displaceProp(right, shift.right),
        stance?.rightDepthOffsetM ?? 0,
        halfLength
      ),
    ];
    const hint = options.facingHint?.(t);
    hintAt[i] = hint != null && Number.isFinite(hint) ? hint : 0;
  }
  const inputAt = (i: number): PlanInput => {
    const sweep = [...staffsAt[i]!];
    for (const d of SWEEP_OFFSETS) {
      const k = loop ? (i + d + n) % n : i + d;
      if (k >= 0 && k < n) sweep.push(...staffsAt[k]!);
    }
    return {
      staffs: staffsAt[i]!,
      sweep,
      stanceChestRad: stanceChest[i]!,
      stanceSpine1Rad: stanceSpine1[i]!,
      hintRad: hintAt[i]!,
    };
  };

  const planIndex: number[] = [];
  for (let i = 0; i < n; i += stride) planIndex.push(i);
  if (!loop && planIndex[planIndex.length - 1] !== n - 1) planIndex.push(n - 1);
  const inputs = planIndex.map(inputAt);

  // A loop starts where the stance is squarest, so its seam is quiet.
  let first = 0;
  if (loop) {
    inputs.forEach((input, j) => {
      if (
        Math.abs(input.stanceChestRad) <
        Math.abs(inputs[first]!.stanceChestRad) - 1e-9
      ) {
        first = j;
      }
    });
  }
  const order = inputs.map((_, j) => (first + j) % inputs.length);
  const startYaw = yawIndexOf(inputs[first]!.hintRad);
  const chosen = choosePath(
    inputs,
    order,
    startYaw,
    model,
    head,
    maxM,
    stride,
    loop
  );

  // The duck as chosen, measured exactly at the chosen pose; dropped where
  // the staffs would then cross the torso.
  const duckPlan = new Float64Array(inputs.length);
  const capPlan = new Float64Array(inputs.length);
  inputs.forEach((input, j) => {
    capPlan[j] = chosen.left[j]! > 1e-6 ? 1 : 0;
    if (chosen.duck[j]! <= 0) return;
    const body = turnBody(
      input.stanceChestRad,
      input.stanceSpine1Rad,
      chosen.yaw[j]!
    );
    const need = headDuckNeed(
      input.sweep,
      body.chestRad,
      head,
      chosen.x[j]!,
      chosen.z[j]!,
      STAFF_STEP_M
    );
    if (need === null) {
      capPlan[j] = 1;
      return;
    }
    const lifted = input.sweep.map((staff) =>
      staff
        ? {
            a: {
              x: staff.a.x - chosen.x[j]!,
              y: staff.a.y + need,
              z: staff.a.z - chosen.z[j]!,
            },
            b: {
              x: staff.b.x - chosen.x[j]!,
              y: staff.b.y + need,
              z: staff.b.z - chosen.z[j]!,
            },
          }
        : null
    );
    const torso = prepareStaffPoints(
      lifted,
      {
        chestRad: body.chestRad,
        spine1Rad: body.waistRad,
        pelvisRad: body.pelvisRad,
      },
      model,
      0
    );
    if (torso.inside) {
      capPlan[j] = 1;
      return;
    }
    duckPlan[j] = need;
  });

  const rawX = upsample(chosen.x, planIndex, n, loop);
  const rawZ = upsample(chosen.z, planIndex, n, loop);
  const rawYaw = upsample(chosen.yaw, planIndex, n, loop);
  const rawDuck = upsample(duckPlan, planIndex, n, loop);
  const capped = new Uint8Array(n);
  const capDense = upsample(capPlan, planIndex, n, loop);
  for (let i = 0; i < n; i++) capped[i] = capDense[i]! > 0 ? 1 : 0;

  const offset = rampFromRest(
    rawX,
    rawZ,
    Math.round(BODY_CLEARANCE_RAMP_STEPS * perStep),
    loop
  );
  const yaw = smooth(rawYaw, stride, loop);
  const duck = widen(rawDuck, perStep, loop, BODY_CLEARANCE_RAMP_STEPS);
  const offsetY = duck.map((value) => -Math.min(BODY_DUCK_MAX_M, value));
  const chestYaw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    chestYaw[i] = residualChestYaw(stanceChest[i]!, yaw[i]!);
  }
  const clearance = offset.x.map((x, i) => Math.hypot(x, offset.z[i]!));
  const feet = planFeet(offset.x, offset.z, yaw, perStep, loop);

  return {
    stepCount,
    loop,
    samplesPerStep: perStep,
    model,
    staffHalfLengthM: halfLength,
    maxM,
    planeMode,
    rawX,
    rawZ,
    rawYaw,
    offsetX: offset.x,
    offsetY,
    offsetZ: offset.z,
    clearance,
    capped,
    yaw,
    chestYaw,
    feet: { left: feet.left, right: feet.right },
    steps: feet.steps,
    report: buildReport(
      stepCount,
      perStep,
      offset,
      offsetY,
      yaw,
      clearance,
      capped,
      feet.steps
    ),
    planSamples: inputs.length,
    maxStatesPerSample: chosen.maxStates,
  };
}

function lerpAngleSample(
  values: ArrayLike<number>,
  at: DenseSampleNeighbours
): number {
  const a = values[at.i0]!;
  return a + wrapAngle(values[at.i1]! - a) * at.w;
}

function sampleFoot(
  track: FootTrack,
  at: DenseSampleNeighbours
): BodyResponseFoot {
  return {
    x: lerpDenseSample(track.x, at),
    z: lerpDenseSample(track.z, at),
    yaw: lerpAngleSample(track.yaw, at),
    lift: lerpDenseSample(track.lift, at),
  };
}

/** Linear between dense samples (yaws the short way round), so it is
 *  continuous across the loop seam. */
export function sampleBodyResponseTrack(
  track: BodyResponseTrack | null,
  scoreTime: number
): BodyResponseSample {
  if (!track) return NO_BODY_RESPONSE;
  const at = locateDenseSample(track, track.yaw.length, scoreTime);
  return {
    offset: {
      x: lerpDenseSample(track.offsetX, at),
      y: Math.min(0, lerpDenseSample(track.offsetY, at)),
      z: lerpDenseSample(track.offsetZ, at),
      yaw: lerpAngleSample(track.yaw, at),
    },
    chestYawRad: lerpAngleSample(track.chestYaw, at),
    feet: {
      left: sampleFoot(track.feet.left, at),
      right: sampleFoot(track.feet.right, at),
    },
  };
}

function buildReport(
  stepCount: number,
  perStep: number,
  offset: { x: Float64Array; z: Float64Array },
  offsetY: Float64Array,
  yaw: Float64Array,
  clearance: Float64Array,
  capped: Uint8Array,
  steps: readonly BodyStep[]
): BodyResponseBeat[] {
  const n = clearance.length;
  const beats: BodyResponseBeat[] = [];
  for (let step = 0; step < stepCount; step++) {
    let most = -1;
    let turned = -1;
    let duckM = 0;
    let wasCapped = false;
    for (let k = 0; k <= perStep; k++) {
      const i = (step * perStep + k) % n;
      if (most < 0 || clearance[i]! > clearance[most]!) most = i;
      if (turned < 0 || Math.abs(yaw[i]!) > Math.abs(yaw[turned]!)) turned = i;
      duckM = Math.max(duckM, -offsetY[i]!);
      wasCapped ||= capped[i] === 1;
    }
    const own = steps.filter(
      (s) => s.startStep >= step && s.startStep < step + 1
    );
    if (
      clearance[most]! > REPORT_EPS_M ||
      Math.abs(yaw[turned]!) > REPORT_EPS_RAD ||
      duckM > REPORT_EPS_M ||
      own.length > 0
    ) {
      beats.push({
        step,
        moveMaxM: clearance[most]!,
        offsetXM: offset.x[most]!,
        offsetZM: offset.z[most]!,
        yawRad: yaw[turned]!,
        duckM,
        steps: own,
        capped: wasCapped,
      });
    }
  }
  return beats;
}

const cm = (metres: number) => (Math.abs(metres) * 100).toFixed(1);
const deg = (radians: number) => Math.round(Math.abs(radians) / DEG);

/** One line per beat: "step 3: 12.4 cm, 11.9 right and 3.5 back; turned 45
 *  left; duck 5.0 cm; left foot steps, right foot steps". */
export function describeBodyResponseTrack(
  track: BodyResponseTrack | null
): string {
  if (!track) return "no body response track";
  if (track.report.length === 0) return "no beats move the body";
  return track.report
    .map((beat) => {
      const parts: string[] = [];
      if (beat.moveMaxM > REPORT_EPS_M) {
        const along: string[] = [];
        if (Math.abs(beat.offsetXM) > REPORT_EPS_M) {
          along.push(
            `${cm(beat.offsetXM)} ${beat.offsetXM > 0 ? "left" : "right"}`
          );
        }
        if (Math.abs(beat.offsetZM) > REPORT_EPS_M) {
          along.push(
            `${cm(beat.offsetZM)} ${beat.offsetZM > 0 ? "forward" : "back"}`
          );
        }
        parts.push(`${cm(beat.moveMaxM)} cm, ${along.join(" and ")}`);
      }
      if (Math.abs(beat.yawRad) > REPORT_EPS_RAD) {
        parts.push(
          `turned ${deg(beat.yawRad)} ${beat.yawRad > 0 ? "left" : "right"}`
        );
      }
      if (beat.duckM > REPORT_EPS_M) parts.push(`duck ${cm(beat.duckM)} cm`);
      if (beat.steps.length) {
        parts.push(beat.steps.map((s) => `${s.foot} foot steps`).join(", "));
      }
      return `step ${beat.step}: ${parts.join("; ")}${beat.capped ? " (capped)" : ""}`;
    })
    .join("\n");
}
