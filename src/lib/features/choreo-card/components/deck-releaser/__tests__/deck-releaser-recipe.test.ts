import { describe, it, expect, beforeEach } from "vitest";
import {
  createDeckReleaserState,
  type DeckReleaserState,
} from "../state/deck-releaser-state.svelte";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";

describe("deck-releaser recipe round-trip", () => {
  let releaserState: DeckReleaserState;
  let seedNumber: number;

  beforeEach(() => {
    seedNumber = 0;
    releaserState = createDeckReleaserState({
      storage: null,
      getLeftPropType: () => undefined,
      getRightPropType: () => undefined,
      mintSeed: () => `test-seed-${++seedNumber}`,
      nextReferenceNumber: () => 1,
    });
  });

  function createState(
    storage: Pick<Storage, "getItem" | "setItem"> | null = null
  ) {
    return createDeckReleaserState({
      storage,
      getLeftPropType: () => undefined,
      getRightPropType: () => undefined,
      mintSeed: () => `extra-seed-${++seedNumber}`,
      nextReferenceNumber: () => 2,
    });
  }

  it("creates isolated state for each mounted deck releaser", () => {
    const other = createState();
    releaserState.name = "First mount";
    releaserState.selectedLevels = new Set([3]);

    expect(other.name).toBe("");
    expect([...other.selectedLevels]).toEqual([1]);
  });

  it("restores a persisted draft into a new state instance", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = createState(storage);
    first.name = "Saved deck";
    first.selectedLevels = new Set([3]);
    first.persist();

    const restored = createState(storage);

    expect(restored.name).toBe("Saved deck");
    expect([...restored.selectedLevels]).toEqual([3]);
  });

  it("toRecipe stamps seed + generatorVersion + new axes", () => {
    releaserState.seed = "fixed-seed";
    releaserState.selectedLoopTypes = new Set(["rotated"]);
    releaserState.selectedLevels = new Set([1]);
    const r = releaserState.toRecipe();
    expect(r.seed).toEqual("fixed-seed");
    expect(r.generatorVersion).toBeTruthy();
    expect(r.loopTypes).toEqual(["rotated"]);
    expect(r.levels).toEqual([1]);
  });

  it("loadRecipe restores seed + axes (reproduce exactly)", () => {
    const r = releaserState.toRecipe();
    r.seed = "stored-seed";
    r.loopTypes = ["inverted"];
    releaserState.loadRecipe(r);
    expect(releaserState.seed).toEqual("stored-seed");
    expect([...releaserState.selectedLoopTypes]).toEqual(["inverted"]);
  });

  it("round-trips the canonical Gallery rule and deck size", () => {
    releaserState.deckMode = "gallery";
    releaserState.totalCards = 24;
    releaserState.galleryFilterSpec = {
      source: "my-library",
      filters: [
        {
          key: BrowseFilterType.DIFFICULTY,
          type: BrowseFilterType.DIFFICULTY,
          value: 2,
          label: "Level 2",
          chipColor: "#8b5cf6",
        },
      ],
      searchQuery: "fire",
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    };

    const recipe = releaserState.toRecipe();
    const restored = createState();
    restored.loadRecipe(recipe);

    expect(recipe.galleryFilters).toBeUndefined();
    expect(restored.galleryFilterSpec).toEqual(releaserState.galleryFilterSpec);
    expect(restored.totalCards).toBe(24);
  });

  it("reroll mints a new seed, leaves dials untouched", () => {
    releaserState.selectedLoopTypes = new Set(["rotated"]);
    const before = releaserState.seed;
    releaserState.reroll();
    expect(releaserState.seed).not.toEqual(before);
    expect([...releaserState.selectedLoopTypes]).toEqual(["rotated"]);
  });
});
