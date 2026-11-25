/**
 * How fast a round of one or two hands has to go to be real.
 *
 * Moves that keep turning one way are timed by the string alone
 * (`qft-string-swing`). A pendulum has no choice of speed: between its turns it
 * falls and rises, so its slowest time is its own (the elliptic integral, by
 * the swing clock's sum).
 *
 * This times the drawn path. It does not move the hand off it, which a real
 * hand does to push the head along, and it is not the momentum simulator that
 * was reverted on purpose.
 */
import { GRAVITY } from "./poi-string-swing.js";
import {
  createStringClock,
  DEFAULT_POI_LENGTH,
  slowestStringSwing,
  stringSwingFor,
} from "./poi-string-swing.js";
import {
  createSwingClock,
  swingFalls,
  type SwingClock,
} from "./poi-swing-clock.js";
import {
  QFT_TRAJECTORY_STEPS,
  trajectoryHandDirectionAt,
  trajectoryHandIndexAt,
  trajectoryPropIndexAt,
  trajectoryPropRateAt,
  type QftTrajectory,
} from "./poi-trajectory.js";

/** One round when no speed keeps any string tight: the notation's old pace. */
export const NOTATION_ROUND_SECONDS = 8.8;

const SAMPLES_PER_STEP = 90;
const TOLERANCE = 1e-9;
/** A spin that throws the head outward less than this share of its turn does
 *  not hold it up, however fast it goes: the needed speed runs off to infinity. */
const NO_SPIN = 1e-3;

const angle = (index: number) => (index * Math.PI) / 4;

/**
 * The longest one eight-step round may take on a real string, in seconds, or
 * null when no speed keeps the string tight on this path. A path the string
 * cannot time by itself, where the hand has to help, gets only the pull along
 * the string, at an even pace.
 */
export function slowestRoundSeconds(
  trajectory: QftTrajectory,
  poiLength = DEFAULT_POI_LENGTH
): number | null {
  const swing = slowestStringSwing(trajectory, poiLength);
  return swing ? swing.seconds : evenRoundSeconds(trajectory, poiLength);
}

function evenRoundSeconds(
  trajectory: QftTrajectory,
  poiLength: number
): number | null {
  let slowest = Infinity;
  const falling = new Set<number>();
  for (const { from, length, root } of swingFalls(trajectory)) {
    const seconds = root * Math.sqrt(poiLength / (2 * GRAVITY));
    slowest = Math.min(slowest, (seconds * QFT_TRAJECTORY_STEPS) / length);
    for (let step = 0; step < length; step += 1) {
      falling.add((from + step) % QFT_TRAJECTORY_STEPS);
    }
  }

  /* Smallest and largest w^2 that keep the pull from going below zero. */
  let least = 0;
  let most = Infinity;
  for (let step = 0; step < QFT_TRAJECTORY_STEPS; step += 1) {
    if (falling.has(step)) continue;
    const handRate = trajectoryHandDirectionAt(trajectory, step);
    const propRate = trajectoryPropRateAt(trajectory, step);
    for (let sample = 0; sample < SAMPLES_PER_STEP; sample += 1) {
      const cursor = step + sample / SAMPLES_PER_STEP;
      const prop = angle(trajectoryPropIndexAt(trajectory, cursor));
      const hand = angle(trajectoryHandIndexAt(trajectory, cursor));
      const outward =
        poiLength *
        (propRate ** 2 +
          trajectory.radius * handRate ** 2 * Math.cos(prop - hand));
      const weight = GRAVITY * Math.cos(prop);

      if (Math.abs(outward) < NO_SPIN * poiLength) {
        if (weight > TOLERANCE) return null;
      } else if (outward > 0) {
        least = Math.max(least, weight / outward);
      } else {
        most = Math.min(most, weight / outward);
      }
    }
  }
  if (least > most) return null;
  if (least > 0) {
    slowest = Math.min(slowest, (2 * Math.PI) / Math.sqrt(least));
  }
  return slowest;
}

export type PaceHand = "left" | "right";

export interface RealPace {
  /** One eight-step round at the slowest real speed. */
  seconds: number;
  /** The hand whose string needs that speed; null when both, or neither. */
  setBy: PaceHand | null;
  /** Hands whose string no speed keeps tight on this path. */
  slack: PaceHand[];
}

/** Both hands share one round, so the hand that must go faster sets it. */
export function realPace(
  hands: { left: QftTrajectory; right?: QftTrajectory },
  poiLength = DEFAULT_POI_LENGTH
): RealPace {
  const left = slowestRoundSeconds(hands.left, poiLength);
  const right = hands.right
    ? slowestRoundSeconds(hands.right, poiLength)
    : undefined;

  const slack: PaceHand[] = [];
  if (left === null) slack.push("left");
  if (right === null) slack.push("right");

  const seconds = Math.min(left ?? Infinity, right ?? Infinity);
  if (!Number.isFinite(seconds)) {
    return { seconds: NOTATION_ROUND_SECONDS, setBy: null, slack };
  }
  const tied =
    typeof left === "number" &&
    typeof right === "number" &&
    Math.abs(left - right) < 1e-6;
  return {
    seconds,
    setBy: tied ? null : left === seconds ? "left" : "right",
    slack,
  };
}

/**
 * Where a hand is in its eight steps at each moment of a round this long. Two
 * hands set off together each round; between, each keeps its own swing.
 */
export function createRoundClock(
  trajectory: QftTrajectory,
  seconds: number,
  poiLength = DEFAULT_POI_LENGTH
): SwingClock {
  const swing = stringSwingFor(trajectory, seconds, poiLength);
  return swing ? createStringClock(swing) : createSwingClock(trajectory);
}
