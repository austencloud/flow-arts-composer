import { afterEach, describe, expect, it } from "vitest";
import { applyFilter } from "$lib/shared/browse/services/browse-filter";
import { applyFilters } from "$lib/shared/browse/services/multi-filter";
import { deriveSpecMembers } from "$lib/shared/browse/services/smart-filter-spec";
import { localizeFilterChip } from "$lib/shared/browse/components/localize-filter-chip";
import { groupRuleFilters } from "$lib/shared/browse/services/filter-rule-groups";
import { SECTION_FOR_FILTER_TYPE } from "$lib/shared/browse/domain/workspace-sections";
import { setLocale } from "$lib/shared/i18n/i18n.svelte";
import {
  BrowseFilterType,
  GridJoinFilterValue,
} from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ActiveFilter } from "$lib/shared/browse/domain/multi-filter-models";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";

function seq(id: string, conjoined?: unknown, gridMode?: string): SequenceData {
  return {
    id,
    word: id,
    steps: [],
    ...(conjoined !== undefined && { conjoined }),
    ...(gridMode && { gridMode }),
  } as unknown as SequenceData;
}

const pool = [
  seq("joined-se", { toward: "se", steps: 2 }, "diamond"),
  seq("joined-e", { toward: "e", steps: 1 }, "box"),
  seq("single", undefined, "diamond"),
  // A stored value that is not a valid join reads as one grid.
  seq("malformed", { toward: "up", steps: "x" }, "box"),
];

const ids = (list: SequenceData[]) => list.map((s) => s.id);

afterEach(async () => {
  await setLocale("en");
});

describe("grid join browse filter", () => {
  it("joined keeps only sequences that carry a valid join", () => {
    expect(
      ids(applyFilter(pool, BrowseFilterType.GRID_JOIN, GridJoinFilterValue.JOINED))
    ).toEqual(["joined-se", "joined-e"]);
  });

  it("one grid keeps sequences with no join, including a malformed stored one", () => {
    expect(
      ids(applyFilter(pool, BrowseFilterType.GRID_JOIN, GridJoinFilterValue.SINGLE))
    ).toEqual(["single", "malformed"]);
  });

  it("an unknown value does not narrow the pool", () => {
    expect(applyFilter(pool, BrowseFilterType.GRID_JOIN, "other")).toHaveLength(4);
  });

  it("stacks as alternatives and ANDs with grid mode", () => {
    const filter = (value: string): ActiveFilter => ({
      type: BrowseFilterType.GRID_JOIN,
      value,
      label: value,
      chipColor: "#fff",
    });
    const both = new Map<string, ActiveFilter>([
      ["gridJoin:joined", filter("joined")],
      ["gridJoin:single", filter("single")],
    ]);
    expect(applyFilters(pool, both)).toHaveLength(4);

    const joinedBox = new Map<string, ActiveFilter>([
      ["gridJoin:joined", filter("joined")],
      [
        "gridMode:box",
        {
          type: BrowseFilterType.GRID_MODE,
          value: "box",
          label: "Box",
          chipColor: "#fff",
        },
      ],
    ]);
    expect(ids(applyFilters(pool, joinedBox))).toEqual(["joined-e"]);
  });
});

describe("grid join smart collection rule", () => {
  it("a saved rule selects the joined sequences from a pool", () => {
    const spec: SmartFilterSpec = {
      source: "community",
      filters: [
        {
          key: "gridJoin:joined",
          type: "gridJoin",
          value: "joined",
          label: "Joined grids",
          chipColor: "#fff",
        },
      ],
      sortMethod: "alphabetical",
      sortDirection: "asc",
    };
    expect(ids(deriveSpecMembers(pool, spec))).toEqual(["joined-se", "joined-e"]);
  });
});

describe("grid join chip text", () => {
  it("reads in English and German from the value, not the saved label", async () => {
    const joined = { type: "gridJoin", label: "Joined grids", value: "joined" };
    const single = { type: "gridJoin", label: "One grid", value: "single" };
    await setLocale("en");
    expect([joined, single].map(localizeFilterChip)).toEqual([
      "Joined grids",
      "One grid",
    ]);
    await setLocale("de");
    expect([joined, single].map(localizeFilterChip)).toEqual([
      "Verbundene Raster",
      "Ein Raster",
    ]);
  });

  it("opens the joined-grids editor and groups under its own label", () => {
    expect(SECTION_FOR_FILTER_TYPE[BrowseFilterType.GRID_JOIN]).toBe("gridjoin");
    const [group] = groupRuleFilters([
      {
        key: "gridJoin:joined",
        type: BrowseFilterType.GRID_JOIN,
        label: "Joined grids",
        chipColor: "#fff",
      },
    ]);
    expect(group!.label).toBe("Layout");
    expect(group!.chips[0]!.displayLabel).toBe("Joined grids");
  });
});
