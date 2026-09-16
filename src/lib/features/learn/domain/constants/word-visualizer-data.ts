/**
 * Word Visualizer data constants and types
 */

export type HandPosition8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export { type PlacementType } from "./shared-types";
import type { PlacementType } from "./shared-types";
// Prop-rotation family for word visualization (distinct from the hand-path
// MotionType `shift|dash|static` in the motion files — see shared-types.ts).
export type MotionType = "pro" | "anti" | "hybrid";

export interface LetterDefinition {
  letter: string;
  startLeft: HandPosition8;
  startRight: HandPosition8;
  endLeft: HandPosition8;
  endRight: HandPosition8;
  leftMotion: MotionType;
  rightMotion: MotionType;
  description?: string;
}

export interface GridPoint {
  x: number;
  y: number;
  label: string;
}

export const GRID_POINTS_8: Record<HandPosition8, GridPoint> = {
  N: { x: 50, y: 12, label: "N" },
  NE: { x: 82, y: 22, label: "NE" },
  E: { x: 92, y: 50, label: "E" },
  SE: { x: 82, y: 78, label: "SE" },
  S: { x: 50, y: 88, label: "S" },
  SW: { x: 18, y: 78, label: "SW" },
  W: { x: 8, y: 50, label: "W" },
  NW: { x: 18, y: 22, label: "NW" },
};

export const LEFT_HAND_COLOR = "#4A9EFF";
export const RIGHT_HAND_COLOR = "#FF4A9E";

export const PLACEMENT_COLORS: Record<PlacementType, string> = {
  alpha: "#FF6B6B",
  beta: "#4ECDC4",
  gamma: "#FFE66D",
};

// Opposite pairs for detecting Alpha placements
const OPPOSITES: Record<string, string> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
  NE: "SW",
  SW: "NE",
  NW: "SE",
  SE: "NW",
};

export function getPlacementType(
  left: HandPosition8,
  right: HandPosition8
): PlacementType {
  if (left === right) return "beta";
  if (OPPOSITES[left] === right) return "alpha";
  return "gamma";
}

export function interpolatePosition(
  start: HandPosition8,
  end: HandPosition8,
  progress: number
): { x: number; y: number } {
  const startPoint = GRID_POINTS_8[start];
  const endPoint = GRID_POINTS_8[end];
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * progress,
    y: startPoint.y + (endPoint.y - startPoint.y) * progress,
  };
}

export function getMotionArrowPath(
  startPos: HandPosition8,
  endPos: HandPosition8,
  motionType: MotionType
): string {
  const start = GRID_POINTS_8[startPos];
  const end = GRID_POINTS_8[endPos];

  if (startPos === endPos) return "";

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const perpX = -dy * 0.3;
  const perpY = dx * 0.3;

  const direction = motionType === "pro" ? 1 : motionType === "anti" ? -1 : 0;
  const controlX = midX + perpX * direction;
  const controlY = midY + perpY * direction;

  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}
