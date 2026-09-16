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

const PERSIST_KEY = "test-migration-gallery";

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
});
