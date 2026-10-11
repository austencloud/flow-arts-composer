/**
 * Resolves per-tip visual effects and effort qualities.
 * Delegates to the pure functions in TipEffectTypes.
 */

import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import {
  type EffectType,
  type TipEffectMap,
  type TipEffortMap,
  resolveEffect,
  resolveEffort,
} from "../domain/types/tip-effect-types";

export {
  resolveEffect as resolveTipEffect,
  resolveEffort as resolveTipEffort,
};

export function setCellWide(map: TipEffectMap, effect: EffectType): TipEffectMap {
  return { ...map, "*": { effect } };
}

export function setPerHand(
  map: TipEffectMap,
  propIndex: number,
  effect: EffectType,
): TipEffectMap {
  return { ...map, [`${propIndex}`]: { effect } };
}

export function setPerTip(
  map: TipEffectMap,
  propIndex: number,
  tipIndex: number,
  effect: EffectType,
): TipEffectMap {
  return { ...map, [`${propIndex}-${tipIndex}`]: { effect } };
}

// Re-export types for convenience
export type { EffectType, TipEffectMap, TipEffortMap };
export type { EffortId };
