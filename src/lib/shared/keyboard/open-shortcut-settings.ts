import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
import type { ShortcutHelpLaunchOptions } from "#lib/shared/keyboard/state/keyboard-shortcut-state.svelte.js";
import { keyboardShortcutState } from "#lib/shared/keyboard/state/keyboard-shortcut-state.svelte.js";
import { logKeyboardShortcutSettingsOpened } from "#lib/shared/keyboard/keyboard-shortcut-analytics.js";

export type ShortcutSettingsSource =
  | "keyboard_shortcut"
  | "command_palette"
  | "viewer_3d";

/**
 * Opens shortcut management as a normal Settings destination. The launch
 * options survive the route transition so callers can focus a useful subset.
 */
export async function openShortcutSettings(
  source: ShortcutSettingsSource,
  options: ShortcutHelpLaunchOptions = {}
): Promise<void> {
  keyboardShortcutState.openHelp(options);
  logKeyboardShortcutSettingsOpened(keyboardShortcutState.context, source);
  await handleModuleChange("settings", "keyboard");
}
