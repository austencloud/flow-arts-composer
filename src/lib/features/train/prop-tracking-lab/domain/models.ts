/**
 * Prop Tracking Lab Domain Models
 *
 * Models for the video-to-notation proof of concept:
 * 1. Video loading and frame extraction
 * 2. User-drawn bounding box for initial prop selection
 * 3. Prop tracking across frames
 * 4. Endpoint (tip) detection and trajectory tracking
 * 5. Keyframe detection and rotation calculation
 */

/**
 * A point in normalized coordinates (0-1) relative to video dimensions.
 */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * A point in pixel coordinates.
 */
export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Bounding box in normalized coordinates (0-1).
 */
export interface BoundingBox {
  x: number; // Left edge
  y: number; // Top edge
  width: number;
  height: number;
}

/**
 * A single frame extracted from video with tracking data.
 */
export interface TrackedFrame {
  /** Frame index (0-based) */
  index: number;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Prop bounding box (if tracked) */
  propBox: BoundingBox | null;
  /** Prop centroid (center of bounding box) */
  centroid: NormalizedPoint | null;
  /** Prop tip/endpoint (furthest point from centroid) */
  tip: NormalizedPoint | null;
  /** Angle of prop in radians (0 = pointing right, PI/2 = pointing up) */
  angle: number | null;
  /** Tracking confidence (0-1) */
  confidence: number;
  /** Whether this frame is a user-marked keyframe */
  isKeyframe: boolean;
}

/**
 * Represents a detected keyframe with its derived motion data.
 */
export interface DetectedKeyframe {
  /** Frame index */
  frameIndex: number;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Hand positions at this keyframe (in TKA grid coordinates) */
  handPositions: {
    left: GridLocation | null;
    right: GridLocation | null;
  };
  /** Prop angle at this keyframe */
  propAngle: number;
  /** Cumulative rotation from previous keyframe (in radians) */
  rotationFromPrevious: number | null;
  /** Number of full turns from previous keyframe */
  turnsFromPrevious: number | null;
}

/**
 * TKA grid locations (8 cardinal/intercardinal directions).
 */
export type GridLocation = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/**
 * Motion type derived from position change.
 */
export type MotionType = "static" | "shift" | "dash";

/**
 * Rotation direction.
 */
export type RotationDirection = "cw" | "ccw" | "none";

/**
 * A complete tracking session containing video metadata and all tracked frames.
 */
export interface TrackingSession {
  /** Unique session ID */
  id: string;
  /** Video file name */
  fileName: string;
  /** Video duration in milliseconds */
  duration: number;
  /** Video dimensions */
  dimensions: { width: number; height: number };
  /** Frame rate (frames per second) */
  fps: number;
  /** Total number of frames */
  totalFrames: number;
  /** Initial bounding box drawn by user (normalized) */
  initialBox: BoundingBox;
  /** All tracked frames */
  frames: TrackedFrame[];
  /** Detected/marked keyframes */
  keyframes: DetectedKeyframe[];
  /** Session creation time */
  createdAt: Date;
}

/**
 * Derived pictograph data from keyframe pair.
 * This is the OUTPUT of the Skel2TKA pipeline.
 */
export interface DerivedPictograph {
  /** Start keyframe index */
  startKeyframe: number;
  /** End keyframe index */
  endKeyframe: number;
  /** Start grid position */
  startPlacement: GridLocation;
  /** End grid position */
  endPlacement: GridLocation;
  /** Motion type (derived from start/end) */
  motionType: MotionType;
  /** Rotation direction */
  rotationDirection: RotationDirection;
  /** Number of turns (0, 0.5, 1, 1.5, 2, etc.) */
  turns: number;
  /** Confidence in this derivation */
  confidence: number;
}

/**
 * Configuration for the tracking algorithm.
 */
export interface TrackingConfig {
  /** Minimum confidence threshold for valid tracking (0-1) */
  confidenceThreshold: number;
  /** Motion threshold for keyframe detection (normalized distance) */
  keyframeMotionThreshold: number;
  /** Minimum frames between keyframes */
  minKeyframeGap: number;
  /** Whether to auto-detect keyframes or require manual marking */
  autoDetectKeyframes: boolean;
}

/**
 * Default tracking configuration.
 */
export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  confidenceThreshold: 0.5,
  keyframeMotionThreshold: 0.02, // 2% of video dimension
  minKeyframeGap: 5, // At least 5 frames between keyframes
  autoDetectKeyframes: false, // Start with manual marking
};

// Types shared by the endpoint tracker, notation pipeline, and review surface.
export type {
  StaffHand,
  StaffPose3D,
  BeatPose3D,
  StaffMotionNotation,
} from "./notation-3d";
