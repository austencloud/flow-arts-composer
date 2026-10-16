import { describe, expect, it } from "vitest";
import { BUUGENG_PAIRS, buugengPair, buugengPairFor } from "./buugeng-pair";

describe("buugeng pairs", () => {
  it("covers every combination of the two stored flips exactly once", () => {
    const combos = BUUGENG_PAIRS.map(
      (pair) => `${pair.leftFlipped}/${pair.rightFlipped}`
    );
    expect(new Set(combos).size).toBe(4);
  });

  it("round-trips each pair through its flips", () => {
    for (const pair of BUUGENG_PAIRS) {
      expect(buugengPairFor(pair.leftFlipped, pair.rightFlipped).id).toBe(
        pair.id
      );
      expect(buugengPair(pair.id)).toBe(pair);
    }
  });

  it("calls a pair mirrored exactly when the hands face opposite ways", () => {
    for (const pair of BUUGENG_PAIRS) {
      expect(pair.kind === "mirrored").toBe(
        pair.leftFlipped !== pair.rightFlipped
      );
    }
  });

  it("reads the app default, neither hand flipped, as both A", () => {
    expect(buugengPairFor(false, false).id).toBe("matching-a");
  });
});
