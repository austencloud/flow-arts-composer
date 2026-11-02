/**
 * QfT notation model — Charlie Cushing's poi notation, computed rather than traced.
 *
 * Home base: eight positions around a circle, numbered clockwise with 8 at top.
 * 1 up/right, 2 right, 3 down/right, 4 down, 5 down/left, 6 left, 7 up/left, 8 up.
 *
 * The same compass doubles as the direction-of-travel scale, which is the thing
 * that separates otherwise-identical patterns: a 4-petal inspin and a 4-petal
 * antispin flower pass through the exact same eight positions.
 *
 * Sources and the published tables this reproduces:
 * docs/reference/archive/qft-notation/README.md
 */

import type { SpinRatio } from "@vtg/domain";

export type Convention = "charlie" | "drex";
export type Spin = "inspin" | "antispin";

export type PositionValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** `n` is Charlie's "out of resolution" — the tangent doesn't land on the compass. */
export type DirectionValue = PositionValue | "n";

export interface QftKnobs {
  /** Hand path radius, in units of one prop length. The source's own unit. */
  radius: number;
  /** Prop rotations per hand rotation. */
  downbeats: number;
  /**
   * Exact prop-to-hand rotation ratio when the decimal `downbeats` value is not
   * the source of truth. Theory Atlas uses this for closed rational paths and
   * for the stationary-hand 1:0 endpoint.
   */
  ratio?: SpinRatio;
  spin: Spin;
  /**
   * Prop offset from the hand, in eighths. Zero for flowers and extensions;
   * 4 for isolations, where the prop sits opposite the hand on the compass.
   */
  phase?: number;
  /**
   * Where on the compass the hand starts, in eighths.
   *
   * QfT as published always starts the hand at 8, because it describes one
   * hand in isolation and the choice of starting point is free. It stops being
   * free the moment a second hand is on the stage: the offset BETWEEN the two
   * hands is the whole of VTG timing — together 0, quarter 2, split 4 — and
   * there is nowhere else in the model to put it.
   *
   * It also buys the 45°-rotated box grid for nothing, that rotation being
   * exactly one compass position.
   */
  handPhase?: number;
  /**
   * Which way the hand travels: +1 clockwise, -1 counter.
   *
   * Same reasoning. One hand alone may as well go clockwise; two hands going
   * the same way or opposite ways is the direction half of a VTG mode, and it
   * cannot be expressed by any amount of phase.
   *
   * Note this is the HAND's direction. `spin` stays relative to the hand, so
   * an inspin flower is inspin whichever way its hand is going.
   */
  handDirection?: 1 | -1;
}

export interface QftIncrement {
  propDepart: PositionValue;
  propDirDepart: DirectionValue;
  handDepart: PositionValue;
  radius: number;
  handArrive: PositionValue;
  propDirArrive: DirectionValue;
  propArrive: PositionValue;
}

const STEPS = 8;
const EIGHTH = Math.PI / 4;

/** One prop length. Every distance in the system is expressed against this. */
export const PROP_LENGTH = 1;

/**
 * Map any integer onto 1..8, with 0 landing on 8 rather than 0 — the source
 * numbers the top position 8, not 0.
 */
export function norm(k: number): PositionValue {
  const m = ((Math.round(k) % STEPS) + STEPS) % STEPS;
  return (m === 0 ? STEPS : m) as PositionValue;
}

/** Compass angle in radians for a position, measured clockwise from straight up. */
export function angleOf(position: number): number {
  return position * EIGHTH;
}

/** Screen-space point for a position at a given radius. Screen y grows downward. */
export function pointAt(
  position: number,
  radius: number
): { x: number; y: number } {
  const a = angleOf(position);
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

const spinSign = (spin: Spin): 1 | -1 => (spin === "inspin" ? 1 : -1);

/**
 * A hand path this small is a hand that is not travelling.
 *
 * Below this the compass reading is meaningless, not merely imprecise: an
 * eighth of a circle whose radius is a hundredth of a prop length is not a
 * place the hand goes.
 */
const STATIONARY_RADIUS = 0.01;

/**
 * Hand position at step `u`.
 *
 * At radius 0 the hand sits at the centre and never leaves it, so it has no
 * compass bearing at all. Reporting `8,1,2,3…` there describes a journey that
 * does not happen — the numbers march while the hand stands still.
 *
 * QfT as published has no symbol for the centre; every position is a bearing,
 * and the centre has none. The only radius-0 table in the source is the
 * pendulum's, which writes 8 on every row. This follows that convention rather
 * than inventing a ninth position, and the gap is recorded in the sourcing
 * archive rather than papered over.
 */
function handPositionAt(knobs: QftKnobs, u: number): PositionValue {
  return knobs.radius < STATIONARY_RADIUS ? 8 : norm(handIndexAt(knobs, u));
}

/** Which way the hand travels. Clockwise unless the caller says otherwise. */
const handSign = (knobs: QftKnobs): 1 | -1 => knobs.handDirection ?? 1;

/** Static ratios keep the hand at its starting point while the prop rotates. */
function handRateForKnobs(knobs: QftKnobs): number {
  return knobs.ratio?.handCycles === 0 ? 0 : handSign(knobs);
}

/**
 * Continuous hand index at step `u`. Integer steps give the table rows.
 *
 * The identity at the default knobs (`handPhase` 0, clockwise) is plain `u`,
 * which is what every published QfT table assumes.
 */
export function handIndexAt(knobs: QftKnobs, u: number): number {
  return handRateForKnobs(knobs) * u + (knobs.handPhase ?? 0);
}

/**
 * Continuous prop index at hand-step `u`. Integer steps give the table rows.
 *
 * Exported so the stage can draw the sector the prop sweeps across an
 * increment. That has to come from the model rather than from the drawn
 * angles: at 8 rotations per hand rotation the prop turns a full circle in one
 * increment, and a sector derived from `atan2` of the head position cannot tell
 * that from no rotation at all.
 */
export function propIndexAt(knobs: QftKnobs, u: number): number {
  return (
    propRateForKnobs(knobs) * u + (knobs.handPhase ?? 0) + (knobs.phase ?? 0)
  );
}

/**
 * Prop positions per hand step, signed in the drawing's frame.
 *
 * `spin` is relative to the hand, so a hand running counter-clockwise carries
 * its inspin prop counter-clockwise too — hence the hand's sign multiplies in.
 * Without it, reversing a hand would silently convert its inspin flower to an
 * antispin one, which is a different shape with a different petal count.
 */
export function propRateForKnobs(knobs: QftKnobs): number {
  const magnitude = knobs.ratio
    ? knobs.ratio.handCycles === 0
      ? knobs.ratio.propRotations
      : knobs.ratio.propRotations / knobs.ratio.handCycles
    : knobs.downbeats;
  return handSign(knobs) * spinSign(knobs.spin) * magnitude;
}

/**
 * Tangent of the prop head's actual path, as a screen-space vector.
 *
 * head(u) = hand(u) + prop offset, so the derivative is the sum of the hand's
 * tangent and the prop's tangent about the hand. The constant factor from the
 * chain rule drops out because only the direction matters.
 */
function headTangent(knobs: QftKnobs, u: number): { x: number; y: number } {
  const handAngle = angleOf(handIndexAt(knobs, u));
  const propAngle = angleOf(propIndexAt(knobs, u));
  const h = handRateForKnobs(knobs);
  const s = propRateForKnobs(knobs);
  return {
    x:
      knobs.radius * h * Math.cos(handAngle) +
      PROP_LENGTH * s * Math.cos(propAngle),
    y:
      knobs.radius * h * Math.sin(handAngle) +
      PROP_LENGTH * s * Math.sin(propAngle),
  };
}

/** Compass angle of a screen-space vector, in eighths. Not necessarily integral. */
function eighthsOf(v: { x: number; y: number }): number {
  const a = Math.atan2(v.x, -v.y);
  const positive = a < 0 ? a + Math.PI * 2 : a;
  return positive / EIGHTH;
}

const TOLERANCE = 1e-6;

/**
 * Charlie's rule: direction is parallel to the instantaneous slope of the path
 * the head actually traces. Where that slope doesn't land on the eight-point
 * compass, the value is out of resolution and the cell reads `n`.
 */
function directionCharlie(knobs: QftKnobs, u: number): DirectionValue {
  const t = headTangent(knobs, u);
  if (Math.hypot(t.x, t.y) < TOLERANCE) return "n";
  const e = eighthsOf(t);
  const nearest = Math.round(e);
  return Math.abs(e - nearest) < TOLERANCE ? norm(nearest) : "n";
}

/**
 * Drex's rule: direction is always at a right angle to the tether, so nothing
 * is ever out of resolution. Two eighths ahead of the prop when spinning with
 * the hand, two behind when spinning against it.
 */
function directionDrex(knobs: QftKnobs, u: number): DirectionValue {
  /* Two eighths off the tether, on the side the prop is actually heading —
	   which reverses with the hand, same as the prop's own rate does. */
  return norm(
    propIndexAt(knobs, u) + 2 * handSign(knobs) * spinSign(knobs.spin)
  );
}

function directionAt(
  knobs: QftKnobs,
  u: number,
  convention: Convention
): DirectionValue {
  return convention === "charlie"
    ? directionCharlie(knobs, u)
    : directionDrex(knobs, u);
}

/**
 * The eight increments of one hand revolution, as notation rows.
 *
 * Each row's arrival values are the next row's departure values — the source
 * writes movement as origin and destination, assuming a continuous path
 * between them rather than drawing every infinitesimal step.
 */
export function buildIncrements(
  knobs: QftKnobs,
  convention: Convention
): QftIncrement[] {
  const rows: QftIncrement[] = [];
  for (let i = 0; i < STEPS; i += 1) {
    rows.push({
      propDepart: norm(propIndexAt(knobs, i)),
      propDirDepart: directionAt(knobs, i, convention),
      handDepart: handPositionAt(knobs, i),
      radius: knobs.radius,
      handArrive: handPositionAt(knobs, i + 1),
      propDirArrive: directionAt(knobs, i + 1, convention),
      propArrive: norm(propIndexAt(knobs, i + 1)),
    });
  }
  return rows;
}

/**
 * Pendulum, which is not a knob state.
 *
 * Everything else here is rotational: a hand circle with a prop rotating
 * against it. A pendulum oscillates, never completing a revolution, and never
 * touches 7, 8 or 1 because those point upward. It gets its own generator
 * rather than a fudged radius.
 */
const PENDULUM_PATH = [2, 3, 4, 5, 6, 5, 4, 3, 2];

/**
 * Continuous prop index along the swing, so the drawn prop lands on the same
 * position the notation row names. The rotational path can't express this —
 * a pendulum reverses, and `propIndexAt` only ever advances.
 */
export function pendulumIndexAt(u: number): number {
  const t = ((u % STEPS) + STEPS) % STEPS;
  const i = Math.floor(t);
  const frac = t - i;
  const from = PENDULUM_PATH[i] as number;
  const to = PENDULUM_PATH[i + 1] as number;
  return from + (to - from) * frac;
}

/** Hand and prop-head positions for the pendulum. The hand never leaves centre. */
export function pendulumPosesAt(u: number) {
  const head = pointAt(pendulumIndexAt(u), PROP_LENGTH);
  return { hand: { x: 0, y: 0 }, head };
}

/** Sample points of the swung arc, for drawing the trail. */
export function tracePendulum(samples = 240): Array<{ x: number; y: number }> {
  return Array.from({ length: samples + 1 }, (_, i) =>
    pointAt(pendulumIndexAt((i / samples) * STEPS), PROP_LENGTH)
  );
}

export function buildPendulum(): QftIncrement[] {
  const path = PENDULUM_PATH;
  return Array.from({ length: STEPS }, (_, i) => {
    const depart = path[i] as number;
    const arrive = path[i + 1] as number;
    const descending = arrive > depart;
    return {
      propDepart: norm(depart),
      propDirDepart: norm(depart + (descending ? 2 : -2)),
      handDepart: 8,
      radius: 0,
      handArrive: 8,
      propDirArrive: norm(arrive + (descending ? 2 : -2)),
      propArrive: norm(arrive),
    };
  });
}

/**
 * Sample points of the traced path, with the hand orbit and the prop measured
 * in the drawing's own units.
 *
 * The model's unit is one prop length and `radius` measures the hand orbit
 * against it, which is the right frame for the notation and the wrong one for
 * any drawing that also renders a real prop. A staff's tracked tip sits 126.4
 * out from a hand travelling a 150 circle, so collapsing the two to a single
 * unit draws a flower with the wrong proportions against the grid it sits on.
 *
 * `units.hand` scales the orbit rather than replacing it, so a stationary hand
 * stays at the centre however long that unit is.
 */
export function traceScaledPath(
  knobs: QftKnobs,
  units: { hand: number; prop: number },
  samples = closedPathSampleCount(knobs)
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const revolutions = revolutionsToClose(knobs);
  for (let i = 0; i <= samples; i += 1) {
    const u = (i / samples) * STEPS * revolutions;
    const hand = pointAt(handIndexAt(knobs, u), knobs.radius * units.hand);
    const prop = pointAt(propIndexAt(knobs, u), units.prop);
    points.push({ x: hand.x + prop.x, y: hand.y + prop.y });
  }
  return points;
}

/** Sample points of the traced path, for drawing the trail. */
export function tracePath(
  knobs: QftKnobs,
  samples = closedPathSampleCount(knobs)
): Array<{ x: number; y: number }> {
  return traceScaledPath(knobs, { hand: 1, prop: PROP_LENGTH }, samples);
}

function decimalDenominator(value: number): number {
  if (!Number.isFinite(value)) return 1;

  const magnitude = Math.abs(value);
  for (let denominator = 1; denominator <= 1024; denominator += 1) {
    const numerator = Math.round(magnitude * denominator);
    if (Math.abs(magnitude - numerator / denominator) < TOLERANCE) {
      return denominator;
    }
  }

  return 1;
}

/**
 * How many hand revolutions before the pattern repeats. A prop making a whole
 * number of turns per hand circle closes in one; anything else needs more.
 */
export function revolutionsToClose(knobs: QftKnobs): number {
  if (knobs.ratio) return Math.max(1, knobs.ratio.handCycles);
  return decimalDenominator(knobs.downbeats);
}

/** Eight compass steps per hand revolution across the exact closed path. */
export function closedPathSteps(knobs: QftKnobs): number {
  return STEPS * revolutionsToClose(knobs);
}

/** Preserve curve quality as the number of hand and prop windings grows. */
export function closedPathSampleCount(knobs: QftKnobs): number {
  const handWindings = knobs.ratio
    ? knobs.ratio.handCycles
    : revolutionsToClose(knobs);
  const propWindings = knobs.ratio
    ? knobs.ratio.propRotations
    : Math.abs(knobs.downbeats) * handWindings;
  return Math.max(240, Math.ceil((handWindings + propWindings) * 32));
}

/** Hand and prop-head positions at a continuous step, for rendering. */
export function posesAt(knobs: QftKnobs, u: number) {
  const hand = pointAt(handIndexAt(knobs, u), knobs.radius);
  const offset = pointAt(propIndexAt(knobs, u), PROP_LENGTH);
  return { hand, head: { x: hand.x + offset.x, y: hand.y + offset.y } };
}
