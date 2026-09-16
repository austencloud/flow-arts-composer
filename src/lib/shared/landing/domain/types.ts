/**
 * Endless Spinner Orchestrator Interface
 *
 * Manages continuous sequence playback by chaining sequences together seamlessly.
 * When one sequence ends, finds another that starts where the previous ended.
 */

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

/**
 * Represents the end state of a sequence that must be matched
 * for seamless transition to the next sequence.
 */
export interface EndState {
  /** Grid placement where props end (e.g., BETA3, ALPHA1) */
  placement: GridPlacement | null;
  /** Left prop's end orientation (in, out, clock, counter) */
  leftOrientation: Orientation | null;
  /** Right prop's end orientation */
  rightOrientation: Orientation | null;
}

/**
 * Placement groups for bridge generation.
 * Used when no direct match exists and we need to generate
 * a freeform sequence to transition to a new area.
 */
export type PlacementGroup = "alpha" | "beta" | "gamma";

/**
 * Statistics about the endless playback session.
 */
export interface SpinnerStats {
  /** Total sequences played in this session */
  sequencesPlayed: number;
  /** Number of unique sequences used */
  uniqueSequencesUsed: number;
  /** Direct matches (exact start state match) */
  directMatches: number;
  /** Rotated matches (sequence rotated to match) */
  rotatedMatches: number;
  /** Bridge sequences generated */
  bridgesGenerated: number;
}
