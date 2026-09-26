import {
  flowerPetals,
  type FlowerStyle,
  type RotatingFlower,
} from "$lib/shared/shape-matrix/domain/flower-signature";

export interface FlowerName {
  readonly id: string;
  readonly name: string;
  readonly flower: RotatingFlower;
  /**
   * Austen's own words for the name. Left unset until he writes it; the page
   * shows only the drawing, ratio, and petal count until then.
   */
  readonly definition?: string;
}

/**
 * Every flower starts pointing out, the classic picture: a four-petal
 * antispin flower then has its petal tips at the top, bottom, and sides.
 */
function named(
  id: string,
  name: string,
  style: FlowerStyle,
  turns: number
): FlowerName {
  return {
    id,
    name,
    flower: {
      style,
      turns,
      ori: "out",
      grid: "diamond",
      petals: flowerPetals({ style, turns }),
    },
  };
}

/** Ordered by ratio, one prop rotation more per hand cycle at each step. */
export const FLOWER_NAMES: readonly FlowerName[] = [
  named("cat-eye", "Cat-eye", "anti", 0),
  named("triquetra", "Triquetra", "anti", 0.5),
  named("antispin-flower", "Antispin flower", "anti", 1),
  named("inspin-flower", "Inspin flower", "pro", 1.5),
];
