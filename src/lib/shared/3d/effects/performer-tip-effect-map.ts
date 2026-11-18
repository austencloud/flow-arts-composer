/**
 * The tip-effect map one performer draws with. The worker scene, the old
 * scene and the Unreal scene all read it here, so the order lives in one place:
 *
 *   1. the performer's own per-hand effects   -> {"0", "1"}
 *   2. the performer's own single effect      -> {"*"}
 *   3. the shared map, passed through whole   -> "*", "0", "1" (and per-tip)
 *
 * A performer with its own effect is never overridden by the shared per-prop
 * choice.
 */

import {
  resolveEffect,
  type EffectType,
  type TipEffectMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

export interface PerformerEffectSource {
  rawEffect?: EffectType | null;
  rawHandEffects?: { left: EffectType; right: EffectType } | null;
}

export function performerTipEffectMap(
  performer: PerformerEffectSource,
  sharedMap: TipEffectMap
): TipEffectMap {
  if (performer.rawHandEffects) {
    return {
      "0": { effect: performer.rawHandEffects.left },
      "1": { effect: performer.rawHandEffects.right },
    };
  }
  if (performer.rawEffect) return { "*": { effect: performer.rawEffect } };
  return { ...sharedMap };
}

/** The effect on the left (0) and right (1) prop of that performer. */
export function performerHandEffects(
  performer: PerformerEffectSource,
  sharedMap: TipEffectMap
): { left: EffectType; right: EffectType } {
  const map = performerTipEffectMap(performer, sharedMap);
  return {
    left: resolveEffect(0, 0, undefined, map),
    right: resolveEffect(1, 0, undefined, map),
  };
}

/**
 * The distinct effects one prop (0 left, 1 right) wears across its tips, read
 * with the same resolveEffect the renderers use. The old renderer's layer uses
 * it to light an effect only on the prop that wears it.
 */
export function effectsOnProp(
  propIndex: 0 | 1,
  tipKeys: readonly number[],
  tipMap: TipEffectMap | undefined,
  sharedMap: TipEffectMap
): EffectType[] {
  return [
    ...new Set(
      tipKeys.map((key) => resolveEffect(propIndex, key, tipMap, sharedMap))
    ),
  ];
}
