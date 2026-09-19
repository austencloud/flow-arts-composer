/**
 * What the two PROPS are doing to each other at a theory pairing.
 *
 * The element row above the animation names the relationship between the two
 * HANDS. That is only half of a VTG reading, and on the Matrix surface the
 * other half is already on screen: `PropRelationshipChipRow` shows the hand
 * element producing a prop element, because a pair of hands in Split-Same can
 * still be carrying props that are Together-Opposite.
 *
 * The Matrix reads that off a realized sequence's start orientations. A theory
 * ratio has no sequence, which is the whole reason the surface exists, so the
 * bearings come from the same QfT knobs the animation runs on. The three cases
 * and their thresholds live in the engine behind `propTimingBetween`; this
 * module only says where the bearings come from.
 */
import { propTimingBetween, type PropRelationship } from "./prop-relationship";
import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
import { propRateForKnobs, angleOf } from "$lib/shared/notation/qft/qft-model";
import { theoryKnobs, type TheoryFlower } from "./theory-flower";
import type { VtgMode } from "../services/shape-matrix-realizations";

export interface TheoryPair {
  readonly left: TheoryFlower;
  readonly right: TheoryFlower;
}

/**
 * The props' timing and direction, classified from the pairing's own knobs.
 *
 * Direction is the sign each prop turns in, which is constant for the whole
 * path. Timing is the angle between the two props, which is constant only
 * while they turn at the same rate — 1:2 against 1:3 opens and closes that
 * angle every cycle, and there is no timing to name. That is not a gap in the
 * Theory surface; it is the same `direction-only` case the Matrix reports for
 * a pair of unequal turn values.
 */
export function theoryPropRelationship(
  pair: TheoryPair,
  mode: VtgMode
): PropRelationship {
  const left = theoryKnobs(pair.left, "left", mode);
  const right = theoryKnobs(pair.right, "right", mode);
  const leftRate = propRateForKnobs(left);
  const rightRate = propRateForKnobs(right);

  // A prop that never turns is neither clockwise nor counter-clockwise, so a
  // float pairing has no direction to compare, exactly as in the Matrix.
  if (leftRate === 0 || rightRate === 0) {
    return { kind: "float", direction: null, timing: null, element: null };
  }

  const direction = leftRate > 0 === rightRate > 0 ? "same" : "opp";
  if (Math.abs(leftRate) !== Math.abs(rightRate)) {
    return { kind: "direction-only", direction, timing: null, element: null };
  }

  // Both props turn at one rate, so the angle they hold at the downbeat is the
  // angle they hold throughout.
  const timing = propTimingBetween(
    angleOf((left.handPhase ?? 0) + (left.phase ?? 0)),
    angleOf((right.handPhase ?? 0) + (right.phase ?? 0)),
    direction
  );
  const element = TND_BY_FAMILY[`${timing}-${direction}`];
  if (!element) {
    throw new Error(`No element for prop relationship ${timing}-${direction}`);
  }
  return { kind: "full", direction, timing, element };
}
