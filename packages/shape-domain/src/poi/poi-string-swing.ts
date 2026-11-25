/**
 * How fast a head on a string goes round a drawn path.
 *
 * A string pulls along itself and nothing else. Two things follow from
 * Newton's second law, with y the square of the speed along the drawn path:
 *
 *   Across the string there is only gravity, so the head cannot be held back
 *   on the way down or pushed on the way up. That fixes how the speed changes
 *   round the path,  (1/2) A y' + B y = G,  up to one choice: how hard it is
 *   swung.
 *
 *   Along the string the pull must never go below zero, or the string is slack.
 *   The slowest swing is the one whose pull reaches zero and no lower.
 *
 * For a hand that stays still this is the textbook ball on a string: v^2 = g L
 * over the top, 5 g L through the bottom.
 *
 * Until 2026-11-23 the first part was left out: the head was taken to spin
 * evenly, which a string cannot make it do, and flowers came out at about half
 * their real speed (Austen: "slower than they would in reality").
 */
import type { SwingClock } from "./poi-swing-clock.js";
import {
  QFT_TRAJECTORY_STEPS,
  trajectoryHandDirectionAt,
  trajectoryHandIndexAt,
  trajectoryPropIndexAt,
  trajectoryPropRateAt,
  type QftTrajectory,
} from "./poi-trajectory.js";

/** Hand to the far end of the poi, in metres. */
export const DEFAULT_POI_LENGTH = 0.6;

/** Metres a second, every second. */
export const GRAVITY = 9.81;

const SAMPLES_PER_STEP = 90;
const TOLERANCE = 1e-9;
/** How near to nothing a round's gain in speed must be. */
const CLOSES = 1e-4;
/** Where the head hardly moves across its string, nothing there sets its speed. */
const NO_SPIN = 1e-3;

const angle = (index: number) => (index * Math.PI) / 4;

export interface StringSwing {
  /** One eight-step round. */
  seconds: number;
  /** Steps a second at each of the round's even sample points. */
  speeds: number[];
}

/** Every swing a string allows on one path: y = (swing + work) / hold. */
interface Swings {
  works: number[];
  holds: number[];
  /** The least and the most it can be swung with the string tight. */
  least: number;
  most: number;
}

function readSwings(
  trajectory: QftTrajectory,
  poiLength: number
): Swings | null {
  const propRate = trajectoryPropRateAt(trajectory, 0);
  const handRate = trajectoryHandDirectionAt(trajectory, 0);
  for (let step = 1; step < QFT_TRAJECTORY_STEPS; step += 1) {
    if (trajectoryPropRateAt(trajectory, step) !== propRate) return null;
    if (trajectoryHandDirectionAt(trajectory, step) !== handRate) return null;
  }

  const count = QFT_TRAJECTORY_STEPS * SAMPLES_PER_STEP;
  const dx = 1 / SAMPLES_PER_STEP;
  const spin = angle(propRate);
  const turn = angle(handRate);
  const reach = trajectory.radius * poiLength;

  /* Across the string: A, B and G of (1/2) A y' + B y = G at each sample. */
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const cursor = index * dx;
    const prop = angle(trajectoryPropIndexAt(trajectory, cursor));
    const between = prop - angle(trajectoryHandIndexAt(trajectory, cursor));
    const along = poiLength * spin + reach * turn * Math.cos(between);
    const bend = reach * turn ** 2 * Math.sin(between);
    const fall = GRAVITY * Math.sin(prop);
    /* Along the string: pull = outward * y - drag * y' / 2 - weight. */
    const outward =
      poiLength * spin ** 2 + reach * turn ** 2 * Math.cos(between);
    const drag = reach * turn * Math.sin(between);
    return {
      along,
      bend,
      fall,
      outward: outward + (drag * bend) / along,
      weight: GRAVITY * Math.cos(prop) + (drag * fall) / along,
    };
  });
  const sign = Math.sign(samples[0]!.along);
  if (
    samples.some(({ along }) => along * sign < NO_SPIN * poiLength * Math.PI)
  ) {
    return null;
  }

  /* y = (swing + work) / hold; the integrals are the linear equation's own. */
  const holds = [1];
  const works = [0];
  let held = 0;
  let work = 0;
  let workSize = 0;
  for (let index = 1; index <= count; index += 1) {
    const from = samples[index - 1]!;
    const to = samples[index]!;
    held += dx * (from.bend / from.along + to.bend / to.along);
    const hold = Math.exp(held);
    const added =
      dx *
      ((from.fall * holds[index - 1]!) / from.along +
        (to.fall * hold) / to.along);
    work += added;
    workSize += Math.abs(added);
    holds.push(hold);
    works.push(work);
  }
  /* A round that gains or loses speed cannot repeat on the string alone. */
  if (Math.abs(held) > CLOSES || Math.abs(work) > CLOSES * (1 + workSize)) {
    return null;
  }

  let least = -Infinity;
  let most = Infinity;
  samples.forEach(({ outward, weight }, index) => {
    least = Math.max(least, -works[index]!);
    const slope = outward / holds[index]!;
    if (Math.abs(slope) < TOLERANCE) {
      if (weight > TOLERANCE) most = -Infinity;
      return;
    }
    const bound = weight / slope - works[index]!;
    if (slope > 0) least = Math.max(least, bound);
    else most = Math.min(most, bound);
  });
  if (least > most) return null;

  return { works, holds, least, most };
}

function swingOf({ works, holds }: Swings, swing: number): StringSwing | null {
  const speeds: number[] = [];
  let seconds = 0;
  for (let index = 0; index < works.length - 1; index += 1) {
    const squared = (swing + works[index]!) / holds[index]!;
    if (squared < TOLERANCE) return null;
    speeds.push(Math.sqrt(squared));
    seconds += 1 / (SAMPLES_PER_STEP * Math.sqrt(squared));
  }
  return { seconds, speeds };
}

/**
 * The slowest swing that a string alone can give a move that keeps turning one
 * way, or null when a string cannot carry it round the drawn path at any speed.
 */
export function slowestStringSwing(
  trajectory: QftTrajectory,
  poiLength = DEFAULT_POI_LENGTH
): StringSwing | null {
  const swings = readSwings(trajectory, poiLength);
  return swings && swingOf(swings, swings.least);
}

/**
 * The swing that goes round in this many seconds. The faster it goes, the less
 * gravity matters and the more even it gets. A round longer than the slowest is
 * the slowest swing in slow motion.
 */
export function stringSwingFor(
  trajectory: QftTrajectory,
  seconds: number,
  poiLength = DEFAULT_POI_LENGTH
): StringSwing | null {
  const swings = readSwings(trajectory, poiLength);
  const slowest = swings && swingOf(swings, swings.least);
  if (!swings || !slowest || seconds >= slowest.seconds) return slowest;

  /* Harder swings are quicker, so the one wanted is between these two. */
  const period = (swing: number) => swingOf(swings, swing)!.seconds;
  let low = swings.least;
  let gap = 1;
  while (low + gap < swings.most && period(low + gap) > seconds) gap *= 2;
  let high = Math.min(low + gap, swings.most);
  for (let round = 0; round < 50; round += 1) {
    const middle = (low + high) / 2;
    if (period(middle) > seconds) low = middle;
    else high = middle;
  }
  return swingOf(swings, high);
}

/** Maps even playing time, in steps, to where the swing has got to. */
export function createStringClock({ speeds }: StringSwing): SwingClock {
  const times = [0];
  for (const [index, speed] of speeds.entries()) {
    const next = speeds[(index + 1) % speeds.length]!;
    times.push(times[index]! + (1 / speed + 1 / next) / 2);
  }
  const total = times[times.length - 1]!;

  return (time) => {
    const cycle = Math.floor(time / QFT_TRAJECTORY_STEPS);
    const at = (time / QFT_TRAJECTORY_STEPS - cycle) * total;
    let low = 0;
    let high = times.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (times[middle]! <= at) low = middle;
      else high = middle;
    }
    const part = (at - times[low]!) / (times[high]! - times[low]!);
    return (cycle + (low + part) / speeds.length) * QFT_TRAJECTORY_STEPS;
  };
}
