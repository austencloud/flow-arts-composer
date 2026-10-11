import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { VariationConstraints } from "../domain/models/spell-models";
import type { ConstraintSet } from "#lib/shared/sequence-engine/constraints/types.js";
import type { LetterSource } from "../domain/models/spell-models";
import type { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { SpellPreferences } from "../domain/models/spell-models";

/**
 * Details about an orientation continuity error
 */
export interface OrientationContinuityError {
  /** The step index where the error occurs */
  stepIndex: number;
  /** The hand that has the orientation break */
  hand: HandSide;
  /** Expected start orientation (from previous beat's end) */
  expectedStartOrientation: string;
  /** Actual start orientation in the beat */
  actualStartOrientation: string;
  /** Description of the error */
  message: string;
}

/**
 * Result of a transition validation
 */
export interface TransitionValidationResult {
  /** Whether the transition is valid */
  valid: boolean;
  /** Errors found during validation (empty if valid) */
  errors: OrientationContinuityError[];
}

/**
 * Random Sequence Generator Interface
 *
 * Generates a single random valid sequence using constraint-based random walks.
 * Much faster than exhaustive exploration - returns first valid sequence found.
 */
export interface RandomSequenceGenerationOptions {
  /** Grid mode to use */
  gridMode: GridMode;
  /** Optional constraints to respect during generation */
  constraints?: VariationConstraints;
  /** Optional soft constraint set for scoring variations (smooth, natural, choppy) */
  constraintSet?: ConstraintSet;
  /** Optional abort signal to cancel generation */
  signal?: AbortSignal;
  /** Max attempts before giving up (default: 100) */
  maxAttempts?: number;
  /** Optional letter sources from parsing (tracks which letters are bridges) */
  letterSources?: LetterSource[];
  /** Difficulty level - filters variations by max turn count */
  level?: DifficultyLevel;
  /** Turn intensity bias (0.0-2.0) - biases weighted selection toward higher or lower turns */
  turnIntensity?: number;
}

/**
 * Result of parsing a word for generation
 */
export interface WordParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed letters (original, without bridges) */
  originalLetters?: Letter[];
  /** Expanded letters (with bridges inserted) */
  expandedLetters?: Letter[];
  /** Expanded word string */
  expandedWord?: string;
  /** Letter sources tracking which letters are original vs bridge */
  letterSources?: LetterSource[];
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Options for word parsing
 */
export interface WordParseOptions {
  /** Preferences that affect bridge letter selection */
  preferences?: SpellPreferences;
}
