// src/generation/turns/left-spin-rule.ts
/**
 * Which way the left hand's dash or static spins once it gains turns, given
 * the right hand's direction. Props win: a prop relationship fixes the spin
 * relation outright, hand relationship or not. Otherwise "Match turns" plus
 * a hand relationship decides (a mirrored dash spins the other way from its
 * partner). Undefined leaves the materializer to continuity or a coin flip.
 *
 * The beam enrichment and postProcess both apply the same rule, so what the
 * constraints saw during the search is what the sequence ends up with.
 */
import {
  relatedRotationDirection,
  type HandRelationshipOptions,
} from "../constraints/style/hand-relationship-constraint.js";
import {
  propRelatedRotationDirection,
  type PropRelationshipOptions,
} from "../constraints/style/prop-relationship-constraint.js";

export type LeftSpinRule = (
  rightDirection: string | undefined
) => "cw" | "ccw" | undefined;

export function resolveLeftSpinRule(input: {
  handRelationship?: HandRelationshipOptions;
  propRelationship?: PropRelationshipOptions;
  matchHandTurns?: boolean;
}): LeftSpinRule | undefined {
  if (input.propRelationship) {
    const direction = input.propRelationship.direction;
    return (right) => propRelatedRotationDirection(right, direction);
  }
  if (input.matchHandTurns && input.handRelationship) {
    const relationship = input.handRelationship;
    return (right) => relatedRotationDirection(right, relationship);
  }
  return undefined;
}
