import { pointsOf } from "#lib/shared/mandala/services/mandala-density.js";
import type {
  MandalaPoint,
  SVGPathData,
} from "#lib/shared/mandala/domain/mandala-types.js";
import type { FlowerStyle } from "@tka/shape-domain";

/** Where a flower's petals point: up/down/left/right, or the corners. */
export type PetalAnchor = "cardinal" | "diagonal";

/**
 * Close to a tip or a waist the radius barely changes while the angle keeps
 * moving, so a loose band would pull in points far off the petal's direction.
 */
const RADIUS_TOLERANCE = 0.0025;
const ANGLE_TOLERANCE_DEGREES = 10;

/** Distance from the nearest multiple of 90° after turning by `offset`. */
function distanceFromAxis(degrees: number, offset: number): number {
  const remainder = (((degrees - offset) % 90) + 90) % 90;
  return Math.min(remainder, 90 - remainder);
}

function degreesOf(point: MandalaPoint): number {
  return (Math.atan2(point.y, point.x) * 180) / Math.PI;
}

/**
 * The points a petal is read at. An antispin petal is a loop reaching outward,
 * so its tip is the path's farthest point. An inspin petal is a loop on the
 * inside of the flower, with a wide lobe between each pair, so it is read at
 * the path's nearest point: `pro-2-out-diamond` swings its wide lobes to the
 * cardinals and sits its four petals on the diagonals, which is what makes it
 * box mode.
 *
 * The mandala's centre is the origin of these coordinates: the painters
 * translate to the middle of the canvas and stroke the points as they are.
 */
function readPetalPoints(
  paths: readonly SVGPathData[],
  style: FlowerStyle
): { points: MandalaPoint[]; radius: number; reach: number } | null {
  const points = paths.flatMap(pointsOf);
  if (points.length === 0) return null;
  const radii = points.map((point) => Math.hypot(point.x, point.y));
  const reach = Math.max(...radii);
  if (reach === 0) return null;

  const radius = style === "anti" ? reach : Math.min(...radii);
  return {
    points: points.filter(
      (_, index) => Math.abs(radii[index]! - radius) <= reach * RADIUS_TOLERANCE
    ),
    radius,
    reach,
  };
}

/**
 * Read a flower's petal direction from the path it actually draws. The TKA grid
 * names where the hand sits on the downbeat and the orientation then shifts the
 * petals, so the grid word can't answer this.
 */
export function flowerPetalAnchor(
  paths: readonly SVGPathData[],
  style: FlowerStyle
): PetalAnchor | null {
  const petals = readPetalPoints(paths, style);
  if (!petals) return null;
  const angles = petals.points.map(degreesOf);
  const within = (offset: number) =>
    angles.every(
      (angle) => distanceFromAxis(angle, offset) <= ANGLE_TOLERANCE_DEGREES
    );

  if (within(0)) return "cardinal";
  if (within(45)) return "diagonal";
  return null;
}

/**
 * Where the petals point once the whole stage has turned by this many eighths
 * of a circle. An odd count swaps the corners for the sides.
 */
export function turnedPetalAnchor(
  anchor: PetalAnchor | null,
  eighthTurns: number
): PetalAnchor | null {
  if (!anchor || eighthTurns % 2 === 0) return anchor;
  return anchor === "diagonal" ? "cardinal" : "diagonal";
}
