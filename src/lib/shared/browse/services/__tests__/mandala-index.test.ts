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
      return ids.map((id) => rows.get(id)).filter((row): row is MandalaSignatureRow => !!row);
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
  it("measures a pool into groups ordered sparse to dense, sharing a group per picture", async () => {
    const dense = sequence("idx-dense", "AAAA", twoHandSteps);
    const denseAgain = sequence("idx-dense-2", "AAAA", twoHandSteps);
    const sparse = sequence("idx-sparse", "BBBB", oneHandSteps);
    const empty = sequence("idx-empty", "", []);
    const clock = manualScheduler();
    const index = createMandalaIndex({ store: memoryStore().store, scheduler: clock.scheduler });

    index.setPool([dense, denseAgain, sparse, empty]);
    await settle();
    expect(index.progress).toEqual({ measured: 1, total: 4 });
    expect(index.done).toBe(false);
    expect(index.groups).toEqual([]);

    clock.runAll();

    expect(index.progress).toEqual({ measured: 4, total: 4 });
    expect(index.done).toBe(true);
    expect(index.groups.map((group) => group.sequences.length)).toEqual([1, 2]);
    expect(index.groups[0]!.coverage).toBeLessThan(index.groups[1]!.coverage);
    expect(index.groups[0]!.band.id).toBe("sparse");
    expect(index.groups[1]!.sequences.map((s) => s.id)).toEqual(["idx-dense", "idx-dense-2"]);
    expect(index.groupOf(index.groups[1]!.key)?.paths.left.length).toBeGreaterThan(0);
    expect(index.fan).toHaveLength(2);
  });

  it("fills in slice by slice and saves each slice's rows", async () => {
    const a = sequence("slice-a", "AAAA", twoHandSteps);
    const b = sequence("slice-b", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const memory = memoryStore();
    const index = createMandalaIndex({ store: memory.store, scheduler: clock.scheduler });

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
      measure: MANDALA_MEASURE_VERSION,
    });
    expect(memory.rows.size).toBe(2);
  });

  it("seeds saved rows from the current measure and ignores rows from an older one", async () => {
    const saved = sequence("saved-a", "AAAA", twoHandSteps);
    const stale = sequence("stale-b", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const memory = memoryStore([
      { id: mandalaCacheKey(saved)!, key: "saved-key", coverage: 0.2, measure: MANDALA_MEASURE_VERSION },
      { id: mandalaCacheKey(stale)!, key: "stale-key", coverage: 0.9, measure: MANDALA_MEASURE_VERSION - 1 },
    ]);
    const index = createMandalaIndex({ store: memory.store, scheduler: clock.scheduler });

    index.setPool([saved, stale]);
    await settle();

    expect(peekMandalaKey(saved)).toBe("saved-key");
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(index.groups.map((group) => group.key)).toEqual(["saved-key"]);
    expect(clock.pending()).toBe(1);

    clock.runAll();
    expect(index.done).toBe(true);
    expect(peekMandalaKey(stale)).not.toBe("stale-key");
  });

  it("measures only the new sequences when the pool changes, and stops when told", async () => {
    const known = sequence("pool-known", "AAAA", twoHandSteps);
    const fresh = sequence("pool-fresh", "BBBB", oneHandSteps);
    const clock = manualScheduler();
    const index = createMandalaIndex({ store: memoryStore().store, scheduler: clock.scheduler });

    index.setPool([known]);
    await settle();
    clock.runAll();
    expect(index.done).toBe(true);

    index.setPool([known, fresh]);
    await settle();
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(clock.pending()).toBe(1);

    index.stop();
    clock.runAll();
    expect(index.progress).toEqual({ measured: 1, total: 2 });
    expect(index.done).toBe(false);
  });
});
