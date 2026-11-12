/**
 * Runs the family distance for a set of pairs: in a module worker when the
 * browser can start one, otherwise in idle slices on the page.
 *
 * The climb hands it shapes and the pairs its saved book lacks; it hands back
 * one distance per pair. Tests and SSR have no Worker, so they take the slice
 * path, which runs the very same steps (`measurePairSteps`).
 */
import type {
  MandalaDistanceWorkerIn,
  MandalaDistanceWorkerOut,
} from "../workers/mandala-family-distance.worker";
import { measurePairSteps, type ShapeOutline } from "./mandala-family-distance";
import { runInSlices } from "./mandala-family";

export interface MandalaDistanceJob {
  readonly outlines: readonly ShapeOutline[];
  /** Flat pairs of indices into `outlines`: i0, j0, i1, j1 ... */
  readonly pairs: Uint32Array;
}

export interface MandalaDistanceOptions {
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

/** Measures every pair of a job; resolves with one distance per pair, in order. */
export type MandalaDistanceRunner = (
  job: MandalaDistanceJob,
  options?: MandalaDistanceOptions
) => Promise<Float32Array>;

/** The same work in idle slices on the page. */
export const measureDistancesInSlices: MandalaDistanceRunner = (job, options = {}) => {
  const out = new Float32Array(job.pairs.length >> 1);
  const steps = measurePairSteps(job.outlines, job.pairs, out, options.onProgress);
  return runInSlices(steps, { signal: options.signal }).then(() => out);
};

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../workers/mandala-family-distance.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

/**
 * The worker when one starts, the slices when not. A worker that fails part
 * way hands the whole job to the slices, so a pool always gets its families.
 */
export const measureDistances: MandalaDistanceRunner = (job, options = {}) => {
  const { onProgress, signal } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  const worker = startWorker();
  if (!worker) return measureDistancesInSlices(job, options);

  return new Promise<Float32Array>((resolve, reject) => {
    let settled = false;
    const finish = (then: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      then();
    };
    const fallBack = (): void =>
      finish(() => measureDistancesInSlices(job, options).then(resolve, reject));
    const onAbort = (): void => finish(() => reject(signal?.reason));
    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<MandalaDistanceWorkerOut>): void => {
      const message = event.data;
      if (message.type === "progress") onProgress?.(message.share);
      else if (message.type === "done") finish(() => resolve(message.distances));
      else fallBack();
    };
    worker.onerror = (event): void => {
      // A worker that cannot load (an old browser, a blocked module) is not an
      // error the visitor needs to see; the page does the work instead.
      event.preventDefault();
      fallBack();
    };

    const request: MandalaDistanceWorkerIn = {
      type: "measure",
      outlines: job.outlines.map((outline) => ({ traces: outline.traces, span: outline.span })),
      pairs: job.pairs,
    };
    worker.postMessage(request);
  });
};
