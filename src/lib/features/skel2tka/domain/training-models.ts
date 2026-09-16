/**
 * Training Data Domain Models
 *
 * Types for the training data collection system.
 * Every human verification = a labeled training pair.
 * Corrections are more valuable than acceptances (hard cases).
 *
 * Stored in IndexedDB locally, synced to Firebase for export.
 */

import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { DetectionFrame } from "$lib/shared/train/domain/detection-frame";
import type { UserCorrection } from "./verification-models";

/** Reference to the source video */
export interface VideoReference {
  /** Original filename */
  fileName: string;

  /** File size in bytes */
  fileSizeBytes: number;

  /** Video duration in seconds */
  durationSec: number;

  /** Video dimensions */
  width: number;
  height: number;

  /** Frame rate used for extraction */
  extractionFps: number;

  /** SHA-256 hash of the video file (for deduplication) */
  fileHash: string;
}

/** Hand position verified by the user for a single beat */
export interface VerifiedStepPosition {
  /** Beat index */
  stepNumber: number;

  /** Left hand grid location */
  leftLocation: GridLocation | null;

  /** Right hand grid location */
  rightLocation: GridLocation | null;

  /** TKA position label (alpha, beta, gamma) */
  placementLabel: string | null;

  /** Beat start time in seconds */
  startTime: number;

  /** Beat end time in seconds */
  endTime: number;
}

/** The raw detection input (what the pipeline produced) */
export interface TrainingInput {
  /** Which phase produced this data */
  phase: number;

  /** Raw detection frames from MediaPipe */
  detectionFrames: DetectionFrame[];

  /** Frame rate of the source video */
  fps: number;

  /** Video duration in seconds */
  duration: number;
}

/** The verified output (what the human confirmed or corrected) */
export interface TrainingOutput {
  /** Verified beat positions */
  beats: VerifiedStepPosition[];

  /** How the output was verified */
  verificationMethod: "accepted" | "corrected";

  /** Corrections applied (empty if accepted as-is) */
  corrections: UserCorrection[];
}

/** A complete training pair: raw input + verified output */
export interface TrainingPair {
  /** Unique ID (UUID v4) */
  id: string;

  /** Reference to the source video */
  video: VideoReference;

  /** What the pipeline detected */
  input: TrainingInput;

  /** What the human verified as correct */
  output: TrainingOutput;

  /** When this pair was created */
  createdAt: number;

  /** Whether this pair has been synced to Firebase */
  synced: boolean;

  /** User who verified (always Austen for now) */
  verifiedBy: string;
}

/** Statistics about the training data collection */
export interface TrainingDataStats {
  /** Total number of training pairs */
  totalPairs: number;

  /** Pairs that were accepted as-is */
  acceptedPairs: number;

  /** Pairs that required corrections */
  correctedPairs: number;

  /** Pairs synced to Firebase */
  syncedPairs: number;

  /** Pairs pending sync */
  unsyncedPairs: number;

  /** Breakdown by phase */
  byPhase: Record<number, number>;
}
