/**
 * Co-exported types from retired interface contracts.
 */

import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { TransformationIntervals } from "../domain/models/label-models";

export interface AxisAlternatingResult {
  isAxisAlternating: boolean;
  transformationFamily: string[];
  metaPatternType: "palindromic" | "alternating" | "symmetric" | "structured";
  patternSequence: string[];
  description: string;
}
export type SwapRhythmPattern =
  | "1-2-2-1"
  | "1-2-1-2"
  | "1-1-2-2"
  | "2-1-1-2"
  | "2-1-2-1"
  | "2-2-1-1"
  | "uniform"
  | "unknown";
export interface ColumnBehavior {
  /** Column position (1-based, e.g., 1,2,3,4 for quartered) */
  position: number;
  /** Base transformation for this column (without swap/invert modifiers) */
  baseTransformation: string;
  /** Is this column swapped relative to base? */
  isSwapped: boolean;
  /** Is this column inverted relative to base? */
  isInverted: boolean;
  /** Is this column mirrored relative to base? */
  isMirrored: boolean;
  /** Is this column flipped relative to base? */
  isFlipped: boolean;
  /** Beat numbers in this column */
  steps: number[];
  /** All transformations detected for this column */
  transformations: string[];
}
export interface ModularAnalysisResult {
  isModular: boolean;
  /** Behaviors for each column */
  columnBehaviors: ColumnBehavior[];
  /** Detected swap rhythm pattern */
  swapRhythm: SwapRhythmPattern;
  /** Positions that are swapped (1-based) */
  swappedPositions: number[];
  /** Base transformation shared across columns */
  baseTransformation: string | null;
  /** Human-readable description */
  description: string;
}

export interface HandPathCycle {
  /** Which hand this cycle describes */
  hand: "left" | "right";

  /** Number of steps in one complete cycle */
  cycleLength: number;

  /** How many times the cycle repeats in the full sequence */
  repeatCount: number;

  /** Path sequence as location transitions, e.g., ["s→n", "n→e", "e→w", "w→s"] */
  pathSequence: string[];

  /** Motion type pattern, e.g., ["dash", "anti", "dash", "anti"] */
  motionPattern: string[];

  /** Rotation direction pattern, e.g., ["noRotation", "ccw", "noRotation", "cw"] */
  rotationPattern: string[];

  /** Whether the path forms a complete loop (returns to start) */
  isClosedLoop: boolean;

  /** Confidence score for this cycle detection (0-1) */
  confidence: number;
}
export type PositionalCategory = "alpha" | "beta" | "gamma1" | "gamma2";
export interface ZoneCoverageAnalysis {
  /** Coverage per sequence half */
  perHalf: {
    first: Record<PositionalCategory, number>;
    second: Record<PositionalCategory, number>;
  };

  /** True if each half visits all 4 positional categories */
  hasCompleteCoverage: boolean;

  /** True if coverage follows a "Latin Square" pattern */
  hasLatinSquarePattern: boolean;

  /** Human-readable summary */
  summary: string;
}
export interface LayeredPathResult {
  /** Whether a layered path pattern was detected */
  isLayeredPath: boolean;

  /** Left hand's detected cycle */
  leftCycle: HandPathCycle | null;

  /** Right hand's detected cycle */
  rightCycle: HandPathCycle | null;

  /** Rhythm type classification */
  rhythmType: "isorhythmic" | "polyrhythmic" | null;

  /** For polyrhythmic: the ratio of cycle lengths (e.g., "3:4") */
  polyrhythmRatio: string | null;

  /** Zone coverage analysis (observation for research) */
  zoneCoverage: ZoneCoverageAnalysis | null;

  /** Human-readable description */
  description: string;

  /** Overall confidence score (0-1) */
  confidence: number;
}

export interface RawStepData {
  beat?: number;
  letter?: string;
  startPos?: string;
  endPos?: string;
  sequenceStartPlacement?: string;
  leftAttributes?: RawMotionAttributes;
  rightAttributes?: RawMotionAttributes;
  // Metadata object (first item in sequence array) fields
  word?: string;
  author?: string;
  level?: number;
  propType?: string;
  isCircular?: boolean;
  gridMode?: string; // Authoritative grid mode
  [key: string]: unknown;
}
export interface RawMotionAttributes {
  motionType?: string;
  startLoc?: string;
  endLoc?: string;
  startOri?: string;
  endOri?: string;
  propRotDir?: string;
  turns?: number | string;
}
export interface SequenceEntry {
  id: string; // Unique sequence identifier
  word: string;
  isCircular: boolean;
  loopType: string | null;
  thumbnails: string[];
  sequenceLength: number;
  gridMode: string;
  /** Firestore path to full sequence data: "users/{ownerId}/sequences/{id}" */
  sourceRef?: string;
  fullMetadata?: {
    sequence?: RawStepData[];
  };
}

export type ComponentId =
  | "rotated"
  | "swapped"
  | "mirrored"
  | "flipped"
  | "inverted"
  | "rewound"
  | "repeated"
  | "modular";
export interface LOOPDesignation {
  components: ComponentId[];
  loopType: string | null;
  period?: Period | null; // Only relevant when "rotated" component is selected
}
export interface SectionDesignation {
  steps: number[]; // Beat numbers in this section
  components: ComponentId[];
  loopType: string | null;
  period?: Period | null; // Only relevant when "rotated" component is selected
}

export interface LetterRelationshipInfo {
  letter1: string;
  letter2: string;
  /** Formal letter transformation relationships */
  relationships: {
    isInverted: boolean; // Pro ↔ Anti (A↔B, Σ↔Δ)
    isCompound: boolean; // Section transition pairs (D↔J, M↔P)
    isAlphaBetaCounterpart: boolean; // Gamma endpoint sharing (Σ↔Θ, W↔Y)
  };
  /** Human-readable summary of the relationship */
  summary: string;
}
export interface StepPairRelationship {
  keyStep: number;
  correspondingStep: number;
  /** Primary transformation (contextual, after priority filtering) */
  detectedTransformations: string[]; // e.g., ["ROTATED 180+SWAPPED"]
  /** All valid transformations this pair satisfies (before filtering) */
  allValidTransformations?: string[]; // e.g., ["ROTATED 180+SWAPPED", "MIRRORED+INVERTED"]
  confirmedTransformation?: string; // User-selected interpretation
  /** Letter-based relationship analysis */
  letterRelationship?: LetterRelationshipInfo;
}

export type FilterMode = "all" | "needsVerification" | "verified";
export interface SequenceStats {
  total: number;
  needsVerification: number;
  verified: number;
}

export interface LOOPDesignationInput {
  components: ComponentId[];
  loopType: string | null;
  period?: Period | null;
  transformationIntervals?: TransformationIntervals;
}

export interface LabeledSequence {
  word: string;
  designations: LOOPDesignation[]; // Multiple valid designations (whole sequence)
  sections?: SectionDesignation[]; // Section-based designations
  stepPairs?: StepPairRelationship[]; // Beat-pair relationships
  isFreeform: boolean; // Circular but no recognizable pattern
  isUnknown?: boolean; // Needs further analysis/review
  needsVerification?: boolean; // Auto-labeled, needs human verification
  autoLabeled?: boolean; // Was this label auto-generated by detection algorithm
  labeledAt: string;
  notes: string;
}

export interface FormattedTransformations {
  primary: string[];
  all: string[];
}
