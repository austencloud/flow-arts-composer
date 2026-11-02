import { describe, expect, it } from "vitest";
import {
  HAND_COMBINATIONS,
  classifyHandMove,
  combinationMoves,
} from "./hand-motions-topic.js";
import {
  randomCombinationExample,
  sameExample,
} from "./hand-combination-examples.js";

/** A small seeded generator (mulberry32), so draws repeat exactly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("randomCombinationExample", () => {
  for (const combination of HAND_COMBINATIONS) {
    it(`draws only ${combination.id} examples, never the one on screen`, () => {
      const rng = seeded(7);
      const moves = [...combinationMoves(combination.id)].sort();
      let shown = combination.demo;
      for (let i = 0; i < 200; i++) {
        const next = randomCombinationExample(combination, shown, rng);
        // Each hand's move matches its points, and the pair makes this
        // combination, whichever hand makes which move.
        for (const hand of [next.left, next.right]) {
          expect(classifyHandMove(hand.from, hand.to)).toBe(hand.move);
        }
        expect([next.left.move, next.right.move].sort()).toEqual(moves);
        expect(sameExample(next, shown)).toBe(false);
        shown = next;
      }
    });
  }

  it("repeats exactly under the same seed", () => {
    for (const combination of HAND_COMBINATIONS) {
      const a = seeded(42);
      const b = seeded(42);
      for (let i = 0; i < 20; i++) {
        expect(randomCombinationExample(combination, null, a)).toEqual(
          randomCombinationExample(combination, null, b)
        );
      }
    }
  });

  it("lets either hand make either move of a mixed combination", () => {
    const shift = HAND_COMBINATIONS.find((c) => c.id === "shift")!;
    const rng = seeded(3);
    const blueMoves = new Set(
      Array.from(
        { length: 50 },
        () => randomCombinationExample(shift, null, rng).left.move
      )
    );
    expect(blueMoves).toEqual(new Set(["shift", "static"]));
  });
});
