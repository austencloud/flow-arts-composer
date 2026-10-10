import type { SettingsState } from "#lib/shared/settings/state/settings-state.svelte.js";
import { getAnimationVisibilityManager } from "../../animation-engine/state/animation-visibility-state.svelte";

const hmrData = import.meta.hot?.data as
  | { isInitialized?: boolean; settingsService?: SettingsState | null }
  | undefined;

let isInitialized = $state(hmrData?.isInitialized ?? false);
let settingsService: SettingsState | null = hmrData?.settingsService ?? null;

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.isInitialized = isInitialized;
    data.settingsService = settingsService;
  });
}

export async function initializeAppServices(): Promise<void> {
  if (isInitialized) return;

  const { settingsService: singleton } = await import(
    "../../settings/state/settings-state.svelte"
  );
  settingsService = singleton;
  isInitialized = true;

  syncDarkModeToAnimationManager();
}

/**
 * Sync the darkMode setting from AppSettings to the animation visibility manager.
 * Called after settings are loaded to ensure animations use the correct setting.
 */
function syncDarkModeToAnimationManager(): void {
  if (!settingsService) return;

  const darkMode = settingsService.settings.darkMode ?? false;
  getAnimationVisibilityManager().setDarkMode(darkMode);
}

export function clearAppServicesCache(): void {
  isInitialized = false;
  settingsService = null;
}

export function getSettingsServiceSync(): SettingsState {
  if (!settingsService) {
    throw new Error(
      "Settings service not initialized. Call initializeAppServices first."
    );
  }
  return settingsService;
}

export async function getSettingsService(): Promise<SettingsState> {
  if (!settingsService) {
    const { settingsService: singleton } = await import(
      "../../settings/state/settings-state.svelte"
    );
    settingsService = singleton;
  }
  if (!settingsService) {
    throw new Error("Settings service is null after resolution");
  }
  return settingsService;
}

export function areServicesInitialized(): boolean {
  return isInitialized;
}
