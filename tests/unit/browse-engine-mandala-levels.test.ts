// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";

vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn().mockResolvedValue([]),
    refreshFromFirestore: vi.fn().mockResolvedValue([]),
    removeFromCache: vi.fn(),
  }),
}));

// The Mandala filter itself is tested on its own; here it lets everything
// through, so the test is only about how the engine orders what it keeps.
vi.mock("#lib/shared/browse/services/browse-filter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#lib/shared/browse/services/browse-filter.js")>();
  return {
    ...actual,
    applyFilter: (
      pool: SequenceData[],
      type: BrowseFilterType,
      value: Parameters<typeof actual.applyFilter>[2]
    ) => (type === BrowseFilterType.MANDALA ? pool : actual.applyFilter(pool, type, value)),
  };
});

vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: () => null,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { effectiveUserId: "owner", isAuthenticated: true, isFullAccount: true },
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

function sequence(id: string, word: string, level: number): SequenceData {
  return {
    id,
    name: word,
    word,
    level,
    sequenceLength: word.length,
    steps: [],
  } as unknown as SequenceData;
}

const pool = [
  sequence("c3", "CAB", 3),
  sequence("a2", "ABC", 2),
  sequence("b1", "BCA", 1),
  sequence("a1", "ACB", 1),
  sequence("b3", "BAC", 3),
];

describe("BrowseEngine with a Mandala filter", () => {
  it("lists and sections the family easiest first, with the sort inside each level", () => {
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });
    engine.setPool(pool);
    engine.setSort(BrowseSortMethod.ALPHABETICAL, "asc");
    expect(engine.sectionGroupBy).toBe("letter");

    engine.addFilter(BrowseFilterType.MANDALA, "shape~a1", "Mandala", "");
    expect(engine.sectionGroupBy).toBe("level");
    expect(engine.sequences.map((s) => s.id)).toEqual(["a1", "b1", "a2", "b3", "c3"]);

    engine.setSort(BrowseSortMethod.ALPHABETICAL, "desc");
    expect(engine.sequences.map((s) => s.id)).toEqual(["b1", "a1", "a2", "c3", "b3"]);

    engine.setSectionGroupBy("length");
    expect(engine.sectionGroupBy).toBe("length");

    engine.clearUserFilters();
    dispose();
  });

  it("leaves sorting and sections alone without one", () => {
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });
    engine.setPool(pool);
    engine.setSort(BrowseSortMethod.ALPHABETICAL, "asc");
    expect(engine.sequences.map((s) => s.id)).toEqual(["a2", "a1", "b3", "b1", "c3"]);
    dispose();
  });
});
