/**
 * Confirmations a person can turn off with "Don't ask again".
 *
 * Each one guards a change the app can undo. Deleting saved work, resetting
 * settings with no way back, and other permanent changes are never listed
 * here and always ask. Settings › Preferences shows one switch per entry, in
 * this order, so a dialog that offers "Don't ask again" must be listed.
 */
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { AppSettings } from "./domain/app-settings";
import { settingsService } from "./state/settings-state.svelte.js";

export const SKIPPABLE_CONFIRMATIONS = [
  { key: "skipClearConfirmation", label: "settings_ask_before_clearing" },
  { key: "skipLoopConfirmation", label: "settings_ask_before_loop" },
  {
    key: "skipRemovePerformerConfirmation",
    label: "settings_ask_before_removing_performer",
  },
  {
    key: "skipDeleteTrackConfirmation",
    label: "settings_ask_before_deleting_track",
  },
  {
    key: "skipClearPostKeyframesConfirmation",
    label: "settings_ask_before_clearing_post_keyframes",
  },
] as const satisfies readonly {
  key: keyof AppSettings;
  label: TranslationKey;
}[];

export type SkippableConfirmation =
  (typeof SKIPPABLE_CONFIRMATIONS)[number]["key"];

/** False once the person ticked "Don't ask again" for this confirmation. */
export function shouldConfirm(key: SkippableConfirmation): boolean {
  return !settingsService.currentSettings?.[key];
}

/** The dialog's "Don't ask again" was ticked when the person confirmed. */
export function stopAsking(key: SkippableConfirmation): void {
  void settingsService.updateSetting(key, true);
}
