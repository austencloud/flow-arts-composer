/**
 * Shared effect metadata. Single source of truth for id/label/icon/color
 * across the unified EffectsPanel (sidebar/strip/grid layouts) and
 * EffectSelector. The canonical roster contains 16 effects; the "none" chip is rendered
 * separately by consumers that need it.
 */

import type { Component } from "svelte";
import type { EffectPresetGroup } from "./presets/types";
import type { PrimaryParamSpec } from "./effect-primary-param";
import { PRIMARY_PARAMS } from "./effect-primary-param";
import { resilientLazyImport } from "$lib/shared/hmr-helper";
import { TRAIL_PRESET_GROUP } from "./presets/trail-presets";
import { FIRE_PRESET_GROUP } from "./presets/fire-presets";
import { LED_PRESET_GROUP } from "./presets/led-presets";
import { CHARCOAL_PRESET_GROUP } from "./presets/charcoal-presets";
import { ZAP_PRESET_GROUP } from "./presets/zap-presets";
import { SPARKLES_PRESET_GROUP } from "./presets/sparkles-presets";
import { GHOST_PRESET_GROUP } from "./presets/ghost-presets";
import { BLOOM_PRESET_GROUP } from "./presets/bloom-presets";
import { GOO_PRESET_GROUP } from "./presets/goo-presets";
import { BUBBLES_PRESET_GROUP } from "./presets/bubbles-presets";
import { PETALS_PRESET_GROUP } from "./presets/petals-presets";
import { SMOKE_PRESET_GROUP } from "./presets/smoke-presets";
import { INK_PRESET_GROUP } from "./presets/ink-presets";
import { FROST_PRESET_GROUP } from "./presets/frost-presets";
import { SILK_PRESET_GROUP } from "./presets/silk-presets";
import { ANIMAL_PRESET_GROUP } from "./presets/animal-presets";
import { PULSE_PRESET_GROUP } from "./presets/pulse-presets";
// Moved to effects/domain so pure domain code (e.g. presentation-intent) can
// read effect labels without pulling in this file's 17 preset modules and the
// HMR helper. Imported (not just re-exported) because EFFECTS/EFFECT_ICONS/
// EffectMeta are still used below in this file (EffectRegistration, registry
// building, effectNavIcon, readyEffectIds); re-exported so every existing
// importer of this module keeps working unchanged.
import {
  EFFECTS,
  EFFECT_COLORS,
  EFFECT_LABELS,
  EFFECT_ICONS,
  type EffectMeta,
} from "$lib/shared/effects/domain/effect-meta";

export {
  EFFECTS,
  EFFECT_COLORS,
  EFFECT_LABELS,
  EFFECT_ICONS,
  type EffectMeta,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EffectRegistration {
  meta: EffectMeta;
  presetGroup: EffectPresetGroup;
  // Component<any> — each customize component has its own required props (e.g. onBack)
  // that the registry does not need to know about; consumers cast as needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customizeComponent: () => Promise<{ default: Component<any> }>;
  primaryParam?: PrimaryParamSpec;
}

/** Generic Effects glyph, used only while nothing is chosen. */
export const EFFECTS_FALLBACK_ICON = "fa-wand-magic-sparkles";

/**
 * The glyph a nav pill should wear for the currently chosen effect. A selected
 * effect names itself the way the Props pill shows the chosen prop; the wand is
 * for "none", where there is no effect to show.
 */
export function effectNavIcon(effectId: string | null | undefined): string {
  if (!effectId || effectId === "none") return EFFECTS_FALLBACK_ICON;
  return EFFECT_ICONS[effectId] ?? EFFECTS_FALLBACK_ICON;
}

/** Effect ids whose covens should appear in the hub (ready3d !== false). */
export function readyEffectIds(): string[] {
  return EFFECTS.filter((e) => e.ready3d !== false).map((e) => e.id);
}

// ── Registration map ─────────────────────────────────────────────────────

const REGISTRY = new Map<string, EffectRegistration>();

export function registerEffect(reg: EffectRegistration): void {
  REGISTRY.set(reg.meta.id, reg);
}

export function getRegistration(id: string): EffectRegistration | undefined {
  return REGISTRY.get(id);
}

export function getAllRegistrations(): EffectRegistration[] {
  return EFFECTS.map((e) => REGISTRY.get(e.id)).filter(Boolean) as EffectRegistration[];
}

// ── Self-registration at module load ─────────────────────────────────────

const presetGroups: Record<string, EffectPresetGroup> = {
  trails: TRAIL_PRESET_GROUP,
  fire: FIRE_PRESET_GROUP,
  led: LED_PRESET_GROUP,
  charcoal: CHARCOAL_PRESET_GROUP,
  zap: ZAP_PRESET_GROUP,
  sparkles: SPARKLES_PRESET_GROUP,
  ghost: GHOST_PRESET_GROUP,
  bloom: BLOOM_PRESET_GROUP,
  goo: GOO_PRESET_GROUP,
  bubbles: BUBBLES_PRESET_GROUP,
  petals: PETALS_PRESET_GROUP,
  smoke: SMOKE_PRESET_GROUP,
  ink: INK_PRESET_GROUP,
  frost: FROST_PRESET_GROUP,
  silk: SILK_PRESET_GROUP,
  animal: ANIMAL_PRESET_GROUP,
  pulse: PULSE_PRESET_GROUP,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customizeLoaders: Record<string, () => Promise<{ default: Component<any> }>> = {
  trails: resilientLazyImport(() => import("./customize/TrailCustomize.svelte")),
  fire: resilientLazyImport(() => import("./customize/FireCustomize.svelte")),
  led: resilientLazyImport(() => import("./customize/LedCustomize.svelte")),
  charcoal: resilientLazyImport(() => import("./customize/CharcoalCustomize.svelte")),
  zap: resilientLazyImport(() => import("./customize/ZapCustomize.svelte")),
  sparkles: resilientLazyImport(() => import("./customize/SparklesCustomize.svelte")),
  ghost: resilientLazyImport(() => import("./customize/GhostCustomize.svelte")),
  bloom: resilientLazyImport(() => import("./customize/BloomCustomize.svelte")),
  goo: resilientLazyImport(() => import("./customize/GooCustomize.svelte")),
  bubbles: resilientLazyImport(() => import("./customize/BubblesCustomize.svelte")),
  petals: resilientLazyImport(() => import("./customize/PetalsCustomize.svelte")),
  smoke: resilientLazyImport(() => import("./customize/SmokeCustomize.svelte")),
  ink: resilientLazyImport(() => import("./customize/InkCustomize.svelte")),
  frost: resilientLazyImport(() => import("./customize/FrostCustomize.svelte")),
  silk: resilientLazyImport(() => import("./customize/SilkCustomize.svelte")),
  animal: resilientLazyImport(() => import("./customize/AnimalCustomize.svelte")),
  pulse: resilientLazyImport(() => import("./customize/PulseCustomize.svelte")),
};

for (const meta of EFFECTS) {
  registerEffect({
    meta,
    presetGroup: presetGroups[meta.id]!,
    customizeComponent: customizeLoaders[meta.id]!,
    primaryParam: PRIMARY_PARAMS[meta.id],
  });
}
