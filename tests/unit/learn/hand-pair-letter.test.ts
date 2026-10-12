import { beforeAll, describe, expect, it } from "vitest";
import { getLetterType } from "#lib/shared/foundation/domain/models/letter.js";
import {
  HAND_COMBINATIONS,
  classifyHandMove,
  combinationFor,
  handPairLetter,
  handPairPictographData,
  type ComboHand,
} from "#lib/shared/guide-topics/hand-motions-topic.js";
import { calculateDashLocationFromPictographData } from "#lib/shared/pictograph/arrow/positioning/calculation/services/dash-location-calculator.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { loadPictographDatasetForTests } from "../combination/pictograph-dataset";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const POINTS = [N, E, S, W];

function handTo(from: GridLocation, to: GridLocation): ComboHand {
  return { move: classifyHandMove(from, to)!, from, to };
}

/** Every pair the two-hand stage can make: any two starts, any two moves. */
function allPairs(): { left: ComboHand; right: ComboHand }[] {
  const pairs = [];
  for (const blueFrom of POINTS)
    for (const redFrom of POINTS)
      for (const blueTo of POINTS)
        for (const redTo of POINTS)
          pairs.push({
            left: handTo(blueFrom, blueTo),
            right: handTo(redFrom, redTo),
          });
  return pairs;
}

describe("a hand pair's letter", () => {
  beforeAll(async () => {
    await loadPictographDatasetForTests();
  });

  it("names a letter of the pair's own combination for every pair", async () => {
    for (const { left, right } of allPairs()) {
      const letter = await handPairLetter(left, right);
      const label = `${left.from}>${left.to} ${right.from}>${right.to}`;
      expect(letter, label).not.toBeNull();
      expect(getLetterType(letter!), label).toBe(
        combinationFor(left.move, right.move).letterType
      );
    }
  });

  it("stores each board example's own letter", async () => {
    for (const { id, demo, demoLetter } of HAND_COMBINATIONS) {
      expect(await handPairLetter(demo.left, demo.right), id).toBe(demoLetter);
    }
  });

  it("moves a Cross-Shift dash off the point where the shifting hand ends", async () => {
    // Austen's example: red shifts W to S while blue dashes E to W. Alone,
    // blue's dash would lie at South, under red's hand.
    const left = handTo(E, W);
    const right = handTo(W, S);
    const alone = handPairPictographData(left, right);
    expect(calculateDashLocationFromPictographData(alone, true)).toBe(S);
    const letter = await handPairLetter(left, right);
    const lettered = handPairPictographData(left, right, letter);
    expect(calculateDashLocationFromPictographData(lettered, true)).toBe(N);
  });

  it("never draws a dash where the other hand ends", async () => {
    for (const { left, right } of allPairs()) {
      const data = handPairPictographData(
        left,
        right,
        await handPairLetter(left, right)
      );
      if (left.move === "dash" && right.move === "shift") {
        expect(calculateDashLocationFromPictographData(data, true)).not.toBe(
          right.to
        );
      }
      if (right.move === "dash" && left.move === "shift") {
        expect(calculateDashLocationFromPictographData(data, false)).not.toBe(
          left.to
        );
      }
    }
  });
});
