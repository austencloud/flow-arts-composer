import { describe, expect, it } from "vitest";

import { normalizeFormations } from "#lib/features/stage/domain/formation-invariants.js";
import type { Formation } from "#lib/features/stage/domain/stage-types.js";

function formation(
  id: string,
  atBeat: number,
  transitionBeats: number,
  spots: Formation["spots"] = {}
): Formation {
  return { id, atBeat, transitionBeats, spots };
}

describe("normalizeFormations", () => {
  it("sorts, deduplicates, rounds, and clamps formation timing", () => {
    const result = normalizeFormations(
      [
        formation("late", 12.6, 20),
        formation("opening", 0.2, 4),
        formation("duplicate", 12.8, 2),
        formation("middle", 7.6, 9),
      ],
      [],
      10,
      8
    );

    expect(
      result.map(({ id, atBeat, transitionBeats }) => ({
        id,
        atBeat,
        transitionBeats,
      }))
    ).toEqual([
      { id: "opening", atBeat: 0, transitionBeats: 0 },
      { id: "middle", atBeat: 8, transitionBeats: 8 },
      { id: "late", atBeat: 13, transitionBeats: 5 },
    ]);
  });

  it("keeps exactly one clamped spot for every performer", () => {
    const result = normalizeFormations(
      [
        formation("opening", 0, 0, {
          performerA: {
            x: -2,
            z: 20,
            walkStyle: "crab",
            easing: "easeInOut",
          },
          removedPerformer: {
            x: 1,
            z: 1,
            walkStyle: "direct",
            easing: "linear",
          },
        }),
      ],
      ["performerA", "performerB"],
      10,
      8
    );

    expect(Object.keys(result[0]!.spots)).toEqual(["performerA", "performerB"]);
    expect(result[0]!.spots.performerA).toMatchObject({ x: 0, z: 8 });
    expect(result[0]!.spots.performerB).toMatchObject({
      x: 5,
      z: 4,
      walkStyle: "direct",
      easing: "linear",
    });
  });

  it("creates a valid opening formation for an empty track", () => {
    const result = normalizeFormations([], ["performerA"], 10, 8);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ atBeat: 0, transitionBeats: 0 });
    expect(result[0]!.spots.performerA).toBeDefined();
  });

  it("migrates optional performer travel without changing legacy spots", () => {
    const result = normalizeFormations(
      [
        formation("opening", 0, 0, {
          performerA: {
            x: 1,
            z: 1,
            walkStyle: "direct",
            easing: "linear",
          },
        }),
        formation("arrival", 16, 8, {
          performerA: {
            x: 6,
            z: 1,
            walkStyle: "direct",
            easing: "linear",
            travel: {
              departureBeat: -4,
              arrivalBeat: 20,
              stepCount: 99,
            },
          },
        }),
      ],
      ["performerA"],
      10,
      8
    );

    expect(result[0]!.spots.performerA.travel).toBeUndefined();
    expect(result[1]!.spots.performerA.travel).toEqual({
      departureBeat: 0,
      arrivalBeat: 16,
      stepCount: 16,
    });
  });
});
