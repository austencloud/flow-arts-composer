/**
 * The mandala index: every distinct mandala a pool of sequences draws.
 *
 * Measuring a sequence costs about 3.5 ms the first time, and the community
 * pool runs to 1,578 (12 Nov 2026), so the index hands the measuring to the
 * mandala workers (`mandala-workers.ts`) a few sequences per task, and the
 * screen fills in as keys arrive. Without workers it measures in idle slices
 * between frames. Either way each answer is the stage 1 measure (the same as
 * `resolveMandalaSignature`), so the Mandala sort pays nothing afterwards,
 * and is written to IndexedDB so the next visit loads it instead of
 * measuring again.
 *
 * `groups` is the pool's distinct mandalas, simple to complex (enclosed
 * spaces, then coverage), each with the sequences that draw it. `version`
 * ticks after every slice; the Mandala filter reads it so a filtered grid
 * fills in as the measuring runs, and the climb (`mandala-climb.svelte.ts`)
 * listens through `subscribe` so families follow without a host asking.
 */
import { untrack } from "svelte";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import type { MandalaSignature } from "#lib/shared/mandala/services/mandala-density.js";
import { stepsText } from "#lib/shared/mandala/services/mandala-measure-work.js";
import {
  mandalaWorkers,
  type MandalaWorkers,
} from "#lib/shared/mandala/services/mandala-workers.js";
import {
  MANDALA_MEASURE_VERSION,
  mandalaCacheKey,
  peekMandalaSignature,
  resolveMandalaSignature,
  seedMandalaSignature,
} from "./sequence-density";

/** One saved measurement. `id` is the stage 1 cache key. */
export interface MandalaSignatureRow {
  id: string;
  key: string;
  coverage: number;
  /** Enclosed spaces; absent on rows from measure 1, which are ignored anyway. */
  spaces: number;
  /** The measure that produced the row; rows from another measure are ignored. */
  measure: number;
}

export interface MandalaIndexStore {
  load(ids: readonly string[]): Promise<MandalaSignatureRow[]>;
  save(rows: readonly MandalaSignatureRow[]): Promise<void>;
}

/**
 * Runs `work` when the page has time. `work` gets the slice's budget in
 * milliseconds; the returned function cancels a slice not yet run.
 */
export type MandalaIndexScheduler = (
  work: (budgetMs: number) => void
) => () => void;

export interface MandalaGroup {
  key: string;
  coverage: number;
  /** How many spaces the mandala's lines enclose. */
  spaces: number;
  /** The sequences that draw this mandala, in pool order. */
  sequences: readonly SequenceData[];
  /** The mandala's geometry, from its first sequence, made once per key. */
  readonly paths: MandalaPaths;
}

export interface MandalaIndex {
  /** Measure this pool; a pool already set is left alone. */
  setPool(sequences: readonly SequenceData[]): void;
  /** The pool last set, so a host can tell whether the index holds its own. */
  readonly pool: readonly SequenceData[];
  readonly progress: { readonly measured: number; readonly total: number };
  readonly done: boolean;
  /**
   * True once a pool with no sequences has been set. `done` stays false for
   * it, and before any pool is set this is false too, so a door can tell
   * "nothing to draw" from "still loading".
   */
  readonly empty: boolean;
  /** Ticks after every slice and every load from the store. */
  readonly version: number;
  /** Distinct mandalas, simple to complex: enclosed spaces, then coverage, then key. */
  readonly groups: readonly MandalaGroup[];
  groupOf(key: string): MandalaGroup | undefined;
  /** A sequence of the current pool by its id. */
  sequenceById(id: string): SequenceData | undefined;
  /**
   * Called after every change the index makes (a new pool, a slice, a load
   * from the store). Returns the function that stops the calls.
   */
  subscribe(listener: () => void): () => void;
  /** Stop measuring; the pool and its answers stay. */
  stop(): void;
}

/** Idle time the page has not promised to anything else is spent in full. */
const MAX_BUDGET_MS = 40;
/** When the idle callback fires by its timeout, take this much anyway. */
const FORCED_BUDGET_MS = 8;
const IDLE_TIMEOUT_MS = 100;

export const idleScheduler: MandalaIndexScheduler = (work) => {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(
      (deadline) =>
        work(
          deadline.didTimeout
            ? FORCED_BUDGET_MS
            : Math.max(
                FORCED_BUDGET_MS,
                Math.min(MAX_BUDGET_MS, deadline.timeRemaining())
              )
        ),
      { timeout: IDLE_TIMEOUT_MS }
    );
    return () => cancelIdleCallback(handle);
  }
  const handle = requestAnimationFrame(() => work(FORCED_BUDGET_MS));
  return () => cancelAnimationFrame(handle);
};

/** The Dexie table, loaded on first use; without IndexedDB, nothing is kept. */
export function dexieStore(): MandalaIndexStore {
  const table = async () =>
    (await import("#lib/shared/persistence/database/tka-database.js")).db
      .mandalaSignatures;
  return {
    async load(ids) {
      try {
        const rows = await (await table()).bulkGet([...ids]);
        return rows.filter(
          (row): row is MandalaSignatureRow => row !== undefined
        );
      } catch {
        return [];
      }
    },
    async save(rows) {
      try {
        await (await table()).bulkPut([...rows]);
      } catch {
        // A full or blocked database only costs the next visit a re-measure.
      }
    },
  };
}

const noStore: MandalaIndexStore = {
  load: async () => [],
  save: async () => {},
};

const PATHS_BY_KEY = new Map<string, MandalaPaths>();

/**
 * Keeps a shape's drawing made elsewhere (the climb's workers make one for
 * every shape), so the wall's tiles draw without making it again.
 */
export function seedMandalaPaths(key: string, paths: MandalaPaths): void {
  if (!PATHS_BY_KEY.has(key)) PATHS_BY_KEY.set(key, paths);
}

/** The drawing kept for a shape, if one has been made yet. */
export function peekMandalaPaths(key: string): MandalaPaths | undefined {
  return PATHS_BY_KEY.get(key);
}

function pathsFor(key: string, sequence: SequenceData): MandalaPaths {
  let paths = PATHS_BY_KEY.get(key);
  if (!paths) {
    paths = calculate(sequence.steps ?? []);
    PATHS_BY_KEY.set(key, paths);
  }
  return paths;
}

/** Sequences per worker task: few enough that the screen fills in as they land. */
const SEQUENCES_PER_TASK = 24;

export function createMandalaIndex(
  options: {
    store?: MandalaIndexStore;
    scheduler?: MandalaIndexScheduler;
    /** Measures off the page; null measures in idle slices. Default: the app's pool. */
    workers?: MandalaWorkers | null;
    now?: () => number;
  } = {}
): MandalaIndex {
  const store =
    options.store ??
    (typeof indexedDB === "undefined" ? noStore : dexieStore());
  const scheduler = options.scheduler ?? idleScheduler;
  const workers =
    options.workers === undefined ? mandalaWorkers() : options.workers;
  const now = options.now ?? (() => performance.now());

  let pool = $state.raw<readonly SequenceData[]>([]);
  let measured = $state(0);
  let total = $state(0);
  let fed = $state(false);
  let version = $state(0);
  let queue: SequenceData[] = [];
  let run = 0;
  let cancelSlice: (() => void) | null = null;
  let stopWorkers: (() => void) | null = null;
  const listeners = new Set<() => void>();

  /** Every change goes through here, so listeners hear each one. */
  function tick(): void {
    version++;
    // A listener reads the index; untracked, so whatever effect called
    // setPool does not come to depend on what the listener reads.
    untrack(() => {
      for (const listener of [...listeners]) listener();
    });
  }

  const groups = $derived.by<readonly MandalaGroup[]>(() => {
    void version;
    const byKey = new Map<
      string,
      { coverage: number; spaces: number; sequences: SequenceData[] }
    >();
    for (const sequence of pool) {
      const signature = peekMandalaSignature(sequence);
      if (!signature || !signature.key) continue;
      const group = byKey.get(signature.key);
      if (group) group.sequences.push(sequence);
      else
        byKey.set(signature.key, {
          coverage: signature.coverage,
          spaces: signature.spaces,
          sequences: [sequence],
        });
    }
    return [...byKey.entries()]
      .sort(
        (a, b) =>
          a[1].spaces - b[1].spaces ||
          a[1].coverage - b[1].coverage ||
          a[0].localeCompare(b[0])
      )
      .map(([key, group]) => ({
        key,
        coverage: group.coverage,
        spaces: group.spaces,
        sequences: group.sequences,
        get paths() {
          return pathsFor(key, group.sequences[0]!);
        },
      }));
  });

  const groupByKey = $derived(
    new Map(groups.map((group) => [group.key, group]))
  );
  const sequenceIndex = $derived(
    new Map(pool.map((sequence) => [sequence.id, sequence]))
  );

  function clearSlice(): void {
    cancelSlice?.();
    cancelSlice = null;
  }

  /** Stops whatever is measuring: the slices and the workers. */
  function clearWork(): void {
    clearSlice();
    stopWorkers?.();
    stopWorkers = null;
  }

  function rowOf(id: string, signature: MandalaSignature): MandalaSignatureRow {
    return {
      id,
      key: signature.key,
      coverage: signature.coverage,
      spaces: signature.spaces,
      measure: MANDALA_MEASURE_VERSION,
    };
  }

  /**
   * Hands the queue to the workers a few sequences per task; each answer
   * lands as it comes. If a worker fails, the page measures what is left.
   */
  function measureOffPage(thisRun: number, pool: MandalaWorkers): void {
    const pending = queue;
    queue = [];
    const controller = new AbortController();
    stopWorkers = () => controller.abort();
    const landed = new Set<SequenceData>();
    let failed = false;
    for (let start = 0; start < pending.length; start += SEQUENCES_PER_TASK) {
      const chunk = pending.slice(start, start + SEQUENCES_PER_TASK);
      pool
        .run(
          () => ({
            type: "signatures",
            steps: stepsText(chunk.map((sequence) => sequence.steps ?? [])),
          }),
          { signal: controller.signal }
        )
        .then((result) => {
          if (thisRun !== run || failed || result.type !== "signatures") return;
          const rows: MandalaSignatureRow[] = [];
          chunk.forEach((sequence, i) => {
            const signature = result.signatures[i];
            const id = mandalaCacheKey(sequence);
            if (!signature || !id) return;
            seedMandalaSignature(sequence, signature);
            rows.push(rowOf(id, signature));
            landed.add(sequence);
          });
          if (rows.length === 0) return;
          measured += rows.length;
          tick();
          void store.save(rows);
          if (landed.size === pending.length) stopWorkers = null;
        })
        .catch(() => {
          if (thisRun !== run || failed || controller.signal.aborted) return;
          failed = true;
          controller.abort();
          stopWorkers = null;
          queue = pending.filter((sequence) => !landed.has(sequence));
          if (queue.length > 0) scheduleSlice(thisRun);
        });
    }
  }

  function scheduleSlice(thisRun: number): void {
    clearSlice();
    cancelSlice = scheduler((budgetMs) => {
      cancelSlice = null;
      if (thisRun !== run) return;
      const start = now();
      const rows: MandalaSignatureRow[] = [];
      while (
        queue.length > 0 &&
        (rows.length === 0 || now() - start < budgetMs)
      ) {
        const sequence = queue.shift()!;
        const id = mandalaCacheKey(sequence);
        if (!id) continue;
        rows.push(rowOf(id, resolveMandalaSignature(sequence)));
      }
      if (rows.length > 0) {
        measured += rows.length;
        tick();
        void store.save(rows);
      }
      if (queue.length > 0) scheduleSlice(thisRun);
    });
  }

  async function start(
    sequences: readonly SequenceData[],
    thisRun: number
  ): Promise<void> {
    const pending: SequenceData[] = [];
    let known = 0;
    for (const sequence of sequences) {
      if (!mandalaCacheKey(sequence)) {
        known++;
        continue;
      }
      if (peekMandalaSignature(sequence)) known++;
      else pending.push(sequence);
    }
    total = sequences.length;
    measured = known;
    fed = true;
    tick();
    if (pending.length === 0) return;

    const rows = await store.load(
      pending.map((sequence) => mandalaCacheKey(sequence)!)
    );
    if (thisRun !== run) return;
    const byId = new Map(
      rows
        .filter(
          (row) =>
            row.measure === MANDALA_MEASURE_VERSION &&
            typeof row.spaces === "number"
        )
        .map((row) => [row.id, row])
    );
    queue = [];
    for (const sequence of pending) {
      const row = byId.get(mandalaCacheKey(sequence)!);
      if (row) {
        seedMandalaSignature(sequence, {
          coverage: row.coverage,
          key: row.key,
          spaces: row.spaces,
        });
        measured++;
      } else {
        queue.push(sequence);
      }
    }
    tick();
    if (queue.length === 0) return;
    if (workers && !workers.broken) measureOffPage(thisRun, workers);
    else scheduleSlice(thisRun);
  }

  return {
    setPool(sequences) {
      if (sequences === pool) return;
      pool = sequences;
      run++;
      clearWork();
      queue = [];
      void start(sequences, run);
    },
    get pool() {
      return pool;
    },
    get progress() {
      return { measured, total };
    },
    get done() {
      return total > 0 && measured >= total;
    },
    get empty() {
      return fed && total === 0;
    },
    get version() {
      return version;
    },
    get groups() {
      return groups;
    },
    groupOf(key) {
      return groupByKey.get(key);
    },
    sequenceById(id) {
      return sequenceIndex.get(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      run++;
      clearWork();
      queue = [];
    },
  };
}

/** The app's one index: the gallery feeds it its pool, the filter reads it. */
export const mandalaIndex: MandalaIndex = createMandalaIndex();
