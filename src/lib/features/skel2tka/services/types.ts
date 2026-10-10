import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
import type { DetectedBeat } from "../domain/models";

/**
 * StepBoundaryDetector - Find beat transitions in a hand timeline
 *
 * Groups consecutive frames with stable (same) blue/red grid locations
 * into beats. A new beat starts when either hand changes grid location.
 */
export interface StepDetectionOptions {
  /**
   * Minimum number of frames for a segment to count as a beat.
   * Segments shorter than this are merged into the previous beat.
   * Default: 3
   */
  minFramesPerBeat?: number;

  /**
   * Minimum confidence threshold for a hand detection to be considered valid.
   * Frames where both hands are below this threshold are skipped.
   * Default: 0.5
   */
  minConfidence?: number;
}

/**
 * VideoFrameExtractor - Extract ImageData frames from a video file
 *
 * Uses a hidden video element + canvas to seek through a video file
 * and extract frames at a configurable sample rate.
 */
export interface FrameExtractionOptions {
  /** Frames per second to extract (default: 15) */
  fps?: number;
  /** Maximum number of frames to extract (default: unlimited) */
  maxFrames?: number;
}

/** Context passed to the renderer for each frame */
export interface OverlayRenderContext {
  /** The canvas 2D context to draw on */
  ctx: CanvasRenderingContext2D;
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** The detection data for this specific frame */
  frame: DetectionFrame | null;
  /** The current frame index in the timeline */
  frameIndex: number;
  /** Detected beats (for beat boundary visualization) */
  beats: DetectedBeat[];
  /** Current timestamp in seconds */
  timestamp: number;
}
