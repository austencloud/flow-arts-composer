/**
 * Labels a symmetric seed satisfies at once.
 *
 * Each row is the seed half of a swapped LOOP the builder produced at level 1
 * (rows of DiamondPictographDataframe.csv, start placement dropped). The second
 * half is the first with the hands exchanged, which is what a swap does
 * (pair-relation.ts). For these letters every diamond variation has the right
 * hand on a rotated or reflected copy of the left hand's path, so the swap
 * lands exactly where the detector's preferred label would.
 */
import { describe, expect, it } from "vitest";
import {
  labelExplainsPair,
  labelsEquivalentForHalves,
  labelsEquivalentForPair,
  type PairLabel,
} from "../../../src/loop/detection/label-equivalence.js";
import type { PairMotions } from "../../../src/loop/detection/pair-relation.js";

/** "n>e pro | n>w pro": left hand, then right hand. */
function step(spec: string): PairMotions {
  const [left, right] = spec.split("|").map((side) => {
    const [path, motionType] = side.trim().split(" ");
    const [startLocation, endLocation] = path!.split(">");
    return {
      startLocation: startLocation!,
      endLocation: endLocation!,
      motionType: motionType!,
    };
  });
  return { left: left!, right: right! };
}

const swapHands = (s: PairMotions): PairMotions => ({
  left: s.right,
  right: s.left,
});

/** Seed half plus its hand-swapped copy: a swapped LOOP. */
function swappedLoop(seed: string[]): PairMotions[] {
  const half = seed.map(step);
  return [...half, ...half.map(swapHands)];
}

const SWAPPED: PairLabel = { components: ["swapped"] };
const REPEATED: PairLabel = { components: [] };

const ROWS: Array<{
  seed: string;
  steps: string[];
  detected: PairLabel;
  equivalent: boolean;
}> = [
  {
    seed: "D",
    steps: ["n>e pro | n>w pro", "e>n pro | w>n pro"],
    detected: { components: ["mirrored"], reflectionAxis: "north-south" },
    equivalent: true,
  },
  {
    seed: "E",
    steps: ["s>e anti | s>w anti", "e>s pro | w>s pro"],
    detected: { components: ["mirrored"], reflectionAxis: "north-south" },
    equivalent: true,
  },
  {
    seed: "J",
    steps: ["n>e pro | s>e pro", "e>s pro | e>n pro"],
    detected: { components: ["flipped"], reflectionAxis: "east-west" },
    equivalent: true,
  },
  {
    seed: "K",
    steps: ["s>e anti | n>e anti", "e>n pro | e>s pro"],
    detected: { components: ["flipped"], reflectionAxis: "east-west" },
    equivalent: true,
  },
  {
    seed: "P",
    steps: ["e>n pro | n>e pro"],
    detected: {
      components: ["mirrored"],
      reflectionAxis: "northeast-southwest",
    },
    equivalent: true,
  },
  {
    seed: "Q",
    steps: ["e>s anti | s>e anti"],
    detected: {
      components: ["mirrored"],
      reflectionAxis: "northwest-southeast",
    },
    equivalent: true,
  },
  {
    seed: "AA",
    steps: ["n>e pro | s>w pro", "e>s pro | w>n pro"],
    detected: { components: ["rotated"], rotation: "180" },
    equivalent: true,
  },
  {
    seed: "BA",
    steps: ["w>n anti | e>s anti", "n>e pro | s>w pro"],
    detected: { components: ["rotated"], rotation: "180" },
    equivalent: true,
  },
  // Both hands share every path, so the swap is a repeat. What the detector
  // reports is the seed's own inner reflection, one step apart, which the
  // halves do not show.
  {
    seed: "GG",
    steps: ["n>w pro | n>w pro", "w>n pro | w>n pro"],
    detected: {
      components: ["mirrored"],
      reflectionAxis: "northwest-southeast",
    },
    equivalent: false,
  },
  {
    seed: "HG",
    steps: ["w>n anti | w>n anti", "n>w pro | n>w pro"],
    detected: {
      components: ["inverted", "mirrored"],
      reflectionAxis: "northwest-southeast",
    },
    equivalent: false,
  },
];

describe("labelsEquivalentForHalves — the ten symmetric seeds", () => {
  for (const { seed, steps, detected, equivalent } of ROWS) {
    it(`${seed}: swapped ${equivalent ? "is" : "is not"} equivalent to the detected label`, () => {
      const loop = swappedLoop(steps);
      // The swap itself always holds; equivalence is about the other label.
      expect(labelsEquivalentForHalves(loop, SWAPPED, SWAPPED)).toBe(true);
      expect(labelsEquivalentForHalves(loop, SWAPPED, detected)).toBe(
        equivalent
      );
      expect(labelsEquivalentForHalves(loop, detected, SWAPPED)).toBe(
        equivalent
      );
    });
  }

  it("GG and HG: the swap is indistinguishable from repeating the seed", () => {
    for (const seed of ["GG", "HG"]) {
      const loop = swappedLoop(ROWS.find((r) => r.seed === seed)!.steps);
      expect(labelsEquivalentForHalves(loop, SWAPPED, REPEATED)).toBe(true);
    }
  });
});

describe("labelsEquivalentForPair — what it refuses", () => {
  const [d, , dSwapped] = swappedLoop(ROWS[0]!.steps);

  it("a pinned axis must match: D mirrors across north-south, not east-west", () => {
    expect(
      labelsEquivalentForPair(d!, dSwapped!, SWAPPED, {
        components: ["mirrored"],
        reflectionAxis: "north-south",
      })
    ).toBe(true);
    expect(
      labelsEquivalentForPair(d!, dSwapped!, SWAPPED, {
        components: ["flipped"],
        reflectionAxis: "east-west",
      })
    ).toBe(false);
  });

  it("a mixed seed carries no common alias: D mirrors where A rotates", () => {
    // D from beta1 ends at alpha7 (e, w); A continues from alpha7.
    const loop = swappedLoop(["n>e pro | n>w pro", "e>s pro | w>n pro"]);
    expect(
      labelsEquivalentForHalves(loop, SWAPPED, { components: ["mirrored"] })
    ).toBe(false);
    expect(
      labelsEquivalentForHalves(loop, SWAPPED, { components: ["rotated"] })
    ).toBe(false);
    expect(
      labelExplainsPair(loop[1]!, loop[3]!, {
        components: ["rotated"],
        rotation: "180",
      })
    ).toBe(true);
  });

  it("an odd or empty step list has no halves to compare", () => {
    expect(labelsEquivalentForHalves([], SWAPPED, SWAPPED)).toBe(false);
    expect(labelsEquivalentForHalves([d!, d!, d!], SWAPPED, SWAPPED)).toBe(
      false
    );
  });
});
