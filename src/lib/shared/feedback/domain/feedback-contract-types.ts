/**
 * Co-exported types from retired interface contracts.
 */

import type { FeedbackItem, FeedbackStatus, FeedbackType, FeedbackPriority, StagedImageState } from "#lib/shared/feedback/domain/models/feedback-models.js";


export type ClaimHealth =
  | "active"      // Has claim, not stale
  | "stale"       // Has claim, but older than threshold
  | "orphaned"    // Status is "in-progress" but no claim
  | "none";       // No claim (normal for new/in-review/completed)

/**
 * Effective status derived from stored status + claim state
 *
 * The stored status records the lifecycle transition. Claim health determines
 * whether an in-progress item still has a live owner and may temporarily change
 * how stale or orphaned work is grouped.
 */
export interface EffectiveStatus {
  /** The status to display/use for grouping */
  displayStatus: FeedbackStatus;

  /** The stored status in Firestore (may differ from displayStatus) */
  storedStatus: FeedbackStatus;

  /** Claim health for UI indicators */
  claimHealth: ClaimHealth;

  /** Claim age in milliseconds (if claimed) */
  claimAgeMs?: number;

  /** Short claim token for display (first 8 chars) */
  claimTokenShort?: string;
}


export interface EditSnapshot {
  type: FeedbackType;
  priority: FeedbackPriority | "";
  title: string;
  description: string;
}

export interface EditableFields {
  type: FeedbackType;
  priority: FeedbackPriority | "";
  title: string;
  description: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}


export interface FeedbackQueryResult {
  items: FeedbackItem[];
  lastDocId: string | null;
  hasMore: boolean;
}


export interface FeedbackTypeConfig {
  label: string;
  icon: string;
  color: string;
  placeholder: string;
}


export type DraftSaveStatus = "idle" | "saving" | "saved";


export type StagedProgressCallback = (state: StagedImageState) => void;

export interface StagedUploadHandle {
  /** Resolves with the download URL on success, rejects on failure */
  promise: Promise<string>;
  /** Cancel the in-flight upload */
  cancel: () => void;
  /** The storage path (for deletion after upload completes) */
  storagePath: string;
}


export type SwimLane = 'critical' | 'normal' | 'internal' | 'backlog';


export interface VoiceRecordingResult {
	blob: Blob;
	mimeType: string;
	durationMs: number;
}
