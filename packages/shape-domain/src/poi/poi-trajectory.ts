import {
  norm,
  pointAt,
  propRateForKnobs,
  PROP_LENGTH,
  type DirectionValue,
  type PositionValue,
  type QftIncrement,
  type QftKnobs,
} from "../qft/qft-model.js";

export const QFT_TRAJECTORY_STEPS = 8;

export type QftPropRateProfile = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * One QFT hand whose prop speed can change inside the eight-step cycle.
 *
 * The rate profile is relative to the hand. A counterclockwise hand therefore
 * mirrors the same named pattern without rewriting all eight rates.
 */
export interface QftTrajectory {
  radius: number;
  /** Where the hand begins on the eight-point compass. */
  handPhase?: number;
  handDirection: 1 | -1;
  propRate: QftPropRateProfile;
  /** Where the prop begins, measured from the body compass. */
  propPhase: number;
  /**
   * The hand rides the poi's own line on its circle and turns back with it,
   * instead of going round: a pendulum's hand, which swings along the bottom
   * of its circle and never passes over the top (Austen, 2026-11-22).
   */
  handFollowsProp?: boolean;
}

/**
 * The One Surface app treats a trajectory as one complete hand description.
 * Keep the established trajectory name for existing consumers while giving
 * the app the vocabulary used by its design.
 */
export type QftHand = QftTrajectory;

export interface QftTrajectoryReversal {
  /** The step whose departure begins the new rate, 1 through 8. */
  step: PositionValue;
  handPosition: PositionValue;
  propPosition: PositionValue;
  fromRate: number;
  toRate: number;
}

const STATIONARY_RADIUS = 0.01;
const RATE_TOLERANCE = 1e-9;

function wrappedStep(step: number): number {
  return (
    ((step % QFT_TRAJECTORY_STEPS) + QFT_TRAJECTORY_STEPS) %
    QFT_TRAJECTORY_STEPS
  );
}

function rateSign(rate: number): -1 | 0 | 1 {
  if (Math.abs(rate) < RATE_TOLERANCE) return 0;
  return rate > 0 ? 1 : -1;
}

/** The signed rate in the drawing's frame at a continuous cursor position. */
export function trajectoryPropRateAt(
  trajectory: QftTrajectory,
  cursor: number
): number {
  const step = wrappedStep(Math.floor(cursor));
  return trajectory.handDirection * (trajectory.propRate[step] ?? 0);
}

export function trajectoryHandIndexAt(
  trajectory: QftTrajectory,
  cursor: number
): number {
  if (trajectory.handFollowsProp)
    return trajectoryPropIndexAt(trajectory, cursor);
  return trajectory.handDirection * cursor + (trajectory.handPhase ?? 0);
}

/** Which way the hand travels during a step; 0 when it stays put. */
export function trajectoryHandDirectionAt(
  trajectory: QftTrajectory,
  step: number
): -1 | 0 | 1 {
  return trajectory.handFollowsProp
    ? rateSign(trajectoryPropRateAt(trajectory, step))
    : trajectory.handDirection;
}

/** True for a move that turns around, which gravity keeps from being rotated. */
export function isGravityBound(trajectory: QftTrajectory): boolean {
  return trajectoryReversals(trajectory).length > 0;
}

export function constantRateProfile(rate: number): QftPropRateProfile {
  return [rate, rate, rate, rate, rate, rate, rate, rate];
}

/**
 * Lift the published scalar model into the per-step owner without changing
 * any of its geometry. This is the bridge that lets flowers, guide presets,
 * and reversals share one renderer and one notation pipeline.
 */
export function trajectoryFromKnobs(knobs: QftKnobs): QftTrajectory {
  const handPhase = knobs.handPhase ?? 0;
  const handDirection = knobs.handDirection ?? 1;
  const signedDrawingRate = propRateForKnobs(knobs);
  const relativeRate = signedDrawingRate / handDirection;

  return {
    radius: knobs.radius,
    handPhase,
    handDirection,
    propRate: constantRateProfile(relativeRate),
    propPhase: handPhase + (knobs.phase ?? 0),
  };
}

/**
 * The pendulum and the extendulum use the same four forward and four reverse
 * prop steps and turn at the same places: level, pointing out, with the hand at
 * a side. The hand is what differs.
 *
 * A pendulum's hand swings with the poi along the bottom of its circle and
 * back. "It does not pass across the top" (Austen, 2026-11-23).
 */
export function createPendulumTrajectory(radius = 0): QftTrajectory {
  return { ...createExtendulumTrajectory(radius), handFollowsProp: true };
}

/**
 * An extendulum's hand goes all the way round like an extension's, extended
 * through the bottom half, with the poi's end crossing the middle through the
 * top half. He judged this one legal in sitting 1 (2026-11-22).
 */
export function createExtendulumTrajectory(radius = 1): QftTrajectory {
  return {
    radius,
    handPhase: 2,
    handDirection: 1,
    propRate: [1, 1, 1, 1, -1, -1, -1, -1],
    propPhase: 2,
  };
}

export function withTrajectoryPhase(
  trajectory: QftTrajectory,
  phaseOffset: number
): QftTrajectory {
  return {
    ...trajectory,
    handPhase: (trajectory.handPhase ?? 0) + phaseOffset,
    propPhase: trajectory.propPhase + phaseOffset,
  };
}

/**
 * The same motion, begun later in its cycle. Unlike a rotation this keeps the
 * move where it is in space, so a pendulum still hangs below the hand.
 */
export function withTrajectoryDelay(
  trajectory: QftTrajectory,
  steps: number
): QftTrajectory {
  const rate = (index: number) =>
    trajectory.propRate[wrappedStep(index + steps)] ?? 0;
  return {
    ...trajectory,
    handPhase: (trajectory.handPhase ?? 0) + trajectory.handDirection * steps,
    propPhase: trajectoryPropIndexAt(trajectory, steps),
    propRate: [
      rate(0),
      rate(1),
      rate(2),
      rate(3),
      rate(4),
      rate(5),
      rate(6),
      rate(7),
    ],
  };
}

/** The same path travelled the other way round. */
export function reverseTrajectory(trajectory: QftTrajectory): QftTrajectory {
  const [a, b, c, d, e, f, g, h] = trajectory.propRate;
  return {
    ...trajectory,
    handDirection: trajectory.handDirection === 1 ? -1 : 1,
    propRate: [h, g, f, e, d, c, b, a],
  };
}

/** The same motion seen in a mirror: left and right trade, up stays up. */
export function mirrorTrajectory(trajectory: QftTrajectory): QftTrajectory {
  return {
    ...trajectory,
    handPhase: -(trajectory.handPhase ?? 0),
    handDirection: trajectory.handDirection === 1 ? -1 : 1,
    propPhase: -trajectory.propPhase,
  };
}

/**
 * Continuous prop index from the rate profile.
 *
 * Whole steps use a prefix sum. The fractional part advances through the
 * current rate, so the head does not jump at a step or reversal boundary.
 */
export function trajectoryPropIndexAt(
  trajectory: QftTrajectory,
  cursor: number
): number {
  const whole = Math.floor(cursor);
  const fraction = cursor - whole;
  const cycle = Math.floor(whole / QFT_TRAJECTORY_STEPS);
  const step = wrappedStep(whole);
  const cycleRate = trajectory.propRate.reduce((sum, rate) => sum + rate, 0);
  let prefix = cycle * cycleRate;

  for (let index = 0; index < step; index += 1) {
    prefix += trajectory.propRate[index] ?? 0;
  }
  prefix += (trajectory.propRate[step] ?? 0) * fraction;

  return trajectory.propPhase + trajectory.handDirection * prefix;
}

function handPositionAt(
  trajectory: QftTrajectory,
  cursor: number
): PositionValue {
  return trajectory.radius < STATIONARY_RADIUS
    ? 8
    : norm(trajectoryHandIndexAt(trajectory, cursor));
}

function directionAt(propIndex: number, rate: number): DirectionValue {
  const sign = rateSign(rate);
  return sign === 0 ? "n" : norm(propIndex + sign * 2);
}

export function trajectoryPosesAt(trajectory: QftTrajectory, cursor: number) {
  const hand = pointAt(
    trajectoryHandIndexAt(trajectory, cursor),
    trajectory.radius
  );
  const offset = pointAt(
    trajectoryPropIndexAt(trajectory, cursor),
    PROP_LENGTH
  );
  return {
    hand,
    head: {
      x: hand.x + offset.x,
      y: hand.y + offset.y,
    },
  };
}

export function traceTrajectory(
  trajectory: QftTrajectory,
  samples = 240
): Array<{ x: number; y: number }> {
  return Array.from(
    { length: samples + 1 },
    (_, index) =>
      trajectoryPosesAt(
        trajectory,
        (index / Math.max(1, samples)) * QFT_TRAJECTORY_STEPS
      ).head
  );
}

/**
 * Rate changes belong to the departure of the new step. Step 1 compares the
 * end of the prior cycle with the first rate, so a loop-seam reversal remains
 * visible and selectable.
 */
export function trajectoryReversals(
  trajectory: QftTrajectory
): QftTrajectoryReversal[] {
  const reversals: QftTrajectoryReversal[] = [];

  for (let stepIndex = 0; stepIndex < QFT_TRAJECTORY_STEPS; stepIndex += 1) {
    const previousIndex = wrappedStep(stepIndex - 1);
    const fromRate =
      trajectory.handDirection * (trajectory.propRate[previousIndex] ?? 0);
    const toRate =
      trajectory.handDirection * (trajectory.propRate[stepIndex] ?? 0);
    const fromSign = rateSign(fromRate);
    const toSign = rateSign(toRate);
    if (fromSign === 0 || toSign === 0 || fromSign === toSign) continue;

    reversals.push({
      step: (stepIndex + 1) as PositionValue,
      handPosition: handPositionAt(trajectory, stepIndex),
      propPosition: norm(trajectoryPropIndexAt(trajectory, stepIndex)),
      fromRate,
      toRate,
    });
  }

  return reversals;
}

/**
 * Under gravity alone a poi turns around only as a pendulum does: level with
 * the floor and pointing out, past a hand at the side or over a still hand,
 * and falling away from the turn through the bottom. A swing that leaves its
 * turn upward would hang from nothing (Austen, 2026-11-23).
 * Austen's sitting 1 verdicts and ruling, 2026-11-22: turns pointing out at
 * the top, bottom or a diagonal, sideways, or pointing in are illegal. Stalls
 * need build-up and pull-back that these paths cannot show.
 */
export function hasValidReversalPositions(trajectory: QftTrajectory): boolean {
  const stillHand = trajectory.radius < STATIONARY_RADIUS;
  return trajectoryReversals(trajectory).every(
    ({ propPosition, handPosition, toRate }) =>
      ((propPosition === 2 && toRate > 0) ||
        (propPosition === 6 && toRate < 0)) &&
      (stillHand || handPosition === propPosition)
  );
}

export function buildTrajectoryIncrements(
  trajectory: QftTrajectory
): QftIncrement[] {
  return Array.from({ length: QFT_TRAJECTORY_STEPS }, (_, stepIndex) => {
    const departIndex = trajectoryPropIndexAt(trajectory, stepIndex);
    const arriveIndex = trajectoryPropIndexAt(trajectory, stepIndex + 1);
    const rate = trajectoryPropRateAt(trajectory, stepIndex);

    return {
      propDepart: norm(departIndex),
      propDirDepart: directionAt(departIndex, rate),
      handDepart: handPositionAt(trajectory, stepIndex),
      radius: trajectory.radius,
      handArrive: handPositionAt(trajectory, stepIndex + 1),
      propDirArrive: directionAt(arriveIndex, rate),
      propArrive: norm(arriveIndex),
    };
  });
}
