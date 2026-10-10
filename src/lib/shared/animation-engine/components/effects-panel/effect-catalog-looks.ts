import { isEffectId } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import type { EffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { EFFECTS, getRegistration } from "./effect-registry";
import {
  createEffectLookPreview,
  type EffectLookPreviewModel,
} from "./effect-look-preview";
import { matchPresetId, pickedPresetId } from "./presets/match-preset";
import type { EffectPreset } from "./presets/types";

export interface EffectCatalogLook {
  preset: EffectPreset;
  model: EffectLookPreviewModel;
}

/** The look each effect's picture shows: the one that effect is set to now,
 *  so the picture shows what turning it on will look like (or, for the effect
 *  that is on, the look picked in the dock). An effect with no named looks
 *  (Ghost) draws its motif from its defaults.
 *
 *  Reads the state's version, so a `$derived` that calls this recomputes when
 *  any effect's settings change. */
export function effectCatalogLooks(
  effectsConfigState: EffectsConfigState
): Map<string, EffectCatalogLook> {
  void effectsConfigState.version;
  const looks = new Map<string, EffectCatalogLook>();
  for (const meta of EFFECTS) {
    const group = getRegistration(meta.id)?.presetGroup;
    if (!group || !isEffectId(meta.id)) continue;
    const config = effectsConfigState.effect(meta.id) as unknown as Record<
      string,
      unknown
    >;
    const current =
      pickedPresetId(group, config, effectsConfigState.activePresets[meta.id]) ??
      matchPresetId(group, config);
    const preset: EffectPreset = group.presets.find(
      (candidate) => candidate.id === current
    ) ??
      group.presets[0] ?? {
        id: `${meta.id}-default`,
        name: meta.label,
        previewColor: meta.color,
      };
    looks.set(meta.id, {
      preset,
      model: createEffectLookPreview(meta.id, preset),
    });
  }
  return looks;
}
