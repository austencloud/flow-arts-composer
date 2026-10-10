/**
 * Duet Sequence Domain Model
 *
 * Defines a pairing of two sequences for coordinated duet performance.
 * Does NOT modify SequenceData - references existing library sequences by ID.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Performer positioning hint for duet performance
 */
export type DuetPositioning = "side-by-side" | "face-to-face" | "custom";

/**
 * Duet sequence definition - pairs two sequences for two-performer playback
 */
export interface DuetSequence {
  /** Unique identifier */
  id: string;

  /** Display name for the duet */
  name: string;

  /** Optional description */
  description?: string;

  /** Reference to performer 1's sequence (by ID) */
  performer1SequenceId: string;

  /** Reference to performer 2's sequence (by ID) */
  performer2SequenceId: string;

  /**
   * Beat offset applied to performer 2.
   * Positive = performer 2 starts later, negative = performer 2 starts earlier.
   * In steps (e.g., 1 = one beat behind, -0.5 = half beat ahead)
   */
  stepOffset: number;

  /** Positioning hint for avatar placement */
  positioning: DuetPositioning;

  /** Creation timestamp */
  createdAt: Date;

  /** Creator user ID (optional) */
  createdBy?: string;

  /** Tags for organization */
  tags?: string[];
}

/**
 * Duet sequence with resolved sequence data
 * Used when loading a duet for playback
 */
export interface DuetSequenceWithData extends DuetSequence {
  /** Resolved sequence data for performer 1 */
  performer1Sequence: SequenceData;

  /** Resolved sequence data for performer 2 */
  performer2Sequence: SequenceData;
}

/**
 * Input for creating a new duet
 */
export interface CreateDuetInput {
  name: string;
  description?: string;
  performer1SequenceId: string;
  performer2SequenceId: string;
  stepOffset?: number;
  positioning?: DuetPositioning;
  tags?: string[];
}

export function createDuetSequence(input: CreateDuetInput): DuetSequence {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    performer1SequenceId: input.performer1SequenceId,
    performer2SequenceId: input.performer2SequenceId,
    stepOffset: input.stepOffset ?? 0,
    positioning: input.positioning ?? "side-by-side",
    createdAt: new Date(),
    tags: input.tags,
  };
}
