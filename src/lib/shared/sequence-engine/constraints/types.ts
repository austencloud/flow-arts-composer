/**
 * Constraint System Types
 *
 * Core interfaces for the constraint-based sequence generation system.
 */

import type { ConstraintType, ConstraintMode } from "./constraint-types";

/**
 * Motion data for constraint evaluation.
 */
export interface ConstraintMotionData {
  color: string;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation: string;
  endOrientation: string;
}

/**
 * Pictograph data for constraint evaluation.
 */
export interface ConstraintPictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: ConstraintMotionData;
  rightMotion: ConstraintMotionData;
}

/**
 * Simplified step data for constraint tracking between evaluations.
 * Used internally by generators to track previous steps without full pictograph data.
 */
export interface ConstraintStep {
  letter: string;
  leftMotionType: string;
  rightMotionType: string;
  leftPropRotation: string;
  rightPropRotation: string;
  startPlacement: string;
  endPlacement: string;
  /** Blue hand start location (grid point) */
  leftStartLocation?: string;
  /** Blue hand end location (grid point) */
  leftEndLocation?: string;
  /** Red hand start location (grid point) */
  rightStartLocation?: string;
  /** Red hand end location (grid point) */
  rightEndLocation?: string;
}

/**
 * Context passed to constraints for evaluation.
 */
export interface ConstraintContext {
  /** Index of the current step being evaluated (0-based, excluding start position) */
  stepIndex: number;

  /** Total number of steps in the sequence (excluding start position) */
  totalSteps: number;

  /** Previously selected variations in the sequence */
  previousSteps: ConstraintPictographData[];

  /** The candidate variation being evaluated */
  candidate: ConstraintPictographData;

  /** The letter being placed at this step */
  letter: string;
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
   */
  evaluate(context: ConstraintContext): ConstraintScore;
}

/**
 * Constraint that operates on individual variations (stateless).
 */
export interface IVariationConstraint extends IConstraint {
  /**
   * Quick check if a variation could possibly satisfy this constraint.
   */
  couldSatisfy?(candidate: ConstraintPictographData): boolean;
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
