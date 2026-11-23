import {
  trajectoryPosesAt,
  QFT_TRAJECTORY_STEPS,
  type QftTrajectory,
} from "#lib/shared/notation/qft/qft-trajectory.js";

/**
 * Swing-shaped playback for the poi reversal teacher.
 *
 * Austen, 2026-11-22, judging sitting 1: a real poi "would slow to reach the
 * extension part. And then speed up on the way down". This does not simulate
 * anything and cannot make a path legal or illegal. It only re-times an
 * existing path so the head moves the way a swinging weight does: slowest at
 * its highest points, fastest at its lowest, by the energy rule
 * speed = sqrt(floor² + drop below the highest point). For a weight on a
 * string under gravity alone that rule is exact, so the turns ease the way a
 * real pendulum's do; the floor only keeps the very top from freezing the
 * picture. Austen asked for easing "that represent gravity and reality a
 * little closer" (2026-11-22). The momentum simulator
 * that tried to decide legality was reverted on purpose; keep this a timing.
 */

/** Hand radius drawn for a "still" hand: a real hand moves a hair. */
export const STILL_HAND_DISPLAY_RADIUS = 0.08;

/** The range the page offers for that swing; "as big as we want" (Austen). */
export const STILL_HAND_RADIUS_RANGE = { min: 0.02, max: 0.6 } as const;

const STILL_RADIUS = 0.01;

/**
 * The path as the stage should draw it. A hand that is perfectly still in the
 * model gets a hair of movement, because "statically moving really wouldn't
 * work. Even just a hair of movement would be necessary" (Austen, 2026-11-22).
 *
 * That movement swings, it does not circle. Of the pendulum he said the hand
 * would "go up to the left part of the circle, and then down to the right part
 * of the circle, and going down every single time. It wouldn't be doing this
 * whole full circle approach for the hand path" (2026-11-22). So the hand
 * rides the poi's own line on its small circle and turns back with it.
 */
export function displayTrajectory(
  trajectory: QftTrajectory,
  stillRadius: number = STILL_HAND_DISPLAY_RADIUS
): QftTrajectory {
  if (!isStillHand(trajectory)) return trajectory;
  return {
    ...trajectory,
    radius: stillRadius,
    handFollowsProp: true,
  };
}

/** True when the model's hand does not move at all. */
export function isStillHand(trajectory: QftTrajectory): boolean {
  return trajectory.radius < STILL_RADIUS;
}

export interface SwingTimingOptions {
  /** Samples across the eight-step cycle. */
  samples?: number;
  /** Speed at the highest point, as a share of the speed gained by falling the whole path height. */
  floor?: number;
}

/**
 * Returns how fast the cursor should move at each point of the cycle, in steps
 * per step-time. One full cycle takes as long as before (eight step-times).
 */
export function createSwingTiming(
  trajectory: QftTrajectory,
  { samples = 960, floor = 0.04 }: SwingTimingOptions = {}
): (cursor: number) => number {
  const dc = QFT_TRAJECTORY_STEPS / samples;
  const poses = Array.from({ length: samples + 1 }, (_, index) =>
    trajectoryPosesAt(trajectory, index * dc)
  );

  const heights = poses.map((pose) => -pose.head.y);
  const top = Math.max(...heights);
  const span = Math.max(1e-6, top - Math.min(...heights));

  const raw = Array.from({ length: samples }, (_, index) => {
    const a = poses[index]!;
    const b = poses[index + 1]!;
    const headSpeed = Math.hypot(b.head.x - a.head.x, b.head.y - a.head.y) / dc;
    const handSpeed = Math.hypot(b.hand.x - a.hand.x, b.hand.y - a.hand.y) / dc;
    // When the head parks (pointing in with the hand circle as long as the
    // string, it sits on the centre), the hand still has to go round.
    const pathSpeed = Math.max(headSpeed, handSpeed * 0.5, 1e-3);
    const midHeight = (-a.head.y - b.head.y) / 2;
    const swingSpeed = Math.sqrt(floor * floor + (top - midHeight) / span);
    return swingSpeed / pathSpeed;
  });

  // Scale so one cycle still takes eight step-times. The bounds only catch a
  // parked head or the very top; a real turn passes well inside them. A few
  // passes settle the scale after clamping.
  let rates = raw;
  for (let pass = 0; pass < 6; pass += 1) {
    const period = rates.reduce((sum, rate) => sum + dc / rate, 0);
    const scale = period / QFT_TRAJECTORY_STEPS;
    rates = rates.map((rate) => Math.min(6, Math.max(0.05, rate * scale)));
  }

  return (cursor: number) => {
    const wrapped =
      ((cursor % QFT_TRAJECTORY_STEPS) + QFT_TRAJECTORY_STEPS) %
      QFT_TRAJECTORY_STEPS;
    return rates[Math.min(samples - 1, Math.floor(wrapped / dc))]!;
  };
}
