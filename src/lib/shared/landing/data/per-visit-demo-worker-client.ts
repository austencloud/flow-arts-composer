/**
 * Main-thread half of the per-visit demo worker.
 *
 * Owns one lazily created worker for the whole page, correlates requests to
 * responses by id, and decides when the worker is not an option at all. It
 * never throws: every failure resolves to a status the caller can route on, so
 * per-visit-demo.ts can fall back to the in-process roll without a try/catch
 * around every call site.
 *
 * The worker is created on first use, not at module scope, so importing this
 * module during SSR (or in jsdom, where `Worker` does not exist) costs nothing
 * and starts nothing.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type {
  PerVisitDemoRequest,
  PerVisitDemoResponse,
} from "$lib/shared/landing/data/per-visit-demo.worker";

export type WorkerRollResult =
  /** The worker ran the roll and produced a sequence. */
  | { status: "ok"; sequence: SequenceData }
  /** The worker ran and generation failed. Caller substitutes the fallback. */
  | { status: "failed" }
  /** No worker could run this. Caller must roll in-process instead. */
  | { status: "unavailable" };

const UNAVAILABLE: WorkerRollResult = { status: "unavailable" };

/**
 * A roll that never answers must not strand the hero's prefetch forever. The
 * budget is far above the measured cost (a cold roll is ~570 ms wall clock,
 * warm ~5 ms) so it only trips on a genuinely wedged worker, and tripping it
 * costs one in-process roll rather than a stuck act.
 */
const RESPONSE_TIMEOUT_MS = 15_000;

let worker: Worker | null = null;
/** Latches once the worker proves unusable, so a broken environment costs one
 *  failed attempt rather than one per draw. */
let unusable = false;
let nextRequestId = 1;

const pending = new Map<number, (result: WorkerRollResult) => void>();

function settleAll(result: WorkerRollResult): void {
  for (const resolve of pending.values()) resolve(result);
  pending.clear();
}

function retireWorker(): void {
  unusable = true;
  const dying = worker;
  worker = null;
  settleAll(UNAVAILABLE);
  dying?.terminate();
}

function ensureWorker(): Worker | null {
  if (unusable) return null;
  if (worker) return worker;
  // `Worker` is absent under SSR and in jsdom; both fall back to the in-process
  // roll, which is also what keeps the existing unit tests on one code path.
  if (typeof Worker === "undefined") {
    unusable = true;
    return null;
  }
  try {
    // The literal `new URL(..., import.meta.url)` form is what lets Vite find,
    // bundle, and fingerprint the worker — do not hoist it into a variable.
    worker = new Worker(
      new URL("./per-visit-demo.worker.ts", import.meta.url),
      { type: "module" }
    );
  } catch (error) {
    console.warn("[per-visit-demo] worker unavailable, rolling in-process:", error);
    unusable = true;
    return null;
  }

  worker.addEventListener(
    "message",
    (event: MessageEvent<PerVisitDemoResponse>) => {
      const data = event.data;
      const resolve = data && pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      resolve(data.ok ? { status: "ok", sequence: data.sequence } : { status: "failed" });
    }
  );
  // An error inside the worker's module graph arrives here, not as a message.
  // Retire it so the act degrades to in-process rolls instead of hanging.
  worker.addEventListener("error", (event) => {
    console.warn("[per-visit-demo] worker error, rolling in-process:", event.message);
    retireWorker();
  });
  worker.addEventListener("messageerror", () => {
    console.warn("[per-visit-demo] worker message could not be deserialized");
    retireWorker();
  });

  return worker;
}

/**
 * Ask the worker for one roll.
 *
 * `startPlacement` is plain-ified before it crosses: the hero holds its current
 * sequence in `$state`, so `sequence.startPlacement` is a Svelte reactive Proxy,
 * and the structured clone algorithm throws DataCloneError on any Proxy exotic
 * object. The JSON round trip is over a single start-placement pictograph, not a
 * sequence, so it is cheap.
 */
export function rollInWorker(options?: {
  propType?: PropType;
  startPlacement?: PictographData | null;
}): Promise<WorkerRollResult> {
  const active = ensureWorker();
  if (!active) return Promise.resolve(UNAVAILABLE);

  let request: PerVisitDemoRequest;
  try {
    request = {
      id: nextRequestId++,
      ...(options?.propType ? { propType: options.propType } : {}),
      ...(options?.startPlacement
        ? {
            startPlacement: JSON.parse(
              JSON.stringify(options.startPlacement)
            ) as PictographData,
          }
        : {}),
    };
  } catch (error) {
    console.warn("[per-visit-demo] could not serialize roll options:", error);
    return Promise.resolve(UNAVAILABLE);
  }

  return new Promise<WorkerRollResult>((resolve) => {
    let settled = false;
    const finish = (result: WorkerRollResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(request.id);
      resolve(result);
    };
    const timer = setTimeout(() => {
      console.warn("[per-visit-demo] worker roll timed out, rolling in-process");
      finish(UNAVAILABLE);
      retireWorker();
    }, RESPONSE_TIMEOUT_MS);

    pending.set(request.id, finish);
    try {
      active.postMessage(request);
    } catch (error) {
      console.warn("[per-visit-demo] could not post roll to worker:", error);
      finish(UNAVAILABLE);
      retireWorker();
    }
  });
}

/** Test seam: forget the cached worker and any latched failure. */
export function resetPerVisitDemoWorkerForTests(): void {
  worker?.terminate();
  worker = null;
  unusable = false;
  pending.clear();
}
