/**
 * Refactored Application State - Clean Architecture
 *
 * Orchestrates focused state services following Single Responsibility Principle.
 * Each service handles one specific concern, making the code maintainable and testable.
 *
 * This replaces the 460-line monolith with a clean, focused architecture.
 */

import { BackgroundType } from "@austencloud/backgrounds";
import type { PerformanceSnapshot } from "../../foundation/ui/ui-types";
import { GridMode } from "../../pictograph/grid/domain/enums/grid-enums";
import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import { DEFAULT_FAN_APPEARANCE } from "../../pictograph/prop/domain/fan-appearance";
import { DEFAULT_PROP_LOOK } from "../../pictograph/prop/domain/prop-look";
import type {
  AppSettings,
  PropPreset,
} from "../../settings/domain/app-settings";
import { healPropPair } from "../../settings/domain/prop-pair-rule";
import {
  getIsInitialized,
  getIsInitializing,
  getInitializationError,
  resetInitializationState,
} from "./initialization-state.svelte";
import {
  areServicesInitialized,
  getSettingsServiceSync,
} from "./services.svelte";
import {
  initializeModulePersistence,
  preloadCachedModuleServices,
} from "./ui/module-state";
import {
  getShowSettings,
  getIsFullScreen,
  getIsTransitioning,
  resetUIState,
} from "./ui/ui-state.svelte";
import { userPreviewState } from "../../debug/state/user-preview-state.svelte";

// HMR Test Comment - This should trigger a full reload

// Default prop presets for new users (10 commonly-used configurations)
const DEFAULT_PROP_PRESETS: PropPreset[] = [
  { leftPropType: PropType.STAFF, rightPropType: PropType.STAFF, catDogMode: false },
  { leftPropType: PropType.FAN, rightPropType: PropType.FAN, catDogMode: false },
  { leftPropType: PropType.CLUB, rightPropType: PropType.CLUB, catDogMode: false },
  { leftPropType: PropType.BUUGENG, rightPropType: PropType.BUUGENG, catDogMode: false },
  { leftPropType: PropType.MINIHOOP, rightPropType: PropType.MINIHOOP, catDogMode: false },
  { leftPropType: PropType.TRIAD, rightPropType: PropType.TRIAD, catDogMode: false },
  { leftPropType: PropType.DOUBLESTAR, rightPropType: PropType.DOUBLESTAR, catDogMode: false },
  { leftPropType: PropType.BIGDOUBLESTAR, rightPropType: PropType.BIGDOUBLESTAR, catDogMode: false },
  { leftPropType: PropType.QUIAD, rightPropType: PropType.QUIAD, catDogMode: false },
  { leftPropType: PropType.STAFF, rightPropType: PropType.FAN, catDogMode: true },
];

// Default settings returned when services aren't initialized
const DEFAULT_SETTINGS: AppSettings = {
  gridMode: GridMode.DIAMOND,
  backgroundType: BackgroundType.COSMIC,
  backgroundQuality: "medium",
  backgroundEnabled: true,
  backgroundColor: "#000000",
  propPresets: DEFAULT_PROP_PRESETS,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  fanAppearance: DEFAULT_FAN_APPEARANCE,
  propArtwork: DEFAULT_PROP_LOOK,
  selectedPresetIndex: 0,
};

// Pre-load settings from localStorage synchronously to avoid flash of default background
const SETTINGS_STORAGE_KEY = "tka-modern-web-settings";

// Cache for preloaded settings - evaluated lazily on first access (not during SSR)
let preloadedSettingsCache: AppSettings | null = null;

function getPreloadedSettings(): AppSettings {
  // Return cached value if already evaluated
  if (preloadedSettingsCache !== null) {
    return preloadedSettingsCache;
  }

  // During SSR, localStorage isn't available - return defaults
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return DEFAULT_SETTINGS;
  }

  // On client, read from localStorage and cache the result
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      preloadedSettingsCache = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(stored);
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ...healPropPair(parsed),
    };
    preloadedSettingsCache = merged;
    return merged;
  } catch {
    preloadedSettingsCache = DEFAULT_SETTINGS;
    return DEFAULT_SETTINGS;
  }
}

export function getSettings() {
  const initialized = areServicesInitialized();

  if (!initialized) {
    // Return pre-loaded settings from localStorage (not hardcoded defaults)
    // This ensures BackgroundHost gets the user's saved background type immediately
    return getPreloadedSettings();
  }

  // When in preview mode, return the previewed user's settings (read-only)
  // This allows admins to see how the app looks with another user's configuration
  if (userPreviewState.isActive && userPreviewState.data.settings) {
    // Merge with defaults to ensure all required fields are present
    return {
      ...DEFAULT_SETTINGS,
      ...userPreviewState.data.settings,
      ...healPropPair(userPreviewState.data.settings),
    };
  }

  // Return the reactive settings object directly (NOT a snapshot)
  // This ensures components using $derived(getSettings()) will re-render when settings change
  const settings = getSettingsServiceSync().settings;
  return settings;
}

/**
 * Check if settings are currently in read-only preview mode
 * When true, settings changes should be blocked (viewing another user's config)
 */
export function isSettingsPreviewMode(): boolean {
  return userPreviewState.isActive && userPreviewState.data.settings !== null;
}

const performanceMetrics = $state({
  initializationTime: 0,
  lastRenderTime: 0,
  memoryUsage: 0,
});

export function getPerformanceMetrics() {
  return performanceMetrics;
}

export function getIsReady() {
  return (
    getIsInitialized() && !getIsInitializing() && !getInitializationError()
  );
}

export function getCanUseApp() {
  return getIsReady() && !getShowSettings();
}

/**
 * Update a single setting key-value pair.
 * This is the preferred method for individual setting updates as it avoids
 * race conditions when multiple updates happen in quick succession.
 */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  // Block updates when viewing another user's settings
  if (isSettingsPreviewMode()) {
    console.warn(
      "Cannot update settings while in preview mode (viewing another user's configuration)"
    );
    return;
  }

  if (!areServicesInitialized()) {
    console.warn("Settings service not initialized, cannot update setting");
    return;
  }

  // Use the singular updateSetting method which directly updates the state
  void getSettingsServiceSync().updateSetting(key, value);
}

export async function updateSettings(
  newSettings: Partial<AppSettings>
): Promise<void> {
  // Block updates when viewing another user's settings
  if (isSettingsPreviewMode()) {
    console.warn(
      "Cannot update settings while in preview mode (viewing another user's configuration)"
    );
    return;
  }

  if (!areServicesInitialized()) {
    console.warn("Settings service not initialized, cannot update settings");
    return;
  }

  // Update each setting individually using the interface method
  void getSettingsServiceSync().updateSettings(newSettings);
}

// Performance tracking
export function updateInitializationTime(time: number): void {
  performanceMetrics.initializationTime = time;
}

export function updateLastRenderTime(time: number): void {
  performanceMetrics.lastRenderTime = time;
}

export function updateMemoryUsage(): void {
  if (typeof performance !== "undefined" && "memory" in performance) {
    const memory = (performance as { memory: { usedJSHeapSize: number } })
      .memory;
    performanceMetrics.memoryUsage = Math.round(
      memory.usedJSHeapSize / 1048576
    );
  }
}

export async function restoreApplicationState(): Promise<void> {
  try {
    // Preload cached module services first to prevent UI flicker
    preloadCachedModuleServices();

    await initializeModulePersistence();
  } catch (error) {
    console.warn("⚠️ Failed to restore application state:", error);
    // Don't throw - app should work even if persistence fails
  }
}

// Performance snapshot for debugging
export function createPerformanceSnapshot(): PerformanceSnapshot {
  return {
    timestamp: Date.now(),
    metrics: performanceMetrics,
    appState: {
      isFullScreen: getIsFullScreen(),
      isTransitioning: getIsTransitioning(),
      showSettings: getShowSettings(),
    },
    memoryUsage: performanceMetrics.memoryUsage,
  };
}

export function resetMetrics(): void {
  performanceMetrics.initializationTime = 0;
  performanceMetrics.lastRenderTime = 0;
  performanceMetrics.memoryUsage = 0;
}

export function clearStoredSettings(): void {
  if (!areServicesInitialized()) {
    console.warn("Settings service not initialized, cannot clear settings");
    return;
  }
  getSettingsServiceSync().clearStoredSettings();
}

export function debugSettings(): void {
  if (!areServicesInitialized()) {
    console.warn("Settings service not initialized, cannot debug settings");
    return;
  }
  getSettingsServiceSync().debugSettings();
}

// Reset all application state to defaults
export function resetAppState(): void {
  resetUIState();

  resetInitializationState();

  // Reset performance metrics
  resetMetrics();

  // TODO: Implement resetToDefaults in SettingsState interface
  console.warn("resetToDefaults not implemented in SettingsState");
}

declare global {
  interface Window {
    debugSettings?: typeof debugSettings;
    resetAppState?: typeof resetAppState;
    clearStoredSettings?: typeof clearStoredSettings;
  }
}

if (typeof window !== "undefined") {
  window.debugSettings = debugSettings;
  window.resetAppState = resetAppState;
  window.clearStoredSettings = clearStoredSettings;
}
