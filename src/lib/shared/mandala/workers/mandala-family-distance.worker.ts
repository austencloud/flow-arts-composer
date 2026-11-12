/// <reference lib="webworker" />

/**
 * Mandala family distance worker.
 *
 * Measures how unlike pairs of mandala shapes are, off the page. The page
 * sends each shape's traces and span (worked out there, since the span needs
 * the renderer) and the pairs it still lacks; this posts progress and then
 * the distances, one per pair, in the order asked. It imports plain maths
 * only: no renderer, no DOM.
 */
import { measurePairSteps, type ShapeOutline } from "../services/mandala-family-distance";

export interface MandalaDistanceRequest {
  type: "measure";
  outlines: ShapeOutline[];
  /** Flat pairs of indices into `outlines`: i0, j0, i1, j1 ... */
  pairs: Uint32Array;
}
export type MandalaDistanceWorkerIn = MandalaDistanceRequest;

export type MandalaDistanceWorkerOut =
  | { type: "progress"; share: number }
  | { type: "done"; distances: Float32Array }
  | { type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Progress is posted when it has moved at least this much. */
const PROGRESS_STEP = 0.01;

scope.onmessage = (event: MessageEvent<MandalaDistanceWorkerIn>): void => {
  const { outlines, pairs } = event.data;
  try {
    const distances = new Float32Array(pairs.length >> 1);
    let posted = 0;
    const steps = measurePairSteps(outlines, pairs, distances, (share) => {
      if (share - posted < PROGRESS_STEP && share < 1) return;
      posted = share;
      const message: MandalaDistanceWorkerOut = { type: "progress", share };
      scope.postMessage(message);
    });
    while (!steps.next().done) {
      // Each step is small; the worker has nothing else to do between them.
    }
    const done: MandalaDistanceWorkerOut = { type: "done", distances };
    scope.postMessage(done, [distances.buffer]);
  } catch (error) {
    const failed: MandalaDistanceWorkerOut = {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(failed);
  }
};
