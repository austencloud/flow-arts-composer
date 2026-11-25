/**
 * Swing speed: when a hand that turns around is where in its eight steps.
 *
 * Austen, 2026-11-22: a real poi "would slow to reach the extension part. And
 * then speed up on the way down", and its easing should "represent gravity and
 * reality a little closer". Between two turns the head moves at the speed its
 * fall gives it, the square root of the drop below the turn. For a weight on a
 * string under gravity alone that rule is exact.
 *
 * This only re-times a path. It cannot move the path or make one legal or
 * illegal; the momentum simulator that tried to was reverted on purpose. Turns
 * stay on their own steps, so two hands still meet where the notation says.
 *
 * Flowers have their own timing (`qft-string-swing`). A stretch the head does
 * not fall through keeps the notation's even steps, such as an extendulum's
 * level line across the centre: the hand carries it there.
 */
import {
  QFT_TRAJECTORY_STEPS,
  trajectoryPosesAt,
  trajectoryReversals,
  type QftTrajectory,
} from "./poi-trajectory.js";

/** Cursor samples per step. */
const SAMPLES = 60;
/** A fall smaller than this, in prop lengths, does not drive the swing. */
const FLAT = 0.02;

export type SwingClock = (time: number) => number;

const evenClock: SwingClock = (time) => time;

interface Fall {
  /** Share of the stretch's time spent before each sample. */
  times: number[];
  /**
   * Path over the square root of the drop, summed, in prop lengths. Times the
   * square root of length / 2g it is the stretch's time in seconds.
   */
  root: number;
}

/** How a stretch between two turns is timed, or null if it is not a fall. */
function readFall(
  trajectory: QftTrajectory,
  from: number,
  length: number
): Fall | null {
  const count = length * SAMPLES;
  const heads = Array.from(
    { length: count + 1 },
    (_, index) =>
      trajectoryPosesAt(trajectory, from + (index / count) * length).head
  );
  /* Screen y grows downward, so a drop is a gain in y. */
  const drop = (index: number) => heads[index]!.y - heads[0]!.y;
  let deepest = 0;
  for (let index = 0; index <= count; index += 1) {
    if (drop(index) < -FLAT) return null;
    deepest = Math.max(deepest, drop(index));
  }
  if (deepest < FLAT) return null;

  const times = [0];
  for (let index = 0; index < count; index += 1) {
    const a = heads[index]!;
    const b = heads[index + 1]!;
    /*
     * Speed at each end of a short slice, averaged: exact for a steady fall,
     * and finite at a turn, where the speed starts from zero.
     */
    const speed =
      (Math.sqrt(Math.max(0, drop(index))) +
        Math.sqrt(Math.max(0, drop(index + 1)))) /
      2;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    times.push(times[index]! + distance / Math.max(speed, 1e-4));
  }
  const total = times[count]!;
  return { times: times.map((time) => time / total), root: total };
}

interface SwingStretch {
  /** The step it leaves its turn on, from 0. */
  from: number;
  /** Steps to the next turn. */
  length: number;
  fall: Fall | null;
}

function swingStretches(trajectory: QftTrajectory): SwingStretch[] {
  const turns = trajectoryReversals(trajectory).map(({ step }) => step - 1);
  return turns.map((from, index) => {
    const next = turns[index + 1] ?? turns[0]! + QFT_TRAJECTORY_STEPS;
    const length = next - from;
    return { from, length, fall: readFall(trajectory, from, length) };
  });
}

/** The stretches gravity times, and how long each takes (see `Fall.root`). */
export function swingFalls(
  trajectory: QftTrajectory
): Array<{ from: number; length: number; root: number }> {
  return swingStretches(trajectory).flatMap(({ from, length, fall }) =>
    fall ? [{ from, length, root: fall.root }] : []
  );
}

/** Maps even playing time, in steps, to where this hand is in its own cycle. */
export function createSwingClock(trajectory: QftTrajectory): SwingClock {
  const stretches = swingStretches(trajectory);
  if (stretches.length === 0) return evenClock;

  return (time) => {
    const first = stretches[0]!.from;
    const cycle = Math.floor((time - first) / QFT_TRAJECTORY_STEPS);
    const local = time - cycle * QFT_TRAJECTORY_STEPS;
    const stretch =
      [...stretches].reverse().find(({ from }) => from <= local) ??
      stretches[0]!;
    if (!stretch.fall) return time;

    const { from, length } = stretch;
    const { times } = stretch.fall;
    const share = Math.min(1, Math.max(0, (local - from) / length));
    let low = 0;
    let high = times.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (times[middle]! <= share) low = middle;
      else high = middle;
    }
    const span = times[high]! - times[low]!;
    const part = span > 0 ? (share - times[low]!) / span : 0;
    return (
      cycle * QFT_TRAJECTORY_STEPS +
      from +
      ((low + part) / (times.length - 1)) * length
    );
  };
}
