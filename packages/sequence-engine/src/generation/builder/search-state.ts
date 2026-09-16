/**
 * Search State
 *
 * Tracks the state of beam search during constrained sequence generation.
 * Manages candidate states, beam pruning, and backtracking.
 */

import type {
  SearchState,
  VariationScore,
  PictographData,
  ConstraintSet,
} from "../constraints/types.js";
import { scoreVariation, calculateSequenceScore } from "./variation-scorer.js";

/**
 * Configuration for the beam search algorithm.
 */
export interface BeamSearchConfig {
  /** Number of candidates to keep at each step */
  beamWidth: number;

  /** Maximum backtrack attempts on dead ends */
  maxBacktracks: number;

  /** Minimum acceptable final score (0-1) */
  minAcceptableScore: number;

  /** Whether to allow partial results if no complete sequence found */
  allowPartial: boolean;
}

export const DEFAULT_BEAM_CONFIG: BeamSearchConfig = {
  beamWidth: 10,
  maxBacktracks: 50,
  minAcceptableScore: 0.3,
  allowPartial: true,
};

export function createInitialState(
  startPictograph: PictographData,
  variationIndex: number
): SearchState {
  return {
    steps: [startPictograph],
    cumulativeScore: 1.0, // Start with perfect score
    stepScores: [
      {
        variation: startPictograph,
        variationIndex,
        totalScore: 1.0,
        hardConstraintsSatisfied: true,
        constraintScores: new Map(),
      },
    ],
    currentEndPlacement: startPictograph.endPlacement,
  };
}

/**
 * Extends a search state with a new step.
 * @param isBridge - If true, marks this step index as a bridge letter
 */
export function extendState(
  state: SearchState,
  newStep: PictographData,
  stepScore: VariationScore,
  isBridge: boolean = false
): SearchState {
  const newSteps = [...state.steps, newStep];
  const newStepScores = [...state.stepScores, stepScore];

  // Recalculate cumulative score
  const totalScores = newStepScores.slice(1); // Exclude start placement
  const cumulativeScore =
    totalScores.length > 0
      ? totalScores.reduce((sum, s) => sum + s.totalScore, 0) / totalScores.length
      : 1.0;

  // Copy and extend bridge indices if this is a bridge
  const bridgeStepIndices = new Set(state.bridgeStepIndices);
  if (isBridge) {
    bridgeStepIndices.add(newSteps.length - 1); // Index of the just-added step
  }

  return {
    steps: newSteps,
    cumulativeScore,
    stepScores: newStepScores,
    currentEndPlacement: newStep.endPlacement,
    bridgeStepIndices,
  };
}

export function pruneBeam(
  states: SearchState[],
  beamWidth: number
): SearchState[] {
  // Sort by cumulative score descending
  const sorted = [...states].sort(
    (a, b) => b.cumulativeScore - a.cumulativeScore
  );

  // Keep only the top beamWidth states
  return sorted.slice(0, beamWidth);
}

export function isStateViable(state: SearchState): boolean {
  // All step scores must have hard constraints satisfied
  return state.stepScores.every((s) => s.hardConstraintsSatisfied);
}

export function getViableStates(states: SearchState[]): SearchState[] {
  return states.filter(isStateViable);
}

export function getBestState(
  states: SearchState[],
  minScore: number
): SearchState | null {
  const viable = getViableStates(states);
  if (viable.length === 0) {
    return null;
  }

  // Sort by score and filter by minimum
  const sorted = viable.sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  const best = sorted[0];

  if (best && best.cumulativeScore >= minScore) {
    return best;
  }

  return null;
}

/**
 * Used for reporting.
 */
export function countReversals(state: SearchState): number {
  let reversals = 0;

  for (let i = 1; i < state.steps.length; i++) {
    const prev = state.steps[i - 1];
    const curr = state.steps[i];
    if (!prev || !curr) continue;

    // Check left hand
    if (isDirectionChange(prev.leftMotion.rotationDirection, curr.leftMotion.rotationDirection)) {
      reversals++;
    }

    // Check right hand
    if (isDirectionChange(prev.rightMotion.rotationDirection, curr.rightMotion.rotationDirection)) {
      reversals++;
    }
  }

  return reversals;
}

function isDirectionChange(prev: string, curr: string): boolean {
  if (prev === "no_rot" || prev === "noRotation" || curr === "no_rot" || curr === "noRotation") {
    return false;
  }
  return (
    (prev === "cw" && curr === "ccw") ||
    (prev === "ccw" && curr === "cw")
  );
}

export function calculateContinuityPercentage(state: SearchState): number {
  if (state.steps.length <= 1) {
    return 100;
  }

  let continuousTransitions = 0;
  let totalTransitions = 0;

  for (let i = 1; i < state.steps.length; i++) {
    const prev = state.steps[i - 1];
    const curr = state.steps[i];
    if (!prev || !curr) continue;

    // Check left hand
    const leftStatic =
      prev.leftMotion.motionType === "static" ||
      curr.leftMotion.motionType === "static";
    if (!leftStatic) {
      totalTransitions++;
      if (!isDirectionChange(prev.leftMotion.rotationDirection, curr.leftMotion.rotationDirection)) {
        continuousTransitions++;
      }
    }

    // Check right hand
    const rightStatic =
      prev.rightMotion.motionType === "static" ||
      curr.rightMotion.motionType === "static";
    if (!rightStatic) {
      totalTransitions++;
      if (!isDirectionChange(prev.rightMotion.rotationDirection, curr.rightMotion.rotationDirection)) {
        continuousTransitions++;
      }
    }
  }

  if (totalTransitions === 0) {
    return 100;
  }

  return Math.round((continuousTransitions / totalTransitions) * 100);
}
