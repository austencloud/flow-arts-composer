/**
 * Constraint System Types
 *
 * Core interfaces for the constraint-based sequence generation system.
 */

import type { ConstraintType, ConstraintMode } from "./constraint-types.js";
import type { MotionData } from "../../core/types/sequence-engine-types.js";
import type { TurnValue } from "../turns/TurnMaterializer.js";

export type { MotionData };


export interface PictographData {
  letter: string;
  startPosition: string;
  endPosition: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}


/**
 * Context passed to constraints for evaluation.
 * Includes the current sequence state and candidate variation.
 */
export interface ConstraintContext {
  /** Index of the current step being evaluated (0-based, excluding start position) */
  stepIndex: number;

  /** Total number of steps in the sequence (excluding start position) */
  totalSteps: number;

  /** Previously selected variations in the sequence */
  previousSteps: PictographData[];

  /** The candidate variation being evaluated */
  candidate: PictographData;

  /** The letter being placed at this step */
  letter: string;

  /** Current level (determines which turns/orientations are available) */
  level?: number;

  /** Turn allocation for this step's motions */
  turnAllocation?: { left: number; right: number };

  /** Exact assignments: floats become zero turns on static and dash motions. */
  assignedTurns?: { left: TurnValue; right: TurnValue };

  /** Grid mode (e.g. "diamond", "box") */
  gridMode?: string;

  /** Prop type (e.g. "staff", "fan", "club") */
  propType?: string;
}

/**
 * Result of constraint evaluation.
 */
export interface ConstraintScore {
  /** Score between 0 (worst) and 1 (best) */
  score: number;

  /** Whether the constraint is satisfied (for hard constraints) */
  satisfied: boolean;

  /** Human-readable reason for the score */
  reason: string;
}

/**
 * Base interface for all constraints.
 */
export interface IConstraint {
  /** Unique type identifier */
  readonly type: ConstraintType;

  /** Whether this is a hard (must satisfy) or soft (best-effort) constraint */
  readonly mode: ConstraintMode;

  /** Human-readable description */
  readonly description: string;

  /**
   * Evaluate how well a candidate variation satisfies this constraint.
   * @param context The current sequence state and candidate
   * @returns Score and satisfaction status
   */
  evaluate(context: ConstraintContext): ConstraintScore;
}

/**
 * Constraint that operates on individual variations (stateless).
 * Most constraints implement this interface.
 */
export interface IVariationConstraint extends IConstraint {
  /**
   * Quick check if a variation could possibly satisfy this constraint.
   * Used for early filtering before full scoring.
   */
  couldSatisfy?(candidate: PictographData): boolean;
}

/**
 * Constraint that operates on the full sequence.
 * Used for pattern-based constraints (alternating, etc.)
 */
export interface ISequenceConstraint extends IConstraint {
  /**
   * Called after sequence is complete for final scoring.
   */
  evaluateSequence(steps: PictographData[]): ConstraintScore;
}


/**
 * A set of constraints to apply during generation.
 */
export interface ConstraintSet {
  /** Hard constraints (must all be satisfied) */
  hard: IConstraint[];

  /** Soft constraints (contribute to score) */
  soft: IConstraint[];

  /** Weights for soft constraints (default 1.0) */
  weights?: Map<ConstraintType, number>;
}


/**
 * Detailed scoring result for a candidate variation.
 */
export interface VariationScore {
  /** The variation being scored */
  variation: PictographData;

  /** Index of this variation in the letter's variations */
  variationIndex: number;

  /** Total weighted score (0-1) */
  totalScore: number;

  /** Whether all hard constraints are satisfied */
  hardConstraintsSatisfied: boolean;

  /** Individual constraint scores */
  constraintScores: Map<ConstraintType, ConstraintScore>;
}


/**
 * State of a partial sequence during beam search.
 */
export interface SearchState {
  /** Sequence of selected variations so far */
  steps: PictographData[];

  /** Cumulative score so far */
  cumulativeScore: number;

  /** Per-step scores for reporting */
  stepScores: VariationScore[];

  /** Current end position (for position continuity) */
  currentEndPosition: string;

  /** Indices of steps that are bridge letters (not user-requested letters) */
  bridgeStepIndices?: Set<number>;
}


/**
 * Report on how well a generated sequence satisfies constraints.
 */
export interface ConstraintReport {
  /** Overall score (0-1) */
  score: number;

  /** Whether all hard constraints were satisfied */
  satisfied: boolean;

  /** Individual constraint results */
  details: ConstraintDetail[];

  /** Confidence of the parser (0-1), if constraints were parsed from text */
  parseConfidence?: number;

  /** Tokens that couldn't be parsed */
  unrecognized?: string[];
}

/**
 * Detail for a single constraint in the report.
 */
export interface ConstraintDetail {
  /** Constraint type */
  constraint: ConstraintType;

  /** Score achieved (0-1) */
  score: number;

  /** Human-readable description of the result */
  description: string;

  /** Whether this was a hard or soft constraint */
  mode: ConstraintMode;
}
