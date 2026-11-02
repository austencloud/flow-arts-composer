import type { SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";
import SVGPathCommander from "svg-path-commander";

interface Pt {
  x: number;
  y: number;
}

const CURVE_SAMPLE_COUNT = 64;
const curveSampleCache = new Map<string, Pt[] | null>();

/** Whole-curve tolerance used by the slower regression oracle. */
export const CURVE_MATCH_EPS = 12.0;

function sampleClosedCurve(
  path: SVGPathData,
  sampleCount: number
): Pt[] | null {
  const cacheKey = `${sampleCount}|${path.d}`;
  if (curveSampleCache.has(cacheKey)) return curveSampleCache.get(cacheKey)!;

  const commander = new SVGPathCommander(path.d);
  const length = commander.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) return null;
  const first = commander.getPointAtLength(0);
  const last = commander.getPointAtLength(length);
  if (Math.hypot(first.x - last.x, first.y - last.y) > CURVE_MATCH_EPS) {
    return null;
  }
  const points = Array.from({ length: sampleCount }, (_, index) =>
    commander.getPointAtLength((length * index) / sampleCount)
  );
  const closedPoints = [...points, points[0]!];
  curveSampleCache.set(cacheKey, closedPoints);
  return closedPoints;
}

function pointSegmentDistanceSquared(point: Pt, start: Pt, end: Pt): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy)
    )
  );
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  return (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
}

function directedPolylineDistanceSquared(points: Pt[], loop: Pt[]): number {
  let furthest = 0;
  for (const point of points.slice(0, -1)) {
    let nearest = Infinity;
    for (let index = 0; index < loop.length - 1; index++) {
      nearest = Math.min(
        nearest,
        pointSegmentDistanceSquared(point, loop[index]!, loop[index + 1]!)
      );
    }
    furthest = Math.max(furthest, nearest);
  }
  return furthest;
}

function sampledCurveDistance(a: Pt[], b: Pt[]): number {
  return Math.sqrt(
    Math.max(
      directedPolylineDistanceSquared(a, b),
      directedPolylineDistanceSquared(b, a)
    )
  );
}

/**
 * Complete-curve oracle for tests; too expensive for pointer-time solving.
 * 64 samples suit the short loci the focused suites check. A long, high-turn
 * flower needs more: its chords cut corners by up to 18 units at 64, which
 * reads as a mismatch that a finer sample shows is not there.
 */
export function curveDistance(
  a: SVGPathData[],
  b: SVGPathData[],
  sampleCount = CURVE_SAMPLE_COUNT
): number {
  if (!a.length || a.length !== b.length) return Infinity;
  const left = [...a].sort((x, y) => x.tipIndex - y.tipIndex);
  const right = [...b].sort((x, y) => x.tipIndex - y.tipIndex);
  let distance = 0;

  for (let index = 0; index < left.length; index++) {
    if (left[index]!.tipIndex !== right[index]!.tipIndex) return Infinity;
    const leftPoints = sampleClosedCurve(left[index]!, sampleCount);
    const rightPoints = sampleClosedCurve(right[index]!, sampleCount);
    if (!leftPoints || !rightPoints) return Infinity;
    distance = Math.max(
      distance,
      sampledCurveDistance(leftPoints, rightPoints)
    );
  }

  return distance;
}
