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
  startOrientation: string; // "in" | "out" | "clock" | "counter"
  endOrientation: string; // "in" | "out" | "clock" | "counter"
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
import type { HandSide } from "@tka/tka-types";
