import type { TrailSettings } from "$lib/shared/animation-engine/domain/types/trail-types";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

/** Trail render settings minus workflow flags and the tunnel-only layer array. */
export type PresentationTrailSettings = Omit<
  TrailSettings,
  "usePathCache" | "previewMode" | "additionalLayerColors"
>;

/** Keys of EffectsConfig that describe one effect's look. */
export type EffectIntentKey = Exclude<
  keyof EffectsConfig,
  "version" | "tipEffectMap" | "activePresets" | "activeEffect" | "effectLayerOverrides"
>;

/**
 * EffectsConfig with only the intent objects referenced by tipEffectMap.
 * The bookkeeping keys are always present; unreferenced intents are omitted
 * and filled from DEFAULT_EFFECTS_CONFIG on read.
 */
export type PresentationEffectsConfig = Pick<
  EffectsConfig,
  "version" | "tipEffectMap" | "activePresets" | "activeEffect" | "effectLayerOverrides"
> &
  Partial<Pick<EffectsConfig, EffectIntentKey>>;

/** The visual look a creator saved a sequence with. */
export interface PresentationIntent {
  /** Null follows the theme's blue/red defaults, same contract as AppSettings. */
  readonly primaryPropColors: ViewerCustomColorPair | null;
  readonly trail: PresentationTrailSettings;
  readonly effects: PresentationEffectsConfig;
}
