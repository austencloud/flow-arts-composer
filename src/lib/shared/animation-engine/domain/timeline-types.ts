/**
 * Timeline Editor Types
 *
 * Data model for the DAW-style timeline editor.
 * Replaces the grid-cell approach with a track-based timeline system
 * familiar to users of Premiere Pro, DaVinci Resolve, and Audition.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  type TrailSettings,
  DEFAULT_TRAIL_SETTINGS,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  type TimeSignatureKey,
  DEFAULT_TIME_SIGNATURE,
} from "#lib/shared/foundation/domain/models/time-signature.js";

// Time Units

/**
 * All time values in the timeline are in seconds (floating point).
 * This allows for precise positioning without worrying about frame rates.
 */
export type TimeSeconds = number;

/**
 * Frames per second for rendering/export
 */
export type FrameRate = 24 | 30 | 60;

// Timeline Clip

/**
 * A clip is an animation sequence placed on the timeline.
 * Think of it like a video clip in Premiere Pro.
 */
export interface TimelineClip {
  /** Unique clip identifier */
  id: string;

  /** Reference to the source sequence */
  sequenceId: string;

  /** Cached sequence data (for display/rendering without lookup) */
  sequence: SequenceData;

  /** Track this clip belongs to */
  trackId: string;


  /** Where the clip starts on the timeline (seconds) */
  startTime: TimeSeconds;

  /** Total duration on timeline (after speed adjustments) */
  duration: TimeSeconds;

  // === Trimming (In/Out Points) ===

  /**
   * Source in-point: where to start playing from within the sequence.
   * 0 = start from beginning of sequence.
   * Expressed as a fraction (0-1) of the original sequence duration.
   */
  inPoint: number;

  /**
   * Source out-point: where to stop playing within the sequence.
   * 1 = play to end of sequence.
   * Expressed as a fraction (0-1) of the original sequence duration.
   */
  outPoint: number;


  /** Playback speed multiplier (1 = normal, 0.5 = half speed, 2 = double) */
  playbackRate: number;

  /** Whether this clip loops during its timeline duration */
  loop: boolean;

  /** Number of times to loop (0 = infinite within duration) */
  loopCount: number;


  /** Trail effect settings for this clip's animation */
  trailSettings: TrailSettings;

  /** Rotation offset in degrees */
  rotation: number;

  /** Opacity (0-1) for compositing */
  opacity: number;


  /** User-provided label (optional) */
  label?: string;

  /** Color for timeline display */
  color: string;

  /** Whether clip is locked (can't be moved/edited) */
  locked: boolean;

  /** Whether clip is muted (skipped during playback) */
  muted: boolean;
}

// Timeline Track

/**
 * A track is a horizontal lane that holds clips.
 * Multiple tracks allow for layering/compositing animations.
 */
export interface TimelineTrack {
  /** Unique track identifier */
  id: string;

  /** Display name */
  name: string;

  /** Vertical order (0 = top) */
  order: number;

  /** Track type for rendering behavior */
  type: TrackType;

  /** Clips on this track (ordered by startTime) */
  clips: TimelineClip[];


  /** Mute all clips on this track */
  muted: boolean;

  /** Solo this track (mute all others) */
  solo: boolean;

  /** Lock track (prevent edits) */
  locked: boolean;

  /** Track visibility in preview */
  visible: boolean;

  /** Track height in pixels (for UI) */
  height: number;

  /** Track color accent */
  color: string;
}

/**
 * Track types determine how clips are rendered/composited
 */
export type TrackType =
  | "animation" // Standard animation clips
  | "overlay" // Overlaid on top with transparency
  | "background" // Behind other tracks
  // Stage-specific track types (for multi-performer 3D choreography)
  | "performer" // Performer track - one track per avatar in Stage
  | "formation" // Formation cue markers - trigger formation changes
  | "camera"; // Camera keyframe track - choreographed camera moves

// Audio Reference

/**
 * Reference to the audio track for sync.
 * Actual audio state is managed by the existing AudioState.
 */
export interface TimelineAudioRef {
  /** Whether audio is attached */
  hasAudio: boolean;

  /** Audio file name for display */
  fileName: string | null;

  /** Audio duration in seconds */
  duration: TimeSeconds;

  /** BPM (detected or manual) */
  bpm: number | null;
}

// Timeline Project

/**
 * The complete timeline project.
 * This is the top-level data structure that gets saved/loaded.
 */
export interface TimelineProject {
  /** Unique project identifier */
  id: string;

  /** Project name */
  name: string;

  /** All tracks in the project */
  tracks: TimelineTrack[];

  /** Audio reference (actual audio state lives elsewhere) */
  audio: TimelineAudioRef;


  /** Total project duration (auto-calculated or manual) */
  duration: TimeSeconds;

  /** Default BPM for new clips */
  defaultBpm: number;

  /** Time signature for beat grid display */
  timeSignature: TimeSignatureKey;

  /** Snap settings */
  snap: SnapSettings;

  /** Frame rate for export */
  frameRate: FrameRate;


  /** Creation timestamp */
  createdAt: Date;

  /** Last modified timestamp */
  updatedAt: Date;

  /** Creator identifier */
  creator: string;

  /** Whether this is a favorite */
  isFavorite: boolean;
}

// Snap Settings

/**
 * Snapping configuration for clip placement
 */
export interface SnapSettings {
  /** Master snap toggle */
  enabled: boolean;

  /** Snap to beat markers */
  snapToSteps: boolean;

  /** Snap to other clip edges */
  snapToClips: boolean;

  /** Snap to playhead position */
  snapToPlayhead: boolean;

  /** Snap to time grid intervals */
  snapToGrid: boolean;

  /** Grid interval in seconds (when snapToGrid enabled) */
  gridInterval: TimeSeconds;
}

// Playhead & Selection State (UI State, not persisted)

/**
 * Current playhead position and playback state.
 * This is UI state that changes constantly during playback.
 */
export interface PlayheadState {
  /** Current position in seconds */
  position: TimeSeconds;

  /** Whether playback is active */
  isPlaying: boolean;

  /** Playback direction (1 = forward, -1 = reverse) */
  direction: 1 | -1;

  /** Shuttle speed multiplier (for J/K/L) */
  shuttleSpeed: number;

  /** Loop region start (null = no loop region) */
  loopStart: TimeSeconds | null;

  /** Loop region end */
  loopEnd: TimeSeconds | null;
}

/**
 * Selection state for multi-select operations
 */
export interface SelectionState {
  /** Selected clip IDs */
  selectedClipIds: string[];

  /** Selected track IDs */
  selectedTrackIds: string[];

  /** Drag selection rectangle (for marquee select) */
  selectionRect: SelectionRect | null;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// Zoom & Scroll State (UI State)

/**
 * Timeline viewport state for zoom and scroll
 */
export interface ViewportState {
  /** Horizontal zoom level (pixels per second) */
  pixelsPerSecond: number;

  /** Horizontal scroll offset in seconds */
  scrollX: TimeSeconds;

  /** Vertical scroll offset in pixels */
  scrollY: number;

  /** Visible time range (derived from zoom + scroll + container width) */
  visibleStart: TimeSeconds;
  visibleEnd: TimeSeconds;
}

// Speed Curves (Stretch Goal)

/**
 * Control point for speed curve bezier
 */
export interface SpeedCurvePoint {
  /** Position along clip duration (0-1) */
  position: number;

  /** Speed value at this point (0.1 - 4.0 typical range) */
  speed: number;

  /** Bezier handle for incoming curve */
  handleIn: { x: number; y: number };

  /** Bezier handle for outgoing curve */
  handleOut: { x: number; y: number };
}

/**
 * Speed curve for advanced speed ramping
 * If present on a clip, overrides the simple playbackRate
 */
export interface SpeedCurve {
  /** Whether speed curve is enabled */
  enabled: boolean;

  /** Control points defining the curve */
  points: SpeedCurvePoint[];

  /** Preset name if using a preset */
  preset: SpeedCurvePreset | null;
}

export type SpeedCurvePreset =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bounce"
  | "elastic";

// Factory Functions

let clipIdCounter = 0;
let trackIdCounter = 0;
let projectIdCounter = 0;

/**
 * Generate unique clip ID
 */
export function generateClipId(): string {
  return `clip-${Date.now()}-${++clipIdCounter}`;
}

/**
 * Generate unique track ID
 */
export function generateTrackId(): string {
  return `track-${Date.now()}-${++trackIdCounter}`;
}

/**
 * Generate unique project ID
 */
export function generateProjectId(): string {
  return `project-${Date.now()}-${++projectIdCounter}`;
}

/**
 * Create a new clip from a sequence
 */
export function createClip(
  sequence: SequenceData,
  trackId: string,
  startTime: TimeSeconds,
  options: Partial<TimelineClip> = {}
): TimelineClip {
  // Calculate default duration from sequence steps
  // Assume 1 beat = 1 second at 60 BPM as default
  const stepCount = sequence.steps.length;
  const defaultDuration = stepCount > 0 ? stepCount : 4;

  return {
    id: generateClipId(),
    sequenceId: sequence.id,
    sequence,
    trackId,
    startTime,
    duration: options.duration ?? defaultDuration,
    inPoint: 0,
    outPoint: 1,
    playbackRate: 1,
    loop: false,
    loopCount: 0,
    trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
    rotation: 0,
    opacity: 1,
    color: getRandomClipColor(),
    locked: false,
    muted: false,
    ...options,
  };
}

/**
 * Create a new track
 */
export function createTrack(
  name: string,
  order: number,
  options: Partial<TimelineTrack> = {}
): TimelineTrack {
  return {
    id: generateTrackId(),
    name,
    order,
    type: "animation",
    clips: [],
    muted: false,
    solo: false,
    locked: false,
    visible: true,
    height: 80,
    color: getRandomTrackColor(),
    ...options,
  };
}

/**
 * Create a new empty timeline project
 */
export function createProject(name: string = "Untitled"): TimelineProject {
  return {
    id: generateProjectId(),
    name,
    tracks: [createTrack("Track 1", 0)],
    audio: {
      hasAudio: false,
      fileName: null,
      duration: 0,
      bpm: null,
    },
    duration: 60, // 1 minute default
    defaultBpm: 120,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    snap: createDefaultSnapSettings(),
    frameRate: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: "You",
    isFavorite: false,
  };
}

/**
 * Create default snap settings
 */
export function createDefaultSnapSettings(): SnapSettings {
  return {
    enabled: true,
    snapToSteps: true,
    snapToClips: true,
    snapToPlayhead: false,
    snapToGrid: false,
    gridInterval: 1,
  };
}

/**
 * Create default playhead state
 */
export function createDefaultPlayheadState(): PlayheadState {
  return {
    position: 0,
    isPlaying: false,
    direction: 1,
    shuttleSpeed: 1,
    loopStart: null,
    loopEnd: null,
  };
}

/**
 * Create default selection state
 */
export function createDefaultSelectionState(): SelectionState {
  return {
    selectedClipIds: [],
    selectedTrackIds: [],
    selectionRect: null,
  };
}

/**
 * Create default viewport state
 */
export function createDefaultViewportState(): ViewportState {
  return {
    pixelsPerSecond: 50, // 50px = 1 second at default zoom
    scrollX: 0,
    scrollY: 0,
    visibleStart: 0,
    visibleEnd: 20, // Show ~20 seconds initially
  };
}

// ============================================================================
// Color Helpers
// ============================================================================

const CLIP_COLORS = [
  "#4a9eff", // Blue
  "#ff6b6b", // Red
  "#51cf66", // Green
  "#ffd43b", // Yellow
  "#cc5de8", // Purple
  "#ff922b", // Orange
  "#20c997", // Teal
  "#f06595", // Pink
];

const TRACK_COLORS = [
  "#868e96", // Gray
  "#4a9eff", // Blue
  "#51cf66", // Green
  "#ffd43b", // Yellow
];

function getRandomClipColor(): string {
  return (
    CLIP_COLORS[Math.floor(Math.random() * CLIP_COLORS.length)] ?? "#4a9eff"
  );
}

function getRandomTrackColor(): string {
  return (
    TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)] ?? "#868e96"
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the end time of a clip
 */
export function getClipEndTime(clip: TimelineClip): TimeSeconds {
  return clip.startTime + clip.duration;
}

/**
 * Check if two clips overlap
 */
export function clipsOverlap(a: TimelineClip, b: TimelineClip): boolean {
  if (a.trackId !== b.trackId) return false;
  return a.startTime < getClipEndTime(b) && getClipEndTime(a) > b.startTime;
}

/**
 * Calculate the total duration of a project (end of last clip)
 */
export function calculateProjectDuration(
  project: TimelineProject
): TimeSeconds {
  let maxEnd: TimeSeconds = 0;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = getClipEndTime(clip);
      if (clipEnd > maxEnd) {
        maxEnd = clipEnd;
      }
    }
  }

  // Include audio duration if present
  if (project.audio.hasAudio && project.audio.duration > maxEnd) {
    maxEnd = project.audio.duration;
  }

  return maxEnd || 60; // Minimum 1 minute
}

/**
 * Convert time to pixel position
 */
export function timeToPixels(
  time: TimeSeconds,
  pixelsPerSecond: number
): number {
  return time * pixelsPerSecond;
}

/**
 * Convert pixel position to time
 */
export function pixelsToTime(
  pixels: number,
  pixelsPerSecond: number
): TimeSeconds {
  return pixels / pixelsPerSecond;
}

/**
 * Snap a time value to the nearest snap point
 */
export function snapTime(
  time: TimeSeconds,
  settings: SnapSettings,
  beatMarkers: TimeSeconds[],
  clipEdges: TimeSeconds[],
  playheadPosition: TimeSeconds
): TimeSeconds {
  if (!settings.enabled) return time;

  const snapThreshold = 0.1; // 100ms snap threshold
  let nearestSnap = time;
  let nearestDistance = Infinity;

  const checkSnap = (snapPoint: TimeSeconds) => {
    const distance = Math.abs(time - snapPoint);
    if (distance < nearestDistance && distance < snapThreshold) {
      nearestDistance = distance;
      nearestSnap = snapPoint;
    }
  };

  if (settings.snapToSteps) {
    beatMarkers.forEach(checkSnap);
  }

  if (settings.snapToClips) {
    clipEdges.forEach(checkSnap);
  }

  if (settings.snapToPlayhead) {
    checkSnap(playheadPosition);
  }

  if (settings.snapToGrid) {
    const gridSnap =
      Math.round(time / settings.gridInterval) * settings.gridInterval;
    checkSnap(gridSnap);
  }

  return nearestSnap;
}
