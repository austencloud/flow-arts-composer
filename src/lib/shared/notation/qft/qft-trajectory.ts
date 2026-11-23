import {
  norm,
  pointAt,
  propRateForKnobs,
  PROP_LENGTH,
  type DirectionValue,
  type PositionValue,
  type QftIncrement,
  type QftKnobs,
} from "./qft-model";

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
   * Drawing only: the hand rides the poi's own line on its small circle and
   * turns back with it, instead of going round. Used to show a nearly still
   * hand under a pendulum, which swings along the bottom of its circle rather
   * than circling (Austen, 2026-11-22).
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
 * The published pendulum and its radius-one extendulum use the same four
 * forward and four reverse prop steps. Radius changes the hand path without
 * creating a second motion code path.
 */
export function createPendulumTrajectory(radius = 0): QftTrajectory {
  return {
    radius,
    handPhase: 0,
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

/** Gravity permits a reversal only when the prop is horizontal. */
export function hasValidReversalPositions(trajectory: QftTrajectory): boolean {
  return trajectoryReversals(trajectory).every(
    ({ propPosition }) => propPosition === 2 || propPosition === 6
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
