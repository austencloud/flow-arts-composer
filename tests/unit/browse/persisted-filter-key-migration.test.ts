import { describe, expect, it, vi } from "vitest";

// Node test env has no localStorage; the engine reads it at creation.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn(async () => []),
    refreshFromFirestore: vi.fn(async () => []),
    removeFromCache: vi.fn(),
  }),
}));
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => null,
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { isAuthenticated: false, isFullAccount: false },
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

import { createBrowseEngineForTest } from "../browse-engine-test-helpers.svelte";
import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const PERSIST_KEY = "test-migration-gallery";
const PERSIST_KEY_ENUM_RENAME = "test-migration-gallery-placement-rename";

function sequenceWithStartGroup(id: string, group: string): SequenceData {
  return {
    id,
    word: id,
    steps: [],
    startingPlacementGroup: group,
  } as unknown as SequenceData;
}

function seedLegacyPlacementEnumValues() {
  // Persisted before "position" was renamed to "placement": the FilterType
  // enum VALUES were "startPosition"/"endPosition", stacked one key per
  // value like every other OR_STACKING_TYPES entry. Also includes a type
  // that no longer exists at all, and a current, unrelated type that must
  // survive untouched.
  localStorage.setItem(
    PERSIST_KEY_ENUM_RENAME,
    JSON.stringify({
      source: "community",
      sortMethod: "alphabetical",
      sortDirection: "asc",
      activeFilters: [
        [
          "startPosition:alpha",
          {
            type: "startPosition",
            value: "alpha",
            label: "Alpha",
            chipColor: "#fff",
            locked: false,
          },
        ],
        [
          "retired_filter_type",
          {
            type: "retired_filter_type",
            value: "whatever",
            label: "Ghost",
            chipColor: "#fff",
            locked: false,
          },
        ],
        [
          "difficulty:2",
          {
            type: "difficulty",
            value: 2,
            label: "Level 2",
            chipColor: "#fff",
            locked: false,
          },
        ],
      ],
      columns: 4,
    })
  );
}

function seedLegacyPersistedState() {
  // The OLD scheme: one-per-type bare keys, no connectives field.
  localStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({
      source: "community",
      sortMethod: "alphabetical",
      sortDirection: "asc",
      activeFilters: [
        [
          "startPlacement",
          {
            type: "startPlacement",
            value: "alpha",
            label: "Alpha",
            chipColor: "#fff",
            locked: false,
          },
        ],
        [
          "cap_type:component:mirrored",
          {
            type: "cap_type",
            value: "component:mirrored",
            label: "Mirrored",
            chipColor: "#fff",
            locked: false,
          },
        ],
        [
          "cap_type:component:swapped",
          {
            type: "cap_type",
            value: "component:swapped",
            label: "Swapped",
            chipColor: "#fff",
            locked: false,
          },
        ],
      ],
      columns: 4,
    })
  );
}

describe("persisted filter key migration", () => {
  it("loads bare-type keys, applies them, and legacy stacked LOOPs keep AND", () => {
    seedLegacyPersistedState();
    // createBrowseEngineForTest wraps the factory in $effect.root, which does
    // not execute its callback in this node/SSR test build (the same
    // pre-existing gap that fails browse-engine-solo-load-race.test.ts).
    // Restore/read behavior under test here is synchronous factory logic, so
    // call the factory directly; effects are inert in this environment.
    let engine: ReturnType<typeof createBrowseEngine>;
    let dispose = () => {};
    const viaHelper = createBrowseEngineForTest({ persistKey: PERSIST_KEY });
    if (viaHelper.engine) {
      engine = viaHelper.engine;
      dispose = viaHelper.dispose;
    } else {
      engine = createBrowseEngine({ persistKey: PERSIST_KEY });
      dispose = () => engine.destroy();
    }
    try {
      // Bare-type key restored as an active filter.
      expect(engine.activeFilters.has("startPlacement")).toBe(true);
      // Legacy state had 2 stacked LOOPs and no stored connective →
      // buildInitialConnectives resolves cap_type to "all" (its meaning
      // when saved); a fresh session would default "any".
      expect(engine.connectives["cap_type"]).toBe("all");
      // removeFilter by bare type still clears the legacy-keyed entry.
      engine.removeFilter("startPlacement");
      expect(engine.activeFilters.has("startPlacement")).toBe(false);
    } finally {
      dispose();
      localStorage.removeItem(PERSIST_KEY);
    }
  });

  it("migrates the startPosition/endPosition enum rename, drops a retired type, and leaves a current type alone", () => {
    seedLegacyPlacementEnumValues();
    let engine: ReturnType<typeof createBrowseEngine>;
    let dispose = () => {};
    const viaHelper = createBrowseEngineForTest({
      persistKey: PERSIST_KEY_ENUM_RENAME,
    });
    if (viaHelper.engine) {
      engine = viaHelper.engine;
      dispose = viaHelper.dispose;
    } else {
      engine = createBrowseEngine({ persistKey: PERSIST_KEY_ENUM_RENAME });
      dispose = () => engine.destroy();
    }
    try {
      // Old key/type gone; migrated onto the current FilterType with a key
      // rebuilt to match, value intact.
      expect(engine.activeFilters.has("startPosition:alpha")).toBe(false);
      const migrated = engine.activeFilters.get("startPlacement:alpha");
      expect(migrated?.type).toBe(BrowseFilterType.STARTING_PLACEMENT);
      expect(migrated?.value).toBe("alpha");

      // A type that no longer exists is dropped, not kept as a dead chip.
      expect(engine.activeFilters.has("retired_filter_type")).toBe(false);
      expect(
        engine.allFilterChips.some((chip) => chip.key === "retired_filter_type")
      ).toBe(false);

      // A current, unrelated type restores untouched.
      const untouched = engine.activeFilters.get("difficulty:2");
      expect(untouched?.type).toBe(BrowseFilterType.DIFFICULTY);
      expect(untouched?.value).toBe(2);

      // The migrated filter actually filters. Drop the unrelated difficulty
      // chip first so it doesn't AND against a pool with no difficulty data.
      engine.removeFilter("difficulty");
      engine.setPool([
        sequenceWithStartGroup("alpha-seq", "alpha"),
        sequenceWithStartGroup("beta-seq", "beta"),
      ]);
      expect(engine.sequences.map((s) => s.id)).toEqual(["alpha-seq"]);
    } finally {
      dispose();
      localStorage.removeItem(PERSIST_KEY_ENUM_RENAME);
    }
  });
});
