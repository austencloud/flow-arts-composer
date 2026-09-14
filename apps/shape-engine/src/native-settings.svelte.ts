import { BackgroundType } from "@austencloud/backgrounds";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  DEFAULT_FAN_APPEARANCE,
  normalizeFanAppearance,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
import { DEFAULT_PROP_LOOK } from "$lib/shared/pictograph/prop/domain/prop-look";
import {
  normalizeLegacyAppSettings,
  type AppSettings,
} from "$lib/shared/settings/domain/app-settings";

const STORAGE_KEY = "tka-shape-engine-settings";

const DEFAULT_SETTINGS: AppSettings = {
  gridMode: GridMode.DIAMOND,
  backgroundType: BackgroundType.COSMIC,
  backgroundQuality: "medium",
  backgroundEnabled: true,
  backgroundColor: "#000000",
  hapticFeedback: true,
  reducedMotion: false,
  catDogMode: false,
  propType: PropType.STAFF,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  fanAppearance: DEFAULT_FAN_APPEARANCE,
  propArtwork: DEFAULT_PROP_LOOK,
  primaryPropColors: null,
  leftBuugengFlipped: false,
  rightBuugengFlipped: false,
  compositionRecipeOverrides: {},
  blockedStartPositions: [],
  blockedStartPositionsByGridMode: {},
  propPresets: [],
  selectedPresetIndex: 0,
  darkMode: true,
};

function normalizeSettings(value: unknown): AppSettings {
  const normalized = normalizeLegacyAppSettings(value);
  return {
    ...DEFAULT_SETTINGS,
    ...normalized,
    fanAppearance: normalizeFanAppearance(normalized?.fanAppearance),
    compositionRecipeOverrides: normalized?.compositionRecipeOverrides ?? {},
  };
}

function loadSettings(): AppSettings {
  if (typeof localStorage === "undefined")
    return normalizeSettings(DEFAULT_SETTINGS);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? normalizeSettings(JSON.parse(stored))
      : normalizeSettings(DEFAULT_SETTINGS);
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

const settingsState = $state<AppSettings>(loadSettings());

function persistSettings(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsState));
  } catch {
    // The app remains usable when storage is unavailable or full.
  }
}

export class NativeSettingsService {
  get settings(): AppSettings {
    return settingsState;
  }

  get currentSettings(): AppSettings {
    return settingsState;
  }

  async updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    await this.updateSettings({ [key]: value } as Partial<AppSettings>);
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<void> {
    Object.assign(
      settingsState,
      normalizeSettings({ ...settingsState, ...updates })
    );
    persistSettings();
  }

  async loadSettings(): Promise<void> {
    Object.assign(settingsState, loadSettings());
  }

  saveSettings(): void {
    persistSettings();
  }

  clearStoredSettings(): void {
    if (typeof localStorage !== "undefined")
      localStorage.removeItem(STORAGE_KEY);
    Object.assign(settingsState, normalizeSettings(DEFAULT_SETTINGS));
  }

  async resetToDefaults(): Promise<void> {
    this.clearStoredSettings();
    persistSettings();
  }

  cleanup(): void {}
}

export { NativeSettingsService as SettingsState };
export const settingsService = new NativeSettingsService();

export function getSettings(): AppSettings {
  return settingsState;
}

export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  void settingsService.updateSetting(key, value);
}

export async function updateSettings(
  updates: Partial<AppSettings>
): Promise<void> {
  await settingsService.updateSettings(updates);
}

export function setCurrentPropType(propType: PropType): Promise<void> {
  return updateSettings({
    propType,
    leftPropType: propType,
    rightPropType: propType,
  });
}

export function clearStoredSettings(): void {
  settingsService.clearStoredSettings();
}

export function isSettingsPreviewMode(): boolean {
  return false;
}
