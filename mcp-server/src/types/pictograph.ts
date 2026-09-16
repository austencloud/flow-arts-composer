import type { HandSide } from "@tka/tka-types";

/**
 * Shared Pictograph Types
 *
 * Single source of truth for pictograph and motion data structures
 * used throughout the MCP server.
 */

/**
 * Motion data for a single hand/prop in a pictograph.
 */
export interface MotionData {
  hand: HandSide;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation: string;
  endOrientation: string;
  turns?: number | "fl";
  plane?: string;
  prefloatMotionType?: string;
  prefloatRotationDirection?: string;
}

/**
 * Complete pictograph data representing one step of motion.
 */
export interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

/**
 * Grid modes supported by the pictograph system.
 */
export type GridMode = "diamond" | "box" | "skewed";
