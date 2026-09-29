/**
 * Body clearance: where the body moves so its staffs stay out of it.
 *
 * In a strict isolation the staff turns around a fixed point. When the chest
 * turns side-on the torso can occupy that point as the audience sees it, and
 * the staff runs through the chest. A performer keeps the staff and the point
 * where they are and moves the chest off it
 * (docs/architecture/performer-grid-styles.md, step 5). This module plans that
 * move over the whole score. A host applies it only when it asks for it;
 * nothing here changes a pose on its own.
 *
 * The torso is a stack of ellipses in three parts that turn separately: the
 * chest with the chest yaw, the waist with Spine1, and the pelvis not at all
 * (the hips stay square to the audience). Widths and depths are multiples of
 * the shoulder half-width, so one table fits both measured rigs, and each
 * ellipse grows by the staff's radius, so a staff clears when its centre line
 * does. The head is left out: it has its own dodge, and planning for it moved
 * the body more without fewer head contacts on the rig meshes.
 *
 * Moving the body by t along a direction carries each staff point through the
 * torso, so every part a point passes through forbids an interval of t. The
 * need along that direction is the end of the chain of intervals that starts
 * at zero: the shortest move after which no staff point is inside. Every point
 * pushes, including a stretch of staff the body would walk into, so the body
 * never stops inside a staff.
 *
 * At each score time the body may move along any of 24 directions, each held
 * to the arms' reach: no further than keeps each grip within reach of its
 * shoulder, and never further from a grip that is already out of reach. A
 * dynamic programme over the score then picks one direction per sample. It
 * charges most for staff left inside the torso, then for the length of the
 * move, then for how far the move changes between samples, so the body keeps
 * to one path through a passage. Side-on, that path mostly runs sideways,
 * parallel to the audience and away from the way the chest faces.
 *
 * The chosen moves are widened per half-axis, as the hard-beat track widens
 * its displacement, so the body starts moving ahead of the beat that needs
 * it. Wherever the widened move would pull a grip out of reach it is scaled
 * back, and that cut is ramped over a shorter window so the body never jerks.
 *
 * Frame: the performer's own. +x is the performer's left, +y is up, +z faces
 * the audience; the body's vertical axis is x = z = 0 and heights are measured
 * from the grid centre, the frame `propStateToStaffTarget` returns.
 */

import { DEFAULT_SCENE_DIMENSIONS, PlaneMode } from "@austencloud/scene-3d";
import type { PropState3D } from "@austencloud/scene-3d";
import { propStateToStaffTarget } from "../services/swept-volume/swept-volume-builder";
import type { PerformerReachMeasurements } from "../domain/performer-reach-measurements";
import {
  defaultHardBeatBodyModel,
  displaceProp,
  HARD_BEAT_SAMPLES_PER_STEP,
  lerpDenseSample,
  locateDenseSample,
  sampleHardBeatTrack,
  widen,
  type HardBeatScoreSource,
  type HardBeatTrack,
} from "./hard-beat-displacement";
import {
  resolveTrackedUpperBodyStance,
  type StanceYawTrack,
} from "./stance-yaw-track";

/** Height the torso table was measured at; its rows scale from it. */
const CALIBRATION_HEIGHT_M = 1.905;
/** ch18, the broader of the two measured rigs (ch07 is 0.199), stands in until
 *  a rig reports its own shoulders. */
const UNMEASURED_SHOULDER_HALF_WIDTH_M = 0.223;
/**
 * Shoulder to grip at which the palm starts to leave the staff, at the
 * calibration height. Short of the 0.604 m straight-arm reach
 * (`defaultHardBeatBodyModel`), because the solve keeps the elbow bent: on
 * both rigs the scoreboard's grip gap starts rising near 0.54 m.
 */
const GRIP_REACH_M = 0.53;
/** Staff points are tested this far apart. Between two of them the centre
 *  line can dip into a grown ellipse by well under a millimetre. */
const STAFF_STEP_M = 0.01;
/** The body may move along this many directions, evenly round the ring (15
 *  degrees apart); straight back and straight sideways are among them. */
const MOVE_DIRECTIONS = 24;
/**
 * Planning costs per metre: staff left inside the torso, the move itself, and
 * the change in the move from one sample to the next. Tuned on the rig
 * scoreboard (ch07 and ch18, isolation at 67 cm): at half the turn cost the
 * rendered torso contacts rose by 17% and 54% on the two rigs; at double it,
 * more moves were cut short (125 samples against 85) for no further gain.
 */
const LEFT_INSIDE_COST = 20;
const MOVE_COST = 1;
const TURN_COST = 16;
/**
 * Half-width of the ramp that scales a move back to the arms' reach. At 0.1
 * steps the body's top speed nearly doubled on the scoreboard; at 0.3 it held
 * more of the torso in the staff.
 */
const REACH_CUT_RAMP_STEPS = 0.2;
/** Moves below this are not reported. */
const REPORT_EPS_M = 0.001;

export const BODY_CLEARANCE_SAMPLES_PER_STEP = HARD_BEAT_SAMPLES_PER_STEP;
/**
 * Half-width of the ramp: the move starts this far ahead of the beat that
 * needs it. The whole body moves rather than one hand, so it takes twice the
 * staffs' ramp; a 20 cm move then peaks near 0.6 m per beat.
 */
export const BODY_CLEARANCE_RAMP_STEPS = 0.5;
/** No move goes further. It bounds a bad input, not a real beat: the largest
 *  move straight back over the isolation corpus at 67 cm is 25.5 cm (the
 *  broader rig, before a rig is measured), a staff lying through the full
 *  depth of a side-on chest. */
export const DEFAULT_BODY_CLEARANCE_MAX_M = 0.3;

type TorsoTurn = "chest" | "waist" | "pelvis";

/** [height from the grid centre (m at 1.905 m), half-width, front, back]; the
 *  last three in shoulder half-widths, front and back along the part's own
 *  facing from the body's vertical axis. */
type TorsoRow = readonly [number, number, number, number];

interface TorsoPart {
  readonly turn: TorsoTurn;
  readonly rows: readonly TorsoRow[];
}

/**
 * The torso of ch07 and ch18 at 1.905 m, fitted to their skinned-mesh vertices
 * by bone (`tests/unit/3d/performer-body-mesh.ts`) in 2 cm rows, divided by
 * each rig's shoulder half-width (0.199 and 0.223 m), and taken as the outer
 * envelope of both. Rows are thinned where the envelope is straight, never by
 * more than 0.02 shoulder half-widths (4 mm). Against the meshes on the
 * isolation corpus at 67 cm (Jade's hug fit), the move straight back it gives
 * is never short by more than 1 cm on either rig, and is about 3.5 cm long at
 * the median.
 */
export const BODY_CLEARANCE_TORSO: readonly TorsoPart[] = [
  {
    turn: "chest",
    rows: [
      [-0.212, 0.8, 0.84, -0.68],
      [-0.172, 0.9, 0.91, -0.67],
      [-0.152, 1.0, 0.9, -0.74],
      [-0.132, 1.1, 0.89, -0.77],
      [-0.112, 1.1, 0.88, -0.88],
      [-0.092, 1.2, 0.83, -0.91],
      [-0.072, 1.2, 0.76, -1.0],
      [-0.052, 1.3, 0.69, -0.85],
      [-0.032, 1.3, 0.61, -0.81],
      [0.008, 1.3, 0.5, -0.66],
      [0.028, 1.2, 0.44, -0.68],
      [0.048, 1.2, 0.45, -0.65],
      [0.068, 1.0, 0.45, -0.49],
      [0.088, 0.5, 0.4, -0.36],
    ],
  },
  {
    turn: "waist",
    rows: [
      [-0.332, 1.0, 0.79, -0.55],
      [-0.312, 0.9, 0.85, -0.53],
      [-0.272, 1.0, 0.78, -0.54],
      [-0.212, 0.9, 0.82, -0.66],
      [-0.192, 0.9, 0.83, -0.63],
      [-0.172, 0.9, 0.78, -0.78],
    ],
  },
  {
    turn: "pelvis",
    rows: [
      [-0.692, 0.5, 0.52, -0.6],
      [-0.672, 0.8, 0.59, -0.55],
      [-0.652, 0.92, 0.71, -0.47],
      [-0.632, 0.9, 0.74, -0.54],
      [-0.572, 1.04, 0.7, -0.66],
      [-0.512, 1.0, 0.78, -0.7],
      [-0.492, 1.0, 0.79, -0.55],
      [-0.472, 0.9, 0.79, -0.59],
      [-0.432, 1.0, 0.85, -0.57],
      [-0.352, 1.0, 0.81, -0.41],
      [-0.332, 0.8, 0.84, -0.32],
      [-0.312, 0.7, 0.81, -0.41],
      [-0.292, 0.8, 0.78, -0.34],
    ],
  },
];

export interface BodyClearanceModel {
  /** Performer height over the 1.905 m calibration; row heights scale by it. */
  heightScale: number;
  /** Upper-arm root half-span; every width and depth is a multiple of it. */
  shoulderHalfWidthM: number;
  /** Shoulder height from the grid centre. */
  shoulderDyM: number;
  /** Shoulder depth from the body's vertical axis, + toward the audience. */
  shoulderDzM: number;
  /** Added to every ellipse, so a staff's centre line tests its surface. */
  staffRadiusM: number;
  /** Shoulder to grip beyond which a move may not pull a hand. */
  gripReachM: number;
}

export interface BodyClearanceModelOptions {
  heightM?: number;
  /** Half the rig's measured shoulder span (`shoulderWidthM / 2`). */
  shoulderHalfWidthM?: number | null;
  staffRadiusM?: number;
}

export function defaultBodyClearanceModel(
  options: BodyClearanceModelOptions = {}
): BodyClearanceModel {
  const heightM = options.heightM ?? CALIBRATION_HEIGHT_M;
  const heightScale =
    Number.isFinite(heightM) && heightM > 0
      ? heightM / CALIBRATION_HEIGHT_M
      : 1;
  // The hard-beat planner's arm, so both plan against the same shoulders.
  const arm = defaultHardBeatBodyModel(heightM);
  const measured = options.shoulderHalfWidthM;
  return {
    heightScale,
    shoulderHalfWidthM:
      measured != null && Number.isFinite(measured) && measured > 0
        ? measured
        : UNMEASURED_SHOULDER_HALF_WIDTH_M * heightScale,
    shoulderDyM: arm.shoulderDyM,
    shoulderDzM: arm.shoulderDzM,
    staffRadiusM: options.staffRadiusM ?? DEFAULT_SCENE_DIMENSIONS.staffRadius,
    gripReachM: GRIP_REACH_M * heightScale,
  };
}

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A staff's centre line, tip to tip, in the performer frame. */
export interface StaffLine {
  a: Vec3Like;
  b: Vec3Like;
}

export interface BodyClearancePose {
  /** The chest's yaw; the chest part turns with it. */
  chestRad: number;
  /** Spine1's yaw; the waist turns with it. */
  spine1Rad: number;
}

/** A direction on the floor, in the performer frame. */
export interface BodyMove {
  x: number;
  z: number;
}

/** The ring of moves the planner chooses from; index 18 is straight back. */
const MOVE_RING: readonly BodyMove[] = Array.from(
  { length: MOVE_DIRECTIONS },
  (_, k) => ({
    x: Math.cos((2 * Math.PI * k) / MOVE_DIRECTIONS),
    z: Math.sin((2 * Math.PI * k) / MOVE_DIRECTIONS),
  })
);

/** [half-width, front, back] at a row height, or null outside the part. */
function partAt(
  rows: readonly TorsoRow[],
  row: number
): [number, number, number] | null {
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (row < first[0] || row > last[0]) return null;
  for (let k = 0; k < rows.length - 1; k++) {
    const lo = rows[k]!;
    const hi = rows[k + 1]!;
    if (row > hi[0]) continue;
    const span = hi[0] - lo[0];
    const t = span > 0 ? (row - lo[0]) / span : 0;
    return [
      lo[1] + (hi[1] - lo[1]) * t,
      lo[2] + (hi[2] - lo[2]) * t,
      lo[3] + (hi[3] - lo[3]) * t,
    ];
  }
  return [last[1], last[2], last[3]];
}

/**
 * Each staff point against each torso part at its height, ready to test along
 * any move: the point in the part's unit circle (x0, y0), how far outside it
 * lies (qc = x0² + y0² - 1), and the four factors that carry a unit move into
 * the unit circle.
 */
interface StaffPoints {
  count: number;
  /** x0, y0, qc, cos/halfU, sin/halfU, sin/halfV, cos/halfV per record. */
  data: Float64Array;
  /** Some point starts inside the torso. */
  inside: boolean;
}

const RECORD_STRIDE = 7;

/**
 * Points that no move within `horizonM` can bring into their part are left
 * out; a need up to the horizon is exact without them, and a longer one stays
 * longer than the horizon.
 */
function prepareStaffPoints(
  staffs: readonly (StaffLine | null)[],
  pose: BodyClearancePose,
  model: BodyClearanceModel,
  horizonM: number
): StaffPoints {
  const turns: Record<TorsoTurn, { c: number; s: number }> = {
    chest: { c: Math.cos(pose.chestRad), s: Math.sin(pose.chestRad) },
    waist: { c: Math.cos(pose.spine1Rad), s: Math.sin(pose.spine1Rad) },
    pelvis: { c: 1, s: 0 },
  };
  const sh = model.shoulderHalfWidthM;
  const r = model.staffRadiusM;
  const out: number[] = [];
  let inside = false;
  for (const staff of staffs) {
    if (!staff) continue;
    const { a, b } = staff;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const count = Math.max(2, Math.ceil(length / STAFF_STEP_M));
    for (let k = 0; k <= count; k++) {
      const s = k / count;
      const px = a.x + (b.x - a.x) * s;
      const py = a.y + (b.y - a.y) * s;
      const pz = a.z + (b.z - a.z) * s;
      const row = py / model.heightScale;
      for (const part of BODY_CLEARANCE_TORSO) {
        const shape = partAt(part.rows, row);
        if (!shape) continue;
        const { c, s: sn } = turns[part.turn];
        // Into the part's own frame: u across it, v along its facing.
        const u = px * c - pz * sn;
        const v = px * sn + pz * c;
        const halfU = shape[0] * sh + r;
        const centreV = ((shape[1] + shape[2]) / 2) * sh;
        const halfV = ((shape[1] - shape[2]) / 2) * sh + r;
        const x0 = u / halfU;
        const y0 = (v - centreV) / halfV;
        const qc = x0 * x0 + y0 * y0 - 1;
        // A move of m shifts the point at most m / min(halfU, halfV) in the
        // unit circle.
        if ((Math.sqrt(qc + 1) - 1) * Math.min(halfU, halfV) > horizonM) {
          continue;
        }
        if (qc < 0) inside = true;
        out.push(x0, y0, qc, c / halfU, sn / halfU, sn / halfV, c / halfV);
      }
    }
  }
  return {
    count: out.length / RECORD_STRIDE,
    data: Float64Array.from(out),
    inside,
  };
}

/** The shortest move along the unit `(mx, mz)` after which no staff point is
 *  inside the torso; zero when none starts inside. */
function chainedNeed(
  points: StaffPoints,
  mx: number,
  mz: number,
  scratch: Float64Array
): number {
  if (!points.inside) return 0;
  // In the body's frame the points move against the body.
  const fx = -mx;
  const fz = -mz;
  const d = points.data;
  let m = 0;
  for (let k = 0; k < points.count; k++) {
    const o = k * RECORD_STRIDE;
    const x0 = d[o]!;
    const y0 = d[o + 1]!;
    const qc = d[o + 2]!;
    const dx = fx * d[o + 3]! - fz * d[o + 4]!;
    const dy = fx * d[o + 5]! + fz * d[o + 6]!;
    const qa = dx * dx + dy * dy;
    if (qa < 1e-12) continue;
    const qb = 2 * (x0 * dx + y0 * dy);
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    const leave = (-qb + root) / (2 * qa);
    if (leave <= 0) continue;
    scratch[m++] = Math.max(0, (-qb - root) / (2 * qa));
    scratch[m++] = leave;
  }
  // Chain from zero through every interval that reaches it.
  let reach = 0;
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = 0; k < m; k += 2) {
      if (scratch[k]! <= reach + 1e-9 && scratch[k + 1]! > reach) {
        reach = scratch[k + 1]!;
        grew = true;
      }
    }
  }
  return reach;
}

/**
 * How far the body moves along the unit `move` so that no staff point is left
 * inside the torso, every point pushing. Zero when nothing starts inside. Not
 * capped; the track caps it.
 */
export function bodyClearanceNeed(
  staffs: readonly (StaffLine | null)[],
  pose: BodyClearancePose,
  model: BodyClearanceModel,
  move: BodyMove
): number {
  const points = prepareStaffPoints(staffs, pose, model, Infinity);
  return chainedNeed(
    points,
    move.x,
    move.z,
    new Float64Array(points.count * 2)
  );
}

/** One hand for the reach test: its grip less its shoulder, and how far apart
 *  a move may leave them. */
interface ReachHand {
  vx: number;
  vy: number;
  vz: number;
  limit: number;
}

/** The hands' reach at one score time. A grip is the middle of its staff. */
function reachHands(
  staffs: readonly (StaffLine | null)[],
  chestRad: number,
  model: BodyClearanceModel
): ReachHand[] {
  const h = model.shoulderHalfWidthM;
  const cos = Math.cos(chestRad);
  const sin = Math.sin(chestRad);
  const hands: ReachHand[] = [];
  staffs.forEach((line, index) => {
    if (!line) return;
    // The left shoulder sits toward +x, the right toward -x.
    const side = index === 0 ? 1 : -1;
    const vx = (line.a.x + line.b.x) / 2 - side * h * cos;
    const vy = (line.a.y + line.b.y) / 2 - model.shoulderDyM;
    const vz = (line.a.z + line.b.z) / 2 - (model.shoulderDzM - side * h * sin);
    hands.push({
      vx,
      vy,
      vz,
      limit: Math.max(model.gripReachM, Math.hypot(vx, vy, vz)),
    });
  });
  return hands;
}

/** The furthest t along the unit `(mx, mz)` that keeps the grip within the
 *  hand's limit. The limit is never below where the grip already is, so t = 0
 *  is always allowed. */
function reachAllowance(hand: ReachHand, mx: number, mz: number): number {
  const b = hand.vx * mx + hand.vz * mz;
  const c0 =
    hand.vx * hand.vx +
    hand.vy * hand.vy +
    hand.vz * hand.vz -
    hand.limit * hand.limit;
  return b + Math.sqrt(Math.max(0, b * b - c0));
}

/** One sample's moves round the ring, each held to the cap and the reach. */
interface MoveCandidates {
  x: Float64Array;
  z: Float64Array;
  cost: Float64Array;
  /** The move stops short of clearing the staffs. */
  short: Uint8Array;
}

/**
 * A move cut short is charged for what it leaves inside, measured up to
 * `horizonM`; null when nothing is inside.
 */
function moveCandidates(
  points: StaffPoints,
  hands: readonly ReachHand[],
  maxM: number,
  horizonM: number,
  scratch: Float64Array
): MoveCandidates | null {
  if (!points.inside) return null;
  const x = new Float64Array(MOVE_DIRECTIONS);
  const z = new Float64Array(MOVE_DIRECTIONS);
  const cost = new Float64Array(MOVE_DIRECTIONS);
  const short = new Uint8Array(MOVE_DIRECTIONS);
  let any = false;
  MOVE_RING.forEach((move, k) => {
    const need = chainedNeed(points, move.x, move.z, scratch);
    if (need > 1e-6) any = true;
    let t = Math.min(need, maxM);
    let cut = need > maxM;
    for (const hand of hands) {
      const allowed = reachAllowance(hand, move.x, move.z);
      if (allowed < t) {
        t = Math.max(0, allowed);
        cut = true;
      }
    }
    x[k] = move.x * t;
    z[k] = move.z * t;
    short[k] = cut ? 1 : 0;
    cost[k] =
      LEFT_INSIDE_COST * Math.max(0, Math.min(need, horizonM) - t) +
      MOVE_COST * t;
  });
  return any ? { x, z, cost, short } : null;
}

interface ChosenMoves {
  x: Float64Array;
  z: Float64Array;
  short: Uint8Array;
}

/**
 * The cheapest path through the score, one candidate per sample; a sample
 * with nothing inside holds the body where it stands. A loop starts at such a
 * sample when one exists, so its seam costs nothing.
 */
function chooseMoves(
  candidates: readonly (MoveCandidates | null)[],
  loop: boolean
): ChosenMoves {
  const n = candidates.length;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const short = new Uint8Array(n);
  if (n === 0) return { x, z, short };
  const start = loop ? Math.max(0, candidates.indexOf(null)) : 0;
  const order = Array.from({ length: n }, (_, j) => (start + j) % n);
  const best: Float64Array[] = new Array(n);
  const from: Int16Array[] = new Array(n);
  let prev = -1;
  for (const i of order) {
    const own = candidates[i];
    const size = own ? MOVE_DIRECTIONS : 1;
    const acc = new Float64Array(size);
    const back = new Int16Array(size);
    const before = prev >= 0 ? candidates[prev] : null;
    const beforeSize = before ? MOVE_DIRECTIONS : 1;
    for (let k = 0; k < size; k++) {
      const ox = own ? own.x[k]! : 0;
      const oz = own ? own.z[k]! : 0;
      const cost = own ? own.cost[k]! : 0;
      if (prev < 0) {
        acc[k] = cost;
        continue;
      }
      let min = Infinity;
      let arg = 0;
      for (let q = 0; q < beforeSize; q++) {
        const px = before ? before.x[q]! : 0;
        const pz = before ? before.z[q]! : 0;
        const value =
          best[prev]![q]! + TURN_COST * Math.hypot(ox - px, oz - pz);
        if (value < min) {
          min = value;
          arg = q;
        }
      }
      acc[k] = cost + min;
      back[k] = arg;
    }
    best[i] = acc;
    from[i] = back;
    prev = i;
  }
  let k = 0;
  best[prev]!.forEach((value, q) => {
    if (value < best[prev]![k]!) k = q;
  });
  for (let j = n - 1; j >= 0; j--) {
    const i = order[j]!;
    const own = candidates[i];
    if (own) {
      x[i] = own.x[k]!;
      z[i] = own.z[k]!;
      short[i] = own.short[k]!;
    }
    k = from[i]![k]!;
  }
  return { x, z, short };
}

/**
 * The chosen moves as rendered: widened per half-axis, so a move that turns
 * keeps the hull of its neighbours, then scaled back to the arms' reach and
 * the cap.
 */
function rampMoves(
  chosen: ChosenMoves,
  hands: readonly (ReachHand[] | null)[],
  maxM: number,
  perStep: number,
  loop: boolean
): { x: Float64Array; z: Float64Array } {
  const n = chosen.x.length;
  const half = (values: Float64Array, sign: number) =>
    widen(
      values.map((value) => Math.max(0, sign * value)),
      perStep,
      loop,
      BODY_CLEARANCE_RAMP_STEPS
    );
  const px = half(chosen.x, 1);
  const nx = half(chosen.x, -1);
  const pz = half(chosen.z, 1);
  const nz = half(chosen.z, -1);
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const reduction = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = px[i]! - nx[i]!;
    z[i] = pz[i]! - nz[i]!;
    const length = Math.hypot(x[i]!, z[i]!);
    if (length <= 1e-9) continue;
    let scale = 1;
    for (const hand of hands[i] ?? []) {
      const allowed = reachAllowance(hand, x[i]! / length, z[i]! / length);
      scale = Math.min(scale, Math.max(0, allowed) / length);
    }
    reduction[i] = 1 - scale;
  }
  // Widening the cut keeps each sample at or below its own allowance.
  const cut = widen(reduction, perStep, loop, REACH_CUT_RAMP_STEPS);
  for (let i = 0; i < n; i++) {
    const reach = Math.max(0, 1 - cut[i]!);
    const length = Math.hypot(x[i]!, z[i]!) * reach;
    const scale = reach * (length > maxM ? maxM / length : 1);
    x[i] = x[i]! * scale;
    z[i] = z[i]! * scale;
  }
  return { x, z };
}

export type BodyClearanceProp = Pick<
  PropState3D,
  "worldPosition" | "worldRotation" | "plane"
>;

/** Where the props are at any score time, with their orientation. Structural,
 *  so `CharacterInstanceState` satisfies it directly. */
export interface BodyClearanceScoreSource extends HardBeatScoreSource {
  propStatesAtScoreTime(scoreTime: number): {
    left: BodyClearanceProp | null;
    right: BodyClearanceProp | null;
  };
}

export interface BodyClearanceTrackOptions {
  source: BodyClearanceScoreSource | null;
  stanceTrack: StanceYawTrack | null;
  /** The staffs' hard-beat displacement, as the renderer applies it. */
  hardBeatTrack?: HardBeatTrack | null;
  heightM: number;
  /** The staff on screen, tip to tip. */
  staffLengthM: number;
  /** The rig's measurements, as the live stance plans with: they set the
   *  stance corridor and the shoulder width. Null plans for the broader rig. */
  measurements?: PerformerReachMeasurements | null;
  /** Only the wall mode is planned; every other mode gets no track. */
  planeMode?: PlaneMode;
  maxM?: number;
  model?: BodyClearanceModel;
}

/** One beat's move, for logs and reviews. */
export interface ClearedBeat {
  /** Score-time step, 0-based: 0.00-0.99 is step 0. */
  step: number;
  /** The furthest the body moves in this beat, ramp included. */
  clearanceMaxM: number;
  /** The move at that furthest point, in the performer frame. */
  offsetXM: number;
  offsetZM: number;
  /** A chosen move stopped short of clearing somewhere in this beat. */
  capped: boolean;
}

export interface BodyClearanceTrack {
  readonly stepCount: number;
  readonly loop: boolean;
  readonly samplesPerStep: number;
  readonly model: Readonly<BodyClearanceModel>;
  readonly staffHalfLengthM: number;
  readonly maxM: number;
  /** The move chosen at each sample, before ramping, in the performer frame. */
  readonly rawX: Float64Array;
  readonly rawZ: Float64Array;
  /** The move as rendered: ramped, then held to the arms' reach and the cap. */
  readonly offsetX: Float64Array;
  readonly offsetZ: Float64Array;
  /** The rendered move's length. */
  readonly clearance: Float64Array;
  /** The chosen move stops short of clearing the staffs: held to the cap or
   *  to the arms' reach. */
  readonly capped: Uint8Array;
  readonly report: readonly ClearedBeat[];
}

export interface BodyClearanceSample {
  /** Toward the performer's left. */
  x: number;
  /** Toward the audience; a move back is negative. */
  z: number;
}

/** What an untracked host applies: nothing. */
export const NO_BODY_CLEARANCE: Readonly<BodyClearanceSample> = Object.freeze({
  x: 0,
  z: 0,
});

function staffLine(
  prop: BodyClearanceProp | null,
  depthM: number,
  halfLengthM: number
): StaffLine | null {
  if (!prop) return null;
  const staff = propStateToStaffTarget(prop, halfLengthM);
  return {
    a: {
      x: staff.tipAWorld.x,
      y: staff.tipAWorld.y,
      z: staff.tipAWorld.z + depthM,
    },
    b: {
      x: staff.tipBWorld.x,
      y: staff.tipBWorld.y,
      z: staff.tipBWorld.z + depthM,
    },
  };
}

export function buildBodyClearanceTrack(
  options: BodyClearanceTrackOptions
): BodyClearanceTrack | null {
  const { source } = options;
  if (!source) return null;
  if ((options.planeMode ?? PlaneMode.WALL) !== PlaneMode.WALL) return null;
  const stepCount = Math.floor(source.motionStepCount);
  if (!(stepCount > 0)) return null;
  const halfLength = options.staffLengthM / 2;
  if (!(Number.isFinite(halfLength) && halfLength > 0)) return null;

  const measurements = options.measurements ?? null;
  const model =
    options.model ??
    defaultBodyClearanceModel({
      heightM: options.heightM,
      shoulderHalfWidthM: measurements ? measurements.shoulderWidthM / 2 : null,
    });
  const maxM = options.maxM ?? DEFAULT_BODY_CLEARANCE_MAX_M;
  const horizonM = 2 * maxM;
  const perStep = BODY_CLEARANCE_SAMPLES_PER_STEP;
  const loop = source.loop;
  const n = stepCount * perStep + (loop ? 0 : 1);

  const candidates: (MoveCandidates | null)[] = new Array(n).fill(null);
  const hands: (ReachHand[] | null)[] = new Array(n).fill(null);
  let scratch = new Float64Array(0);
  for (let i = 0; i < n; i++) {
    const t = i / perStep;
    const { left, right } = source.propStatesAtScoreTime(t);
    const stance = resolveTrackedUpperBodyStance(
      options.stanceTrack,
      t,
      PlaneMode.WALL,
      left,
      right,
      measurements
    );
    const pose: BodyClearancePose = {
      chestRad: stance.segments.chestRad,
      spine1Rad: stance.segments.spine1Rad,
    };
    if (!Number.isFinite(pose.chestRad)) continue;
    const shift = sampleHardBeatTrack(options.hardBeatTrack ?? null, t);
    const staffs = [
      staffLine(
        displaceProp(left, shift.left),
        stance.leftDepthOffsetM,
        halfLength
      ),
      staffLine(
        displaceProp(right, shift.right),
        stance.rightDepthOffsetM,
        halfLength
      ),
    ];
    hands[i] = reachHands(staffs, pose.chestRad, model);
    const points = prepareStaffPoints(staffs, pose, model, horizonM);
    if (scratch.length < points.count * 2) {
      scratch = new Float64Array(points.count * 2);
    }
    candidates[i] = moveCandidates(points, hands[i]!, maxM, horizonM, scratch);
  }

  const chosen = chooseMoves(candidates, loop);
  const offset = rampMoves(chosen, hands, maxM, perStep, loop);
  const clearance = offset.x.map((x, i) => Math.hypot(x, offset.z[i]!));

  return {
    stepCount,
    loop,
    samplesPerStep: perStep,
    model,
    staffHalfLengthM: halfLength,
    maxM,
    rawX: chosen.x,
    rawZ: chosen.z,
    offsetX: offset.x,
    offsetZ: offset.z,
    clearance,
    capped: chosen.short,
    report: buildReport(stepCount, perStep, offset, clearance, chosen.short),
  };
}

/** Linear between dense samples, so it stays within its neighbours and is
 *  continuous across the loop seam. */
export function sampleBodyClearanceTrack(
  track: BodyClearanceTrack | null,
  scoreTime: number
): BodyClearanceSample {
  if (!track) return NO_BODY_CLEARANCE;
  const at = locateDenseSample(track, track.clearance.length, scoreTime);
  return {
    x: lerpDenseSample(track.offsetX, at),
    z: lerpDenseSample(track.offsetZ, at),
  };
}

/** Every beat the body moves in by more than 1 mm. Each beat also takes its
 *  closing sample, so a move that rises into the next beat is listed under
 *  the beat it starts in. The track is linear between samples, so their
 *  maxima are the rendered maxima. */
function buildReport(
  stepCount: number,
  perStep: number,
  offset: { x: Float64Array; z: Float64Array },
  clearance: Float64Array,
  capped: Uint8Array
): ClearedBeat[] {
  const n = clearance.length;
  const beats: ClearedBeat[] = [];
  for (let step = 0; step < stepCount; step++) {
    let most = -1;
    let wasCapped = false;
    for (let k = 0; k <= perStep; k++) {
      const i = (step * perStep + k) % n;
      if (most < 0 || clearance[i]! > clearance[most]!) most = i;
      wasCapped ||= capped[i] === 1;
    }
    if (clearance[most]! > REPORT_EPS_M) {
      beats.push({
        step,
        clearanceMaxM: clearance[most]!,
        offsetXM: offset.x[most]!,
        offsetZM: offset.z[most]!,
        capped: wasCapped,
      });
    }
  }
  return beats;
}

const cm = (metres: number) => (Math.abs(metres) * 100).toFixed(1);

/** One line per beat: "step 3: 12.4 cm, 11.9 right and 3.5 back", in the
 *  performer's own left and right. */
export function describeBodyClearanceTrack(
  track: BodyClearanceTrack | null
): string {
  if (!track) return "no body clearance track";
  if (track.report.length === 0) return "no beats move the body";
  return track.report
    .map((beat) => {
      const parts: string[] = [];
      if (Math.abs(beat.offsetXM) > REPORT_EPS_M) {
        parts.push(
          `${cm(beat.offsetXM)} ${beat.offsetXM > 0 ? "left" : "right"}`
        );
      }
      if (Math.abs(beat.offsetZM) > REPORT_EPS_M) {
        parts.push(
          `${cm(beat.offsetZM)} ${beat.offsetZM > 0 ? "forward" : "back"}`
        );
      }
      return `step ${beat.step}: ${cm(beat.clearanceMaxM)} cm, ${parts.join(" and ")}${beat.capped ? " (capped)" : ""}`;
    })
    .join("\n");
}
