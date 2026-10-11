import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import { foldTrailIntentIntoSettings } from "#lib/shared/effects/translators/canvas2d-translator.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/** Detach saved appearance effects before handing them to scoped effect state. */
export function copyPostAnimationEffects(
  effects: EffectsConfig
): EffectsConfig {
  return structuredClone($state.snapshot(effects)) as EffectsConfig;
}

/**
 * The effects an appearance draws with: its own config, else `fallback` with
 * the appearance's trail look folded over it (an item saved before effects
 * were kept whole has only a trail).
 */
export function postAnimationEffectsConfig(
  appearance: PostAnimationAppearance | null | undefined,
  fallback: EffectsConfig
): EffectsConfig {
  const effects = copyPostAnimationEffects(appearance?.effects ?? fallback);
  const trail = appearance?.trail;
  if (!trail || appearance?.effects) return effects;
  effects.trails = {
    ...effects.trails,
    trackingMode: trail.trackingMode,
    thickness: trail.thickness,
    brightness: trail.brightness,
    leftColor: trail.leftColor,
    rightColor: trail.rightColor,
  };
  effects.activeEffect = trail.enabled ? "trails" : "none";
  effects.tipEffectMap = trail.enabled ? { "*": { effect: "trails" } } : {};
  return effects;
}

/** A post's selected trail look belongs to that item, even if viewer trails are off. */
export function postAnimationTrailSettings(
  base: TrailSettings,
  effects: EffectsConfig,
  trail: PostAnimationAppearance["trail"]
): TrailSettings {
  const saved = trail?.settings;
  const source = trail ? { ...DEFAULT_TRAIL_SETTINGS, ...saved } : base;
  return foldTrailIntentIntoSettings(
    {
      ...source,
      mode: saved?.mode ?? TrailMode.FADE,
      trackingMode: trail?.trackingMode ?? source.trackingMode,
      tailLength: trail?.tailLength ?? source.tailLength,
    },
    effects.trails
  );
}
