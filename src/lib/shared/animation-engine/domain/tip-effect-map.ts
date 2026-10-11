import type {
  TipEffectMap,
  EffectType,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";

const VALID = new Set<string>(EFFECTS.map((effect) => effect.id));

/**
 * Build a wildcard TipEffectMap for one station. A null or unknown id falls
 * back to "led" — the registry ids are 1:1 with EffectType, so a known id
 * passes straight through.
 */
export function buildTipEffectMap(effectId: string | null): TipEffectMap {
  const effect = (
    effectId && VALID.has(effectId) ? effectId : "led"
  ) as EffectType;
  return { "*": { effect } };
}
