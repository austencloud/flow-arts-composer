/**
 * The mandala index: every distinct mandala a pool of sequences draws.
 *
 * Measuring a sequence costs about 5.6 ms the first time, and the community
 * pool runs to hundreds, so the index measures in idle slices between frames
 * and the screen fills in as keys arrive. Each slice runs the stage 1
 * measure (`resolveMandalaSignature`), so the Mandala sort pays nothing
 * afterwards, and writes its answers to IndexedDB so the next visit loads
 * them instead of measuring again.
 *
 * `groups` is the pool's distinct mandalas, sparse to dense, each with the
 * sequences that draw it. `version` ticks after every slice; the Mandala
 * filter reads it so a filtered grid fills in as the measuring runs.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import {
  MANDALA_MEASURE_VERSION,
  densityBandOf,
  mandalaCacheKey,
  peekMandalaSignature,
  resolveMandalaSignature,
  seedMandalaSignature,
  type DensityBand,
} from "./sequence-density";

/** One saved measurement. `id` is the stage 1 cache key. */
export interface MandalaSignatureRow {
  id: string;
  key: string;
  coverage: number;
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
export type MandalaIndexScheduler = (work: (budgetMs: number) => void) => () => void;

export interface MandalaGroup {
  key: string;
  coverage: number;
  band: DensityBand;
  /** The sequences that draw this mandala, in pool order. */
  sequences: readonly SequenceData[];
  /** The mandala's geometry, from its first sequence, made once per key. */
  readonly paths: MandalaPaths;
}

export interface MandalaIndex {
  /** Measure this pool; a pool already set is left alone. */
  setPool(sequences: readonly SequenceData[]): void;
  readonly progress: { readonly measured: number; readonly total: number };
  readonly done: boolean;
  /** Ticks after every slice and every load from the store. */
  readonly version: number;
  /** Distinct mandalas, sparse to dense. */
  readonly groups: readonly MandalaGroup[];
  /** Up to three groups spread sparse, medium, dense: the door's fan. */
  readonly fan: readonly MandalaGroup[];
  groupOf(key: string): MandalaGroup | undefined;
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
            : Math.max(FORCED_BUDGET_MS, Math.min(MAX_BUDGET_MS, deadline.timeRemaining()))
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
    (await import("#lib/shared/persistence/database/tka-database.js")).db.mandalaSignatures;
  return {
    async load(ids) {
      try {
        const rows = await (await table()).bulkGet([...ids]);
        return rows.filter((row): row is MandalaSignatureRow => row !== undefined);
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

function pathsFor(key: string, sequence: SequenceData): MandalaPaths {
  let paths = PATHS_BY_KEY.get(key);
  if (!paths) {
    paths = calculate(sequence.steps ?? []);
    PATHS_BY_KEY.set(key, paths);
  }
  return paths;
}

export function createMandalaIndex(options: {
  store?: MandalaIndexStore;
  scheduler?: MandalaIndexScheduler;
  now?: () => number;
} = {}): MandalaIndex {
  const store =
    options.store ??
    (typeof indexedDB === "undefined" ? noStore : dexieStore());
  const scheduler = options.scheduler ?? idleScheduler;
  const now = options.now ?? (() => performance.now());

  let pool = $state.raw<readonly SequenceData[]>([]);
  let measured = $state(0);
  let total = $state(0);
  let version = $state(0);
  let queue: SequenceData[] = [];
  let run = 0;
  let cancelSlice: (() => void) | null = null;

  const groups = $derived.by<readonly MandalaGroup[]>(() => {
    void version;
    const byKey = new Map<string, { coverage: number; sequences: SequenceData[] }>();
    for (const sequence of pool) {
      const signature = peekMandalaSignature(sequence);
      if (!signature || !signature.key) continue;
      const group = byKey.get(signature.key);
      if (group) group.sequences.push(sequence);
      else byKey.set(signature.key, { coverage: signature.coverage, sequences: [sequence] });
    }
    return [...byKey.entries()]
      .sort((a, b) => a[1].coverage - b[1].coverage || a[0].localeCompare(b[0]))
      .map(([key, group]) => ({
        key,
        coverage: group.coverage,
        band: densityBandOf(group.coverage),
        sequences: group.sequences,
        get paths() {
          return pathsFor(key, group.sequences[0]!);
        },
      }));
  });

  const fan = $derived.by<readonly MandalaGroup[]>(() => {
    if (groups.length <= 3) return groups;
    const last = groups.length - 1;
    return [groups[0]!, groups[Math.floor(last / 2)]!, groups[last]!];
  });

  function clearSlice(): void {
    cancelSlice?.();
    cancelSlice = null;
  }

  function scheduleSlice(thisRun: number): void {
    clearSlice();
    cancelSlice = scheduler((budgetMs) => {
      cancelSlice = null;
      if (thisRun !== run) return;
      const start = now();
      const rows: MandalaSignatureRow[] = [];
      while (queue.length > 0 && (rows.length === 0 || now() - start < budgetMs)) {
        const sequence = queue.shift()!;
        const id = mandalaCacheKey(sequence);
        if (!id) continue;
        const signature = resolveMandalaSignature(sequence);
        rows.push({ id, key: signature.key, coverage: signature.coverage, measure: MANDALA_MEASURE_VERSION });
      }
      if (rows.length > 0) {
        measured += rows.length;
        version++;
        void store.save(rows);
      }
      if (queue.length > 0) scheduleSlice(thisRun);
    });
  }

  async function start(sequences: readonly SequenceData[], thisRun: number): Promise<void> {
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
    version++;
    if (pending.length === 0) return;

    const rows = await store.load(pending.map((sequence) => mandalaCacheKey(sequence)!));
    if (thisRun !== run) return;
    const byId = new Map(
      rows.filter((row) => row.measure === MANDALA_MEASURE_VERSION).map((row) => [row.id, row])
    );
    queue = [];
    for (const sequence of pending) {
      const row = byId.get(mandalaCacheKey(sequence)!);
      if (row) {
        seedMandalaSignature(sequence, { coverage: row.coverage, key: row.key });
        measured++;
      } else {
        queue.push(sequence);
      }
    }
    version++;
    if (queue.length > 0) scheduleSlice(thisRun);
  }

  return {
    setPool(sequences) {
      if (sequences === pool) return;
      pool = sequences;
      run++;
      clearSlice();
      queue = [];
      void start(sequences, run);
    },
    get progress() {
      return { measured, total };
    },
    get done() {
      return total > 0 && measured >= total;
    },
    get version() {
      return version;
    },
    get groups() {
      return groups;
    },
    get fan() {
      return fan;
    },
    groupOf(key) {
      return groups.find((group) => group.key === key);
    },
    stop() {
      run++;
      clearSlice();
      queue = [];
    },
  };
}

/** The app's one index: the gallery feeds it its pool, the filter reads it. */
export const mandalaIndex: MandalaIndex = createMandalaIndex();
