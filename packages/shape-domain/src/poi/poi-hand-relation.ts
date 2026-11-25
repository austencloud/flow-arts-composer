/**
 * Timing and direction of the two hands, set and read.
 *
 * This is about the hands only. Two props can turn at different rates, so one
 * timing and direction cannot describe them; two hands on full circles always
 * keep one. A pendulum's hand turns back, so a pair with a pendulum in it
 * usually passes through several, and the readout says which and when
 * (Austen, 2026-11-23: "that needs to be clear and not misleading").
 *
 * Opposite hands are measured against down, like the rest of TKA: together
 * opposite means both hands reach the bottom, and the top, at once.
 */
import type { VtgMode } from "../elements/vtg-modes.js";
import {
  isGravityBound,
  mirrorTrajectory,
  reverseTrajectory,
  QFT_TRAJECTORY_STEPS,
  trajectoryHandDirectionAt,
  trajectoryHandIndexAt,
  withTrajectoryDelay,
  type QftTrajectory,
} from "./poi-trajectory.js";

const wrap = (value: number) =>
  ((value % QFT_TRAJECTORY_STEPS) + QFT_TRAJECTORY_STEPS) %
  QFT_TRAJECTORY_STEPS;

const sameIndex = (a: number, b: number) => {
  const gap = wrap(a - b);
  return gap < 1e-9 || QFT_TRAJECTORY_STEPS - gap < 1e-9;
};

/** Hand offset between the two hands, in eighths, for each timing. */
const TIMING_OFFSETS: Record<string, readonly number[]> = {
  T: [0],
  Q: [2, -2],
  S: [4],
};

export interface HandStart {
  /** Compass index of the hand when the cycle begins; 0 is the top. */
  index: number;
  direction: 1 | -1;
}

/**
 * The same move with its hand starting where asked, or null when its hand is
 * never there going that way.
 *
 * The drawing stays where it is. Turning a flower to its start moved its petals
 * off the ones that were picked (Austen, 2026-11-23), so a hand going all the
 * way round begins partway along the same path, either way round. A swing
 * begins at another point of its own cycle, or mirrored.
 */
export function startHandAt(
  trajectory: QftTrajectory,
  start: HandStart
): QftTrajectory | null {
  if (!isGravityBound(trajectory)) {
    const facing =
      trajectory.handDirection === start.direction
        ? trajectory
        : reverseTrajectory(trajectory);
    return withTrajectoryDelay(
      facing,
      wrap(start.direction * (start.index - (trajectory.handPhase ?? 0)))
    );
  }

  for (const facing of [trajectory, mirrorTrajectory(trajectory)]) {
    for (let delay = 0; delay < QFT_TRAJECTORY_STEPS; delay += 1) {
      if (!sameIndex(trajectoryHandIndexAt(facing, delay), start.index)) {
        continue;
      }
      if (trajectoryHandDirectionAt(facing, delay) !== start.direction) {
        continue;
      }
      return withTrajectoryDelay(facing, delay);
    }
  }
  return null;
}

/** A hand on its own, starting at a compass index in the way it already goes. */
export function startSoloHand(
  trajectory: QftTrajectory,
  index: number
): QftTrajectory | null {
  const direction = trajectory.handDirection;
  const started = startHandAt(trajectory, { index, direction });
  if (started || !isGravityBound(trajectory)) return started;
  return startHandAt(trajectory, {
    index,
    direction: direction === 1 ? -1 : 1,
  });
}

/** Two hands starting in a timing and direction, or null when they never can. */
export function relateHands(
  left: QftTrajectory,
  right: QftTrajectory,
  mode: VtgMode,
  startIndex: number
): { left: QftTrajectory; right: QftTrajectory } | null {
  const startedLeft = startSoloHand(left, startIndex);
  if (!startedLeft) return null;

  const leftDirection = trajectoryHandDirectionAt(startedLeft, 0);
  if (leftDirection === 0) {
    throw new Error("A started hand always has a direction to relate to.");
  }
  const opposite = mode[1] === "O";
  const rightDirection = opposite
    ? leftDirection === 1
      ? -1
      : 1
    : leftDirection;
  for (const offset of TIMING_OFFSETS[mode[0]!]!) {
    const startedRight = startHandAt(right, {
      index: (opposite ? -startIndex : startIndex) + offset,
      direction: rightDirection,
    });
    if (startedRight) return { left: startedLeft, right: startedRight };
  }
  return null;
}

/** What the hands do during one step, or null when a hand is still. */
export function readHandRelation(
  left: QftTrajectory,
  right: QftTrajectory,
  step: number
): VtgMode | null {
  if (left.radius < 0.01 || right.radius < 0.01) return null;
  const leftDirection = trajectoryHandDirectionAt(left, step);
  const rightDirection = trajectoryHandDirectionAt(right, step);
  if (leftDirection === 0 || rightDirection === 0) return null;

  const same = leftDirection === rightDirection;
  const leftIndex = trajectoryHandIndexAt(left, step);
  const rightIndex = trajectoryHandIndexAt(right, step);
  const phase = wrap(same ? rightIndex - leftIndex : rightIndex + leftIndex);
  const folded = Math.min(phase, QFT_TRAJECTORY_STEPS - phase);
  const timing = folded < 1 ? "T" : folded > 3 ? "S" : "Q";
  return `${timing}${same ? "S" : "O"}` as VtgMode;
}

/** The hands' timing and direction on each of the eight steps. */
export function readHandRelations(
  left: QftTrajectory,
  right: QftTrajectory
): Array<VtgMode | null> {
  return Array.from({ length: QFT_TRAJECTORY_STEPS }, (_, step) =>
    readHandRelation(left, right, step)
  );
}
