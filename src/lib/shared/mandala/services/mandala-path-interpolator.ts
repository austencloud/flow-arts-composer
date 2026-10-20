import type {
  MandalaPaths,
  MandalaPoint,
  SVGPathData,
} from "../domain/mandala-types";
import { pointsToSVGPath } from "./mandala-geometry-calculator";
import { parsePoints } from "./mandala-fingerprint";

const PATH_GROUPS = ["left", "right", "purple"] as const;

/** Points closer than this (mandala units) count as the same point. */
const SAME_POINT = 1e-3;

/** Lines per hand the beat pairing tries every arrangement of. */
const MAX_PAIRED_LINES = 4;

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

function squaredGap(a: MandalaPoint, b: MandalaPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function samePoint(a: MandalaPoint, b: MandalaPoint): boolean {
  return squaredGap(a, b) <= SAME_POINT * SAME_POINT;
}

function samePoints(
  a: readonly MandalaPoint[],
  b: readonly MandalaPoint[]
): boolean {
  return a.length === b.length && a.every((point, i) => samePoint(point, b[i]!));
}

function blendPoints(
  from: readonly MandalaPoint[],
  to: readonly MandalaPoint[],
  t: number
): MandalaPoint[] {
  return from.map((start, i) => interpolatePoint(start, to[i]!, t));
}

// ─── Beat morph ─────────────────────────────────────────────────────────────
//
// A hand's drawing is one line per prop tip, and each line is a run of beats.
// An edit usually changes one beat, but it can also change which tip draws
// which line from that beat on: one more turn swaps a staff's two ends for
// the rest of the sequence, so the old tip 0 line becomes the new tip 1 line.
// Pairing lines by tip then sends every later beat across the figure to a
// shape it already had. Instead, each beat's old segments are paired with the
// new segments they are closest to, keeping each line joined from beat to
// beat where it can, so a beat the edit did not change stays exactly where it
// is and only the changed beats move.

type Beats = readonly (readonly MandalaPoint[])[];

/** One beat of one line: equal-length point lists to blend. */
interface BeatPair {
  readonly from: readonly MandalaPoint[];
  readonly to: readonly MandalaPoint[];
  readonly still: boolean;
  /** True when this beat does not continue the one before it as one stroke. */
  readonly breaks: boolean;
}

interface LineMorph {
  readonly tipIndex: number;
  readonly beats: readonly BeatPair[];
}

function pathBeats(paths: readonly SVGPathData[]): Beats[] | null {
  const all = paths.map((path) => path.beats);
  if (all.some((beats) => !beats || beats.length === 0)) return null;
  const count = all[0]?.length ?? 0;
  if (all.some((beats) => beats!.length !== count)) return null;
  return all as Beats[];
}

function permutations(count: number): number[][] {
  if (count === 0) return [[]];
  return permutations(count - 1).flatMap((rest) =>
    Array.from({ length: count }, (_, at) => [
      ...rest.slice(0, at),
      count - 1,
      ...rest.slice(at),
    ])
  );
}

/** Mean squared distance a segment's points travel to become the other. */
function segmentCost(
  from: readonly MandalaPoint[],
  to: readonly MandalaPoint[]
): number {
  const count = Math.max(from.length, to.length);
  const a = from.length === count ? from : resamplePoints(from, count);
  const b = to.length === count ? to : resamplePoints(to, count);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += squaredGap(a[i]!, b[i]!);
  return count === 0 ? 0 : sum / count;
}

/**
 * For each beat, which new line each old line's segment becomes: the
 * arrangement with the least travel, where a line that leaves its new
 * neighbour mid-morph pays the size of that gap. Solved over all beats at
 * once (each beat's choice depends only on the one before), so a swap is
 * taken at the beat where it costs least.
 */
function pairBeats(from: Beats[], to: Beats[]): number[][] {
  const lines = from.length;
  const beatCount = from[0]?.length ?? 0;
  const arrangements = permutations(lines);
  // Identity first, so equal costs keep each tip on its own line.
  arrangements.sort((a, b) =>
    a.every((value, i) => value === i) ? -1 : b.every((value, i) => value === i) ? 1 : 0
  );

  const own: number[][] = [];
  for (let beat = 0; beat < beatCount; beat++) {
    const pairCost = from.map((line) =>
      to.map((target) => segmentCost(line[beat]!, target[beat]!))
    );
    own.push(
      arrangements.map((arrangement) =>
        arrangement.reduce((sum, target, line) => sum + pairCost[line]![target]!, 0)
      )
    );
  }

  let cost = own[0] ?? [];
  const back: number[][] = [];
  for (let beat = 1; beat < beatCount; beat++) {
    const next: number[] = [];
    const choice: number[] = [];
    arrangements.forEach((arrangement, index) => {
      let best = Infinity;
      let bestPrevious = 0;
      arrangements.forEach((previous, previousIndex) => {
        let gap = 0;
        for (let line = 0; line < lines; line++) {
          const end = to[previous[line]!]![beat - 1]!;
          const start = to[arrangement[line]!]![beat]![0]!;
          gap += squaredGap(end[end.length - 1]!, start);
        }
        const total = cost[previousIndex]! + gap;
        if (total < best) {
          best = total;
          bestPrevious = previousIndex;
        }
      });
      next.push(best + own[beat]![index]!);
      choice.push(bestPrevious);
    });
    back.push(choice);
    cost = next;
  }

  let last = cost.indexOf(Math.min(...cost));
  const chosen: number[][] = new Array(beatCount);
  for (let beat = beatCount - 1; beat >= 0; beat--) {
    chosen[beat] = arrangements[last]!;
    if (beat > 0) last = back[beat - 1]![last]!;
  }
  return chosen;
}

/** Per beat, which new line each old line's segment becomes. */
type BeatPairing = readonly (readonly number[])[];

/** Both sides' beats, when the beat pairing can take them. */
function pairableBeats(
  fromPaths: readonly SVGPathData[],
  toPaths: readonly SVGPathData[]
): { from: Beats[]; to: Beats[] } | null {
  if (fromPaths.length !== toPaths.length) return null;
  if (fromPaths.length === 0 || fromPaths.length > MAX_PAIRED_LINES) return null;
  const from = pathBeats(fromPaths);
  const to = pathBeats(toPaths);
  if (!from || !to || from[0]!.length !== to[0]!.length) return null;
  return { from, to };
}

/** The beat pairing of two geometries, or null when they pair by tip. */
function decideBeatPairing(
  fromPaths: readonly SVGPathData[],
  toPaths: readonly SVGPathData[]
): BeatPairing | null {
  const beats = pairableBeats(fromPaths, toPaths);
  return beats ? pairBeats(beats.from, beats.to) : null;
}

/**
 * The lines of a beat morph, blending these geometries with a pairing
 * decided earlier. Null when the geometries no longer fit the pairing.
 */
function buildLineMorphs(
  fromPaths: readonly SVGPathData[],
  toPaths: readonly SVGPathData[],
  pairing: BeatPairing
): LineMorph[] | null {
  const beats = pairableBeats(fromPaths, toPaths);
  if (!beats || beats.from[0]!.length !== pairing.length) return null;
  const { from, to } = beats;
  return from.map((line, index) => ({
    tipIndex: fromPaths[index]!.tipIndex,
    beats: line.map((segment, beat): BeatPair => {
      const target = to[pairing[beat]![index]!]![beat]!;
      const count = Math.max(segment.length, target.length);
      const previousFrom = beat > 0 ? line[beat - 1]! : null;
      const previousTo = beat > 0 ? to[pairing[beat - 1]![index]!]![beat - 1]! : null;
      return {
        from: segment.length === count ? segment : resamplePoints(segment, count),
        to: target.length === count ? target : resamplePoints(target, count),
        still: samePoints(segment, target),
        breaks:
          !previousFrom ||
          !previousTo ||
          !samePoint(previousFrom[previousFrom.length - 1]!, segment[0]!) ||
          !samePoint(previousTo[previousTo.length - 1]!, target[0]!),
      };
    }),
  }));
}

function blendLines(lines: readonly LineMorph[], t: number): SVGPathData[] {
  return lines.flatMap((line) => {
    const beats = line.beats.map((pair) =>
      pair.still ? pair.to : blendPoints(pair.from, pair.to, t)
    );
    const strokes: MandalaPoint[][] = [];
    line.beats.forEach((pair, beat) => {
      if (pair.breaks || strokes.length === 0) strokes.push([]);
      strokes[strokes.length - 1]!.push(...beats[beat]!);
    });
    const d = strokes
      .map((points) => pointsToSVGPath(points))
      .filter(Boolean)
      .join(" ");
    return d ? [{ d, tipIndex: line.tipIndex, beats }] : [];
  });
}

// ─── Tip morph (paths without beats) ────────────────────────────────────────

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

function prepareTipGroup(
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

function blendTipGroup(morphs: readonly TipMorph[], t: number): SVGPathData[] {
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

// ─── Public ─────────────────────────────────────────────────────────────────

type GroupMorph =
  | { kind: "beats"; lines: LineMorph[] }
  | { kind: "tips"; morphs: TipMorph[] };

/** A group's morph for these geometries, by the pairing decided for the pair. */
function buildGroup(
  pairing: BeatPairing | null,
  fromPaths: readonly SVGPathData[],
  toPaths: readonly SVGPathData[]
): GroupMorph {
  const lines = pairing ? buildLineMorphs(fromPaths, toPaths, pairing) : null;
  return lines
    ? { kind: "beats", lines }
    : { kind: "tips", morphs: prepareTipGroup(fromPaths, toPaths) };
}

type GroupPairings = Record<(typeof PATH_GROUPS)[number], BeatPairing | null>;

function buildGroups(
  pairings: GroupPairings,
  from: MandalaPaths,
  to: MandalaPaths
): Record<(typeof PATH_GROUPS)[number], GroupMorph> {
  return {
    left: buildGroup(pairings.left, from.left, to.left),
    right: buildGroup(pairings.right, from.right, to.right),
    purple: buildGroup(pairings.purple, from.purple, to.purple),
  };
}

function groupIsStill(group: GroupMorph): boolean {
  return group.kind === "beats"
    ? group.lines.every((line) => line.beats.every((pair) => pair.still))
    : group.morphs.every((morph) => morph.kind === "fixed");
}

function blendGroup(group: GroupMorph, t: number): SVGPathData[] {
  return group.kind === "beats"
    ? blendLines(group.lines, t)
    : blendTipGroup(group.morphs, t);
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

/** A morph between two geometries, as a function of progress. */
export interface MandalaMorph {
  (t: number): MandalaPaths;
  /**
   * True when both geometries draw the same picture (the lines may only have
   * changed which tip draws them), so there is nothing to show moving.
   */
  readonly still: boolean;
}

/**
 * A morph between two calculated geometries, as a function of progress.
 * Paths that carry their beats move beat by beat, each beat's segments paired
 * with the new segments they are closest to, so only what an edit changed
 * moves. Paths without beats pair by prop tip, with unequal sample counts
 * normalized. Pairing and normalizing happen once here, so each frame only
 * blends numbers and writes the path strings.
 */
export function createMandalaMorph(
  from: MandalaPaths,
  to: MandalaPaths
): MandalaMorph {
  const plan = planMandalaMorph(from, to);
  return Object.assign((t: number) => plan.at(from, to, t), {
    still: plan.still,
  });
}

/**
 * A morph whose pairing was decided once and is applied to fresh geometry
 * each frame. The shifting mandala breathes while it morphs: the tip offset
 * changes every frame, so the two geometries are recalculated per frame, but
 * which line turns into which must not change mid-morph.
 */
export interface MandalaMorphPlan {
  /** True when the two geometries the plan was made from draw the same picture. */
  readonly still: boolean;
  /**
   * One frame: `from` and `to` are the pair's geometries as they stand now
   * (same sequences and shape as the plan was made from, any tip offset).
   */
  at(from: MandalaPaths, to: MandalaPaths, t: number): MandalaPaths;
}

/**
 * Decide the pairing between two geometries. Point counts do not change with
 * the tip offset (samples per beat are fixed), so a plan made at one offset
 * holds at every other. Calling `at` with the geometries the plan was made
 * from reuses their prepared lines.
 */
export function planMandalaMorph(
  from: MandalaPaths,
  to: MandalaPaths
): MandalaMorphPlan {
  const pairings: GroupPairings = {
    left: decideBeatPairing(from.left, to.left),
    right: decideBeatPairing(from.right, to.right),
    purple: decideBeatPairing(from.purple, to.purple),
  };
  const own = buildGroups(pairings, from, to);
  return {
    still: PATH_GROUPS.every((group) => groupIsStill(own[group])),
    at(fromNow, toNow, t) {
      if (t <= 0) return fromNow;
      if (t >= 1) return toNow;
      const groups =
        fromNow === from && toNow === to
          ? own
          : buildGroups(pairings, fromNow, toNow);
      return {
        left: blendGroup(groups.left, t),
        right: blendGroup(groups.right, t),
        purple: blendGroup(groups.purple, t),
      };
    },
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
