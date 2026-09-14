import type { TurnValue } from "$lib/shared/create/services/level-turn-values";
import {
  flowerPetals,
  type Flower,
  type FlowerStyle,
  type RotatingFlowerOri,
} from "./flower-signature";

/**
 * Carry a flower selection across a turn change instead of dropping it.
 *
 * The user picked prospin-out; changing the turn value is a request to see
 * THAT variant at the new turn, so the style and orientation are remembered
 * as a variant index and re-realized in the new band.
 */
export type SemanticVariant = 0 | 1 | 2 | 3;

export function semanticVariant(flower: Flower): SemanticVariant {
  if (flower.style === "float") {
    return ({ in: 0, out: 1, clock: 2, counter: 3 } as const)[flower.ori];
  }
  return ((flower.style === "anti" ? 2 : 0) +
    (flower.ori === "out" ? 1 : 0)) as SemanticVariant;
}

function rotatingStyle(variant: SemanticVariant): FlowerStyle {
  return variant >= 2 ? "anti" : "pro";
}

function rotatingOri(variant: SemanticVariant): RotatingFlowerOri {
  return variant % 2 === 0 ? "in" : "out";
}

function floatOri(variant: SemanticVariant): Flower["ori"] {
  return (["in", "out", "clock", "counter"] as const)[variant];
}

export function flowerAtTurn(
  turn: TurnValue,
  rememberedVariant: SemanticVariant
): Flower {
  if (turn === "fl") {
    return {
      style: "float",
      turns: "fl",
      ori: floatOri(rememberedVariant),
      grid: "diamond",
      petals: 0,
    };
  }

  const style = rotatingStyle(rememberedVariant);
  return {
    style,
    turns: turn,
    ori: rotatingOri(rememberedVariant),
    grid: "diamond",
    petals: flowerPetals({ style, turns: turn }),
  };
}

/** The same pair of shapes, re-realized at new left and right turn values. */
export function pairAtTurns(
  pair: { left: Flower; right: Flower },
  leftTurn: TurnValue,
  rightTurn: TurnValue
): { left: Flower; right: Flower } {
  return {
    left: flowerAtTurn(leftTurn, semanticVariant(pair.left)),
    right: flowerAtTurn(rightTurn, semanticVariant(pair.right)),
  };
}
