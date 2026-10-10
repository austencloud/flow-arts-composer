/**
 * Draft Sequence Domain Model
 *
 * Represents an autosaved draft of a sequence.
 * Stored temporarily in Firestore until explicitly saved to library.
 *
 * Domain: Create module - Draft management
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { Timestamp } from "firebase/firestore";

/**
 * Draft sequence data stored in Firestore
 */
export interface DraftSequence {
  /** Session ID this draft belongs to */
  sessionId: string;

  /** User ID who owns this draft */
  userId: string;

  /** Full sequence data */
  sequenceData: SequenceData;

  /** When this draft was created */
  createdAt: Timestamp;

  /** Last update timestamp */
  updatedAt: Timestamp;

  /** Number of steps */
  stepCount: number;

  /** Draft name (if provided) */
  name?: string;

  /** Preview thumbnail (base64 or URL) */
  thumbnail?: string;
}

/**
 * Factory function to create a draft from current sequence
 */
export function createDraftSequence(
  sessionId: string,
  userId: string,
  sequenceData: SequenceData
): Omit<DraftSequence, "createdAt" | "updatedAt"> {
  return {
    sessionId,
    userId,
    sequenceData,
    stepCount: sequenceData.steps.length,
    name: sequenceData.name,
  };
}
