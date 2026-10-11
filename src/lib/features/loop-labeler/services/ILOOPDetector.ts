import type { SequenceEntry } from "#lib/shared/loop-labeler/domain/sequence-models.js";
import type {
  CandidateDesignation,
  StepPairGroups,
  TransformationIntervals,
} from "../domain/models/label-models";
import type { ComponentId } from "../domain/constants/loop-components";
import type { PolyrhythmicLOOPResult } from "./polyrhythmic-detector";
import type { DetectedComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { StepPairRelationship } from "./types";
import type { LayeredPathResult } from "./types";

/**
 * Describes a compound LOOP pattern with multiple transformations at different intervals
 * e.g., 90° rotation (quartered) + swap (halved)
 */
export interface CompoundPattern {
  /** Whether this is a compound pattern (multiple intervals) */
  isCompound: true;
  /** Transformations at quartered interval (90°) */
  quarteredTransformations: string[];
  /** Transformations at halved interval (180°) */
  halvedTransformations: string[];
  /** Combined human-readable description like "90° CCW Rotated (quartered) + Swapped (halved)" */
  description: string;
}

/**
 * Describes an axis-alternating LOOP pattern where transformations
 * from related families (e.g., FLIPPED + MIRRORED) follow a structured positional pattern
 */
export interface AxisAlternatingPattern {
  /** Whether this is an axis-alternating pattern */
  isAxisAlternating: true;
  /** The related transformation families used (e.g., ["FLIPPED", "MIRRORED"]) */
  transformationFamily: string[];
  /** The meta-pattern type (e.g., "palindromic", "alternating", "symmetric") */
  metaPatternType: "palindromic" | "alternating" | "symmetric" | "structured";
  /** The actual pattern sequence (e.g., ["FLIPPED", "MIRRORED", "MIRRORED", "FLIPPED"]) */
  patternSequence: string[];
  /** Human-readable description */
  description: string;
}

/**
 * Swap rhythm pattern within each cycle.
 * Examples: "1-2-2-1" = NO_SWAP, SWAP, SWAP, NO_SWAP (outer pure, inner swapped)
 */
export type SwapRhythm =
  | "1-2-2-1"
  | "1-2-1-2"
  | "1-1-2-2"
  | "2-1-1-2"
  | "2-1-2-1"
  | "2-2-1-1"
  | "uniform"
  | "unknown";

/**
 * Describes a modular LOOP pattern where different columns (positions within cycle)
 * have different transformation behaviors
 */
export interface ModularPattern {
  /** Whether this is a modular pattern */
  isModular: true;
  /** Base transformation shared across columns (e.g., "rotated_90_ccw") */
  baseTransformation: string | null;
  /** Swap rhythm pattern (e.g., "1-2-2-1" = outer pure, inner swapped) */
  swapRhythm: SwapRhythm;
  /** Positions (1-based) that are swapped */
  swappedPositions: number[];
  /** Human-readable description */
  description: string;
}

/**
 * Result of LOOP detection on a sequence
 */
export interface LOOPDetectionResult {
  /** Primary loop type string (e.g., "rotated_swapped") */
  loopType: string | null;

  /** Detected transformation components */
  components: ComponentId[];

  /**
   * Integer LOOP period: count of passes required to return to identity in
   * both location and orientation. 1 = non-LOOP. 2 = halved. 4 = quartered.
   * 8 = octaved (reserved for the L5 grid / L7 wheel).
   */
  period: number;

  /**
   * Detailed per-component annotations with operating domain.
   * Alongside the legacy `components: ComponentId[]` list for the migration
   * window. Reserved orientation primitives appear here but are filtered by
   * UI consumers via RESERVED_ORIENTATION_PRIMITIVES.
   */
  componentsDetailed: DetectedComponent[];

  /** Per-transformation interval configuration */
  transformationIntervals: TransformationIntervals;

  /** Rotation direction for quartered patterns */
  rotationDirection: "cw" | "ccw" | null;

  /** All candidate designations (can be multiple equally valid) */
  candidateDesignations: CandidateDesignation[];

  /** Beat-pair relationships for display */
  stepPairs: StepPairRelationship[];

  /** Beat pairs grouped by transformation pattern */
  stepPairGroups: StepPairGroups;

  /** Is this a circular sequence? */
  isCircular: boolean;

  /** Is this a freeform pattern (circular but no recognized LOOP)? */
  isFreeform: boolean;

  /** Is this a modular pattern (multiple different but recognizable transformations)? */
  isModular: boolean;


  /** Layered path analysis result (parent category) */
  layeredPath: LayeredPathResult | null;

  /** Is this a layered path LOOP? */
  isLayeredPath: boolean;

  // === POLYRHYTHMIC DETECTION (subtype of layered path) ===

  /** Polyrhythmic analysis result (legacy - now part of layeredPath) */
  polyrhythmic: PolyrhythmicLOOPResult | null;

  /** Is this a polyrhythmic pattern? (subtype of layered path) */
  isPolyrhythmic: boolean;


  /** Compound pattern when transformations occur at different intervals */
  compoundPattern?: CompoundPattern;


  /** Axis-alternating pattern when related transformations follow a positional meta-pattern */
  axisAlternatingPattern?: AxisAlternatingPattern;

  /** Is this an axis-alternating pattern? */
  isAxisAlternating: boolean;


  /** Modular pattern when different columns have different transformation behaviors */
  modularPattern?: ModularPattern;
}

/**
 * Service for detecting LOOP patterns in sequences
 *
 * Computes designations on-the-fly from sequence data,
 * eliminating the need to store them in Firebase.
 */
export interface ILOOPDetector {
  /**
   * Detect LOOP patterns in a sequence
   * Returns computed designations without storing anything
   */
  detectLOOP(sequence: SequenceEntry): LOOPDetectionResult;

  /**
   * Check if a sequence is circular (ends where it started)
   */
  isCircular(sequence: SequenceEntry): boolean;
}
