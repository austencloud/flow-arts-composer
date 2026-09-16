/**
 * Transition Analyzer
 *
 * Analyzes letter-to-letter transitions to determine:
 * 1. Which constraints are satisfiable for a given transition
 * 2. What makes certain word combinations impossible
 * 3. Builds knowledge for explaining failures to users
 *
 * This enables us to:
 * - Tell users upfront when their request is impossible
 * - Explain WHY it's impossible (e.g., "E→K requires a hand reversal")
 * - Suggest alternatives that would work
 */

import type { PictographData } from "../types.js";
import { getHandpathDirection, HandPath } from "../style/hand-path-constraint.js";

/**
 * Analysis result for a single letter-to-letter transition.
 */
export interface TransitionAnalysis {
  fromLetter: string;
  toLetter: string;
  /** Total valid variations (position matches) */
  totalValidTransitions: number;
  /** How many have no hand path reversals */
  noHandReversalCount: number;
  /** How many have no prop reversals */
  noPropReversalCount: number;
  /** How many have both hands reverse */
  bothHandsReverseCount: number;
  /** Can this transition satisfy "no handpath reversals"? */
  canAvoidHandReversal: boolean;
  /** Can this transition satisfy "no prop reversals"? */
  canAvoidPropReversal: boolean;
  /** Example variation pairs that work for each constraint */
  examples: {
    noHandReversal?: { fromVariation: number; toVariation: number };
    noPropReversal?: { fromVariation: number; toVariation: number };
  };
}

/**
 * Analysis result for an entire word.
 */
export interface WordAnalysis {
  word: string;
  letters: string[];
  transitions: TransitionAnalysis[];
  /** Can the entire word be done with no handpath reversals? */
  canAvoidAllHandReversals: boolean;
  /** Can the entire word be done with no prop reversals? */
  canAvoidAllPropReversals: boolean;
  /** Which transitions block "no hand reversal"? */
  handReversalBlockers: string[];
  /** Which transitions block "no prop reversal"? */
  propReversalBlockers: string[];
}

function hasHandReversal(from: PictographData, to: PictographData): { left: boolean; right: boolean } {
  const fromLeftHandPath = getHandpathDirection(
    from.leftMotion.startLocation,
    from.leftMotion.endLocation
  );
  const toLeftHandPath = getHandpathDirection(
    to.leftMotion.startLocation,
    to.leftMotion.endLocation
  );
  const fromRightHandPath = getHandpathDirection(
    from.rightMotion.startLocation,
    from.rightMotion.endLocation
  );
  const toRightHandPath = getHandpathDirection(
    to.rightMotion.startLocation,
    to.rightMotion.endLocation
  );

  // Only cw ↔ ccw is a reversal (dash/static are neutral)
  const leftReversal =
    (fromLeftHandPath === HandPath.CLOCKWISE && toLeftHandPath === HandPath.COUNTER_CLOCKWISE) ||
    (fromLeftHandPath === HandPath.COUNTER_CLOCKWISE && toLeftHandPath === HandPath.CLOCKWISE);
  const rightReversal =
    (fromRightHandPath === HandPath.CLOCKWISE && toRightHandPath === HandPath.COUNTER_CLOCKWISE) ||
    (fromRightHandPath === HandPath.COUNTER_CLOCKWISE && toRightHandPath === HandPath.CLOCKWISE);

  return { left: leftReversal, right: rightReversal };
}

function hasPropReversal(from: PictographData, to: PictographData): { left: boolean; right: boolean } {
  // Get effective prop rotation (considering motion type)
  const fromLeftRotation = getEffectivePropRotation(from.leftMotion);
  const toLeftRotation = getEffectivePropRotation(to.leftMotion);
  const fromRightRotation = getEffectivePropRotation(from.rightMotion);
  const toRightRotation = getEffectivePropRotation(to.rightMotion);

  const leftReversal =
    fromLeftRotation !== null &&
    toLeftRotation !== null &&
    fromLeftRotation !== toLeftRotation;
  const rightReversal =
    fromRightRotation !== null &&
    toRightRotation !== null &&
    fromRightRotation !== toRightRotation;

  return { left: leftReversal, right: rightReversal };
}

/**
 * Returns null for static motions (no rotation).
 */
function getEffectivePropRotation(motion: PictographData["leftMotion"]): "cw" | "ccw" | null {
  if (motion.motionType === "static") {
    return null;
  }
  return motion.rotationDirection as "cw" | "ccw";
}

export function analyzeTransition(
  fromLetter: string,
  toLetter: string,
  fromVariations: PictographData[],
  toVariations: PictographData[]
): TransitionAnalysis {
  let totalValid = 0;
  let noHandReversalCount = 0;
  let noPropReversalCount = 0;
  let bothHandsReverseCount = 0;
  let noHandReversalExample: { fromVariation: number; toVariation: number } | undefined;
  let noPropReversalExample: { fromVariation: number; toVariation: number } | undefined;

  for (let fromIdx = 0; fromIdx < fromVariations.length; fromIdx++) {
    const from = fromVariations[fromIdx];
    if (!from) continue;

    for (let toIdx = 0; toIdx < toVariations.length; toIdx++) {
      const to = toVariations[toIdx];
      if (!to) continue;

      // Check if positions match (end of from = start of to)
      if (from.endPlacement !== to.startPlacement) {
        continue;
      }

      totalValid++;

      const handRev = hasHandReversal(from, to);
      const propRev = hasPropReversal(from, to);

      // No hand reversal?
      if (!handRev.left && !handRev.right) {
        noHandReversalCount++;
        if (!noHandReversalExample) {
          noHandReversalExample = { fromVariation: fromIdx, toVariation: toIdx };
        }
      }

      // No prop reversal?
      if (!propRev.left && !propRev.right) {
        noPropReversalCount++;
        if (!noPropReversalExample) {
          noPropReversalExample = { fromVariation: fromIdx, toVariation: toIdx };
        }
      }

      // Both hands reverse?
      if (handRev.left && handRev.right) {
        bothHandsReverseCount++;
      }
    }
  }

  return {
    fromLetter,
    toLetter,
    totalValidTransitions: totalValid,
    noHandReversalCount,
    noPropReversalCount,
    bothHandsReverseCount,
    canAvoidHandReversal: noHandReversalCount > 0,
    canAvoidPropReversal: noPropReversalCount > 0,
    examples: {
      noHandReversal: noHandReversalExample,
      noPropReversal: noPropReversalExample,
    },
  };
}

export function analyzeWord(
  word: string,
  letters: string[],
  getVariationsForLetter: (letter: string) => PictographData[]
): WordAnalysis {
  const transitions: TransitionAnalysis[] = [];
  const handReversalBlockers: string[] = [];
  const propReversalBlockers: string[] = [];

  for (let i = 0; i < letters.length - 1; i++) {
    const fromLetter = letters[i]!;
    const toLetter = letters[i + 1]!;
    const fromVariations = getVariationsForLetter(fromLetter);
    const toVariations = getVariationsForLetter(toLetter);

    const analysis = analyzeTransition(fromLetter, toLetter, fromVariations, toVariations);
    transitions.push(analysis);

    if (!analysis.canAvoidHandReversal) {
      handReversalBlockers.push(`${fromLetter}→${toLetter}`);
    }
    if (!analysis.canAvoidPropReversal) {
      propReversalBlockers.push(`${fromLetter}→${toLetter}`);
    }
  }

  return {
    word,
    letters,
    transitions,
    canAvoidAllHandReversals: handReversalBlockers.length === 0,
    canAvoidAllPropReversals: propReversalBlockers.length === 0,
    handReversalBlockers,
    propReversalBlockers,
  };
}

/**
 * Generate a human-readable explanation of why a constraint is impossible.
 */
export function explainImpossibility(analysis: WordAnalysis, constraint: "no-hand-reversals" | "no-prop-reversals"): string {
  if (constraint === "no-hand-reversals" && !analysis.canAvoidAllHandReversals) {
    const blockers = analysis.handReversalBlockers;
    if (blockers.length === 1) {
      return `The word "${analysis.word}" cannot be done without handpath reversals because the transition ${blockers[0]} always requires at least one hand to reverse direction.`;
    }
    return `The word "${analysis.word}" cannot be done without handpath reversals. ${blockers.length} transitions always require handpath reversals: ${blockers.join(", ")}.`;
  }

  if (constraint === "no-prop-reversals" && !analysis.canAvoidAllPropReversals) {
    const blockers = analysis.propReversalBlockers;
    if (blockers.length === 1) {
      return `The word "${analysis.word}" cannot be done without prop reversals because the transition ${blockers[0]} always requires at least one prop to change spin direction.`;
    }
    return `The word "${analysis.word}" cannot be done without prop reversals. ${blockers.length} transitions always require prop reversals: ${blockers.join(", ")}.`;
  }

  return "";
}
