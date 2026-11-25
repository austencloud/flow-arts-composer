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

import type { RotatingFlower } from "../flowers/flower-signature.js";
import type { VtgMode } from "../elements/vtg-modes.js";
import { norm, type QftKnobs } from "../qft/qft-model.js";
import { relateHands } from "./poi-hand-relation.js";
import { trajectoryFromKnobs, type QftTrajectory } from "./poi-trajectory.js";

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

/** Two flowers in one timing and direction. Flowers can always be related. */
export function realizationToTrajectories(
  left: RotatingFlower,
  right: RotatingFlower,
  mode: VtgMode,
  radii: { left?: number; right?: number } = {}
): { left: QftTrajectory; right: QftTrajectory } {
  const leftHand = flowerToTrajectory(left, radii.left);
  const related = relateHands(
    leftHand,
    flowerToTrajectory(right, radii.right),
    mode,
    leftHand.handPhase ?? 0
  );
  if (!related) throw new Error("Flowers can take any timing and direction.");
  return related;
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
 * comparable at a glance. Red starts partway along its own flower, which stays
 * where it was drawn: the prop has turned as far as that much hand path takes
 * it, measured from the hand.
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

  const offset = TIMING_OFFSET[timing];
  const turnPerHandStep =
    (rightKnobs.spin === "inspin" ? 1 : -1) * rightKnobs.downbeats - 1;

  return {
    left: leftKnobs,
    right: {
      ...rightKnobs,
      handPhase: (rightKnobs.handPhase ?? 0) + offset,
      phase: norm((rightKnobs.phase ?? 0) + turnPerHandStep * offset) % 8,
      handDirection: opposed ? -1 : 1,
    },
  };
}
