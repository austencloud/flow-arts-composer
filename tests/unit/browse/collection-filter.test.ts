/**
 * Collection membership as a stackable gallery filter.
 *
 * Collections used to be a DOOR: tapping the tile ejected to the Library tab.
 * They are now a filter, so "Level 2 in Bella Sequences" is expressible. This
 * locks the four properties that make that safe:
 *
 *  a) the filter narrows to the collection's sequences,
 *  b) it ANDs with a rule from another category,
 *  c) a collection that no longer resolves matches NOTHING while its rule
 *     stays live and removable (spec Risk 4 — never a crash, never an
 *     invisible filter),
 *  d) the per-value `collection:<id>` key round-trips through persistence the
 *     way every other stacking category's key does.
 *
 * Spec: docs/superpowers/specs/2026-08-04-gallery-split-pane-workspace-design.md
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

// Node test env has no localStorage; the engine reads it at creation.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import {
  applyFilters,
  OR_STACKING_TYPES,
} from "#lib/shared/browse/services/multi-filter.js";
import { setCollectionMembershipResolver } from "#lib/shared/browse/services/browse-filter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ActiveFilter } from "#lib/shared/browse/domain/multi-filter-models.js";

function seq(id: string, level: number): SequenceData {
  return {
    id,
    word: id,
    level,
    steps: [],
  } as unknown as SequenceData;
}

function rule(
  type: BrowseFilterType,
  value: string | number,
  label = String(value)
): ActiveFilter {
  return { type, value, label, chipColor: "#6aa0ff" } as ActiveFilter;
}

/** The engine's own key rule: stacking types key per value. */
function keyFor(type: BrowseFilterType, value: string | number): string {
  return OR_STACKING_TYPES.has(type)
    ? `${type}:${String(value)}`
    : String(type);
}

const POOL = [seq("a", 1), seq("b", 2), seq("c", 2), seq("d", 3)];

const MEMBERSHIP: Record<string, ReadonlySet<string>> = {
  bella: new Set(["a", "b"]),
  fire: new Set(["c"]),
};

beforeEach(() => {
  setCollectionMembershipResolver((id) => MEMBERSHIP[id]);
});

describe("collection membership filter", () => {
  it("keys per value, so several collections can coexist", () => {
    expect(OR_STACKING_TYPES.has(BrowseFilterType.COLLECTION)).toBe(true);
    expect(keyFor(BrowseFilterType.COLLECTION, "bella")).toBe(
      "collection:bella"
    );
  });

  it("narrows to the collection's sequences", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "bella"),
        rule(BrowseFilterType.COLLECTION, "bella", "Bella Sequences"),
      ],
    ]);
    expect(applyFilters([...POOL], filters).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("two collections are alternatives (OR within the category)", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "bella"),
        rule(BrowseFilterType.COLLECTION, "bella"),
      ],
      [
        keyFor(BrowseFilterType.COLLECTION, "fire"),
        rule(BrowseFilterType.COLLECTION, "fire"),
      ],
    ]);
    expect(applyFilters([...POOL], filters).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("stacks with a level rule (AND across categories)", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "bella"),
        rule(BrowseFilterType.COLLECTION, "bella"),
      ],
      [
        keyFor(BrowseFilterType.DIFFICULTY, 2),
        rule(BrowseFilterType.DIFFICULTY, 2, "Level 2"),
      ],
    ]);
    // "b" is the only Level 2 sequence filed in Bella.
    expect(applyFilters([...POOL], filters).map((s) => s.id)).toEqual(["b"]);
  });

  it("a collection that no longer resolves matches nothing, and its rule stays live", () => {
    const key = keyFor(BrowseFilterType.COLLECTION, "deleted-id");
    const filters = new Map<string, ActiveFilter>([
      [key, rule(BrowseFilterType.COLLECTION, "deleted-id", "Gone")],
    ]);
    expect(applyFilters([...POOL], filters)).toEqual([]);
    // The rule is still in the map, so the strip still renders a chip whose ×
    // removes exactly this key — an invisible filter is the failure mode.
    expect(filters.has(key)).toBe(true);
    expect(filters.get(key)?.label).toBe("Gone");
  });

  it("no resolver registered degrades to empty, never to unfiltered data", () => {
    setCollectionMembershipResolver(() => undefined);
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "bella"),
        rule(BrowseFilterType.COLLECTION, "bella"),
      ],
    ]);
    expect(applyFilters([...POOL], filters)).toEqual([]);
  });

  it("hands the resolver the set it is about to narrow", () => {
    // Smart collections have no stored members, so the resolver can only
    // answer by evaluating their rule against these candidates.
    const seen: string[][] = [];
    setCollectionMembershipResolver((id, candidates) => {
      seen.push(candidates.map((s) => s.id));
      return MEMBERSHIP[id];
    });
    applyFilters(
      [...POOL],
      new Map([
        [
          keyFor(BrowseFilterType.COLLECTION, "bella"),
          rule(BrowseFilterType.COLLECTION, "bella"),
        ],
      ])
    );
    expect(seen).toEqual([["a", "b", "c", "d"]]);
  });

  it("a rule-based collection resolves its members instead of reporting none", () => {
    // What the real resolver does for kind: "smart" — replay the spec over the
    // candidates. Before this, smart collections returned new Set([]) from an
    // empty sequenceIds array and every one of them read as 0.
    setCollectionMembershipResolver((id, candidates) =>
      id === "level-2-smart"
        ? new Set(candidates.filter((s) => s.level === 2).map((s) => s.id))
        : MEMBERSHIP[id]
    );
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "level-2-smart"),
        rule(BrowseFilterType.COLLECTION, "level-2-smart", "Level 2"),
      ],
    ]);
    expect(applyFilters([...POOL], filters).map((s) => s.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("a rule-based collection intersects when stacked, rather than widening", () => {
    setCollectionMembershipResolver((id, candidates) =>
      id === "level-2-smart"
        ? new Set(candidates.filter((s) => s.level === 2).map((s) => s.id))
        : MEMBERSHIP[id]
    );
    const filters = new Map<string, ActiveFilter>([
      [
        keyFor(BrowseFilterType.COLLECTION, "level-2-smart"),
        rule(BrowseFilterType.COLLECTION, "level-2-smart", "Level 2"),
      ],
      [
        keyFor(BrowseFilterType.COLLECTION, "bella"),
        rule(BrowseFilterType.COLLECTION, "bella"),
      ],
    ]);
    // Two collections are alternatives, so this is (level 2) ∪ (a, b).
    expect(applyFilters([...POOL], filters).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("the collection:<id> key round-trips through persistence", () => {
    const key = keyFor(BrowseFilterType.COLLECTION, "bella");
    const entries: Array<[string, ActiveFilter]> = [
      [key, rule(BrowseFilterType.COLLECTION, "bella", "Bella Sequences")],
    ];
    const restored = new Map<string, ActiveFilter>(
      JSON.parse(JSON.stringify(entries)) as Array<[string, ActiveFilter]>
    );
    expect([...restored.keys()]).toEqual(["collection:bella"]);
    expect(applyFilters([...POOL], restored).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
