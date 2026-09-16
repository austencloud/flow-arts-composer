
/**
 * A detected gap from a single wrong answer.
 */
export interface DetectedGap {
  /** Knowledge graph node ID for the correct answer */
  correctNodeId: string;
  /** Knowledge graph node ID for what the user chose */
  chosenNodeId: string;
  /** Whether this pair is a known confusion in the knowledge graph */
  isKnownConfusion: boolean;
  /** Explanation from the knowledge graph (if known confusion) */
  confusionExplanation?: string;
  /** The correct letter or content label */
  correctLabel: string;
  /** The user's chosen letter or content label */
  chosenLabel: string;
}

/**
 * A recurring misconception pattern across multiple quiz attempts.
 */
export interface MisconceptionPattern {
  /** Knowledge graph node A in the confusion pair */
  nodeA: string;
  /** Knowledge graph node B in the confusion pair */
  nodeB: string;
  /** How many times this confusion has occurred */
  occurrenceCount: number;
  /** When it last happened */
  lastOccurredAt: Date;
  /** Explanation from the knowledge graph */
  explanation?: string;
}

/**
 * LetterBreakdownGenerator
 *
 * Produces deterministic, correct letter descriptions and comparisons
 * from structured domain data. No LLM needed - everything is derivable
 * from type, placements, rotation types, and VTG mode.
 *
 * Used by MisconceptionHint and QuizMisconceptionSummary to build
 * factually correct seed messages for TIKA.
 */
export interface LetterBreakdown {
  letter: string;
  typeNumber: number;
  typeName: string;
  placementDescription: string;
  motionDescription: string;
  tndMode?: string;
  tndElement?: string;
  motionGroup?: string;
  upgradeFrom?: string;
  summary: string;
}

export interface LetterComparison {
  letterA: LetterBreakdown;
  letterB: LetterBreakdown;
  relationship: ComparisonRelationship;
  explanation: string;
}

export type ComparisonRelationship =
  | "same-type-different-placement"
  | "same-type-different-rotation"
  | "same-type-different-group"
  | "cross-type-upgrade"
  | "cross-type-confusion"
  | "same-placement-different-type"
  | "unrelated";

/**
 * Serializable representation of LearningProgress for Firestore.
 * Maps and Sets are converted to plain objects and arrays.
 */
export interface SerializedLearningProgress {
  concepts: Record<string, unknown>;
  completedConcepts: string[];
  currentConceptId?: string;
  overallProgress: number;
  totalCorrect: number;
  totalTimeSpent: number;
  badges: string[];
  lastUpdated: string;
}
