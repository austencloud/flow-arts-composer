import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";

const mocks = vi.hoisted(() => ({ searchCalls: 0 }));

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn().mockResolvedValue([]),
    refreshFromFirestore: vi.fn().mockResolvedValue([]),
    removeFromCache: vi.fn(),
  }),
}));

vi.mock("$lib/shared/browse/services/browse-filter", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("$lib/shared/browse/services/browse-filter")
    >();
  return {
    ...actual,
    applyFilter: (
      pool: SequenceData[],
      type: BrowseFilterType,
      value: Parameters<typeof actual.applyFilter>[2]
    ) => {
      if (type === BrowseFilterType.CONTAINS_LETTERS) mocks.searchCalls += 1;
      return actual.applyFilter(pool, type, value);
    },
  };
});

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    effectiveUserId: "owner",
    isAuthenticated: true,
    isFullAccount: true,
  },
}));

vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: { gridZoomByBucket: {} },
    updateSetting: vi.fn(),
  },
}));

vi.mock("$lib/shared/library/library-events", () => ({
  onLibraryMutated: () => () => {},
  onLibrarySequenceAdded: () => () => {},
}));

vi.mock("$lib/shared/library/services/collection-manager", () => ({
  toggleFavorite: vi.fn(),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function sequence(
  id: string,
  word: string,
  level: number,
  components: string[] = []
): SequenceData {
  return {
    id,
    name: `${word} alpha`,
    word,
    level,
    sequenceLength: word.length,
    components,
    steps: [],
  } as unknown as SequenceData;
}

describe("BrowseEngine searched facet counts", () => {
  beforeEach(() => {
    mocks.searchCalls = 0;
  });

  it("searches the pool once while reading several facet counts", () => {
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });
    engine.setPool([
      sequence("a", "AB", 1),
      sequence("b", "BA", 2),
      sequence("c", "CA", 3),
    ]);
    engine.setSearch("alpha");

    engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, "A");
    engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, "B");
    engine.getFilteredCount(BrowseFilterType.DIFFICULTY, 1);

    expect(mocks.searchCalls).toBe(1);
    dispose();
  });

  it("keeps alternative and connective filters in searched counts", () => {
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });
    engine.setPool([
      sequence("a", "AB", 1, ["mirrored"]),
      sequence("b", "BA", 2, ["swapped"]),
      sequence("c", "CA", 3, ["mirrored", "swapped"]),
      { ...sequence("d", "DA", 2, ["mirrored"]), name: "unmatched" },
    ]);
    engine.setSearch("alpha");

    engine.addFilter(BrowseFilterType.DIFFICULTY, 1, "Level 1", "");
    engine.addFilter(BrowseFilterType.DIFFICULTY, 2, "Level 2", "");
    expect(
      engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, "A")
    ).toBe(1);
    expect(
      engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, "B")
    ).toBe(1);
    expect(
      engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, "C")
    ).toBe(0);

    engine.clearUserFilters();
    engine.addFilter(
      BrowseFilterType.LOOP_TYPE,
      "component:mirrored",
      "Mirrored",
      ""
    );
    engine.addFilter(
      BrowseFilterType.LOOP_TYPE,
      "component:swapped",
      "Swapped",
      ""
    );
    engine.setConnective(BrowseFilterType.LOOP_TYPE, "all");
    expect(engine.getFilteredCount(BrowseFilterType.DIFFICULTY, 3)).toBe(1);
    engine.setConnective(BrowseFilterType.LOOP_TYPE, "any");
    expect(engine.getFilteredCount(BrowseFilterType.DIFFICULTY, 1)).toBe(1);
    expect(engine.getFilteredCount(BrowseFilterType.DIFFICULTY, 2)).toBe(1);

    dispose();
  });
});
