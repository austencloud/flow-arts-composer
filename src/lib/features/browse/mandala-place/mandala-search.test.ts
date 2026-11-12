import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaClimbFamily } from "#lib/shared/browse/services/mandala-climb.svelte.js";
import { familyMatches, familySequences, searchMatches } from "./mandala-search";

function sequence(id: string, word: string): SequenceData {
  return { id, name: word, word, steps: [] } as unknown as SequenceData;
}

function family(id: string, ...groups: SequenceData[][]): MandalaClimbFamily {
  return {
    id,
    members: groups.map((sequences) => ({ sequences })),
  } as unknown as MandalaClimbFamily;
}

const fire = family("f1", [sequence("a", "AABB"), sequence("b", "CCDD")], [sequence("c", "EF")]);
const water = family("f2", [sequence("d", "GHGH")]);

describe("mandala search", () => {
  it("finds nothing to narrow with an empty or blank query", () => {
    expect(searchMatches(familySequences(fire), "")).toBeNull();
    expect(searchMatches(familySequences(fire), "   ")).toBeNull();
  });

  it("matches the way the grid's search does, across every member", () => {
    const matches = searchMatches([...familySequences(fire), ...familySequences(water)], "aabb");
    expect(matches && [...matches]).toEqual(["a"]);
    expect(familyMatches(fire, matches!)).toBe(true);
    expect(familyMatches(water, matches!)).toBe(false);
  });

  it("reaches a sequence in a later member group", () => {
    const matches = searchMatches(familySequences(fire), "ef")!;
    expect([...matches]).toEqual(["c"]);
    expect(familyMatches(fire, matches)).toBe(true);
  });
});
