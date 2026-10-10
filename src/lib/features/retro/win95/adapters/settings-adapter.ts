/**
 * settings-adapter - Persistence for TKA-OS desktop settings.
 *
 * Two-layer persistence:
 *   1. localStorage (fast, instant load, survives page refresh)
 *   2. Firebase via settingsState (cross-device sync, best-effort)
 *
 * The settingsState bridge is intentionally wrapped in try/catch because
 * the retro module boots before auth completes - Firebase will just get
 * updated the next time settings change from an authenticated session.
 *
 * Domain: Retro Desktop Shell
 */

const STORAGE_KEY = "retro-settings";

export interface RetroSettings {
  retroCrtScanlines: boolean;
  retroCrtVignette: boolean;
  retroCrtFlicker: boolean;
  retroDesktopColor: string;
  retroSoundVolume: number;
  retroSoundMuted: boolean;
  retroScreensaverTimeout: number;
}

const RETRO_DEFAULTS: RetroSettings = {
  retroCrtScanlines: true,
  retroCrtVignette: true,
  retroCrtFlicker: true,
  retroDesktopColor: "#008080",
  retroSoundVolume: 70,
  retroSoundMuted: false,
  retroScreensaverTimeout: 60,
};

/**
 * Load retro settings. Reads from localStorage immediately - no async needed.
 * Falls back to built-in defaults if nothing is stored yet.
 */
export function loadRetroSettings(): RetroSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...RETRO_DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // Corrupted storage - start fresh from defaults.
  }
  return { ...RETRO_DEFAULTS };
}

/**
 * Persist a full settings object. Writes to localStorage and attempts
 * a best-effort Firebase sync via settingsState if authenticated.
 */
export function saveRetroSettings(settings: Partial<RetroSettings>): void {
  const current = loadRetroSettings();
  const merged = { ...current, ...settings };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Quota exceeded or private browsing - silently skip storage.
  }

  // Best-effort Firebase sync via settingsService singleton
  try {
    import("#lib/shared/settings/state/settings-state.svelte.js").then(({ settingsService }) => {
      if (
        settingsService &&
        typeof (settingsService as unknown as Record<string, unknown>).updateSetting === "function"
      ) {
        (settingsService as { updateSetting: (key: string, value: unknown) => void }).updateSetting(
          "retro",
          merged
        );
      }
    }).catch(() => {
      // Settings module not ready - Firebase sync will happen next save.
    });
  } catch {
    // Silently skip.
  }
}

/**
 * Convenience helper for updating a single key.
 */
export function saveRetroSetting<K extends keyof RetroSettings>(
  key: K,
  value: RetroSettings[K]
): void {
  saveRetroSettings({ [key]: value } as Partial<RetroSettings>);
}
