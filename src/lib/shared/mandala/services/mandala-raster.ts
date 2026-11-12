/**
 * Plain raster maths for mandala shapes: dropping traced lines onto a grid and
 * counting the spaces they enclose.
 *
 * It imports nothing that draws, so the per-sequence measure, the complexity
 * candidates and the family worker can all share it without pulling the
 * renderer (or the DOM) into a worker. Traces are flat number arrays, x then
 * y for each point, so a shape crosses to a worker as a few copied buffers
 * instead of thousands of little objects.
 */
import type { MandalaPoint } from "../domain/mandala-types";

/** One traced line: x0, y0, x1, y1 and so on. */
export type FlatTrace = Float64Array;

/** A rotation (and maybe a mirror) applied to every point before marking. */
export interface TraceTurn {
  readonly cos: number;
  readonly sin: number;
  /** -1 mirrors x before turning; 1 leaves it. */
  readonly flip: 1 | -1;
}

/** Raster the enclosed spaces are counted on. */
export const SPACES_GRID = 96;
/** An enclosed region smaller than this many cells is a sliver, not a space. */
export const SPACES_MIN_CELLS = 8;

export function flattenTraces(traces: readonly (readonly MandalaPoint[])[]): FlatTrace[] {
  return traces.map((points) => {
    const flat = new Float64Array(points.length * 2);
    points.forEach((p, i) => {
      flat[2 * i] = p.x;
      flat[2 * i + 1] = p.y;
    });
    return flat;
  });
}

/** The farthest any traced point lies from the centre. */
export function flatReach(traces: readonly FlatTrace[]): number {
  let reach = 0;
  for (const flat of traces) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      reach = Math.max(reach, Math.hypot(flat[i]!, flat[i + 1]!));
    }
  }
  return reach;
}

/**
 * Marks every cell the traces pass through on a `grid` by `grid` raster
 * spanning `span` either side of the centre. Half-cell steps leave no gaps a
 * four-way flood fill could leak through.
 */
export function rasterise(
  traces: readonly FlatTrace[],
  span: number,
  grid: number,
  turn?: TraceTurn
): Uint8Array {
  const cells = new Uint8Array(grid * grid);
  if (!(span > 0)) return cells;
  const cell = (2 * span) / grid;
  const last = grid - 1;
  const mark = (x: number, y: number): void => {
    const cx = Math.floor((x + span) / cell);
    const cy = Math.floor((y + span) / cell);
    const ix = cx < 0 ? 0 : cx > last ? last : cx;
    const iy = cy < 0 ? 0 : cy > last ? last : cy;
    cells[iy * grid + ix] = 1;
  };
  for (const flat of traces) {
    const count = flat.length >> 1;
    if (count === 0) continue;
    let px = 0;
    let py = 0;
    for (let i = 0; i < count; i++) {
      let x = flat[2 * i]!;
      let y = flat[2 * i + 1]!;
      if (turn) {
        const mx = x * turn.flip;
        x = mx * turn.cos - y * turn.sin;
        y = mx * turn.sin + y * turn.cos;
      }
      if (i === 0) {
        mark(x, y);
      } else {
        const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (cell / 2)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          mark(px + (x - px) * t, py + (y - py) * t);
        }
      }
      px = x;
      py = y;
    }
  }
  return cells;
}

/** Floods the empty cells from the border; what stays dry is enclosed. */
export function countSpaces(raster: Uint8Array, grid: number): number {
  const seen = new Uint8Array(raster.length);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!raster[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  const flood = (start: number): number => {
    let size = 0;
    push(start);
    while (stack.length > 0) {
      const i = stack.pop()!;
      size++;
      const x = i % grid;
      // Four-way, so a diagonal run of marked cells still holds water.
      if (x > 0) push(i - 1);
      if (x < grid - 1) push(i + 1);
      if (i >= grid) push(i - grid);
      if (i < grid * (grid - 1)) push(i + grid);
    }
    return size;
  };
  for (let n = 0; n < grid; n++) {
    flood(n);
    flood((grid - 1) * grid + n);
    flood(n * grid);
    flood(n * grid + grid - 1);
  }
  let spaces = 0;
  for (let i = 0; i < raster.length; i++) {
    if (!raster[i] && !seen[i] && flood(i) >= SPACES_MIN_CELLS) spaces++;
  }
  return spaces;
}

/** How many enclosed spaces the traces make, inside a square of half-side `span`. */
export function enclosedSpaces(traces: readonly FlatTrace[], span: number): number {
  return countSpaces(rasterise(traces, span, SPACES_GRID), SPACES_GRID);
}
