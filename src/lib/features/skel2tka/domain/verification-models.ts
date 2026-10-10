/**
 * Verification Domain Models
 *
 * Types for the human-in-the-loop verification system.
 * Every phase gate produces a verdict: accepted, corrected, or rejected.
 * Corrections become training data for future AI models.
 */

import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/** The three possible outcomes of a phase verification */
export type PhaseVerdict = "accepted" | "corrected" | "rejected";

/** What field was corrected by the user */
export type CorrectionField =
  | "hand_position"
  | "beat_boundary"
  | "position_label"
  | "endpoint_position"
  | "thumb_vs_pinky"
  | "staff_angle"
  | "turn_count"
  | "direction"
  | "orientation"
  | "motion_type"
  | "letter_type"
  | "pictograph_data";

/** A single correction made by the user */
export interface UserCorrection {
  /** Which beat was corrected (0-indexed) */
  stepNumber: number;

  /** Which field was wrong */
  field: CorrectionField;

  /** Which hand, if applicable */
  hand?: "left" | "right";

  /** What the pipeline detected */
  detectedValue: string;

  /** What the user says is correct */
  correctedValue: string;

  /** Optional free-text note from the user */
  note?: string;
}

/** Hand position correction with grid location picker */
export interface HandPositionCorrection extends UserCorrection {
  field: "hand_position";
  detectedValue: GridLocation;
  correctedValue: GridLocation;
  hand: "left" | "right";
}

/** Complete result of a phase verification */
export interface PhaseVerificationResult {
  /** Which phase was verified */
  phase: number;

  /** The overall verdict */
  verdict: PhaseVerdict;

  /** Corrections if verdict is "corrected" */
  corrections: UserCorrection[];

  /** When the verification happened */
  timestamp: number;

  /** How long the user spent verifying (ms) */
  verificationDurationMs: number;

  /** Optional note from the user */
  note?: string;
}

/** Severity level for a sanity check */
export type SanityCheckSeverity = "pass" | "warning" | "fail";

/** Result of a single automated sanity check */
export interface SanityCheckResult {
  /** Human-readable name of the check */
  name: string;

  /** What was checked */
  description: string;

  /** Pass, warning, or fail */
  severity: SanityCheckSeverity;

  /** The actual value measured */
  actualValue: number | string;

  /** The threshold it was compared against */
  threshold: number | string;

  /** Human-readable detail message */
  message: string;
}

/** Aggregated results of all sanity checks for a phase */
export interface SanityCheckReport {
  /** Which phase these checks are for */
  phase: number;

  /** Individual check results */
  checks: SanityCheckResult[];

  /** Overall pass (all pass), warning (some warnings), or fail (any fails) */
  overallSeverity: SanityCheckSeverity;

  /** Timestamp of the check run */
  timestamp: number;
}
