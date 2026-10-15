/**
 * The four buugeng pairs, as the pair picker offers them.
 *
 * Chirality is stored per hand (`leftBuugengFlipped`, `rightBuugengFlipped`),
 * but what a viewer sees is the pair: at a shared hand point two buugeng that
 * face opposite ways stack into one figure eight, and two that face the same
 * way get the normal beta separation and sit side by side. The picker offers
 * the pairs, and this module maps each pair to the two stored flips and back.
 *
 * A is the unflipped artwork and B its mirror. Every buugeng artwork faces the
 * same way (tests/unit/buugeng-art-handedness.test.ts), so A is one shape in
 * every version.
 */

export type BuugengPairId = "mirrored-ab" | "mirrored-ba" | "matching-a" | "matching-b";

export interface BuugengPair {
  readonly id: BuugengPairId;
  /** Opposite hands nest into one shape; matching hands sit side by side. */
  readonly kind: "mirrored" | "matching";
  readonly leftFlipped: boolean;
  readonly rightFlipped: boolean;
}

export const BUUGENG_PAIRS: readonly BuugengPair[] = [
  { id: "mirrored-ab", kind: "mirrored", leftFlipped: false, rightFlipped: true },
  { id: "mirrored-ba", kind: "mirrored", leftFlipped: true, rightFlipped: false },
  { id: "matching-a", kind: "matching", leftFlipped: false, rightFlipped: false },
  { id: "matching-b", kind: "matching", leftFlipped: true, rightFlipped: true },
];

export function buugengPair(id: BuugengPairId): BuugengPair {
  return BUUGENG_PAIRS.find((pair) => pair.id === id) ?? BUUGENG_PAIRS[2]!;
}

export function buugengPairFor(
  leftFlipped: boolean,
  rightFlipped: boolean
): BuugengPair {
  return (
    BUUGENG_PAIRS.find(
      (pair) =>
        pair.leftFlipped === leftFlipped && pair.rightFlipped === rightFlipped
    ) ?? BUUGENG_PAIRS[2]!
  );
}

/** "A" for the unflipped artwork, "B" for its mirror. */
export function chiralityLetter(flipped: boolean): "A" | "B" {
  return flipped ? "B" : "A";
}
