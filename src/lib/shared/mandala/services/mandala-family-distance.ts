/**
 * The family maths that needs no drawing: how unlike two traced shapes are,
 * and the tree that groups them.
 *
 * A shape arrives here as its traces (flat x, y numbers) and its span, already
 * worked out on the page by `mandala-family.ts`, which may use the renderer.
 * Nothing in this file touches the DOM or the renderer, so the distance worker
 * imports it as is.
 *
 * Distance is a symmetric chamfer distance: the mean distance from each marked
 * cell of one shape to the nearest marked cell of the other, both directions,
 * the worse one, at the best of the 16 turns and flips. The points are
 * transformed and then rasterised, since 45 degrees is not exact on a square
 * grid. The result is a share of the tighter shape's gap between lines. In
 * cells alone, on the real pool, every dense figure sits close to every other
 * (its lines leave nowhere far to be) and one family swallowed 1,166 of 1,577
 * sequences, while a tiny shift in a sparse figure counted just the same.
 *
 * Grouping is complete linkage, so no family holds two shapes farther apart
 * than the threshold; a first-match pass chains hundreds of boxes together.
 * The tree is built once and cut at any threshold without measuring again.
 */
import { flatReach, rasterise, type FlatTrace, type TraceTurn } from "./mandala-raster";

/** Cells per side of the raster two shapes are compared on. */
export const FAMILY_GRID = 48;
/** Eight turns of 45 degrees, each also mirrored. */
export const FAMILY_TURNS = 16;
/**
 * Pairs farther apart than this are not measured exactly, which keeps building
 * the tree quick. It is the top of any useful "how alike" scale.
 */
export const FAMILY_DISTANCE_CAP = 1;
/**
 * Bumped whenever the distance, its grid or its turns change, so a saved
 * distance book from another version is ignored and rewritten.
 */
export const MANDALA_FAMILY_VERSION = 1;

/** The chamfer weights: one cell straight is 3, one cell diagonal is 4. */
const CHAMFER_STRAIGHT = 3;
const CHAMFER_DIAGONAL = 4;

/** What the distance needs of a shape: its traces and the square it sits in. */
export interface ShapeOutline {
  readonly traces: readonly FlatTrace[];
  /** Half the side of the square the shape is compared in. */
  readonly span: number;
}

/** Turn `index`: 0 to 7 are rotations in 45 degree steps, 8 to 15 the same after a mirror. */
function turnOf(index: number): TraceTurn {
  const angle = ((index % 8) * Math.PI) / 4;
  return { cos: Math.cos(angle), sin: Math.sin(angle), flip: index >= 8 ? -1 : 1 };
}

/** The turn that undoes turn `index`; a mirrored turn is its own inverse. */
function inverseTurn(index: number): number {
  return index >= 8 ? index : (8 - index) % 8;
}

/** A shape made ready to compare: its cells at every turn, and one distance field. */
export interface ShapeFigure {
  /** The marked cells at each turn. */
  readonly cells: readonly Uint16Array[];
  /** Chamfer distance of every cell to the unturned shape's nearest mark. */
  readonly field: Uint8Array;
  /** How far apart the lines stand: the mean distance, in cells, inside the figure's reach. */
  readonly gap: number;
}

/** Mean of the distance field over the disc the figure reaches, in cells; never below one. */
function meanGap(field: Uint8Array, grid: number, reachCells: number): number {
  const centre = (grid - 1) / 2;
  let sum = 0;
  let count = 0;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (Math.hypot(x - centre, y - centre) > reachCells) continue;
      sum += field[y * grid + x]!;
      count++;
    }
  }
  return count > 0 ? Math.max(1, sum / count / CHAMFER_STRAIGHT) : 1;
}

function cellsOf(raster: Uint8Array): Uint16Array {
  let count = 0;
  for (let i = 0; i < raster.length; i++) count += raster[i]!;
  const cells = new Uint16Array(count);
  let at = 0;
  for (let i = 0; i < raster.length; i++) if (raster[i]) cells[at++] = i;
  return cells;
}

/** Two-pass chamfer transform; values fit a byte on grids up to 63 cells. */
function distanceField(raster: Uint8Array, grid: number): Uint8Array {
  const field = new Uint8Array(raster.length);
  for (let i = 0; i < raster.length; i++) field[i] = raster[i] ? 0 : 255;
  const relax = (i: number, j: number, cost: number): void => {
    const through = field[j]! + cost;
    if (through < field[i]!) field[i] = through;
  };
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const i = y * grid + x;
      if (x > 0) relax(i, i - 1, CHAMFER_STRAIGHT);
      if (y > 0) {
        relax(i, i - grid, CHAMFER_STRAIGHT);
        if (x > 0) relax(i, i - grid - 1, CHAMFER_DIAGONAL);
        if (x < grid - 1) relax(i, i - grid + 1, CHAMFER_DIAGONAL);
      }
    }
  }
  for (let y = grid - 1; y >= 0; y--) {
    for (let x = grid - 1; x >= 0; x--) {
      const i = y * grid + x;
      if (x < grid - 1) relax(i, i + 1, CHAMFER_STRAIGHT);
      if (y < grid - 1) {
        relax(i, i + grid, CHAMFER_STRAIGHT);
        if (x < grid - 1) relax(i, i + grid + 1, CHAMFER_DIAGONAL);
        if (x > 0) relax(i, i + grid - 1, CHAMFER_DIAGONAL);
      }
    }
  }
  return field;
}

export function figureOf(outline: ShapeOutline): ShapeFigure {
  const { traces, span } = outline;
  const cells: Uint16Array[] = [];
  let field: Uint8Array | null = null;
  for (let turn = 0; turn < FAMILY_TURNS; turn++) {
    const raster = rasterise(traces, span, FAMILY_GRID, turn === 0 ? undefined : turnOf(turn));
    cells.push(cellsOf(raster));
    if (turn === 0) field = distanceField(raster, FAMILY_GRID);
  }
  const reachCells = span > 0 ? (flatReach(traces) / span) * (FAMILY_GRID / 2) : 0;
  return { cells, field: field!, gap: meanGap(field!, FAMILY_GRID, reachCells) };
}

/**
 * The mean of `field` over `cells`, or Infinity as soon as the sum proves the
 * mean will exceed `limit` (the sum is in chamfer units).
 */
function meanOver(cells: Uint16Array, field: Uint8Array, limit: number): number {
  const stop = limit * cells.length;
  let sum = 0;
  for (let i = 0; i < cells.length; i++) {
    sum += field[cells[i]!]!;
    if (sum > stop) return Infinity;
  }
  return sum / cells.length;
}

const SAMPLE_STRIDE = 7;
const SAMPLE_MARGIN = 1.3;

function sampledMean(cells: Uint16Array, field: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < cells.length; i += SAMPLE_STRIDE) {
    sum += field[cells[i]!]!;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * How unlike two shapes are at their best turn, as a share of the tighter
 * shape's gap between lines. Zero means the same cells at some turn. A pair
 * farther apart than `cap` comes back as `cap`.
 */
export function shapeDistance(a: ShapeFigure, b: ShapeFigure, cap = Infinity): number {
  if (a.cells[0]!.length === 0 || b.cells[0]!.length === 0) {
    return a.cells[0]!.length === b.cells[0]!.length ? 0 : cap;
  }
  const gap = Math.min(a.gap, b.gap);
  let best = cap * gap * CHAMFER_STRAIGHT;
  for (let turn = 0; turn < FAMILY_TURNS; turn++) {
    // A turn that looks hopeless on a sample is not worth the full walk. Being
    // wrong only overstates the distance, so it can never join far shapes.
    if (sampledMean(a.cells[turn]!, b.field) > best * SAMPLE_MARGIN) continue;
    const forward = meanOver(a.cells[turn]!, b.field, best);
    if (forward > best) continue;
    // Turning a onto b and measuring back is the same as undoing the turn on b.
    const back = meanOver(b.cells[inverseTurn(turn)]!, a.field, best);
    if (back > best) continue;
    best = Math.max(forward, back);
  }
  return best / (gap * CHAMFER_STRAIGHT);
}

/**
 * Measures the pairs `pairs` names (flat: i0, j0, i1, j1 ...) into `out`, one
 * distance per pair, capped at `FAMILY_DISTANCE_CAP`. Each yield is a small
 * piece of work, so the same steps run whole in the worker or in idle slices
 * on the page. A shape's figure is made the first time a pair needs it.
 */
export function* measurePairSteps(
  outlines: readonly ShapeOutline[],
  pairs: Uint32Array,
  out: Float32Array,
  onProgress: (share: number) => void = () => {}
): Generator<void, void> {
  const figures = new Array<ShapeFigure | undefined>(outlines.length);
  const count = pairs.length >> 1;
  for (let p = 0; p < count; p++) {
    const i = pairs[2 * p]!;
    const j = pairs[2 * p + 1]!;
    // Making a figure is sixteen rasters, so it counts as a step of its own.
    if (!figures[i]) {
      figures[i] = figureOf(outlines[i]!);
      yield;
    }
    if (!figures[j]) {
      figures[j] = figureOf(outlines[j]!);
      yield;
    }
    out[p] = shapeDistance(figures[i]!, figures[j]!, FAMILY_DISTANCE_CAP);
    if ((p & 31) === 31) {
      onProgress((p + 1) / count);
      yield;
    }
  }
  onProgress(1);
}

/** Every pair of `n` shapes, flat: (0,1), (0,2) ... (n-2,n-1). */
export function allPairs(n: number): Uint32Array {
  const pairs = new Uint32Array(n > 1 ? n * (n - 1) : 0);
  let at = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs[at++] = i;
      pairs[at++] = j;
    }
  }
  return pairs;
}

/** What the tree needs of a shape; the mandala index's groups already fit. */
export interface FamilyMember {
  readonly key: string;
  readonly sequences: readonly unknown[];
}

export interface FamilyMerge {
  a: number;
  b: number;
  height: number;
}

/** Shapes merged at a height; a family cut at `t` keeps merges of height up to `t`. */
export interface FamilyTree<S extends FamilyMember = FamilyMember> {
  readonly shapes: readonly S[];
  /** Ascending by height. `a` and `b` are shape indices, one from each side. */
  readonly merges: readonly FamilyMerge[];
}

export interface MandalaFamily<S extends FamilyMember = FamilyMember> {
  /** The representative's key: a family keeps it as long as it stays the most drawn. */
  readonly id: string;
  /** The family's most-drawn shape. */
  readonly representative: S;
  /** Every shape in the family, most drawn first. */
  readonly members: readonly S[];
  /** All the sequences of all the members. */
  readonly sequenceCount: number;
}

/**
 * The agglomerative merge order by nearest-neighbour chain, O(n^2). Complete
 * linkage is reducible, so the chain gives the same tree as the naive method.
 * Each merge records one shape from each side, which is all a cut needs.
 * `distances` is the full n by n matrix and is overwritten.
 */
export function* completeLinkage(
  distances: Float32Array,
  n: number
): Generator<void, FamilyMerge[]> {
  const at = (i: number, j: number): number => i * n + j;
  const active = new Uint8Array(n).fill(1);
  const merges: FamilyMerge[] = [];
  const chain: number[] = [];
  let remaining = n;
  let scan = 0;
  while (remaining > 1) {
    if (chain.length === 0) {
      while (!active[scan]) scan++;
      chain.push(scan);
    }
    const top = chain[chain.length - 1]!;
    const previous = chain.length > 1 ? chain[chain.length - 2]! : -1;
    // Prefer the previous link on a tie, or the chain can circle forever.
    let nearest = previous;
    let nearestDistance = previous >= 0 ? distances[at(top, previous)]! : Infinity;
    for (let other = 0; other < n; other++) {
      if (!active[other] || other === top) continue;
      const d = distances[at(top, other)]!;
      if (d < nearestDistance) {
        nearest = other;
        nearestDistance = d;
      }
    }
    if (nearest === previous && previous >= 0) {
      chain.length -= 2;
      merges.push({ a: top, b: previous, height: nearestDistance });
      // Complete linkage: the merged cluster is as far as its farther side.
      for (let other = 0; other < n; other++) {
        if (!active[other] || other === top || other === previous) continue;
        const d = Math.max(distances[at(top, other)]!, distances[at(previous, other)]!);
        distances[at(previous, other)] = d;
        distances[at(other, previous)] = d;
      }
      active[top] = 0;
      remaining--;
      yield;
    } else {
      chain.push(nearest);
    }
  }
  return merges.sort((x, y) => x.height - y.height);
}

/**
 * The tree for `shapes` from their full distance matrix (n by n, row major),
 * in one go. Linking is quick next to measuring: a few milliseconds for the
 * community pool. The matrix is overwritten.
 */
export function linkFamilyTree<S extends FamilyMember>(
  shapes: readonly S[],
  distances: Float32Array
): FamilyTree<S> {
  const steps = completeLinkage(distances, shapes.length);
  for (;;) {
    const step = steps.next();
    if (step.done) return { shapes, merges: step.value };
  }
}

/** The full n by n matrix from distances listed per pair, as `allPairs` orders them. */
export function matrixFromPairs(n: number, pairs: Uint32Array, values: Float32Array): Float32Array {
  const matrix = new Float32Array(n * n);
  for (let p = 0; p < values.length; p++) {
    const i = pairs[2 * p]!;
    const j = pairs[2 * p + 1]!;
    matrix[i * n + j] = values[p]!;
    matrix[j * n + i] = values[p]!;
  }
  return matrix;
}

/**
 * The families at one "how alike" threshold, on the distance's scale. Pairs beyond
 * `FAMILY_DISTANCE_CAP` were never measured, so a cut there or above stays
 * below the cap. Largest families first, then by the representative's key.
 */
export function familiesAt<S extends FamilyMember>(
  tree: FamilyTree<S>,
  threshold: number
): MandalaFamily<S>[] {
  const parent = tree.shapes.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root]! !== root) root = parent[root]!;
    while (parent[i]! !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (const { a, b, height } of tree.merges) {
    if (height > threshold || height >= FAMILY_DISTANCE_CAP) break;
    parent[find(a)] = find(b);
  }
  const byRoot = new Map<number, S[]>();
  tree.shapes.forEach((shape, i) => {
    const root = find(i);
    const members = byRoot.get(root);
    if (members) members.push(shape);
    else byRoot.set(root, [shape]);
  });
  return [...byRoot.values()]
    .map((members) => {
      const sorted = [...members].sort(
        (x, y) => y.sequences.length - x.sequences.length || x.key.localeCompare(y.key)
      );
      const representative = sorted[0]!;
      return {
        id: representative.key,
        representative,
        members: sorted,
        sequenceCount: sorted.reduce((sum, shape) => sum + shape.sequences.length, 0),
      };
    })
    .sort((x, y) => y.sequenceCount - x.sequenceCount || x.id.localeCompare(y.id));
}
