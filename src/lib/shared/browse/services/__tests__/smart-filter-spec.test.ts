import { describe, expect, it, vi } from "vitest";
import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import type { BrowseEngine } from "$lib/shared/browse/engine/types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import {
  applySpecToEngine,
  buildFilterSpecFromEngine,
  deriveSpecMembers,
} from "../smart-filter-spec";

describe("smart-filter-spec", () => {
  it("serializes trimmed search text with the canonical rule", () => {
    const engine = {
      source: "my-library",
      activeFilters: new Map([
        [
          BrowseFilterType.DIFFICULTY,
          {
            type: BrowseFilterType.DIFFICULTY,
            value: 2,
            label: "Level 2",
            chipColor: "#8b5cf6",
            locked: false,
          },
        ],
      ]),
      connectives: {},
      searchQuery: "  fire  ",
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    } as unknown as BrowseEngine;

    expect(buildFilterSpecFromEngine(engine)).toMatchObject({
      source: "my-library",
      searchQuery: "fire",
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
      filters: [
        {
          type: BrowseFilterType.DIFFICULTY,
          value: 2,
        },
      ],
    });
  });

  it("replays search, filters, connectives, and sort through engine methods", () => {
    const addFilter = vi.fn();
    const setConnective = vi.fn();
    const setSearch = vi.fn();
    const setSort = vi.fn();
    const engine = {
      addFilter,
      setConnective,
      setSearch,
      setSort,
    } as unknown as BrowseEngine;

    applySpecToEngine(engine, {
      source: "my-library",
      filters: [
        {
          key: BrowseFilterType.DIFFICULTY,
          type: BrowseFilterType.DIFFICULTY,
          value: 3,
          label: "Level 3",
          chipColor: "#ef4444",
        },
      ],
      searchQuery: "flame",
      sortMethod: BrowseSortMethod.SEQUENCE_LENGTH,
      sortDirection: "desc",
      connectives: { [BrowseFilterType.LOOP_TYPE]: "all" },
    });

    expect(addFilter).toHaveBeenCalledWith(
      BrowseFilterType.DIFFICULTY,
      3,
      "Level 3",
      "#ef4444"
    );
    expect(setSearch).toHaveBeenCalledWith("flame");
    expect(setSort).toHaveBeenCalledWith(
      BrowseSortMethod.SEQUENCE_LENGTH,
      "desc"
    );
    expect(setConnective).toHaveBeenCalledWith(
      BrowseFilterType.LOOP_TYPE,
      "all"
    );
  });

  it("applies search after the structured rule for pure callers", () => {
    const pool = [
      { id: "fire", name: "FIRE", word: "FIRE", level: 2, steps: [] },
      { id: "fizz", name: "FIZZ", word: "FIZZ", level: 1, steps: [] },
      { id: "water", name: "WATER", word: "WATER", level: 2, steps: [] },
    ] as unknown as SequenceData[];

    const members = deriveSpecMembers(pool, {
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
      searchQuery: "FI",
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    });

    expect(members.map((sequence) => sequence.id)).toEqual(["fire"]);
  });

  it("actually filters a stored pre-rename 'startPosition' filter type", () => {
    // Firestore-persisted SmartFilterSpec / DeckRelease.galleryFilterSpec can
    // carry the FilterType's pre-rename stored value ("startPosition"), not
    // just the current enum value ("startPlacement"). deriveSpecMembers must
    // resolve it onto STARTING_PLACEMENT and actually narrow the pool, not
    // silently no-op the filter.
    const pool = [
      { id: "alpha-seq", word: "ALPHA", steps: [], startingPlacementGroup: "alpha" },
      { id: "beta-seq", word: "BETA", steps: [], startingPlacementGroup: "beta" },
    ] as unknown as SequenceData[];

    const members = deriveSpecMembers(pool, {
      source: "my-library",
      filters: [
        {
          key: "startPosition",
          type: "startPosition",
          value: "alpha",
          label: "Alpha",
          chipColor: "#fff",
        },
      ],
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    });

    expect(members.map((sequence) => sequence.id)).toEqual(["alpha-seq"]);
  });

  it("skips a stored filter whose type no longer exists", () => {
    const addFilter = vi.fn();
    const engine = {
      addFilter,
      setConnective: vi.fn(),
      setSearch: vi.fn(),
      setSort: vi.fn(),
    } as unknown as BrowseEngine;

    applySpecToEngine(engine, {
      source: "my-library",
      filters: [
        {
          key: "retired_filter_type",
          type: "retired_filter_type",
          value: "whatever",
          label: "Ghost",
          chipColor: "#fff",
        },
      ],
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    });

    expect(addFilter).not.toHaveBeenCalled();

    const pool = [
      { id: "fire", word: "FIRE", steps: [] },
    ] as unknown as SequenceData[];
    const members = deriveSpecMembers(pool, {
      source: "my-library",
      filters: [
        {
          key: "retired_filter_type",
          type: "retired_filter_type",
          value: "whatever",
          label: "Ghost",
          chipColor: "#fff",
        },
      ],
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      sortDirection: "asc",
    });
    // An unresolvable type is dropped, not treated as an always-match filter.
    expect(members.map((sequence) => sequence.id)).toEqual(["fire"]);
  });
});
