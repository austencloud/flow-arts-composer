import { pointsOf } from "#lib/shared/mandala/services/mandala-density.js";
import type {
  MandalaPoint,
  SVGPathData,
} from "#lib/shared/mandala/domain/mandala-types.js";
import type { FlowerStyle } from "@tka/shape-domain";

/** Where a flower's petals point: up/down/left/right, or the corners. */
export type PetalAnchor = "cardinal" | "diagonal";

/** Where a flower's petals sit, as a drawing can mark them. */
export interface FlowerPetalMarks {
  /** One per petal, in degrees from -180 to 180, sorted. */
  angles: number[];
  /** One per petal, same order, in the path's own coordinates. */
  points: MandalaPoint[];
  /** How far the flower reaches from its centre. */
  reach: number;
}

/**
 * Close to a tip or a waist the radius barely changes while the angle keeps
 * moving, so a loose band would pull in points far off the petal's direction.
 */
const RADIUS_TOLERANCE = 0.0025;
const ANGLE_TOLERANCE_DEGREES = 10;

/**
 * Inspin petals are small loops near the middle. Dots that close to the centre
 * would crowd together, so anything nearer than this share of the reach is
 * marked on a ring instead.
 */
const REAL_POINT_MIN_REACH = 0.35;
const RING_REACH = 0.5;

/**
 * How closely the read points must agree on where the petals sit, from 0 (they
 * are spread evenly around the circle) to 1 (they fall exactly on the petals).
 */
const MIN_PETAL_AGREEMENT = 0.25;

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
 * One mark per petal, read at the same points `flowerPetalAnchor` reads. A mark
 * sits on the real petal point when that reaches far enough out, and otherwise
 * on a ring at half the reach, along the same direction.
 *
 * A flower's petals are evenly spaced, so the points only have to settle where
 * the first one goes. That also absorbs an inspin path's inner loops, which
 * pass so close to the centre that one petal's nearest points fan out over
 * 30° and overlap the next petal's: `pro-2.75` has 11 petals and 19 separate
 * angles. Multiplying each angle by the petal count lands every petal's points
 * in one place on the circle, and their mean is the first petal's direction.
 */
export function flowerPetalMarks(
  paths: readonly SVGPathData[],
  style: FlowerStyle,
  petalCount: number
): FlowerPetalMarks | null {
  if (petalCount < 1) return null;
  const petals = readPetalPoints(paths, style);
  if (!petals) return null;
  const { points, radius, reach } = petals;

  const wrapped = points.map(
    (point) => Math.atan2(point.y, point.x) * petalCount
  );
  const sumX = wrapped.reduce((sum, angle) => sum + Math.cos(angle), 0);
  const sumY = wrapped.reduce((sum, angle) => sum + Math.sin(angle), 0);
  if (Math.hypot(sumX, sumY) / points.length < MIN_PETAL_AGREEMENT) return null;
  const first = Math.atan2(sumY, sumX) / petalCount;

  const markRadius =
    radius >= reach * REAL_POINT_MIN_REACH ? radius : reach * RING_REACH;
  const directions = Array.from({ length: petalCount }, (_, index) =>
    Math.atan2(
      Math.sin(first + (index * 2 * Math.PI) / petalCount),
      Math.cos(first + (index * 2 * Math.PI) / petalCount)
    )
  ).sort((a, b) => a - b);

  return {
    angles: directions.map((direction) => (direction * 180) / Math.PI),
    points: directions.map((direction) => ({
      x: markRadius * Math.cos(direction),
      y: markRadius * Math.sin(direction),
    })),
    reach,
  };
}
