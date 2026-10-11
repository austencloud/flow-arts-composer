import { describe, expect, it } from "vitest";

import { resolveDirectorSequenceAssignments } from "#lib/features/stage/domain/tika-director-sequences.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function sequence(id: string): SequenceData {
  return {
    id,
    word: id.toUpperCase(),
    name: id,
    steps: [],
  } as unknown as SequenceData;
}

const library = ["alpha", "beta", "gamma", "delta", "epsilon"].map(sequence);
const performerIds = ["p1", "p2", "p3"];

describe("resolveDirectorSequenceAssignments", () => {
  it("gives every performer a different library sequence", () => {
    const picks = resolveDirectorSequenceAssignments({
      actions: [{ type: "assign-distinct-sequences" }],
      performerIds,
      seedKey: "scene:give each one a different sequence",
      library,
    });
    expect(picks.map((pick) => pick.performerId)).toEqual(performerIds);
    const ids = picks.map((pick) => pick.sequence.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(library.map((s) => s.id)).toContain(id);
  });

  it("is deterministic for the same seed and different for another", () => {
    const run = (seedKey: string) =>
      resolveDirectorSequenceAssignments({
        actions: [{ type: "assign-distinct-sequences" }],
        performerIds,
        seedKey,
        library,
      }).map((pick) => pick.sequence.id);
    expect(run("seed-a")).toEqual(run("seed-a"));
    const seeds = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"];
    expect(
      new Set(seeds.map((seed) => run(seed).join(","))).size
    ).toBeGreaterThan(1);
  });

  it("returns nothing when the plan has no sequence action", () => {
    expect(
      resolveDirectorSequenceAssignments({
        actions: [{ type: "assign-distinct-props" }],
        performerIds,
        seedKey: "x",
        library,
      })
    ).toEqual([]);
  });

  it("names the shortfall when the library cannot cover the cast", () => {
    expect(() =>
      resolveDirectorSequenceAssignments({
        actions: [{ type: "assign-distinct-sequences" }],
        performerIds,
        seedKey: "x",
        library: library.slice(0, 2),
      })
    ).toThrow(/2 sequences?.*3 performers/);
    expect(() =>
      resolveDirectorSequenceAssignments({
        actions: [{ type: "assign-distinct-sequences" }],
        performerIds,
        seedKey: "x",
        library: [],
      })
    ).toThrow(/library/i);
  });

  it("treats duplicate library ids as one sequence", () => {
    expect(() =>
      resolveDirectorSequenceAssignments({
        actions: [{ type: "assign-distinct-sequences" }],
        performerIds,
        seedKey: "x",
        library: [sequence("alpha"), sequence("alpha"), sequence("beta")],
      })
    ).toThrow(/2 sequences?.*3 performers/);
  });
});
