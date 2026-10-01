import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";
import {
  TrailMode,
  type TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import type { PostAnimationItem } from "$lib/shared/media-composition/domain/post-project";

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
  return foldTrailIntentIntoSettings(
    {
      ...base,
      mode: TrailMode.FADE,
      trackingMode: trail?.trackingMode ?? base.trackingMode,
      tailLength: trail?.tailLength ?? base.tailLength,
    },
    effects.trails
  );
}
