/**
 * Runs the family distance for a set of pairs: split across the mandala
 * workers when the browser can start them, otherwise in idle slices on the
 * page.
 *
 * The climb hands it shapes and the pairs its saved book lacks; it hands back
 * one distance per pair. Tests and SSR have no Worker, so they take the slice
 * path, which runs the very same steps (`measurePairSteps`).
 */
import { measurePairSteps, type ShapeOutline } from "./mandala-family-distance";
import { runInSlices } from "./mandala-family";
import { mandalaWorkers, type MandalaWorkers } from "./mandala-workers";

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
export const measureDistancesInSlices: MandalaDistanceRunner = (
  job,
  options = {}
) => {
  const out = new Float32Array(job.pairs.length >> 1);
  const steps = measurePairSteps(
    job.outlines,
    job.pairs,
    out,
    options.onProgress
  );
  return runInSlices(steps, { signal: options.signal }).then(() => out);
};

/** Below this many pairs one task does it all; splitting costs more than it saves. */
const PAIRS_PER_TASK_MIN = 2000;

/**
 * The pairs in one piece per worker, measured at once, put back in order.
 * Rejects if a worker fails or the job is dropped.
 */
export function measureDistancesOn(
  workers: MandalaWorkers,
  { minPairsPerTask = PAIRS_PER_TASK_MIN }: { minPairsPerTask?: number } = {}
): MandalaDistanceRunner {
  return async (job, options = {}) => {
    const { onProgress, signal } = options;
    const count = job.pairs.length >> 1;
    const pieces = Math.max(
      1,
      Math.min(workers.size, Math.floor(count / minPairsPerTask))
    );
    const per = Math.ceil(count / pieces);
    const outlines = job.outlines.map((outline) => ({
      traces: outline.traces,
      span: outline.span,
    }));
    const shares = new Array<number>(pieces).fill(0);
    const out = new Float32Array(count);
    // One failed piece stops the others: the caller redoes the whole job.
    const stop = new AbortController();
    const onAbort = (): void => stop.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort);
    try {
      await Promise.all(
        Array.from({ length: pieces }, (_, piece) => measurePiece(piece))
      );
    } catch (error) {
      stop.abort(error);
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
    return out;

    async function measurePiece(piece: number): Promise<void> {
      const from = piece * per;
      const to = Math.min(count, from + per);
      const result = await workers.run(
        () => ({
          type: "distances",
          outlines,
          pairs: job.pairs.slice(2 * from, 2 * to),
        }),
        {
          signal: stop.signal,
          onProgress: (share) => {
            shares[piece] = share * (to - from);
            onProgress?.(
              shares.reduce((sum, done) => sum + done, 0) / Math.max(1, count)
            );
          },
        }
      );
      if (result.type !== "distances")
        throw new Error("A mandala worker answered the wrong task");
      out.set(result.distances, from);
    }
  };
}

/**
 * The workers when they run, the slices when not. A worker that fails part
 * way hands the whole job to the slices, so a pool always gets its families.
 */
export const measureDistances: MandalaDistanceRunner = async (
  job,
  options = {}
) => {
  const { signal } = options;
  if (signal?.aborted) throw signal.reason;
  const workers = mandalaWorkers();
  if (!workers || workers.broken) return measureDistancesInSlices(job, options);
  try {
    return await measureDistancesOn(workers)(job, options);
  } catch (error) {
    if (signal?.aborted) throw error;
    return measureDistancesInSlices(job, options);
  }
};
