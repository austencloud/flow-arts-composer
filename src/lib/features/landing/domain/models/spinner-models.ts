/**
 * Spinner Mode Types
 *
 * Defines the two operational modes for the endless spinner:
 * - library: Plays curated sequences from the public library
 * - infinite: Generates novel sequences algorithmically (local)
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { LOOPType, Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

/**
 * The two modes of endless spinner operation.
 */
export type SpinnerMode = "library" | "infinite";

/**
 * Generation settings used for a sequence.
 * Makes the generation meaningful by showing what parameters produced this unique sequence.
 */
export interface GenerationSettings {
  /** LOOP type used (e.g., "Rotated", "Mirrored", "Swapped") */
  loopType: LOOPType;
  /** Period (halved = 2 parts, quartered = 4 parts) */
  period: Period;
  /** Difficulty level */
  difficulty: DifficultyLevel;
  /** Turn intensity (0-3) */
  turnIntensity: number;
  /** Base length before LOOP multiplication */
  baseLength: number;
  /** Total beat count after LOOP expansion */
  totalSteps: number;
}

/**
 * Information about a generated sequence in Infinite mode.
 * Includes metadata about when and where in the global count it was created.
 */
export interface GeneratedSequenceInfo {
  /** The generated sequence data */
  sequence: SequenceData;
  /** When this sequence was generated */
  generatedAt: Date;
  /** Position in the global generation count (e.g., 47291st sequence ever) */
  globalIndex: number;
  /** The settings used to generate this sequence */
  settings: GenerationSettings;
}

/**
 * Global metrics for spinner generation, persisted to Firebase.
 */
export interface SpinnerMetrics {
  /** Total sequences ever generated across all users and sessions */
  totalGenerated: number;
  /** When the last sequence was generated */
  lastGeneratedAt: Date | null;
}
