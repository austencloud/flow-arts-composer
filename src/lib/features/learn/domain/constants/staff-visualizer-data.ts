/**
 * Staff Position Visualizer data constants
 */

export type HandPosition = "N" | "E" | "S" | "W";
export type ThumbOrientation = "in" | "out";
export { type PlacementType } from "./shared-types";
import type { PlacementType } from "./shared-types";
export type RotationType = "prospin" | "antispin" | "none";

export interface GridPoint {
  x: number;
  y: number;
  label: string;
}

export const GRID_POINTS: Record<HandPosition, GridPoint> = {
  N: { x: 50, y: 15, label: "N" },
  E: { x: 85, y: 50, label: "E" },
  S: { x: 50, y: 85, label: "S" },
  W: { x: 15, y: 50, label: "W" },
};

export const OPPOSITE_PAIRS: Record<string, string> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
};

export const PLACEMENT_COLORS: Record<PlacementType, string> = {
  alpha: "#FF6B6B",
  beta: "#4ECDC4",
  gamma: "#FFE66D",
};

export const ROTATION_COLORS: Record<RotationType, string> = {
  prospin: "#22D3EE",
  antispin: "#F97316",
  none: "transparent",
};

export const LEFT_STAFF_COLOR = "#4A9EFF";
export const RIGHT_STAFF_COLOR = "#FF4A9E";

export function areAdjacent(p1: string, p2: string): boolean {
  const points = ["N", "E", "S", "W"];
  const i1 = points.indexOf(p1);
  const i2 = points.indexOf(p2);
  const diff = Math.abs(i1 - i2);
  return diff === 1 || diff === 3;
}

export function getPlacementType(
  leftPosition: HandPosition,
  rightPosition: HandPosition
): PlacementType {
  if (leftPosition === rightPosition) return "beta";
  if (OPPOSITE_PAIRS[leftPosition] === rightPosition) return "alpha";
  if (areAdjacent(leftPosition, rightPosition)) return "gamma";
  return "gamma";
}

export interface StaffEndpoints {
  thumbX: number;
  thumbY: number;
  pinkyX: number;
  pinkyY: number;
  rotation: number;
}

export function getStaffEndpoints(
  position: HandPosition,
  thumbOrientation: ThumbOrientation
): StaffEndpoints {
  const point = GRID_POINTS[position];
  const center = { x: 50, y: 50 };
  const staffLength = 35;
  const angle = Math.atan2(point.y - center.y, point.x - center.x);
  const thumbTowardCenter = thumbOrientation === "in";

  let rotation = (angle * 180) / Math.PI;
  if (thumbTowardCenter) {
    rotation += 180;
  }

  const thumbX = thumbTowardCenter
    ? center.x
    : center.x + Math.cos(angle) * staffLength;
  const thumbY = thumbTowardCenter
    ? center.y
    : center.y + Math.sin(angle) * staffLength;
  const pinkyX = thumbTowardCenter
    ? center.x + Math.cos(angle) * staffLength
    : center.x;
  const pinkyY = thumbTowardCenter
    ? center.y + Math.sin(angle) * staffLength
    : center.y;

  return { thumbX, thumbY, pinkyX, pinkyY, rotation };
}
