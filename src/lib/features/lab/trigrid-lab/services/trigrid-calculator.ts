/**
 * Core geometry engine for the 3-point equilateral triangle grid.
 *
 * Computes vertex positions, 120-degree arc paths for shift motions, and arrowheads.
 * All coordinates are in a 950x950 SVG space with center at (475, 475).
 */

import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Point, TriGridMode, TriGridArcData } from "../domain/trigrid-types";
import {
  getAllHandPoints,
  getAllOuterMarkers,
  getAdjacentVertices,
  getHandPoint,
  getLocationAngle,
} from "../domain/trigrid-coordinates";
import {
  TRIGRID_HAND_POINT_RADIUS,
  TRIGRID_ARROWHEAD_SIZE,
  TRIGRID_BETA_OFFSET_DISTANCE,
} from "../domain/trigrid-constants";

export function getHandPoints(mode: TriGridMode): Map<GridLocation, Point> {
  return getAllHandPoints(mode);
}

export function getOuterMarkers(mode: TriGridMode): Map<GridLocation, Point> {
  return getAllOuterMarkers(mode);
}

export function computeArcPath(
  from: GridLocation,
  to: GridLocation,
  clockwise: boolean,
  mode: TriGridMode,
): TriGridArcData {
  const startPt = getHandPoint(from, mode);
  const endPt = getHandPoint(to, mode);
  const radius = TRIGRID_HAND_POINT_RADIUS;

  // SVG arc: M startX startY A rx ry rotation largeArcFlag sweepFlag endX endY
  // For a 120-degree arc on our circle:
  // - largeArcFlag = 0 (arc is less than 180 degrees)
  // - sweepFlag = 1 for CW, 0 for CCW
  const sweepFlag = clockwise ? 1 : 0;
  const pathD = `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 0 ${sweepFlag} ${endPt.x} ${endPt.y}`;

  // Compute arrowhead at the endpoint
  const arrowheadPoints = computeArrowhead(endPt, from, to, clockwise, mode);

  return { pathD, arrowheadPoints, clockwise };
}

export function getAdjacentPoints(
  point: GridLocation,
  mode: TriGridMode,
): { cw: GridLocation; ccw: GridLocation } {
  return getAdjacentVertices(point, mode);
}

/**
 * Orientation offsets in degrees for the 6-point trigrid orientation system.
 * Each step in the cycle represents 60 degrees.
 *
 * IN = prop points toward center (0 offset from radial inward direction)
 * OUT = prop points away from center (180 offset)
 * CLOCK_IN/CLOCK_OUT/COUNTER_IN/COUNTER_OUT = 60-degree increments between
 */
const ORIENTATION_OFFSETS: Record<string, number> = {
  [Orientation.IN]: 0,
  [Orientation.CLOCK_IN]: 60,
  [Orientation.CLOCK_OUT]: 120,
  [Orientation.OUT]: 180,
  [Orientation.COUNTER_OUT]: 240,
  [Orientation.COUNTER_IN]: 300,
};

export function computePropRotation(
  location: GridLocation,
  orientation: Orientation,
  mode: TriGridMode,
): number {
  const locationAngle = getLocationAngle(location, mode);
  const orientationOffset = ORIENTATION_OFFSETS[orientation] ?? 0;

  // Location angles are measured from north (0° = top, CW positive).
  // SVG rotation operates in standard screen space (0° = right, CW positive).
  // The prop SVG defaults to pointing right (0° in SVG rotation space).
  //
  // To convert location angle to SVG outward-from-center angle: subtract 90°.
  // "IN" = inward toward center = outward angle + 180°.
  // Combined: (locationAngle - 90) + 180 = locationAngle + 90.
  // Then add the orientation offset (IN=0, CLOCK_IN=60, etc.).
  return locationAngle + 90 + orientationOffset;
}

export function computeBetaOffset(
  location: GridLocation,
  hand: "left" | "right",
  mode: TriGridMode,
): Point {
  const locationAngle = getLocationAngle(location, mode);

  // Left offsets +90°; right offsets -90°.
  const perpendicularAngle = hand === "left"
    ? locationAngle + 90
    : locationAngle - 90;

  // Convert from north-CW convention to SVG radians (same -90 correction as pointAtAngle)
  const angleRad = ((perpendicularAngle - 90) * Math.PI) / 180;

  return {
    x: Math.round(TRIGRID_BETA_OFFSET_DISTANCE * Math.cos(angleRad) * 10) / 10,
    y: Math.round(TRIGRID_BETA_OFFSET_DISTANCE * Math.sin(angleRad) * 10) / 10,
  };
}

/**
 * Compute arrowhead polygon points at the arc endpoint.
 * The arrowhead points in the direction of the tangent at the endpoint.
 */
function computeArrowhead(
  endpoint: Point,
  from: GridLocation,
  to: GridLocation,
  clockwise: boolean,
  mode: TriGridMode,
): string {
  // Tangent direction at the endpoint of a circular arc.
  // For a circle centered at (cx, cy), the tangent at a point is perpendicular to the radius.
  // The tangent direction depends on whether we're moving CW or CCW.
  const toAngle = getLocationAngle(to, mode);

  // Tangent at the endpoint: perpendicular to the radius at that point
  // CW motion: tangent points 90 degrees clockwise from the outward radius
  // CCW motion: tangent points 90 degrees counter-clockwise from the outward radius
  const tangentAngleDeg = clockwise ? toAngle + 90 : toAngle - 90;
  const tangentRad = ((tangentAngleDeg - 90) * Math.PI) / 180;

  const size = TRIGRID_ARROWHEAD_SIZE;

  // Tip of the arrow is at the endpoint
  const tipX = endpoint.x;
  const tipY = endpoint.y;

  // Two base points of the arrowhead triangle
  const backX = tipX - size * Math.cos(tangentRad);
  const backY = tipY - size * Math.sin(tangentRad);

  // Perpendicular offset for the base width
  const perpX = (size * 0.4) * Math.sin(tangentRad);
  const perpY = (size * 0.4) * -Math.cos(tangentRad);

  const p1x = Math.round((backX + perpX) * 10) / 10;
  const p1y = Math.round((backY + perpY) * 10) / 10;
  const p2x = Math.round((backX - perpX) * 10) / 10;
  const p2y = Math.round((backY - perpY) * 10) / 10;

  return `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`;
}
