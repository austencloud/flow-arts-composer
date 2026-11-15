import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export type HandChoice = "both" | "left" | "right";

export interface HandPair {
  left: PropType;
  right: PropType;
}

/**
 * What a prop pick does under the Both / Left / Right choice. Both gives both
 * hands the prop; Left or Right changes that hand only. The stored cat/dog
 * flag is not something a person sets: it is on when the two hands differ and
 * off when they match.
 */
export function applyHandPick(
  pair: HandPair,
  hand: HandChoice,
  propType: PropType
): HandPair & { catDogMode: boolean } {
  const left = hand === "right" ? pair.left : propType;
  const right = hand === "left" ? pair.right : propType;
  return { left, right, catDogMode: left !== right };
}

/** The tiles lit for a choice: the addressed hand's, or both when they differ. */
export function litProps(pair: HandPair, hand: HandChoice): PropType[] {
  if (hand === "left") return [pair.left];
  if (hand === "right") return [pair.right];
  return pair.left === pair.right ? [pair.left] : [pair.left, pair.right];
}
