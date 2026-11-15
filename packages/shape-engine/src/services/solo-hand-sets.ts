// What the solo card needs to know about the two hands' flower lists: whether
// they offer the same shapes, so one set can stand for both, and which flower
// on the other hand matches the one picked, so switching hands keeps the shape.
import { flowerKey, type Flower } from "@tka/shape-domain";

/** Both hands offer the same flowers in the same order. */
export function handsOfferSameShapes(
  left: readonly Flower[],
  right: readonly Flower[]
): boolean {
  if (left.length === 0 || left.length !== right.length) return false;
  return left.every(
    (flower, index) => flowerKey(flower) === flowerKey(right[index]!)
  );
}

/**
 * The flower on `to` at the place `selectedKey` holds on `from`, or the first
 * one when the selected flower is not on `from`.
 */
export function matchingFlowerOnOtherHand(
  from: readonly Flower[],
  to: readonly Flower[],
  selectedKey: string
): Flower | undefined {
  const index = from.findIndex((flower) => flowerKey(flower) === selectedKey);
  return to[index >= 0 ? index : 0] ?? to[0];
}
