/**
 * Effect layer resolution.
 *
 * Each overlay canvas sits on one of three z-index slots:
 *   1 = trail (behind everything)
 *   2 = default effect behind props
 *   3 = main canvas (grid + glyphs + props)
 *   4 = effect override in front of props
 *
 * Users toggle individual effects between "behind" and "front" via the
 * effects panel. The effects domain owns each effect's default intent; this
 * module only maps that resolved intent to renderer stacking slots.
 */

import type { EffectLayerMode } from "#lib/shared/effects/domain/effect-layer-policy.js";

export type { EffectLayerMode } from "#lib/shared/effects/domain/effect-layer-policy.js";

export const LAYER_Z_TRAIL_BEHIND = 1;
export const LAYER_Z_EFFECT_BEHIND = 2;
export const LAYER_Z_PROPS = 3;
export const LAYER_Z_FRONT = 4;

/** Effects whose "behind" default is z=1 (trail) rather than z=2 (most overlays). */
const TRAIL_EFFECT_IDS: ReadonlySet<string> = new Set(["trails"]);

export function resolveEffectZ(
  effectId: string,
  mode: EffectLayerMode
): number {
  if (mode === "front") return LAYER_Z_FRONT;
  return TRAIL_EFFECT_IDS.has(effectId)
    ? LAYER_Z_TRAIL_BEHIND
    : LAYER_Z_EFFECT_BEHIND;
}
