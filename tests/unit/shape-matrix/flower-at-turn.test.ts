import { describe, expect, it } from "vitest";
import {
  flowerAtTurn,
  pairAtTurns,
  semanticVariant,
} from "$lib/shared/shape-matrix/domain/flower-at-turn";
import {
  flowerPetals,
  type Flower,
} from "$lib/shared/shape-matrix/domain/flower-signature";

const proIn: Flower = {
  style: "pro",
  turns: 0,
  ori: "in",
  grid: "diamond",
  petals: flowerPetals({ style: "pro", turns: 0 }),
};
const antiOut: Flower = {
  style: "anti",
  turns: 0,
  ori: "out",
  grid: "diamond",
  petals: flowerPetals({ style: "anti", turns: 0 }),
};

describe("carrying a flower across a turn change", () => {
  it("keeps style and orientation while moving the turn band", () => {
    const moved = pairAtTurns({ left: proIn, right: antiOut }, 1, 2);
    expect(moved.left).toMatchObject({ style: "pro", ori: "in", turns: 1 });
    expect(moved.right).toMatchObject({ style: "anti", ori: "out", turns: 2 });
    expect(moved.left.petals).not.toBe(proIn.petals);
  });

  it("round-trips through the variant index for rotating flowers", () => {
    for (const flower of [proIn, antiOut]) {
      expect(flowerAtTurn(0, semanticVariant(flower))).toEqual(flower);
    }
  });

  it("maps a float and back without losing the variant", () => {
    const floated = flowerAtTurn("fl", semanticVariant(antiOut));
    expect(floated).toMatchObject({ style: "float", turns: "fl", petals: 0 });
    expect(semanticVariant(floated)).toBe(semanticVariant(antiOut));
    expect(flowerAtTurn(0, semanticVariant(floated))).toEqual(antiOut);
  });
});
