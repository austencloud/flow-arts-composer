/**
 * The creator's current look, read from the three places it lives: colors
 * from the global settings, the trail from the animation settings, and
 * effects from the persisted key (what any fresh scope boots with, what a
 * live persisting scope reaches within its save debounce, and the only
 * source on surfaces with no scope: scan, intake, retro, video record).
 *
 * One owner for both the publish-moment stamp (library-save-service) and the
 * "apply this look to my published sequences" restamp, so the two can never
 * capture different looks from the same settings.
 */

import { capturePresentation } from "#lib/shared/foundation/services/presentation-intent.js";
import type { PresentationIntent } from "#lib/shared/foundation/domain/models/presentation-intent.js";
import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
import { loadPersistedEffectsConfig } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";

export function captureSettingsPresentation(): PresentationIntent {
  return capturePresentation({
    primaryPropColors: settingsService.settings.primaryPropColors ?? null,
    trail: animationSettings.trail,
    effects: loadPersistedEffectsConfig() ?? DEFAULT_EFFECTS_CONFIG,
  });
}
