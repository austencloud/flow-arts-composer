/**
 * The work the mandala workers do, as plain functions: measure sequences,
 * outline shapes and compare pairs of shapes. The worker file calls
 * `doMandalaWork` for each message, and tests call it directly, so both run
 * the very same steps.
 *
 * Steps arrive as JSON text: a sequence's steps can hold values a structured
 * clone refuses, and a JSON copy gives the same mandala (checked on 300 pool
 * sequences, 12 Nov 2026).
 *
 * An outlines task also hands back each shape's drawing, so the wall can draw
 * its tiles without making the geometry again on the page. Copying a drawing
 * back costs about a quarter of making it (0.44 ms against 1.7 ms, 12 Nov).
 *
 * A paths task makes the drawings alone, in a card's own path options, for
 * the mandala a slow gallery card draws while its picture is on the way.
 */
import type { MandalaPaths } from "../domain/mandala-types";
import type { MandalaPathOptions, StepLike } from "./types";
import { calculate } from "./mandala-geometry-calculator";
import { mandalaSignature, type MandalaSignature } from "./mandala-density";
import { shapeOutline } from "./mandala-family";
import { measurePairSteps, type ShapeOutline } from "./mandala-family-distance";

export type MandalaWorkIn =
  | { type: "signatures"; steps: string }
  | { type: "outlines"; steps: string }
  | { type: "paths"; steps: string; options?: MandalaPathOptions }
  | { type: "distances"; outlines: ShapeOutline[]; pairs: Uint32Array };

export type MandalaWorkResult =
  | { type: "signatures"; signatures: MandalaSignature[] }
  | { type: "outlines"; outlines: ShapeOutline[]; paths: MandalaPaths[] }
  | { type: "paths"; paths: MandalaPaths[] }
  | { type: "distances"; distances: Float32Array };

/** Progress is posted when it has moved at least this much. */
const PROGRESS_STEP = 0.02;

/** One sequence's steps per entry, as JSON text, for a signatures, outlines or paths task. */
export function stepsText(stepLists: readonly (readonly StepLike[])[]): string {
  return JSON.stringify(stepLists);
}

/**
 * Does one task. `onProgress` hears a distances task's share done; the result
 * comes with the buffers it can hand over without a copy.
 */
export function doMandalaWork(
  task: MandalaWorkIn,
  onProgress: (share: number) => void = () => {}
): { result: MandalaWorkResult; transfer: Transferable[] } {
  if (task.type === "signatures") {
    const lists = JSON.parse(task.steps) as StepLike[][];
    const signatures = lists.map((steps) => mandalaSignature(calculate(steps)));
    return { result: { type: "signatures", signatures }, transfer: [] };
  }
  if (task.type === "paths") {
    const lists = JSON.parse(task.steps) as StepLike[][];
    const paths = lists.map((steps) =>
      calculate(steps, undefined, undefined, task.options)
    );
    return { result: { type: "paths", paths }, transfer: [] };
  }
  if (task.type === "outlines") {
    const lists = JSON.parse(task.steps) as StepLike[][];
    const paths = lists.map((steps) => calculate(steps));
    const outlines = paths.map((drawing) => shapeOutline(drawing));
    const transfer = outlines.flatMap((outline) =>
      outline.traces.map((trace) => trace.buffer as ArrayBuffer)
    );
    return {
      result: {
        type: "outlines",
        outlines: outlines.map((outline) => ({
          traces: outline.traces,
          span: outline.span,
        })),
        paths,
      },
      transfer,
    };
  }
  const distances = new Float32Array(task.pairs.length >> 1);
  let posted = 0;
  const steps = measurePairSteps(
    task.outlines,
    task.pairs,
    distances,
    (share) => {
      if (share - posted < PROGRESS_STEP && share < 1) return;
      posted = share;
      onProgress(share);
    }
  );
  while (!steps.next().done) {
    // Each step is small; a worker has nothing else to do between them.
  }
  return {
    result: { type: "distances", distances },
    transfer: [distances.buffer],
  };
}
