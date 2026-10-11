/**
 * Background Builder State
 *
 * Manages tab persistence and lab settings for the background builder module.
 * Lab settings are persisted via the app settings service for localStorage + Firebase sync.
 */

import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { BackgroundType } from "@austencloud/backgrounds";
import {
  DEFAULT_COSMIC_SETTINGS,
  DEFAULT_FOREST_SETTINGS,
  DEFAULT_BLOSSOM_SETTINGS,
  DEFAULT_RAINBOW_SETTINGS,
  DEFAULT_EMBER_SETTINGS,
  DEFAULT_VOID_LAB_SETTINGS,
  type CosmicLabSettings,
  type ForestLabSettings,
  type BlossomLabSettings,
  type RainbowLabSettings,
  type EmberLabSettings,
  type CelestialLabSettings,
  type VoidLabSettings,
  type BackgroundLabSettings,
} from "#lib/shared/background-builder/domain/lab-settings-types.js";
import { normalizeCelestialLabSettings } from "#lib/shared/background-builder/domain/celestial-lab-settings.js";

const STORAGE_KEY = "tka-background-builder-active-tab";

export type BackgroundBuilderTab =
  | "ocean"
  | "cosmic"
  | "forest"
  | "blossom"
  | "rainbow"
  | "ember"
  | "winter"
  | "autumn";

const VALID_TABS: BackgroundBuilderTab[] = [
  "ocean",
  "cosmic",
  "forest",
  "blossom",
  "rainbow",
  "ember",
  "winter",
  "autumn",
];
const DEFAULT_TAB: BackgroundBuilderTab = "ocean";

// Map builder tabs to background types for setting the active background
const TAB_TO_BACKGROUND_TYPE: Record<
  BackgroundBuilderTab,
  BackgroundType | null
> = {
  ocean: BackgroundType.OCEAN,
  cosmic: BackgroundType.COSMIC,
  forest: BackgroundType.FOREST,
  blossom: BackgroundType.BLOSSOM,
  rainbow: BackgroundType.PRIDE,
  ember: BackgroundType.EMBER,
  winter: BackgroundType.WINTER,
  autumn: BackgroundType.AUTUMN,
};

function isValidTab(value: string): value is BackgroundBuilderTab {
  return VALID_TABS.includes(value as BackgroundBuilderTab);
}

function loadFromStorage(): BackgroundBuilderTab {
  if (typeof window === "undefined") return DEFAULT_TAB;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && isValidTab(stored) ? stored : DEFAULT_TAB;
}

function saveToStorage(tab: BackgroundBuilderTab): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, tab);
}

// Reactive state
let currentTab = $state<BackgroundBuilderTab>(loadFromStorage());

export const backgroundBuilderState = {
  get currentTab() {
    return currentTab;
  },

  setCurrentTab(tab: BackgroundBuilderTab) {
    currentTab = tab;
    saveToStorage(tab);

    // Also update the user's active background setting
    const backgroundType = TAB_TO_BACKGROUND_TYPE[tab];
    if (backgroundType) {
      void settingsService.updateSetting("backgroundCategory", "animated");
      void settingsService.updateSetting("backgroundType", backgroundType);
    }
  },

  reset() {
    currentTab = DEFAULT_TAB;
    saveToStorage(DEFAULT_TAB);
  },
};

// Lab Settings Persistence

/**
 * Get current lab settings from app settings, with defaults applied
 */
function getLabSettings(): BackgroundLabSettings {
  return settingsService.settings.backgroundLabSettings ?? {};
}

/**
 * Save lab settings to app settings (triggers localStorage + Firebase sync)
 */
function saveLabSettings(settings: BackgroundLabSettings): void {
  void settingsService.updateSetting("backgroundLabSettings", settings);
}

// Cosmic Lab Settings

export function getCosmicSettings(): CosmicLabSettings {
  const labSettings = getLabSettings();
  return labSettings.cosmic ?? { ...DEFAULT_COSMIC_SETTINGS };
}

export function updateCosmicSettings(
  settings: Partial<CosmicLabSettings>
): void {
  const current = getCosmicSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, cosmic: updated });
}

// Forest Lab Settings

export function getForestSettings(): ForestLabSettings {
  const labSettings = getLabSettings();
  return labSettings.forest ?? { ...DEFAULT_FOREST_SETTINGS };
}

export function updateForestSettings(
  settings: Partial<ForestLabSettings>
): void {
  const current = getForestSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, forest: updated });
}

// Blossom Lab Settings

export function getBlossomSettings(): BlossomLabSettings {
  const labSettings = getLabSettings();
  return labSettings.blossom ?? { ...DEFAULT_BLOSSOM_SETTINGS };
}

export function updateBlossomSettings(
  settings: Partial<BlossomLabSettings>
): void {
  const current = getBlossomSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, blossom: updated });
}

// Rainbow Lab Settings

export function getRainbowSettings(): RainbowLabSettings {
  const labSettings = getLabSettings();
  return labSettings.rainbow ?? { ...DEFAULT_RAINBOW_SETTINGS };
}

export function updateRainbowSettings(
  settings: Partial<RainbowLabSettings>
): void {
  const current = getRainbowSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, rainbow: updated });
}

// Ember Lab Settings

export function getEmberSettings(): EmberLabSettings {
  const labSettings = getLabSettings();
  return labSettings.ember ?? { ...DEFAULT_EMBER_SETTINGS };
}

export function updateEmberSettings(settings: Partial<EmberLabSettings>): void {
  const current = getEmberSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, ember: updated });
}

// Celestial Lab Settings

export function getCelestialLabSettings(): CelestialLabSettings {
  const labSettings = getLabSettings();
  return normalizeCelestialLabSettings(labSettings.celestial);
}

export function updateCelestialLabSettings(
  settings: Partial<CelestialLabSettings>
): void {
  const current = getCelestialLabSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, celestial: updated });
}

// Void Lab Settings

export function getVoidLabSettings(): VoidLabSettings {
  const labSettings = getLabSettings();
  return labSettings.void ?? { ...DEFAULT_VOID_LAB_SETTINGS };
}

export function updateVoidLabSettings(
  settings: Partial<VoidLabSettings>
): void {
  const current = getVoidLabSettings();
  const updated = { ...current, ...settings };
  const labSettings = getLabSettings();
  saveLabSettings({ ...labSettings, void: updated });
}
