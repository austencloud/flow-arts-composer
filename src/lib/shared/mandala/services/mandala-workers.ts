/**
 * The mandala workers: a few module workers that share the Mandala wall's
 * measuring, so it runs beside the page on several cores at once instead of
 * in the page's idle moments one piece at a time.
 *
 * Measuring the community pool (1,578 sequences, 494 shapes on 12 Nov 2026)
 * took 5.5 s for the sequences and 1.1 s for the shape outlines on the page,
 * then the pair distances in one worker; the wall showed its first tiles at
 * 6 s and all of them at 20 s on an idle desktop, and far later on a busy one,
 * where the page has few idle moments to spare.
 *
 * Tasks queue and each worker takes one at a time. Workers start when work
 * comes and stop after a quiet spell. A worker that cannot load, or that
 * fails, breaks the pool: every waiting task is refused and later ones are
 * refused at once, so callers do the work on the page instead.
 */
import type { MandalaWorkIn, MandalaWorkResult } from "./mandala-measure-work";
import type {
  MandalaWorkerReply,
  MandalaWorkerRequest,
} from "../workers/mandala-measure.worker";

export interface MandalaWorkOptions {
  signal?: AbortSignal;
  /** A distances task's share done, 0 to 1. */
  onProgress?: (share: number) => void;
}

export interface MandalaWorkers {
  /** How many tasks run at once. */
  readonly size: number;
  /** True once a worker failed; every task is then refused. */
  readonly broken: boolean;
  /** Queues one task. `make` builds its message when a worker takes it, so
   *  a long queue does not hold every message at once. */
  run(
    make: () => MandalaWorkIn,
    options?: MandalaWorkOptions
  ): Promise<MandalaWorkResult>;
}

/** The part of a Worker the pool uses; tests pass one that runs in place. */
export interface MandalaWorkerLike {
  postMessage(message: MandalaWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<MandalaWorkerReply>) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface Job {
  id: number;
  make: () => MandalaWorkIn;
  resolve: (result: MandalaWorkResult) => void;
  reject: (reason: unknown) => void;
  options: MandalaWorkOptions;
  onAbort: () => void;
}

interface Slot {
  worker: MandalaWorkerLike;
  job: Job | null;
}

/** Workers stop after this long with nothing to do. */
const IDLE_MS = 20_000;

export function createMandalaWorkers(options: {
  start: () => MandalaWorkerLike;
  size: number;
  idleMs?: number;
}): MandalaWorkers {
  const size = Math.max(1, options.size);
  const idleMs = options.idleMs ?? IDLE_MS;
  const slots: Slot[] = [];
  const queue: Job[] = [];
  let nextId = 1;
  let broken = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function settle(job: Job): void {
    job.options.signal?.removeEventListener("abort", job.onAbort);
  }

  function breakPool(reason: unknown): void {
    if (broken) return;
    broken = true;
    const waiting = [
      ...slots.flatMap((slot) => (slot.job ? [slot.job] : [])),
      ...queue,
    ];
    queue.length = 0;
    for (const slot of slots.splice(0)) {
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.terminate();
    }
    for (const job of waiting) {
      settle(job);
      job.reject(reason);
    }
  }

  function stopIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function idleCheck(): void {
    stopIdle();
    if (queue.length > 0 || slots.some((slot) => slot.job)) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (queue.length > 0 || slots.some((slot) => slot.job)) return;
      for (const slot of slots.splice(0)) slot.worker.terminate();
    }, idleMs);
  }

  function open(): Slot | null {
    let worker: MandalaWorkerLike;
    try {
      worker = options.start();
    } catch (error) {
      breakPool(error);
      return null;
    }
    const slot: Slot = { worker, job: null };
    worker.onmessage = (event) => {
      const reply = event.data;
      const job = slot.job;
      if (!job || reply.id !== job.id) return;
      if (reply.type === "progress") {
        job.options.onProgress?.(reply.share);
        return;
      }
      slot.job = null;
      settle(job);
      if (reply.type === "done") job.resolve(reply.result);
      else job.reject(new Error(reply.message));
      pump();
    };
    worker.onerror = (event) => {
      // A worker that cannot load (an old browser, a blocked module) is not
      // an error the visitor needs to see; the page does the work instead.
      event.preventDefault?.();
      breakPool(new Error("A mandala worker failed"));
    };
    slots.push(slot);
    return slot;
  }

  function pump(): void {
    stopIdle();
    while (queue.length > 0 && !broken) {
      const slot =
        slots.find((candidate) => !candidate.job) ??
        (slots.length < size ? open() : null);
      if (!slot) break;
      const job = queue.shift()!;
      let task: MandalaWorkIn;
      try {
        task = job.make();
      } catch (error) {
        settle(job);
        job.reject(error);
        continue;
      }
      slot.job = job;
      slot.worker.postMessage({ id: job.id, task });
    }
    idleCheck();
  }

  function abort(job: Job): void {
    settle(job);
    const queued = queue.indexOf(job);
    if (queued >= 0) queue.splice(queued, 1);
    const running = slots.findIndex((slot) => slot.job === job);
    if (running >= 0) {
      // The worker is mid-task with nothing to stop it but stopping it.
      const [slot] = slots.splice(running, 1);
      slot!.worker.onmessage = null;
      slot!.worker.onerror = null;
      slot!.worker.terminate();
    }
    job.reject(job.options.signal?.reason);
    pump();
  }

  return {
    size,
    get broken() {
      return broken;
    },
    run(make, runOptions = {}) {
      return new Promise<MandalaWorkResult>((resolve, reject) => {
        if (broken)
          return reject(new Error("The mandala workers are not running"));
        if (runOptions.signal?.aborted) return reject(runOptions.signal.reason);
        const job: Job = {
          id: nextId++,
          make,
          resolve,
          reject,
          options: runOptions,
          onAbort: () => abort(job),
        };
        runOptions.signal?.addEventListener("abort", job.onAbort);
        queue.push(job);
        pump();
      });
    },
  };
}

/** One worker per spare core, leaving one for the page; six at most. */
function poolSize(): number {
  const cores =
    typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(6, cores - 1));
}

let shared: MandalaWorkers | null | undefined;

/** The app's one pool, or null where no Worker exists (tests, SSR). */
export function mandalaWorkers(): MandalaWorkers | null {
  if (shared !== undefined) return shared;
  if (typeof Worker === "undefined") return (shared = null);
  shared = createMandalaWorkers({
    size: poolSize(),
    start: () =>
      new Worker(
        new URL("../workers/mandala-measure.worker.ts", import.meta.url),
        {
          type: "module",
        }
      ) as unknown as MandalaWorkerLike,
  });
  return shared;
}
