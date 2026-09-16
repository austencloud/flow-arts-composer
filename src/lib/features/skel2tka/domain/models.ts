/**
 * Skel2TKA Domain Models
 *
 * Types for the video-to-TKA notation pipeline.
 * Phase 1 focuses on hand tracking and beat extraction from uploaded video.
 */

import type { DetectionFrame } from "$lib/shared/train/domain/detection-frame";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/** A single video frame extracted as ImageData for processing */
export interface ExtractedFrame {
  /** Frame index (0-based) */
  index: number;
  /** Timestamp in seconds within the video */
  timestamp: number;
  /** Raw pixel data from the video frame */
  imageData: ImageData;
}

/** Timeline of hand detections across all analyzed frames */
export interface HandTimeline {
  /** Detection results per frame, ordered by timestamp */
  frames: DetectionFrame[];
  /** Extraction frame rate (frames per second) */
  fps: number;
  /** Total video duration in seconds */
  duration: number;
}

/** Grid position for a single hand at a specific beat */
export interface StepPosition {
  /** Which hand */
  hand: "left" | "right";
  /** Detected grid location */
  location: GridLocation;
  /** Average confidence across frames in this beat */
  confidence: number;
}

/** A detected beat - a time segment where hand positions are stable */
export interface DetectedBeat {
  /** Beat index (0-based) */
  index: number;
  /** Start timestamp in seconds */
  startTime: number;
  /** End timestamp in seconds */
  endTime: number;
  /** Number of frames in this beat */
  frameCount: number;
  /** Stable hand positions during this beat */
  positions: StepPosition[];
  /** TKA position label derived from blue+red locations (alpha, beta, gamma, etc.) */
  placementLabel: string | null;
}

/** Complete result from Phase 1 analysis */
export interface Phase1Result {
  /** The hand detection timeline */
  timeline: HandTimeline;
  /** Detected beats with stable positions */
  beats: DetectedBeat[];
  /** Total processing time in milliseconds */
  processingTimeMs: number;
}

/** Status of a pipeline phase */
export type PhaseStatus = "locked" | "pending" | "active" | "complete";

/** Metadata for a pipeline phase displayed in the overview */
export interface PhaseInfo {
  /** Phase number (1-5) */
  number: number;
  /** Short title */
  title: string;
  /** What this phase does */
  description: string;
  /** Current status */
  status: PhaseStatus;
  /** Icon class (Font Awesome) */
  icon: string;
  /** Theme color */
  color: string;
}

/** Progress callback for long-running operations */
export interface ProgressCallback {
  (current: number, total: number, label?: string): void;
}
