/**
 * TKA flowers, read as QfT.
 *
 * The shape matrix and QfT describe the same geometry in two notations written
 * fourteen years apart, so this is a translation and not a simulation. The
 * agreement is checkable rather than asserted: TKA counts petals as 2·turns for
 * prospin and 2·turns + 2 for antispin (`flower-signature.ts`), QfT counts them
 * as N−1 for inspin and N+1 for antispin, and those are the same two formulas
 * once N = 2·turns + 1. The petal identity is the test in
 * `__tests__/qft-flower-bridge.test.ts`; it holds for all 56 axis flowers.
 *
 * What each notation is better at is the interesting part. A TKA flower is a
 * shape you can hold in one glance. Its QfT reading is eight rows saying where
 * the prop is and which way it is travelling at every step — the thing you can
 * actually call out to someone across a jam.
 */

import type { RotatingFlower } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import type { QftKnobs } from "./qft-model";
import {
  trajectoryFromKnobs,
  withTrajectoryPhase,
  type QftTrajectory,
} from "./qft-trajectory";

/**
 * Hand-path radius, in prop lengths.
 *
 * TKA's engine puts the cardinal grid points at 150 and calls that the staff's
 * half-length (`mandala-constants.ts` — ENGINE_GRID_RADIUS), so the hand circle
 * and the prop are the same length and the ratio is exactly 1. That is also the
 * radius every flower in the 2011 guide is drawn at, which is not a coincidence:
 * both are describing a prop swung at arm's length.
 *
 * The mandala RENDERER standardizes the tip to 120 to keep fans and staves
 * comparable in one picture, which would read as 1.25 here. That is a drawing
 * convention for a different job, not a claim about the geometry, so it is not
 * the number used.
 */
export const FLOWER_RADIUS = 1;

/**
 * A TKA flower as QfT knobs.
 *
 * `turns` is the only field that carries a conversion: TKA counts a turn as
 * 180° of prop rotation on top of the hand's own revolution, so a t-turn flower
 * is 2t + 1 prop rotations per hand rotation. That is QfT's `downbeats` and
 * the prop-rotation side of the VTG label returned by `ratioLabel`.
 */
export function flowerToKnobs(flower: RotatingFlower): QftKnobs {
  return {
    radius: FLOWER_RADIUS,
    downbeats: 2 * flower.turns + 1,
    spin: flower.style === "pro" ? "inspin" : "antispin",
    /* Radial orientation: the prop points along the hand's own bearing, or
		   straight back down it. Four eighths is half the compass. */
    phase: flower.ori === "out" ? 0 : 4,
    /* Box mode rotates the whole flower 45°, which is one compass position. */
    handPhase: flower.grid === "box" ? 1 : 0,
  };
}

export function flowerToTrajectory(
  flower: RotatingFlower,
  radius = FLOWER_RADIUS
): QftTrajectory {
  return trajectoryFromKnobs({ ...flowerToKnobs(flower), radius });
}

/** Hand offset between the two hands, in eighths, for each VTG timing. */
const TIMING_OFFSET = { T: 0, Q: 2, S: 4 } as const;

/** Apply a VTG relationship to two already-selected QfT hands. */
export function relateTrajectories(
  left: QftTrajectory,
  right: QftTrajectory,
  mode: VtgMode
): { left: QftTrajectory; right: QftTrajectory } {
  const timing = mode[0] as keyof typeof TIMING_OFFSET;
  const opposed = mode[1] === "O";
  const relatedRight = withTrajectoryPhase(right, TIMING_OFFSET[timing]);
  const rightDirection: 1 | -1 = opposed
    ? left.handDirection === 1
      ? -1
      : 1
    : left.handDirection;

  return {
    left,
    right: {
      ...relatedRight,
      handDirection: rightDirection,
    },
  };
}

export function realizationToTrajectories(
  left: RotatingFlower,
  right: RotatingFlower,
  mode: VtgMode,
  radii: { left?: number; right?: number } = {}
): { left: QftTrajectory; right: QftTrajectory } {
  return relateTrajectories(
    flowerToTrajectory(left, radii.left),
    flowerToTrajectory(right, radii.right),
    mode
  );
}

/**
 * A whole matrix cell — two flowers in one VTG mode — as a pair of QfT hands.
 *
 * A cell on its own names two shapes. The mode is what makes it a move: it says
 * where the hands are relative to each other and whether they travel together.
 * Both halves land on the eight-point compass without rounding, which is why
 * this needs no knobs beyond the two the model already grew.
 *
 * Timing is the hand offset: together = same point, quarter = a right angle,
 * split = opposite points. Direction is the sign on the right hand's travel.
 * Blue is left where it is and red carries the whole relationship, so the blue
 * reading of a cell is the same in all six modes — which is what makes the six
 * comparable at a glance.
 */
export function realizationToHands(
  left: RotatingFlower,
  right: RotatingFlower,
  mode: VtgMode
): { left: QftKnobs; right: QftKnobs } {
  const timing = mode[0] as keyof typeof TIMING_OFFSET;
  const opposed = mode[1] === "O";

  const leftKnobs = flowerToKnobs(left);
  const rightKnobs = flowerToKnobs(right);

  return {
    left: leftKnobs,
    right: {
      ...rightKnobs,
      handPhase: (rightKnobs.handPhase ?? 0) + TIMING_OFFSET[timing],
      handDirection: opposed ? -1 : 1,
    },
  };
}
