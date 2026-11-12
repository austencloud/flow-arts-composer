/**
 * Candidate measures of how complex a mandala looks, one number per shape.
 *
 * "Simple to complex" is still to be judged by eye, so these sit side by side:
 * - `ink`: the share of the square a line passes through (the density measure).
 * - `spaces`: how many enclosed spaces the lines make. A ring is 1, a ring with
 *   a cross is 4. Slivers of only a few cells do not count. It is the
 *   per-sequence measure (`mandala-density.ts`), which the climb orders by.
 * - `crossings`: how many places lines cross or meet at an angle. A ring with
 *   a cross has 5: its centre and four points on the ring.
 * - `line`: total length of line over the picture's reach, overlap counted once.
 * - `blend`: a rank ordering by `spaces`, with ties broken by `ink`.
 */
import type { MandalaPaths, MandalaPoint } from "../domain/mandala-types";
import { mandalaSignature } from "./mandala-density";
import { shapeReach, shapeSpan, shapeTraces } from "./mandala-family";
/** Raster that decides whether a stretch of line has been counted already. */
const LINE_GRID = 128;
/** Lines closer in direction than this run alongside each other; they do not cross. */
const CROSSING_MIN_ANGLE = (12 * Math.PI) / 180;
/** Meeting points this close, as a share of the reach, are one place. */
const CROSSING_MERGE_SHARE = 0.04;
/** Buckets per side of the index that finds segments near each other. */
const CROSSING_BUCKETS = 32;

export interface MandalaShapeMeasures {
  ink: number;
  spaces: number;
  crossings: number;
  line: number;
}

export interface MandalaComplexity extends MandalaShapeMeasures {
  blend: number;
}

const MEASURES = new WeakMap<MandalaPaths, MandalaShapeMeasures>();

/** All but `blend`, which needs the whole set. Measured once per geometry. */
export function mandalaShapeMeasures(paths: MandalaPaths): MandalaShapeMeasures {
  const cached = MEASURES.get(paths);
  if (cached) return cached;
  const traces = shapeTraces(paths);
  const span = shapeSpan(paths, traces);
  const reach = shapeReach(traces);
  const measures: MandalaShapeMeasures = {
    // Ink and spaces are the per-sequence measure, so the test page and the
    // shipping climb rank by the very same numbers.
    ink: mandalaSignature(paths).coverage,
    spaces: mandalaSignature(paths).spaces,
    crossings: countCrossings(traces, reach),
    line: lineLength(traces, span, reach),
  };
  MEASURES.set(paths, measures);
  return measures;
}

/**
 * The rank of each shape, ordered by `spaces` and then `ink`. Shapes equal on
 * both share a rank, so an order by rank stays stable for them.
 */
export function blendRanks(measures: readonly MandalaShapeMeasures[]): number[] {
  const order = measures
    .map((_, i) => i)
    .sort((a, b) => measures[a]!.spaces - measures[b]!.spaces || measures[a]!.ink - measures[b]!.ink);
  const ranks = new Array<number>(measures.length);
  let rank = 0;
  order.forEach((index, at) => {
    const before = at > 0 ? measures[order[at - 1]!]! : null;
    const own = measures[index]!;
    if (before && (before.spaces !== own.spaces || before.ink !== own.ink)) rank = at;
    ranks[index] = rank;
  });
  return ranks;
}

/** Every measure for every shape, `blend` included. */
export function mandalaComplexities(paths: readonly MandalaPaths[]): MandalaComplexity[] {
  const measures = paths.map(mandalaShapeMeasures);
  const ranks = blendRanks(measures);
  return measures.map((m, i) => ({ ...m, blend: ranks[i]! }));
}

/** Length walked over cells not already visited, over the figure's reach. */
function lineLength(traces: readonly MandalaPoint[][], span: number, reach: number): number {
  if (!(reach > 0) || !(span > 0)) return 0;
  const cell = (2 * span) / LINE_GRID;
  const visited = new Uint8Array(LINE_GRID * LINE_GRID);
  const last = LINE_GRID - 1;
  let length = 0;
  for (const points of traces) {
    // Every step inside a cell counts when the walk found that cell new, so a
    // cell crossed in several steps still adds its whole stretch of line.
    let current = -1;
    let fresh = false;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!;
      const to = points[i]!;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(distance / (cell / 2)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = Math.floor((from.x + (to.x - from.x) * t + span) / cell);
        const cy = Math.floor((from.y + (to.y - from.y) * t + span) / cell);
        const index =
          Math.max(0, Math.min(last, cy)) * LINE_GRID + Math.max(0, Math.min(last, cx));
        if (index !== current) {
          current = index;
          fresh = !visited[index];
          visited[index] = 1;
        }
        if (fresh) length += distance / steps;
      }
    }
  }
  return length / reach;
}

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Which trace, and where along it; neighbours along a trace always touch. */
  trace: number;
  at: number;
}

/** The lines as segments, a stretch drawn twice kept once. */
function uniqueSegments(traces: readonly MandalaPoint[][]): Segment[] {
  const seen = new Set<string>();
  const segments: Segment[] = [];
  const round = (v: number): number => Math.round(v * 100);
  traces.forEach((points, trace) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (a.x === b.x && a.y === b.y) continue;
      const one = `${round(a.x)},${round(a.y)}`;
      const two = `${round(b.x)},${round(b.y)}`;
      const key = one < two ? `${one}|${two}` : `${two}|${one}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, trace, at: i });
    }
  });
  return segments;
}

/** Where two segments touch, at an angle that reads as a crossing; else null. */
function meeting(s: Segment, u: Segment): MandalaPoint | null {
  const dx1 = s.bx - s.ax;
  const dy1 = s.by - s.ay;
  const dx2 = u.bx - u.ax;
  const dy2 = u.by - u.ay;
  const cross = dx1 * dy2 - dy1 * dx2;
  const lengths = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
  if (Math.abs(cross) < lengths * Math.sin(CROSSING_MIN_ANGLE)) return null;
  const px = u.ax - s.ax;
  const py = u.ay - s.ay;
  const t = (px * dy2 - py * dx2) / cross;
  const v = (px * dy1 - py * dx1) / cross;
  const slack = 1e-6;
  if (t < -slack || t > 1 + slack || v < -slack || v > 1 + slack) return null;
  return { x: s.ax + dx1 * t, y: s.ay + dy1 * t };
}

function countCrossings(traces: readonly MandalaPoint[][], reach: number): number {
  if (!(reach > 0)) return 0;
  const segments = uniqueSegments(traces);
  const bucketSize = (2 * reach) / CROSSING_BUCKETS;
  const bucketOf = (v: number): number =>
    Math.max(0, Math.min(CROSSING_BUCKETS - 1, Math.floor((v + reach) / bucketSize)));
  const buckets = new Map<number, number[]>();
  segments.forEach((s, index) => {
    const x0 = bucketOf(Math.min(s.ax, s.bx));
    const x1 = bucketOf(Math.max(s.ax, s.bx));
    const y0 = bucketOf(Math.min(s.ay, s.by));
    const y1 = bucketOf(Math.max(s.ay, s.by));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = y * CROSSING_BUCKETS + x;
        const list = buckets.get(key);
        if (list) list.push(index);
        else buckets.set(key, [index]);
      }
    }
  });

  const mergeSize = reach * CROSSING_MERGE_SHARE;
  const places = new Set<string>();
  const tested = new Set<number>();
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const pair = a < b ? a * segments.length + b : b * segments.length + a;
        if (tested.has(pair)) continue;
        tested.add(pair);
        const s = segments[a]!;
        const u = segments[b]!;
        if (s.trace === u.trace && Math.abs(s.at - u.at) <= 1) continue;
        const point = meeting(s, u);
        if (point) places.add(`${Math.floor(point.x / mergeSize)},${Math.floor(point.y / mergeSize)}`);
      }
    }
  }
  return countPlaces(places);
}

/** Occupied merge cells, joined when they touch, counted as one place each. */
function countPlaces(places: ReadonlySet<string>): number {
  const left = new Set(places);
  let count = 0;
  for (const start of places) {
    if (!left.has(start)) continue;
    count++;
    left.delete(start);
    const stack = [start];
    while (stack.length > 0) {
      const [x, y] = stack.pop()!.split(",").map(Number) as [number, number];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${x + dx},${y + dy}`;
          if (left.has(key)) {
            left.delete(key);
            stack.push(key);
          }
        }
      }
    }
  }
  return count;
}
