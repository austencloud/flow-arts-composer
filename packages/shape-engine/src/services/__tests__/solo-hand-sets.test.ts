import { describe, expect, it } from "vitest";
import {
  flowerKey,
  flowerPetals,
  type Flower,
  type FlowerStyle,
} from "@tka/shape-domain";
import {
  handsOfferSameShapes,
  matchingFlowerOnOtherHand,
} from "../solo-hand-sets";

function flower(style: FlowerStyle, turns: number, ori: "in" | "out"): Flower {
  return {
    style,
    turns,
    ori,
    grid: "diamond",
    petals: flowerPetals({ style, turns }),
  } as Flower;
}

const set = (turns: number) => [
  flower("pro", turns, "in"),
  flower("pro", turns, "out"),
  flower("anti", turns, "in"),
  flower("anti", turns, "out"),
];

describe("handsOfferSameShapes", () => {
  it("is true when both lists hold the same flowers in the same order", () => {
    expect(handsOfferSameShapes(set(1), set(1))).toBe(true);
  });

  it("is false for different turns, a different order, or uneven lists", () => {
    expect(handsOfferSameShapes(set(1), set(2))).toBe(false);
    expect(handsOfferSameShapes(set(1), [...set(1)].reverse())).toBe(false);
    expect(handsOfferSameShapes(set(1), set(1).slice(0, 3))).toBe(false);
  });

  it("is false when there is nothing to show", () => {
    expect(handsOfferSameShapes([], [])).toBe(false);
  });
});

describe("matchingFlowerOnOtherHand", () => {
  it("takes the flower at the same place on the other hand", () => {
    const left = set(1);
    const right = set(1);
    const picked = matchingFlowerOnOtherHand(left, right, flowerKey(left[2]!));
    expect(picked).toBe(right[2]);
  });

  it("falls back to the first flower when the selected one is not listed", () => {
    const right = set(1);
    expect(matchingFlowerOnOtherHand(set(1), right, "missing")).toBe(right[0]);
  });
});
