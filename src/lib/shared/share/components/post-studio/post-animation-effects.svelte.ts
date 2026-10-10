import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import { foldTrailIntentIntoSettings } from "#lib/shared/effects/translators/canvas2d-translator.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { PostAnimationItem } from "#lib/shared/media-composition/domain/post-project.js";

/** Detach saved appearance effects before handing them to scoped effect state. */
export function copyPostAnimationEffects(
  effects: EffectsConfig
): EffectsConfig {
  return structuredClone($state.snapshot(effects)) as EffectsConfig;
}

/** A post's selected trail look belongs to that item, even if viewer trails are off. */
export function postAnimationTrailSettings(
  base: TrailSettings,
  effects: EffectsConfig,
  trail: NonNullable<PostAnimationItem["animationAppearance"]>["trail"]
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
