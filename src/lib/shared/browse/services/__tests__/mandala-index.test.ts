// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createMandalaIndex,
  type MandalaIndexStore,
  type MandalaSignatureRow,
} from "../mandala-index.svelte";
import {
  MANDALA_MEASURE_VERSION,
  mandalaCacheKey,
  peekMandalaKey,
  resolveMandalaSignature,
} from "../sequence-density";
import {
  createMandalaWorkers,
  type MandalaWorkerLike,
} from "#lib/shared/mandala/services/mandala-workers.js";
import { doMandalaWork } from "#lib/shared/mandala/services/mandala-measure-work.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { mandalaSignature } from "#lib/shared/mandala/services/mandala-density.js";

/** A worker that does its task in place, a tick later, as a real one would. */
function inPlaceWorker(options: { fail?: boolean } = {}): MandalaWorkerLike {
  const worker: MandalaWorkerLike = {
    onmessage: null,
    onerror: null,
    terminate() {},
    postMessage(message) {
      setTimeout(() => {
        if (options.fail) return worker.onerror?.(new Event("error"));
        const { result } = doMandalaWork(message.task);
        worker.onmessage?.({
          data: { id: message.id, type: "done", result },
        } as MessageEvent);
      }, 0);
    },
  };
  return worker;
}

const CLOCKWISE = ["n", "e", "s", "w"] as const;

function motion(motionType: "pro" | "anti", start: number) {
  return {
    motionType,
    rotationDirection: "cw",
    startLocation: CLOCKWISE[start % 4]!,
    endLocation: CLOCKWISE[(start + 1) % 4]!,
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
    isVisible: true,
  };
}

function sequence(id: string, word: string, steps: unknown[]): SequenceData {
  return {
    id,
    name: word,
    word,
    steps,
    thumbnails: [],
    tags: [],
    metadata: {},
    isFavorite: false,
  } as unknown as SequenceData;
}

const twoHandSteps = Array.from({ length: 4 }, (_, beat) => ({
  letter: "A",
  stepNumber: beat + 1,
  motions: { left: motion("anti", beat + 2), right: motion("pro", beat) },
}));
const oneHandSteps = Array.from({ length: 4 }, (_, beat) => ({
  letter: "B",
  stepNumber: beat + 1,
  motions: { left: null, right: motion("pro", beat) },
}));

/** A scheduler the test drives by hand: slices run only when asked. */
function manualScheduler() {
  const slices: Array<(budgetMs: number) => void> = [];
  const scheduler = (work: (budgetMs: number) => void) => {
    slices.push(work);
    return () => {
      const at = slices.indexOf(work);
      if (at >= 0) slices.splice(at, 1);
    };
  };
  const runAll = () => {
    let guard = 0;
    while (slices.length > 0 && guard++ < 1000) slices.shift()!(1000);
  };
  const runOne = () => slices.shift()?.(0);
  return { scheduler, runAll, runOne, pending: () => slices.length };
}

function memoryStore(seed: MandalaSignatureRow[] = []) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const store: MandalaIndexStore = {
    async load(ids) {
      return ids
        .map((id) => rows.get(id))
        .filter((row): row is MandalaSignatureRow => !!row);
    },
    async save(saved) {
      for (const row of saved) rows.set(row.id, row);
    },
  };
  return { store, rows };
}

/** Lets the index's store load resolve. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("the mandala index", () => {
  it("measures a pool into groups ordered simple to complex, sharing a group per picture", async () => {
    const dense = sequence("idx-dense", "AAAA", twoHandSteps);
    const denseAgain = sequence("idx-dense-2", "AAAA", twoHandSteps);
    const sparse = sequence("idx-sparse", "BBBB", oneHandSteps);
    const empty = sequence("idx-empty", "", []);
    const clock = manualScheduler();
    const index = createMandalaIndex({
      store: memoryStore().store,
      scheduler: clock.scheduler,
    });

    index.setPool([dense, denseAgain, sparse, empty]);
    await settle();
    expect(index.progress).toEqual({ measured: 1, total: 4 });
    expect(index.done).toBe(false);
    expect(index.groups).toEqual([]);

    clock.runAll();

    expect(index.progress).toEqual({ measured: 4, total: 4 });
    expect(index.done).toBe(true);
    expect(index.groups.map((group) => group.sequences.length)).toEqual([1, 2]);
    const [first, second] = index.groups;
    expect(
      first!.spaces < second!.spaces ||
        (first!.spaces === second!.spaces &&
          first!.coverage <= second!.coverage)
    ).toBe(true);
    expect(index.groups.every((group) => Number.isInteger(group.spaces))).toBe(
      true
    );
    expect(index.groups[1]!.sequences.map((s) => s.id)).toEqual([
      "idx-dense",
      "idx-dense-2",
    ]);
    expect(
      index.groupOf(index.groups[1]!.key)?.paths.left.length
    ).toBeGreaterThan(0);
    expect(index.sequenceById("idx-dense-2")?.word).toBe("AAAA");
  });

  it("measures on the workers into the same groups the page would make, and saves each answer", async () => {
    const pool = [
      sequence("wk-dense", "AAAA", twoHandSteps),
      sequence("wk-dense-2", "AAAA", twoHandSteps),
      sequence("wk-sparse", "BBBB", oneHandSteps),
      ...Array.from({ length: 30 }, (_, i) =>
        sequence(`wk-more-${i}`, "BBBB", oneHandSteps)
      ),
    ];
    const memory = memoryStore();
    const clock = manualScheduler();
    const workers = createMandalaWorkers({
      size: 2,
      start: () => inPlaceWorker(),
    });
    const index = createMandalaIndex({
      store: memory.store,
      scheduler: clock.scheduler,
      workers,
    });

    index.setPool(pool);
    for (let i = 0; i < 50 && !index.done; i++)
      await new Promise((r) => setTimeout(r, 0));

    expect(index.done).toBe(true);
    // No slice ran: the workers did all of it.
    expect(clock.pending()).toBe(0);
    for (const s of pool) {
      expect(peekMandalaKey(s)).toBe(mandalaSignature(calculate(s.steps)).key);
    }
    expect(index.groups.map((group) => group.sequences.length)).toEqual([
      31, 2,
    ]);
    expect(memory.rows.size).toBe(pool.length);
  });

  it("measures on the page what a failed worker left", async () => {
    const pool = [
      sequence("wk-fail-a", "AAAA", twoHandSteps),
      sequence("wk-fail-b", "BBBB", oneHandSteps),
    ];
    const clock = manualScheduler();
    const workers = createMandalaWorkers({
      size: 1,
      start: () => inPlaceWorker({ fail: true }),
    });
    const index = createMandalaIndex({
      store: memoryStore().store,
      scheduler: clock.scheduler,
      workers,
    });

    index.setPool(pool);
    for (let i = 0; i < 20 && clock.pending() === 0; i++)
      await new Promise((r) => setTimeout(r, 0));
    clock.runAll();

    expect(index.done).toBe(true);
    expect(index.groups).toHaveLength(2);
  });

  it("reports an empty pool only once one is set", async () => {
    const clock = manualScheduler();
    const index = createMandalaIndex({
      store: memoryStore().store,
      scheduler: clock.scheduler,
    });
    expect(index.empty).toBe(false);
    index.setPool([]);
    await settle();
    expect(index.empty).toBe(true);
    expect(index.done).toBe(false);
    index.setPool([sequence("then-a", "AAAA", twoHandSteps)]);
    expect(index.empty).toBe(false);
  });

  it("fills in slice by slice and saves each slice's rows", async () => {
    const a = sequence("slice-a", "AAAA", twoHandSteps);
    const b = sequence("slice-b", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const memory = memoryStore();
    const index = createMandalaIndex({
      store: memory.store,
      scheduler: clock.scheduler,
    });

    index.setPool([a, b]);
    await settle();
    const before = index.version;
    clock.runOne();

    expect(index.progress.measured).toBe(1);
    expect(index.version).toBeGreaterThan(before);
    expect(index.groups).toHaveLength(1);
    expect(clock.pending()).toBe(1);

    clock.runOne();
    await settle();
    expect(index.done).toBe(true);
    expect(memory.rows.get(mandalaCacheKey(a)!)).toMatchObject({
      key: resolveMandalaSignature(a).key,
      spaces: resolveMandalaSignature(a).spaces,
      measure: MANDALA_MEASURE_VERSION,
    });
    expect(memory.rows.size).toBe(2);
  });

  it("seeds saved rows, spaces included, and ignores rows from measure 1", async () => {
    const saved = sequence("saved-a", "AAAA", twoHandSteps);
    const stale = sequence("stale-b", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const memory = memoryStore([
      {
        id: mandalaCacheKey(saved)!,
        key: "saved-key",
        coverage: 0.2,
        spaces: 7,
        measure: MANDALA_MEASURE_VERSION,
      },
      // A row from before spaces were measured: version 1, no spaces field.
      {
        id: mandalaCacheKey(stale)!,
        key: "stale-key",
        coverage: 0.9,
        measure: 1,
      } as unknown as MandalaSignatureRow,
    ]);
    const index = createMandalaIndex({
      store: memory.store,
      scheduler: clock.scheduler,
    });

    index.setPool([saved, stale]);
    await settle();

    expect(peekMandalaKey(saved)).toBe("saved-key");
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(index.groups.map((group) => group.key)).toEqual(["saved-key"]);
    expect(index.groups[0]!.spaces).toBe(7);
    expect(clock.pending()).toBe(1);

    clock.runAll();
    expect(index.done).toBe(true);
    expect(peekMandalaKey(stale)).not.toBe("stale-key");
    expect(memory.rows.get(mandalaCacheKey(stale)!)).toMatchObject({
      measure: MANDALA_MEASURE_VERSION,
      spaces: resolveMandalaSignature(stale).spaces,
    });
  });

  it("measures only the new sequences when the pool changes, and stops when told", async () => {
    const known = sequence("pool-known", "AAAA", twoHandSteps);
    const fresh = sequence("pool-fresh", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const index = createMandalaIndex({
      store: memoryStore().store,
      scheduler: clock.scheduler,
    });

    index.setPool([known]);
    await settle();
    clock.runAll();
    expect(index.done).toBe(true);

    index.setPool([known, fresh]);
    await settle();
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(clock.pending()).toBe(1);

    let heard = 0;
    const stopHearing = index.subscribe(() => heard++);
    index.stop();
    clock.runAll();
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(index.done).toBe(false);
    expect(heard).toBe(0);
    stopHearing();
  });

  it("tells subscribers about each change", async () => {
    const clock = manualScheduler();
    const index = createMandalaIndex({
      store: memoryStore().store,
      scheduler: clock.scheduler,
    });
    let heard = 0;
    index.subscribe(() => heard++);
    index.setPool([sequence("sub-a", "AAAA", twoHandSteps)]);
    expect(heard).toBe(1);
    await settle();
    clock.runAll();
    expect(heard).toBeGreaterThanOrEqual(3);
    expect(index.done).toBe(true);
  });
});
