import type {
  MandalaPaths,
  MandalaPoint,
  SVGPathData,
} from "../domain/mandala-types";
import { pointsToSVGPath } from "./mandala-geometry-calculator";
import { parsePoints } from "./mandala-fingerprint";

const PATH_GROUPS = ["left", "right", "purple"] as const;

function interpolatePoint(
  from: MandalaPoint,
  to: MandalaPoint,
  t: number
): MandalaPoint {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function resamplePoints(
  points: readonly MandalaPoint[],
  count: number
): MandalaPoint[] {
  if (points.length === 0 || count === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: count }, () => ({ ...points[0]! }));
  }
  if (count === 1) return [{ ...points[0]! }];

  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (points.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(points.length - 1, Math.ceil(position));
    const progress = position - lowerIndex;
    return interpolatePoint(points[lowerIndex]!, points[upperIndex]!, progress);
  });
}

function collapsedPoints(point: MandalaPoint, count: number): MandalaPoint[] {
  return Array.from({ length: count }, () => ({ ...point }));
}

function pathsByTipIndex(
  paths: readonly SVGPathData[]
): Map<number, SVGPathData> {
  return new Map(paths.map((path) => [path.tipIndex, path]));
}

/** One prop tip's part of a morph: a path that stays put, or two point lists
 *  of equal length to blend. */
type TipMorph =
  | { kind: "fixed"; path: SVGPathData }
  | {
      kind: "blend";
      tipIndex: number;
      from: MandalaPoint[];
      to: MandalaPoint[];
      frame: MandalaPoint[];
    };

function prepareTipMorph(
  tipIndex: number,
  fromPath: SVGPathData | undefined,
  toPath: SVGPathData | undefined
): TipMorph | null {
  if (fromPath?.d === toPath?.d) {
    return toPath ? { kind: "fixed", path: toPath } : null;
  }

  const fromPoints = fromPath ? parsePoints(fromPath.d) : [];
  const toPoints = toPath ? parsePoints(toPath.d) : [];
  const pointCount = Math.max(fromPoints.length, toPoints.length, 2);
  const fallbackPoint = fromPoints[0] ?? toPoints[0];
  if (!fallbackPoint) return null;

  const from = fromPath
    ? resamplePoints(fromPoints, pointCount)
    : collapsedPoints(toPoints[0] ?? fallbackPoint, pointCount);
  const to = toPath
    ? resamplePoints(toPoints, pointCount)
    : collapsedPoints(fromPoints[0] ?? fallbackPoint, pointCount);
  return {
    kind: "blend",
    tipIndex,
    from,
    to,
    frame: from.map((point) => ({ ...point })),
  };
}

function preparePathGroup(
  fromPaths: readonly SVGPathData[],
  toPaths: readonly SVGPathData[]
): TipMorph[] {
  const fromByTip = pathsByTipIndex(fromPaths);
  const toByTip = pathsByTipIndex(toPaths);
  const tipIndices = [
    ...new Set([...fromByTip.keys(), ...toByTip.keys()]),
  ].sort((a, b) => a - b);

  return tipIndices.flatMap((tipIndex) => {
    const morph = prepareTipMorph(
      tipIndex,
      fromByTip.get(tipIndex),
      toByTip.get(tipIndex)
    );
    return morph ? [morph] : [];
  });
}

function blendPathGroup(morphs: readonly TipMorph[], t: number): SVGPathData[] {
  return morphs.flatMap((morph) => {
    if (morph.kind === "fixed") return [morph.path];

    const { from, to, frame } = morph;
    for (let index = 0; index < frame.length; index++) {
      const start = from[index]!;
      const end = to[index]!;
      const point = frame[index]!;
      point.x = start.x + (end.x - start.x) * t;
      point.y = start.y + (end.y - start.y) * t;
    }
    const d = pointsToSVGPath(frame);
    return d ? [{ d, tipIndex: morph.tipIndex }] : [];
  });
}

export function mandalaPathsEqual(
  left: MandalaPaths,
  right: MandalaPaths
): boolean {
  return PATH_GROUPS.every((group) => {
    const leftPaths = left[group];
    const rightPaths = right[group];
    return (
      leftPaths.length === rightPaths.length &&
      leftPaths.every(
        (path, index) =>
          path.tipIndex === rightPaths[index]!.tipIndex &&
          path.d === rightPaths[index]!.d
      )
    );
  });
}

/**
 * A morph between two calculated geometries, as a function of progress.
 * Paths are paired by prop tip, and unequal sample counts are normalized
 * before the points move. A hand whose geometry did not change is returned
 * untouched. Pairing and normalizing happen once here, so each frame only
 * blends numbers and writes the path strings.
 */
export function createMandalaMorph(
  from: MandalaPaths,
  to: MandalaPaths
): (t: number) => MandalaPaths {
  const groups = {
    left: preparePathGroup(from.left, to.left),
    right: preparePathGroup(from.right, to.right),
    purple: preparePathGroup(from.purple, to.purple),
  };
  return (t) => {
    if (t <= 0) return from;
    if (t >= 1) return to;
    return {
      left: blendPathGroup(groups.left, t),
      right: blendPathGroup(groups.right, t),
      purple: blendPathGroup(groups.purple, t),
    };
  };
}

/** One frame of the morph from `from` to `to`. */
export function interpolateMandalaPaths(
  from: MandalaPaths,
  to: MandalaPaths,
  t: number
): MandalaPaths {
  return createMandalaMorph(from, to)(t);
}
