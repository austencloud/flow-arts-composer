import { describe, expect, it } from "vitest";

import {
  marksToFormations,
  type LegacyPerformer,
  type Mark,
} from "#lib/features/stage/domain/formation-migration.js";
import type { Formation } from "#lib/features/stage/domain/stage-types.js";

const CHOREOGRAPHY = { bpm: 120, stageWidth: 10, stageDepth: 8 };

function mark(id: string, x: number, beats: number): Mark {
  return { id, x, z: 4, beats, walkStyle: "direct", easing: "linear" };
}

function performer(id: string, marks: Mark[]): LegacyPerformer {
  return { id, marks };
}

function expectMigrationInvariants(
  formations: Formation[],
  performers: LegacyPerformer[]
): void {
  expect(formations[0]).toMatchObject({ atBeat: 0, transitionBeats: 0 });
  expect(new Set(formations.map((formation) => formation.atBeat)).size).toBe(
    formations.length
  );
  expect(formations.map((formation) => formation.atBeat)).toEqual(
    [...formations.map((formation) => formation.atBeat)].sort((a, b) => a - b)
  );

  formations.forEach((formation, index) => {
    expect(Number.isInteger(formation.atBeat)).toBe(true);
    expect(Number.isInteger(formation.transitionBeats)).toBe(true);
    expect(Object.keys(formation.spots).sort()).toEqual(
      performers.map((value) => value.id).sort()
    );
    if (index > 0) {
      expect(formation.transitionBeats).toBeLessThanOrEqual(
        formation.atBeat - formations[index - 1]!.atBeat
      );
    }
  });
}

describe("marks to formations migration", () => {
  it("preserves synchronized arrival sets", () => {
    const performers = [
      performer("a", [mark("a0", 1, 0), mark("a1", 5, 4), mark("a2", 9, 4)]),
      performer("b", [mark("b0", 9, 0), mark("b1", 5, 4), mark("b2", 1, 4)]),
    ];

    const formations = marksToFormations(performers, CHOREOGRAPHY);
    expect(formations.map((formation) => formation.atBeat)).toEqual([0, 4, 8]);
    expect(formations[1]!.spots).toMatchObject({ a: { x: 5 }, b: { x: 5 } });
    expect(formations[2]!.spots).toMatchObject({ a: { x: 9 }, b: { x: 1 } });
    expectMigrationInvariants(formations, performers);
  });

  it("flattens desynchronized mark durations into the union of arrivals", () => {
    const performers = [
      performer("a", [mark("a0", 0, 0), mark("a1", 4, 4), mark("a2", 8, 4)]),
      performer("b", [mark("b0", 10, 0), mark("b1", 4, 2), mark("b2", 0, 6)]),
    ];

    const formations = marksToFormations(performers, CHOREOGRAPHY);
    expect(formations.map((formation) => formation.atBeat)).toEqual([
      0, 2, 4, 8,
    ]);
    expect(formations.map((formation) => formation.transitionBeats)).toEqual([
      0, 2, 2, 4,
    ]);
    expect(formations[1]!.spots.a!.x).toBeCloseTo(2);
    expect(formations[2]!.spots.b!.x).toBeCloseTo(8 / 3);
    expectMigrationInvariants(formations, performers);
  });
});
