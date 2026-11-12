// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// A Mandala filter restored on reload used to stay empty on phone and Fold:
// only the picker handed the pool to the mandala index, and the picker lives
// in a sheet that is closed after a reload. The engine now hands it over.

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

// The app's one index and one climb, made with stores and a scheduler the
// test controls: shapes come from saved answers (as from IndexedDB on a
// return visit) and the family distances from a saved book.
const saved = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; key: string; coverage: number; spaces: number; measure: number }>,
  book: null as unknown,
}));

vi.mock("#lib/shared/browse/services/mandala-index.svelte.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#lib/shared/browse/services/mandala-index.svelte.js")>();
  return {
    ...actual,
    mandalaIndex: actual.createMandalaIndex({
      store: {
        load: async (ids) => saved.rows.filter((row) => ids.includes(row.id)),
        save: async () => {},
      },
      scheduler: (work) => {
        const handle = setTimeout(() => work(1000), 0);
        return () => clearTimeout(handle);
      },
    }),
  };
});

vi.mock("#lib/shared/browse/services/mandala-climb.svelte.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#lib/shared/browse/services/mandala-climb.svelte.js")>();
  return {
    ...actual,
    mandalaClimb: actual.createMandalaClimb({
      store: {
        load: async () => saved.book as never,
        save: async () => {},
      },
      measure: async () => {
        throw new Error("every pair is in the saved book");
      },
      scheduler: (work) => {
        const handle = setTimeout(() => work(1000), 0);
        return () => clearTimeout(handle);
      },
    }),
  };
});

// The community load's first stage; a test swaps it to stage its own pool.
const loader = vi.hoisted(() => ({
  firstStage: async (): Promise<unknown[]> => [],
}));

vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn(() => loader.firstStage()),
    refreshFromFirestore: vi.fn(async () => []),
    removeFromCache: vi.fn(),
  }),
}));
vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: () => null,
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { isAuthenticated: false, isFullAccount: false },
}));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: { settings: { gridZoomByBucket: {} }, updateSetting: vi.fn() },
}));
vi.mock("#lib/shared/library/library-events.js", () => ({
  onLibraryMutated: () => () => {},
  onLibrarySequenceAdded: () => () => {},
}));
vi.mock("#lib/shared/library/services/collection-manager.js", () => ({
  toggleFavorite: vi.fn(),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";
import { mandalaIndex } from "#lib/shared/browse/services/mandala-index.svelte.js";
import { mandalaClimb } from "#lib/shared/browse/services/mandala-climb.svelte.js";
import { writeBook } from "#lib/shared/mandala/services/mandala-family-book.js";
import { MANDALA_FAMILY_VERSION } from "#lib/shared/mandala/services/mandala-family-distance.js";
import {
  MANDALA_MEASURE_VERSION,
  mandalaCacheKey,
} from "#lib/shared/browse/services/sequence-density.js";

const PERSIST_KEY = "test-mandala-restore";

function drawing(id: string, key: string, spaces: number, level: number): SequenceData {
  const sequence = {
    id,
    name: id,
    word: "AB",
    level,
    sequenceLength: 1,
    steps: [{}],
  } as unknown as SequenceData;
  saved.rows.push({
    id: mandalaCacheKey(sequence)!,
    key,
    coverage: 0,
    spaces,
    measure: MANDALA_MEASURE_VERSION,
  });
  return sequence;
}

// Shapes "ka" and "kb" look alike (distance 0): one family. "kz" stands apart.
const pool = [
  drawing("a1", "ka", 1, 2),
  drawing("a2", "ka", 1, 1),
  drawing("b1", "kb", 2, 1),
  drawing("z1", "kz", 3, 1),
];
{
  const keys = ["ka", "kb", "kz"];
  const matrix = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1, 0]);
  saved.book = writeBook(null, keys, matrix, {
    measure: MANDALA_MEASURE_VERSION,
    family: MANDALA_FAMILY_VERSION,
  });
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(check()).toBe(true);
}

// What a reload finds in local storage: the filter names shape "ka" and its
// first sequence.
function persistFilter(): void {
  localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        source: "community",
        sortMethod: "alphabetical",
        sortDirection: "asc",
        activeFilters: [
          [
            "mandala:ka~a1",
            { type: "mandala", value: "ka~a1", label: "Mandala", chipColor: "", locked: false },
          ],
        ],
        columns: 4,
      })
    );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("a restored Mandala filter", () => {
  it("resolves to its whole family once the pool arrives, with no picker", async () => {
    // Nothing has fed the index yet.
    persistFilter();
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: PERSIST_KEY,
      sections: true,
    });
    expect(engine.hasActiveFilters).toBe(true);
    expect(mandalaIndex.pool).toEqual([]);

    // The pool lands; its shapes are still being read from the saved answers.
    engine.setPool(pool);
    flushSync();
    expect(mandalaIndex.pool).toBe(engine.allSequences);
    expect(engine.isResolvingFilters).toBe(true);

    await until(() => !engine.isResolvingFilters);
    expect(mandalaIndex.done).toBe(true);
    expect(mandalaClimb.ready).toBe(true);
    // The whole family, easiest first, in one section per level.
    expect(engine.sequences.map((s) => s.id)).toEqual(["a2", "b1", "a1"]);
    expect(engine.resultCount).toBe(3);
    expect(engine.sectionGroupBy).toBe("level");
    expect(engine.sections.map((s) => s.title)).toEqual([
      "Level 1 (2 sequences)",
      "Level 2 (1 sequence)",
    ]);

    // A later stage of the pool keeps the answer on screen while it is
    // measured, instead of dropping back to loading.
    engine.setPool([...pool]);
    flushSync();
    expect(engine.isResolvingFilters).toBe(false);
    expect(engine.resultCount).toBe(3);

    // A stage that brings more of the family grows the sections with it,
    // once the newcomers' shapes are read.
    const later = [
      ...pool,
      drawing("a3", "ka", 1, 1),
      drawing("b2", "kb", 2, 2),
      drawing("z2", "kz", 3, 2),
    ];
    engine.setPool(later);
    await until(() => engine.resultCount === 5);
    expect(engine.sections.map((s) => s.title)).toEqual([
      "Level 1 (3 sequences)",
      "Level 2 (2 sequences)",
    ]);
    expect(engine.sections.flatMap((s) => s.sequences.map((q) => q.id)).sort()).toEqual(
      ["a1", "a2", "a3", "b1", "b2"]
    );

    dispose();
  });

  it("stays resolving while a later stage of the pool is still coming", async () => {
    // The first stage lacks the family; only the extras (the T&D alphabet in
    // the app) hold it, and they land after loading has finished.
    persistFilter();
    const [a1, a2, b1, z1] = pool;
    loader.firstStage = async () => [z1];
    const extras = deferred<SequenceData[]>();
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: PERSIST_KEY,
      sections: true,
      extraCommunitySequences: () => extras.promise,
    });

    await engine.initialize();
    expect(engine.isLoading).toBe(false);
    // The first stage is fully measured and has no match, yet the filter has
    // not given its empty verdict: more of the pool is on its way.
    await until(() => mandalaIndex.pool === engine.allSequences && mandalaIndex.done);
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(engine.resultCount).toBe(0);
    expect(engine.isResolvingFilters).toBe(true);

    extras.resolve([a1, a2, b1]);
    await until(() => !engine.isResolvingFilters);
    expect(engine.sequences.map((s) => s.id)).toEqual(["a2", "b1", "a1"]);
    expect(engine.resultCount).toBe(3);

    dispose();
  });

  it("ends resolving when the rest of the pool fails or is empty", async () => {
    // Extras that fail leave a pool with no match: the filter reads empty
    // instead of loading forever.
    persistFilter();
    const [, , , z1] = pool;
    loader.firstStage = async () => [z1];
    const extras = deferred<SequenceData[]>();
    const failing = createBrowseEngineForTest({
      persistKey: PERSIST_KEY,
      sections: true,
      extraCommunitySequences: () => extras.promise,
    });
    await failing.engine.initialize();
    flushSync();
    expect(failing.engine.isResolvingFilters).toBe(true);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    extras.reject(new Error("offline"));
    await until(() => !failing.engine.isResolvingFilters);
    expect(failing.engine.resultCount).toBe(0);
    failing.dispose();

    // An empty pool ends it too.
    persistFilter();
    loader.firstStage = async () => [];
    const empty = createBrowseEngineForTest({ persistKey: PERSIST_KEY, sections: true });
    await empty.engine.initialize();
    await until(() => !empty.engine.isResolvingFilters);
    expect(empty.engine.resultCount).toBe(0);
    empty.dispose();

    // A load that fails outright shows its error, not a skeleton.
    persistFilter();
    loader.firstStage = async () => {
      throw new Error("offline");
    };
    const broken = createBrowseEngineForTest({ persistKey: PERSIST_KEY, sections: true });
    await broken.engine.initialize();
    flushSync();
    expect(broken.engine.error).toBe("offline");
    expect(broken.engine.isLoading).toBe(false);
    expect(broken.engine.isResolvingFilters).toBe(false);
    broken.dispose();
    quiet.mockRestore();
  });
});
