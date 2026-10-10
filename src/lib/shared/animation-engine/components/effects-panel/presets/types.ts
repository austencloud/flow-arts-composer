/**
 * Shared preset types for the unified effects panel.
 *
 * A preset is DATA: a static `patch` (the normal case) or, for the two
 * "Custom" presets that read user-picked colors from localStorage, a
 * `resolvePatch` thunk evaluated at apply time. EffectsPanel feeds the patch
 * to `effectsConfigState.applyPreset` — presets no longer carry an imperative
 * `apply` closure, so their data can be inspected, serialized, and reused.
 */

import type {
  EffectConfigMap,
  EffectsConfigState,
} from "#lib/shared/effects/state/effects-config-state.svelte.js";

export interface EffectPreset<E extends keyof EffectConfigMap = keyof EffectConfigMap> {
  id: string;
  name: string;
  /** CSS color for the preview dot, "rainbow" for the conic-gradient, or "custom". */
  previewColor: string;
  /** Optional second color for dual-dot previews (e.g. "Prop Colors"). */
  previewColor2?: string;
  /**
   * Static intent patch — the normal case. Exactly one of patch/resolvePatch
   * is set. The two "Custom" presets (trails, fire) use resolvePatch instead;
   * the "Custom" chips that only open the Customize panel use an empty patch.
   */
  patch?: Partial<EffectConfigMap[E]>;
  /**
   * Dynamic patch resolved at apply time. Only the trails/fire "Custom"
   * presets use this — they read user-picked colors from localStorage.
   */
  resolvePatch?: () => Partial<EffectConfigMap[E]>;
}

export interface EffectPresetGroup {
  effectType: keyof EffectConfigMap;
  presets: EffectPreset[];
  /** One-line summary of current settings. Pure read of state. */
  getSummary: (state: EffectsConfigState) => string;
}
