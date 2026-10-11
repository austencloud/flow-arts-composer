/**
 * Poi Domain Models
 *
 * Type definitions for poi constraint validation and VTG terminology mapping.
 */

import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PoiMotionValidity, PoiTimingDirection, PoiPatternRatio } from "./poi-enums";

/**
 * A single constraint violation detected in a poi motion or transition.
 */
export interface PoiConstraintViolation {
  /** The type of violation */
  readonly violation: PoiMotionValidity;
  /** Human-readable explanation of the violation */
  readonly message: string;
  /** Which hand's motion caused the violation */
  readonly motionHand: HandSide;
}

/**
 * Result of validating poi constraints on a motion, transition, or sequence.
 */
export interface PoiValidationResult {
  /** True if all constraints pass */
  readonly isValid: boolean;
  /** List of violations (empty if valid) */
  readonly violations: readonly PoiConstraintViolation[];
}

/**
 * Mapping between TKA concepts and VTG terminology for a pictograph.
 */
export interface VTGTerminologyMapping {
  /** Combined motion types, e.g., "pro/pro" or "anti/pro" */
  readonly tkaMotionType: string;
  /** VTG timing/direction combo (T/S, S/O, etc.) */
  readonly vtgTiming: PoiTimingDirection;
  /** VTG pattern ratio (1:1, 1:3, 1:5) */
  readonly vtgRatio: PoiPatternRatio;
}
