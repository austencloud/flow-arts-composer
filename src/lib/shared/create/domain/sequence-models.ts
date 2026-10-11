/**
 * Workbench Domain Models
 *
 * Shared workbench data structures used across modules.
 * Moved from main workbench/domain to shared domain.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export type WorkbenchMode = "view" | "edit" | "construct";

// Additional domain models that were in the main workbench/domain
export interface SequenceCreateRequest {
  name: string;
  word: string;
  length: number;
  author?: string;
  tags?: string[];
}

export interface SequenceCreationParams {
  name: string;
  length: number;
  author?: string;
  tags?: string[];
}

export interface DeleteResult {
  success: boolean;
  deletedCount: number;
  deletedSequence?: SequenceData | null;
  affectedSequences?: SequenceData[];
  error?: string;
}

export interface DeleteConfirmationData {
  sequenceId: string;
  sequenceName: string;
  stepCount: number;
  sequence?: SequenceData;
  hasVariations?: boolean;
  relatedSequences?: SequenceData[];
  willFixVariationNumbers?: boolean;
}
