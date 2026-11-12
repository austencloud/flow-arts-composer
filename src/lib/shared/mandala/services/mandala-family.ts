/**
 * Mandala families: shapes a person would call the same picture.
 *
 * The density key (`mandala-density.ts`) is an exact hash of a raster, so a
 * hair-width difference makes a new mandala. A family tolerates that, and
 * also the turned and flipped copies of a picture, because box-mode and
 * diamond-mode sequences draw one figure 45 degrees apart. Colour plays no
 * part: both hands go onto one raster.
 *
 * This is the page's half. It turns a geometry into the plain outline the
 * distance needs (traces and span, which takes the renderer's extent), and
 * builds a whole tree on the page for the test route. The distance itself,
 * the linkage and the cut live in `mandala-family-distance.ts`, which a
 * worker can import.
 */
import type { MandalaPaths, MandalaPoint } from "../domain/mandala-types";
import { MANDALA_STANDARD_TIP_DX } from "../domain/mandala-constants";
import { pointsOf } from "./mandala-density";
import { resolveMandalaRenderExtent } from "./mandala-renderer";
import { flattenTraces } from "./mandala-raster";
import {
  allPairs,
  figureOf,
  linkFamilyTree,
  matrixFromPairs,
  measurePairSteps,
  type FamilyMember,
  type FamilyTree,
  type ShapeFigure,
  type ShapeOutline,
} from "./mandala-family-distance";

/** The figure's traces, both hands together, with no empty ones. */
export function shapeTraces(paths: MandalaPaths): MandalaPoint[][] {
  return [...paths.left, ...paths.right].map(pointsOf).filter((p) => p.length > 0);
}

/** The farthest any traced point lies from the centre. */
export function shapeReach(traces: readonly MandalaPoint[][]): number {
  let reach = 0;
  for (const points of traces) {
    for (const p of points) reach = Math.max(reach, Math.hypot(p.x, p.y));
  }
  return reach;
}

/**
 * Half the side of the square a shape is compared in: the still's own extent,
 * so a small figure stays small, and wider when a point would leave the square
 * on being turned.
 */
export function shapeSpan(paths: MandalaPaths, traces: readonly MandalaPoint[][]): number {
  const extent = resolveMandalaRenderExtent(paths, {
    show: "both",
    tipDx: MANDALA_STANDARD_TIP_DX,
  });
  return Math.max(extent, shapeReach(traces));
}

/** What the distance needs of a geometry, ready to send to a worker. */
export function shapeOutline(paths: MandalaPaths): ShapeOutline {
  const traces = shapeTraces(paths);
  return { traces: flattenTraces(traces), span: shapeSpan(paths, traces) };
}

export function shapeFigure(paths: MandalaPaths): ShapeFigure {
  return figureOf(shapeOutline(paths));
}

/** A shape the page can build a tree from: the tree's needs plus its geometry. */
export interface FamilyShape extends FamilyMember {
  readonly paths: MandalaPaths;
}

/** Each yield is a small piece of work; `progress` runs from 0 to 1. */
function* treeSteps<S extends FamilyShape>(
  shapes: readonly S[],
  progress: (share: number) => void
): Generator<void, FamilyTree<S>> {
  const n = shapes.length;
  const outlines: ShapeOutline[] = [];
  for (let i = 0; i < n; i++) {
    outlines.push(shapeOutline(shapes[i]!.paths));
    progress((0.1 * (i + 1)) / n);
    yield;
  }
  const pairs = allPairs(n);
  const values = new Float32Array(pairs.length >> 1);
  yield* measurePairSteps(outlines, pairs, values, (share) => progress(0.1 + 0.85 * share));
  const tree = linkFamilyTree(shapes, matrixFromPairs(n, pairs, values));
  progress(1);
  return tree;
}

/** The whole tree, measured on the page in one go. */
export function buildFamilyTree<S extends FamilyShape>(shapes: readonly S[]): FamilyTree<S> {
  const steps = treeSteps(shapes, () => {});
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

export interface FamilyTreeSlices {
  /** Longest stretch of work between breaths, in milliseconds. */
  budgetMs?: number;
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
  /** Gives the page a turn; the default is a macrotask. */
  breathe?: () => Promise<void>;
}

const FAMILY_SLICE_MS = 24;

/** Runs a generator of small steps in slices, giving the page a turn between. */
export async function runInSlices<T>(
  steps: Generator<void, T>,
  options: Pick<FamilyTreeSlices, "budgetMs" | "signal" | "breathe"> = {}
): Promise<T> {
  const budget = options.budgetMs ?? FAMILY_SLICE_MS;
  const breathe =
    options.breathe ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  options.signal?.throwIfAborted();
  for (;;) {
    const start = performance.now();
    do {
      const step = steps.next();
      if (step.done) return step.value;
    } while (performance.now() - start < budget);
    await breathe();
    options.signal?.throwIfAborted();
  }
}

/** The same tree, built without holding up the page. Rejects when aborted. */
export function buildFamilyTreeInSlices<S extends FamilyShape>(
  shapes: readonly S[],
  options: FamilyTreeSlices = {}
): Promise<FamilyTree<S>> {
  return runInSlices(treeSteps(shapes, options.onProgress ?? (() => {})), options);
}
