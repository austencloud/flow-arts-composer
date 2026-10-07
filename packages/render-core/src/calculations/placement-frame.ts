/**
 * Canonical arrow placement frame
 *
 * Arrow placement data is authored once, in the diamond frame. Box is that
 * frame turned 45° clockwise: a box arrow is looked up as the diamond arrow it
 * presents (every location one step counter-clockwise), and the resulting
 * adjustment vector and glyph angle are turned 45° clockwise for display. The
 * anchor itself is the box grid point, which already sits at that rotation.
 *
 * The app owns this rule in
 * src/lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame.ts
 * (see docs/superpowers/specs/2026-08-13-canonical-arrow-placement-frame.md). The MCP
 * renderers use these helpers so a box card places its arrows the same way.
 */

import type { Coordinates, GridMode } from "../types.js";

/** How far the box presentation is turned from the canonical frame. */
export const BOX_FRAME_ROTATION_DEGREES = 45;

const CLOCKWISE_LOCATIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

/**
 * Turn a perimeter location by 45° steps (positive is clockwise). Center and
 * unknown values come back unchanged; case is normalized to lowercase.
 */
export function rotateGridLocation(location: string, steps: number): string {
  const normalized = location.toLowerCase();
  const index = CLOCKWISE_LOCATIONS.indexOf(normalized);
  if (index < 0) return normalized;
  return CLOCKWISE_LOCATIONS[(((index + steps) % 8) + 8) % 8]!;
}

/** Degrees the displayed grid is turned from the canonical placement frame. */
export function placementFrameRotation(gridMode: GridMode | string): 0 | 45 {
  return gridMode === "box" ? BOX_FRAME_ROTATION_DEGREES : 0;
}

/** A displayed location as the canonical (diamond) frame sees it. */
export function toCanonicalLocation(
  location: string,
  rotationDegrees: 0 | 45
): string {
  return rotationDegrees === 0
    ? location.toLowerCase()
    : rotateGridLocation(location, -1);
}

/** A canonical location as the displayed grid shows it. */
export function toDisplayedLocation(
  location: string,
  rotationDegrees: 0 | 45
): string {
  return rotationDegrees === 0
    ? location.toLowerCase()
    : rotateGridLocation(location, 1);
}

/** Turn a canonical screen vector into the displayed grid. */
export function rotatePlacementVectorToDisplayed(
  vector: Coordinates,
  rotationDegrees: 0 | 45
): Coordinates {
  if (rotationDegrees === 0) return { x: vector.x, y: vector.y };
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

/** Turn a canonical arrow-glyph angle into the displayed grid. */
export function rotatePlacementAngleToDisplayed(
  angleDegrees: number,
  rotationDegrees: 0 | 45
): number {
  return (((angleDegrees + rotationDegrees) % 360) + 360) % 360;
}
