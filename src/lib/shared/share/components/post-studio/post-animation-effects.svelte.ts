import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";

/** Detach saved appearance effects before handing them to scoped effect state. */
export function copyPostAnimationEffects(
  effects: EffectsConfig
): EffectsConfig {
  return structuredClone($state.snapshot(effects)) as EffectsConfig;
}
