/**
 * One effect per prop, stored in the one effects map.
 *
 * Props are `0` (left) and `1` (right). The map keeps two shapes only:
 *
 *   both props the same:  {"*": {effect}}            (or {} when both are off)
 *   props differ:         {"*": {P}, "0": {L}, "1": {R}}
 *
 * `"*"` and `activeEffect` always name one truthful effect (P: the left prop's
 * unless it is off, then the right's), so everything that reads only those
 * keeps drawing something while a prop is lit. Per-tip keys ("0-1") are never
 * written here and are carried through untouched.
 */

import {
  setCellWide,
  setPerHand,
} from "#lib/shared/animation-engine/services/tip-effect-resolver.js";
import type {
  EffectType,
  TipEffectMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

export type PropHand = 0 | 1;
export type PropEffectTarget = "both" | PropHand;

const PER_TIP_KEY = /^\d+-\d+$/;

/** The effect one prop wears, read from its hand key, then the wildcard. */
export function effectForProp(map: TipEffectMap, hand: PropHand): EffectType {
  return map[`${hand}`]?.effect ?? map["*"]?.effect ?? "none";
}

/** True when the two props wear different effects. */
export function propEffectsDiffer(map: TipEffectMap): boolean {
  return effectForProp(map, 0) !== effectForProp(map, 1);
}

export interface PropEffectWrite {
  tipEffectMap: TipEffectMap;
  /** The primary effect, always equal to `tipEffectMap["*"]` (or "none"). */
  activeEffect: EffectType;
}

/**
 * The map and primary effect after setting `target` to `effect`. Matching
 * props collapse to the single-effect shape; differing props get all three
 * keys. Per-tip keys already in the map are kept.
 */
export function withPropEffect(
  map: TipEffectMap,
  target: PropEffectTarget,
  effect: EffectType
): PropEffectWrite {
  const left =
    target === "both" || target === 0 ? effect : effectForProp(map, 0);
  const right =
    target === "both" || target === 1 ? effect : effectForProp(map, 1);
  return withPropPair(map, left, right);
}

/**
 * The map and primary effect after giving the left prop `left` and the right
 * prop `right` in one write. Same shapes and invariants as `withPropEffect`.
 */
export function withPropPair(
  map: TipEffectMap,
  left: EffectType,
  right: EffectType
): PropEffectWrite {
  let next: TipEffectMap = {};
  for (const [key, assignment] of Object.entries(map)) {
    if (PER_TIP_KEY.test(key)) next[key] = assignment;
  }

  if (left === right) {
    if (left !== "none") next = setCellWide(next, left);
    return { tipEffectMap: next, activeEffect: left };
  }

  const primary = left !== "none" ? left : right;
  next = setCellWide(next, primary);
  next = setPerHand(next, 0, left);
  next = setPerHand(next, 1, right);
  return { tipEffectMap: next, activeEffect: primary };
}
