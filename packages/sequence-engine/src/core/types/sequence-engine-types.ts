/**
 * Sequence Engine Types - Shared domain models
 *
 * Platform-agnostic types for sequence generation.
 *
 * Post-unification (Phase 1 complete):
 *   - Canonical `Step` and `Motion` live in `@tka/tka-types`.
 *   - `SequenceStep` and `MotionData` are transitional aliases pointing at
 *     `Step` and `Motion`. Engine internals use `Step`/`Motion` directly;
 *     app code still imports via the legacy names while Phase 2 migrates
 *     the app layer. After Phase 2 the aliases can be removed.
 *   - Legacy enum type aliases (MotionType, RotationDirection, Orientation,
 *     GridLocation, LetterCategory, LetterType, PlacementGroup) remain as
 *     loose string literal unions so existing string-flavored engine paths
 *     keep compiling until the enum migration sweep.
 */

// Canonical unified types — single source of truth for Step and Motion.
export type {
  Step,
  StepMotions,
  Motion,
} from "@tka/tka-types";

// Transitional aliases: engine + app code migrating incrementally keeps
// compiling under the legacy names.
import type { Step as _Step, Motion as _Motion } from "@tka/tka-types";

/** @deprecated Use `Step` from `@tka/tka-types`. Alias retained for app-layer transition (Phase 2). */
export type SequenceStep = _Step;
/** @deprecated Use `Motion` from `@tka/tka-types`. Alias retained for app-layer transition (Phase 2). */
export type MotionData = _Motion;

/**
 * Placement groups for letter transitions.
 * Letters can only follow other letters if their placement groups match.
 */
export type PlacementGroup = "alpha" | "beta" | "gamma";

/**
 * Motion types for hand movements.
 */
export type MotionType = "shift" | "dash" | "static" | "pro" | "anti" | "float";

/**
 * Rotation directions for props.
 */
export type RotationDirection = "cw" | "ccw" | "noRotation";

/**
 * Hand path types derived from start/end grid locations.
 */
export type HandPath = "cw" | "ccw" | "dash" | "static" | "hashIn" | "hashOut";

/**
 * Prop orientations.
 */
export type Orientation =
  | "in"
  | "out"
  | "clock"
  | "counter"
  // Interradial orientations (Level 4 - 45° between cardinal orientations)
  | "clockIn"
  | "clockOut"
  | "counterIn"
  | "counterOut"
  // Centric orientations (Level 6 - prop at center)
  | "centerN"
  | "centerNE"
  | "centerE"
  | "centerSE"
  | "centerS"
  | "centerSW"
  | "centerW"
  | "centerNW";

/**
 * Grid locations where hands can be placed.
 */
export type GridLocation = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw" | "c";

/**
 * Categories of letters based on motion type patterns.
 */
export type LetterCategory =
  | "dual-shift"
  | "shift"
  | "cross-shift"
  | "dash"
  | "dual-dash"
  | "static";

/**
 * Letter type numbers (1-6).
 * - Type 1: Dual-Shift (A-V)
 * - Type 2: Shift (W, X, Y, Z, Σ, Δ, Θ, Ω)
 * - Type 3: Cross-Shift (W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-)
 * - Type 4: Dash (Φ, Ψ, Λ)
 * - Type 5: Dual-Dash (Φ-, Ψ-, Λ-)
 * - Type 6: Static (α, β, γ)
 */
export type LetterType = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Information about a letter's placement transitions.
 */
export interface LetterPlacementInfo {
  letter: string;
  startPlacementGroup: PlacementGroup;
  endPlacementGroup: PlacementGroup;
  category?: LetterCategory;
}

/**
 * Raw letter mapping data from letter-mappings.json.
 */
export interface LetterMappingData {
  startPlacement: string;
  endPlacement: string;
  leftMotion: string;
  rightMotion: string;
}

/**
 * Structure of letter-mappings.json file.
 */
export interface LetterMappingsJson {
  letters: Record<string, LetterMappingData>;
  categories: Record<string, string[]>;
}

// `MotionData` and `SequenceStep` interfaces removed — now aliases for
// `Motion` and `Step` from `@tka/tka-types` (see top of file).

/**
 * Result of sequence building.
 */
export interface SequenceResult {
  /** Whether the build was successful */
  isValid: boolean;
  /** The sequence steps (index 0 is start placement) */
  steps: SequenceStep[];
  /** Error message if build failed */
  error?: string;
  /** Word that was spelled (if word-based generation) */
  word?: string;
  /** Letters including any bridges */
  expandedLetters?: string[];
}

/**
 * Input for orientation calculation.
 */
export interface OrientationInput {
  motionType: string;
  turns?: number | "fl";
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation?: string;
}
