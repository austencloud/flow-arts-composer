/**
 * Transition Matrix
 *
 * Pre-computes and caches feasibility data for all letter-to-letter transitions.
 * This enables instant lookups for constraint feasibility without re-analyzing
 * the entire pictograph dataset each time.
 *
 * The matrix answers questions like:
 * - Can A→B be done without handpath reversals?
 * - Does C→D always require a prop reversal?
 * - What's the minimum number of handpath reversals for word "XYZ"?
 */

import type { PictographData } from "../types.js";
import { analyzeTransition, type TransitionAnalysis } from "./transition-analyzer.js";
import { getLetterTransitionGraph } from "../../letter-transition-graph.js";

/**
 * Compact representation of transition feasibility.
 * Stored per from→to letter pair.
 */
export interface TransitionFeasibility {
  /** Number of valid variation combinations (placement matches) */
  validCount: number;
  /** Can this transition avoid hand path reversals? */
  canAvoidHandReversal: boolean;
  /** Can this transition avoid prop spin reversals? */
  canAvoidPropReversal: boolean;
  /** Does this transition ALWAYS require hand reversal? (no escape) */
  alwaysRequiresHandReversal: boolean;
  /** Does this transition ALWAYS require prop reversal? (no escape) */
  alwaysRequiresPropReversal: boolean;
  /** Can this transition PRODUCE a hand reversal? (for "reversal every beat") */
  canProduceHandReversal: boolean;
  /** Can this transition PRODUCE a prop reversal? */
  canProducePropReversal: boolean;
}

/**
 * The full transition matrix.
 * Access via matrix[fromLetter][toLetter]
 */
export type TransitionMatrix = Map<string, Map<string, TransitionFeasibility>>;

export function buildTransitionMatrix(
  allPictographs: PictographData[]
): TransitionMatrix {
  const matrix: TransitionMatrix = new Map();

  // Get all unique letters
  const letters = [...new Set(allPictographs.map((p) => p.letter))].sort();

  // Helper to get variations for a letter
  const getVariations = (letter: string) =>
    allPictographs.filter((p) => p.letter === letter);

  // Analyze every possible transition
  for (const fromLetter of letters) {
    const fromMap = new Map<string, TransitionFeasibility>();

    for (const toLetter of letters) {
      const analysis = analyzeTransition(
        fromLetter,
        toLetter,
        getVariations(fromLetter),
        getVariations(toLetter)
      );

      if (analysis.totalValidTransitions > 0) {
        fromMap.set(toLetter, {
          validCount: analysis.totalValidTransitions,
          canAvoidHandReversal: analysis.canAvoidHandReversal,
          canAvoidPropReversal: analysis.canAvoidPropReversal,
          alwaysRequiresHandReversal: analysis.noHandReversalCount === 0,
          alwaysRequiresPropReversal: analysis.noPropReversalCount === 0,
          canProduceHandReversal:
            analysis.noHandReversalCount < analysis.totalValidTransitions,
          canProducePropReversal:
            analysis.noPropReversalCount < analysis.totalValidTransitions,
        });
      }
    }

    matrix.set(fromLetter, fromMap);
  }

  return matrix;
}

/**
 * Word feasibility analysis result.
 */
export interface WordFeasibility {
  word: string;
  letters: string[];

  /** Can the word be done with NO handpath reversals? */
  canAvoidAllHandReversals: boolean;
  /** Can the word be done with NO prop reversals? */
  canAvoidAllPropReversals: boolean;
  /** Can the word have a hand reversal on EVERY beat? */
  canHaveHandReversalEveryBeat: boolean;
  /** Can the word have a prop reversal on EVERY beat? */
  canHavePropReversalEveryBeat: boolean;

  /** Transitions that ALWAYS require hand reversal (blockers) */
  handReversalBlockers: string[];
  /** Transitions that ALWAYS require prop reversal (blockers) */
  propReversalBlockers: string[];
  /** Transitions that can NEVER produce hand reversal (blockers for "every beat") */
  noHandReversalPossible: string[];
  /** Transitions that can NEVER produce prop reversal */
  noPropReversalPossible: string[];

  /** Minimum possible handpath reversals for this word */
  minHandReversals: number;
  /** Maximum possible handpath reversals for this word */
  maxHandReversals: number;
  /** Minimum possible prop reversals */
  minPropReversals: number;
  /** Maximum possible prop reversals */
  maxPropReversals: number;
}

/**
 * Much faster than re-analyzing all pictographs.
 *
 * NOTE: When no direct transition exists, the system can insert bridge letters
 * to make the transition possible. This function now checks for bridge availability
 * instead of reporting "no valid transition" for bridgeable transitions.
 */
export function analyzeWordFeasibility(
  word: string,
  letters: string[],
  matrix: TransitionMatrix
): WordFeasibility {
  const handReversalBlockers: string[] = [];
  const propReversalBlockers: string[] = [];
  const noHandReversalPossible: string[] = [];
  const noPropReversalPossible: string[] = [];

  let minHandReversals = 0;
  let maxHandReversals = 0;
  let minPropReversals = 0;
  let maxPropReversals = 0;

  // Get transition graph for bridge checking
  const transitionGraph = getLetterTransitionGraph();

  for (let i = 0; i < letters.length - 1; i++) {
    const from = letters[i]!;
    const to = letters[i + 1]!;
    const transition = `${from}→${to}`;

    const feasibility = matrix.get(from)?.get(to);

    if (!feasibility) {
      // No direct transition exists - check if a bridge letter can be used
      const canFollowDirectly = transitionGraph.canFollow(from, to);
      const bridgeOptions = transitionGraph.findAllBridgeOptions(from, to);

      if (canFollowDirectly || bridgeOptions.length > 0) {
        // Bridge available - transition IS possible, just needs an extra letter
        // For constraint analysis, treat bridged transitions conservatively:
        // - They CAN avoid reversals (bridge letter provides flexibility)
        // - They CAN produce reversals (if needed)
        // We don't know the exact bridge behavior without knowing which bridge,
        // so we assume maximum flexibility (all constraints achievable via bridging)
        maxHandReversals++; // Could have reversal
        maxPropReversals++; // Could have reversal
        // Note: We don't add to blockers because bridges provide escape routes
        continue;
      }

      // Truly impossible transition (no direct path AND no bridge available)
      // This should be extremely rare in TKA
      handReversalBlockers.push(transition + " (no valid transition, no bridge)");
      propReversalBlockers.push(transition + " (no valid transition, no bridge)");
      noHandReversalPossible.push(transition + " (no valid transition, no bridge)");
      noPropReversalPossible.push(transition + " (no valid transition, no bridge)");
      continue;
    }

    // Hand reversal analysis
    if (feasibility.alwaysRequiresHandReversal) {
      handReversalBlockers.push(transition);
      minHandReversals++;
      maxHandReversals++;
    } else if (feasibility.canProduceHandReversal) {
      // Optional - can have 0 or 1
      maxHandReversals++;
    }
    // else: can never produce hand reversal

    if (!feasibility.canProduceHandReversal) {
      noHandReversalPossible.push(transition);
    }

    // Prop reversal analysis
    if (feasibility.alwaysRequiresPropReversal) {
      propReversalBlockers.push(transition);
      minPropReversals++;
      maxPropReversals++;
    } else if (feasibility.canProducePropReversal) {
      maxPropReversals++;
    }

    if (!feasibility.canProducePropReversal) {
      noPropReversalPossible.push(transition);
    }
  }

  const totalTransitions = letters.length - 1;

  return {
    word,
    letters,
    canAvoidAllHandReversals: handReversalBlockers.length === 0,
    canAvoidAllPropReversals: propReversalBlockers.length === 0,
    canHaveHandReversalEveryBeat: noHandReversalPossible.length === 0,
    canHavePropReversalEveryBeat: noPropReversalPossible.length === 0,
    handReversalBlockers,
    propReversalBlockers,
    noHandReversalPossible,
    noPropReversalPossible,
    minHandReversals,
    maxHandReversals,
    minPropReversals,
    maxPropReversals,
  };
}

/**
 * Generate suggestions for alternative constraints when the requested one is impossible.
 */
export function suggestAlternatives(feasibility: WordFeasibility): string[] {
  const suggestions: string[] = [];

  // If "no handpath reversals" is impossible but "no prop reversals" is possible
  if (!feasibility.canAvoidAllHandReversals && feasibility.canAvoidAllPropReversals) {
    suggestions.push(
      `Try "smooth-props" preset instead - this word CAN maintain consistent prop spin direction.`
    );
  }

  // If "no prop reversals" is impossible but "no handpath reversals" is possible
  if (!feasibility.canAvoidAllPropReversals && feasibility.canAvoidAllHandReversals) {
    suggestions.push(
      `Try "smooth-hands" preset instead - this word CAN maintain continuous hand paths.`
    );
  }

  // If neither is fully achievable but we can minimize
  if (!feasibility.canAvoidAllHandReversals && !feasibility.canAvoidAllPropReversals) {
    if (feasibility.minHandReversals < feasibility.minPropReversals) {
      suggestions.push(
        `This word requires at least ${feasibility.minHandReversals} hand reversal(s) and ${feasibility.minPropReversals} prop reversal(s). ` +
        `Using "smooth" preset will minimize both.`
      );
    }
  }

  // If "reversal every beat" is impossible
  if (!feasibility.canHaveHandReversalEveryBeat) {
    const maxPossible = feasibility.maxHandReversals;
    const total = feasibility.letters.length - 1;
    suggestions.push(
      `"Hand reversal every beat" is impossible for this word. ` +
      `Maximum achievable: ${maxPossible}/${total} beats with reversals.`
    );
  }

  return suggestions;
}

/**
 * Format a human-readable explanation of why a constraint is impossible.
 */
export function explainConstraintImpossibility(
  feasibility: WordFeasibility,
  constraint: "no-hand-reversals" | "no-prop-reversals" | "hand-reversal-every-beat" | "prop-reversal-every-beat"
): string | null {
  switch (constraint) {
    case "no-hand-reversals":
      if (feasibility.canAvoidAllHandReversals) return null;
      if (feasibility.handReversalBlockers.length === 1) {
        return `The transition ${feasibility.handReversalBlockers[0]} always requires a hand reversal - there's no variation combination that avoids it.`;
      }
      return `${feasibility.handReversalBlockers.length} transitions always require handpath reversals: ${feasibility.handReversalBlockers.join(", ")}.`;

    case "no-prop-reversals":
      if (feasibility.canAvoidAllPropReversals) return null;
      if (feasibility.propReversalBlockers.length === 1) {
        return `The transition ${feasibility.propReversalBlockers[0]} always requires a prop reversal - the prop spin direction must change.`;
      }
      return `${feasibility.propReversalBlockers.length} transitions always require prop reversals: ${feasibility.propReversalBlockers.join(", ")}.`;

    case "hand-reversal-every-beat":
      if (feasibility.canHaveHandReversalEveryBeat) return null;
      if (feasibility.noHandReversalPossible.length === 1) {
        return `The transition ${feasibility.noHandReversalPossible[0]} can never produce a hand reversal - all its variations maintain the same hand path direction.`;
      }
      return `${feasibility.noHandReversalPossible.length} transitions can never produce handpath reversals: ${feasibility.noHandReversalPossible.join(", ")}. Maximum achievable: ${feasibility.maxHandReversals}/${feasibility.letters.length - 1} beats.`;

    case "prop-reversal-every-beat":
      if (feasibility.canHavePropReversalEveryBeat) return null;
      return `${feasibility.noPropReversalPossible.length} transitions can never produce prop reversals: ${feasibility.noPropReversalPossible.join(", ")}.`;
  }
}

// Singleton matrix cache
let cachedMatrix: TransitionMatrix | null = null;
let cachedGridMode: string | null = null;

/**
 * Caches the result for reuse.
 */
export function getTransitionMatrix(
  allPictographs: PictographData[],
  gridMode: string = "diamond"
): TransitionMatrix {
  // Return cached if same grid mode
  if (cachedMatrix && cachedGridMode === gridMode) {
    return cachedMatrix;
  }

  // Build and cache
  cachedMatrix = buildTransitionMatrix(allPictographs);
  cachedGridMode = gridMode;

  return cachedMatrix;
}

export function clearTransitionMatrixCache(): void {
  cachedMatrix = null;
  cachedGridMode = null;
}
