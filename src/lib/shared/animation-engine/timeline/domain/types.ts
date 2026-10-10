import type {
  SnapSettings,
  TimeSeconds,
  TimelineClip,
  TimelineProject,
} from "#lib/shared/animation-engine/domain/timeline-types.js";

/**
 * ITimelineSnapper - Contract for timeline snapping functionality
 *
 * Provides snap calculations for clip positioning:
 * - Snap to beats (from audio BPM)
 * - Snap to other clip edges
 * - Snap to grid intervals
 * - Snap to playhead position
 */

export type SnapType = "beat" | "clip-start" | "clip-end" | "grid" | "playhead";

export interface SnapPoint {
  time: TimeSeconds;
  type: SnapType;
  label?: string;
}

export interface SnapResult {
  /** The snapped time value */
  time: TimeSeconds;
  /** Whether a snap occurred */
  didSnap: boolean;
  /** The type of snap point that was hit */
  snapType: SnapType | null;
  /** Distance from the original position */
  distance: number;
}

export interface SnapContext {
  /** All clips in the timeline */
  clips: TimelineClip[];
  /** Clip IDs to exclude from snap points (e.g., the clip being dragged) */
  excludeClipIds: string[];
  /** Audio BPM for beat markers */
  audioBpm: number | null;
  /** Audio duration for beat marker generation */
  audioDuration: number;
  /** Current playhead position */
  playheadPosition: TimeSeconds;
  /** Snap settings */
  settings: SnapSettings;
}

/**
 * ITimelineUndoManager - Contract for timeline undo/redo functionality
 *
 * Implements command pattern with state snapshots (Memento pattern)
 * for undoing/redoing timeline operations.
 */

/**
 * Types of undoable operations in the timeline
 */
export type TimelineUndoOperationType =
  | "ADD_CLIP"
  | "REMOVE_CLIP"
  | "REMOVE_CLIPS"
  | "MOVE_CLIP"
  | "TRIM_CLIP"
  | "RESIZE_CLIP"
  | "UPDATE_CLIP"
  | "DUPLICATE_CLIP"
  | "ADD_TRACK"
  | "REMOVE_TRACK"
  | "UPDATE_TRACK"
  | "REORDER_TRACKS"
  | "UPDATE_PROJECT"
  | "UPDATE_AUDIO"
  | "BATCH";

/**
 * Snapshot of timeline project state for undo/redo
 */
export interface TimelineProjectSnapshot {
  project: TimelineProject;
  timestamp: number;
  /** Session-only source; never persisted with project or history. */
  audioUrl?: string | null;
}

/**
 * A single entry in the undo history
 */
export interface TimelineUndoEntry {
  /** Unique ID for this entry */
  id: string;

  /** Type of operation that was performed */
  type: TimelineUndoOperationType;

  /** When the operation occurred */
  timestamp: number;

  /** State before the operation */
  beforeState: TimelineProjectSnapshot;

  /** State after the operation (captured on commit) */
  afterState?: TimelineProjectSnapshot;

  /** Human-readable description for UI */
  description: string;
}

/**
 * Undo manager interface for timeline operations
 */

/**
 * ITimelinePlayer - Contract for timeline playback management
 *
 * Handles playback state, transport controls, shuttle (J/K/L),
 * and audio synchronization.
 */

export interface ActiveClipInfo {
  clip: TimelineClip;
  /** Progress through the clip (0-1) */
  progress: number;
  /** Current beat within the clip */
  currentStep: number;
  /** Whether this clip is looping */
  isLooping: boolean;
}
