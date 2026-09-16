/**
 * Spell Tab Domain Models
 *
 * Models for the word-to-sequence generation feature ("Spell" tab).
 * Handles converting typed words into valid TKA sequences with bridge letters.
 */

import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GridPlacement, GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { ConstraintPresetId } from "$lib/shared/sequence-engine/constraints";

/**
 * Describes a single LOOP option available for extension.
 * Structural copy from LOOPValidator to avoid shared/ → features/ import.
 */
export interface LOOPOption {
  /** The LOOP type */
  loopType: LOOPType;
  /** Human-readable name */
  name: string;
  /** Short description of what this LOOP does */
  description: string;
  /** Icon class (FontAwesome) */
  icon: string;
}

/**
 * Describes the type of extension available for a sequence.
 * Structural copy from SequenceExtender to avoid shared/ → features/ import.
 */
export type ExtensionType =
  | "already_complete"
  | "half_rotation"
  | "quarter_rotation"
  | "not_extendable";

/**
 * Result of analyzing whether a sequence can be extended.
 * Structural copy from SequenceExtender to avoid shared/ → features/ import.
 */
export interface ExtensionAnalysis {
  /** Whether extension is available */
  canExtend: boolean;
  /** The type of extension possible */
  extensionType: ExtensionType;
  /** Start placement of the sequence */
  startPlacement: GridPlacement | null;
  /** Current end placement of the sequence */
  currentEndPlacement: GridPlacement | null;
  /** Available LOOP options for extension */
  availableLOOPOptions: LOOPOption[];
  /** Unavailable LOOP options */
  unavailableLOOPOptions: LOOPOption[];
  /** Human-readable description of the extension */
  description: string;
}

/**
 * Tracks whether a letter in the sequence is original (user-typed) or a bridge (interpolated)
 */
export interface LetterSource {
  /** The letter in the sequence */
  letter: Letter;
  /** True if user typed this letter, false if it was interpolated as a bridge */
  isOriginal: boolean;
  /** The step index in the final sequence (1-indexed, after start placement) */
  stepIndex: number;
}

/**
 * User preferences for sequence generation
 */
export interface SpellPreferences {
  /** Target step count (exact length), or null for any length */
  targetStepCount: number | null;
  /** Motion type filter: 'prefer-dash' = favor dashes when available, 'no-dash' = no dash motions, null = any */
  motionTypeFilter: "prefer-dash" | "no-dash" | null;
  /** Maximum allowed reversals: 0 = none, 1-2 = few, null = any */
  maxReversals: number | null;
  /** Prefer high continuity (same rotation direction) */
  highContinuity: boolean;
  /** Hand path reversal mode: 'smooth' = minimize, 'mixed' = balanced, 'choppy' = maximize */
  handPathMode: "smooth" | "mixed" | "choppy";
  /** Generate a circular (LOOP) sequence that returns to start */
  makeCircular: boolean;
  /** Selected LOOP type when makeCircular is true (null = show options after generation) */
  selectedLOOPType: LOOPType | null;
  /** Constraint preset for variation selection */
  constraintPreset: ConstraintPresetId;
}

/**
 * Statistics calculated from a generated sequence
 */
export interface SequenceStats {
  /** Total number of steps */
  totalSteps: number;
  /** Number of prop reversals (blue + red combined) */
  propReversals: number;
  /** Number of dash motions in the sequence */
  dashCount: number;
  /** Number of hand path direction changes */
  handPathChanges: number;
  /** Percentage of steps with prop continuity (no reversal) */
  propContinuityPercent: number;
  /** Percentage of steps with hand path continuity (no change) */
  handPathContinuityPercent: number;
}

/**
 * Constraints for variation exploration.
 * Used to filter and prune variations during generation rather than after.
 */
export interface VariationConstraints {
  /** Exact step count to target, or null for any */
  targetStepCount: number | null;
  /** Motion type filter: 'prefer-dash' favors dashes, 'no-dash' excluded, or null for any */
  motionTypeFilter: "prefer-dash" | "no-dash" | null;
  /** Maximum allowed reversals: 0 = none, 1-2 = few, null = any */
  maxReversals: number | null;
  /** Minimum continuity score (0-1), or null for any */
  minContinuityScore: number | null;
  /** Allowed letter types (1-6), or null for all types */
  allowedLetterTypes: number[] | null;
  /** Whether sequence must be circular (return to start) */
  requiresCircular: boolean;
  /** LOOP type to use when requiresCircular is true (null = default "REWOUND") */
  loopType: LOOPType | null;
}

/**
 * Option for making a non-loopable sequence circular
 * When a sequence ends at a different placement group than it starts,
 * we need bridge letters to get back to the starting group
 */
export interface CircularizationOption {
  /** Bridge letters needed to reach a loopable placement */
  bridgeLetters: Letter[];
  /** The placement we'd end at after adding bridge letters */
  endPlacement: string;
  /** Available LOOP types for this ending placement */
  availableLOOPs: LOOPOption[];
  /** Description for UI display */
  description: string;
}

/**
 * Result of word-to-sequence generation
 */
export interface SpellResult {
  /** The generated sequence data — null when generation failed (`success` is false) */
  sequence: SequenceData | null;
  /** The original word the user typed */
  originalWord: string;
  /** The expanded word including bridge letters */
  expandedWord: string;
  /** Detailed information about each letter's source */
  letterSources: LetterSource[];
  /** Whether generation was successful */
  success: boolean;
  /** Error message if generation failed */
  error?: string;
  /** LOOP analysis for the generated sequence (available extension options) */
  loopAnalysis?: ExtensionAnalysis;
  /**
   * When sequence isn't directly loopable, these are options to make it circular
   * Each option shows bridge letters needed and resulting LOOP choices
   */
  circularizationOptions?: CircularizationOption[];
  /** Reason why direct LOOP isn't available (e.g., "Ends at gamma, needs to reach alpha") */
  directLoopUnavailableReason?: string;
}

/**
 * Information about a letter's placement transitions
 * Used internally by the LetterTransitionGraph
 */
export interface LetterPlacementInfo {
  letter: Letter;
  startPlacementGroup: GridPlacementGroup;
  endPlacementGroup: GridPlacementGroup;
  category: LetterCategory;
}

/**
 * Categories of letters based on motion type
 */
export type LetterCategory =
  | "dual-shift"
  | "shift"
  | "cross-shift"
  | "dash"
  | "dual-dash"
  | "static";

/**
 * Options for generating a sequence from a word
 */
export interface SpellGenerationOptions {
  /** The word to convert to a sequence */
  word: string;
  /** User preferences for generation */
  preferences: SpellPreferences;
  /** Optional: specific start placement to use */
  startPlacement?: GridPlacementGroup;
  /** Optional: seed for randomization (for reproducible results) */
  seed?: number;
  /**
   * Optional: Force a specific bridge letter to be appended for circularization.
   * When provided, this bridge letter will be added at the end of the sequence
   * before applying the LOOP (useful when user selects a circularization option).
   */
  forceBridgeLetter?: Letter;
}

/**
 * Alias mapping for Greek letter input
 * Maps typed text to the corresponding Greek letter
 */
export interface LetterAlias {
  /** The typed text (e.g., "sigma") */
  alias: string;
  /** The actual letter (e.g., "Σ") */
  letter: Letter;
}

// Re-export LOOP types for convenience
export type { LOOPType };
