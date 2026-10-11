import { describe, it, expect } from "vitest";
import {
  deriveSpecMembers,
  resolveSpecConnectives,
} from "#lib/shared/browse/services/smart-filter-spec.js";
import type { SmartFilterSpec } from "#lib/shared/library/domain/models/collection.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function seq(id: string, level: number): SequenceData {
  // Minimal shape the difficulty filter reads (level field + fallback).
  return { id, word: id, level } as unknown as SequenceData;
}

function loopSeq(id: string, components: string[]): SequenceData {
  // Minimal shape filterByLOOPComponent reads (components array).
  return { id, word: id, components } as unknown as SequenceData;
}

function loopFilter(component: string) {
  return {
    key: `cap_type:component:${component}`,
    type: "cap_type",
    value: `component:${component}`,
    label: component,
    chipColor: "#fff",
  };
}

describe("deriveSpecMembers", () => {
  it("filters a pool by the spec's stored filters (difficulty)", () => {
    const pool = [seq("a", 1), seq("b", 2), seq("c", 2), seq("d", 3)];
    const spec: SmartFilterSpec = {
      source: "community",
      filters: [
        { key: "difficulty", type: "difficulty", value: 2, label: "Level 2", chipColor: "#fff" },
      ],
      sortMethod: "alphabetical",
      sortDirection: "asc",
    };
    const result = deriveSpecMembers(pool, spec).map((s) => s.id).sort();
    expect(result).toEqual(["b", "c"]);
  });

  it("empty filters returns the whole pool", () => {
    const pool = [seq("a", 1), seq("b", 2)];
    const spec: SmartFilterSpec = {
      source: "community", filters: [], sortMethod: "alphabetical", sortDirection: "asc",
    };
    expect(deriveSpecMembers(pool, spec)).toHaveLength(2);
  });

  it("legacy spec (no connectives) with stacked LOOP entries keeps its AND meaning", () => {
    const pool = [
      loopSeq("both", ["mirrored", "swapped"]),
      loopSeq("mir", ["mirrored"]),
      loopSeq("swap", ["swapped"]),
    ];
    const spec: SmartFilterSpec = {
      source: "community",
      filters: [loopFilter("mirrored"), loopFilter("swapped")],
      sortMethod: "alphabetical",
      sortDirection: "asc",
    };
    expect(deriveSpecMembers(pool, spec).map((s) => s.id)).toEqual(["both"]);
  });

  it('explicit "any" connective widens stacked LOOP entries to alternatives', () => {
    const pool = [
      loopSeq("both", ["mirrored", "swapped"]),
      loopSeq("mir", ["mirrored"]),
      loopSeq("swap", ["swapped"]),
      loopSeq("neither", ["flipped"]),
    ];
    const spec: SmartFilterSpec = {
      source: "community",
      filters: [loopFilter("mirrored"), loopFilter("swapped")],
      sortMethod: "alphabetical",
      sortDirection: "asc",
      connectives: { cap_type: "any" },
    };
    const result = deriveSpecMembers(pool, spec).map((s) => s.id).sort();
    expect(result).toEqual(["both", "mir", "swap"]);
  });
});

describe("resolveSpecConnectives", () => {
  const base: Omit<SmartFilterSpec, "filters"> = {
    source: "community",
    sortMethod: "alphabetical",
    sortDirection: "asc",
  };

  it("stored connectives win over the migration default", () => {
    const spec: SmartFilterSpec = {
      ...base,
      filters: [loopFilter("mirrored"), loopFilter("swapped")],
      connectives: { cap_type: "any" },
    };
    expect(resolveSpecConnectives(spec).cap_type).toBe("any");
  });

  it('legacy multi-entry LOOP spec resolves to "all" (its meaning when saved)', () => {
    const spec: SmartFilterSpec = {
      ...base,
      filters: [loopFilter("mirrored"), loopFilter("swapped")],
    };
    expect(resolveSpecConnectives(spec).cap_type).toBe("all");
  });

  it('legacy single-entry / empty specs resolve to the new default "any"', () => {
    const single: SmartFilterSpec = { ...base, filters: [loopFilter("mirrored")] };
    const empty: SmartFilterSpec = { ...base, filters: [] };
    expect(resolveSpecConnectives(single).cap_type).toBe("any");
    expect(resolveSpecConnectives(empty).cap_type).toBe("any");
    expect(resolveSpecConnectives(empty).tnd_family).toBe("any");
  });
});
