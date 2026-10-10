/**
 * Keyboard Shortcut State
 *
 * Global state for keyboard shortcuts using Svelte 5 runes.
 * Manages shortcut settings, context, and UI state.
 *
 * Domain: Keyboard Shortcuts - State Management
 */

import type {
  CustomBinding,
  ShortcutContext,
  ShortcutSettings,
} from "../domain/types/keyboard-types";
import {
  createDefaultShortcutSettings,
  decodeShortcutSettings,
  encodeShortcutSettings,
} from "../domain/shortcut-settings-codec";
import { browser } from "$app/env";

export interface ShortcutHelpLaunchOptions {
  view?: "current" | "all" | "changed";
  query?: string;
}

/**
 * Load settings from localStorage
 */
function loadSettings(): ShortcutSettings {
  if (!browser) return createDefaultShortcutSettings();

  try {
    const stored = localStorage.getItem("tka-keyboard-shortcuts-settings");
    return decodeShortcutSettings(stored);
  } catch (error) {
    console.warn("Failed to load keyboard shortcut settings:", error);
  }

  return createDefaultShortcutSettings();
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: ShortcutSettings): void {
  if (!browser) return;

  try {
    localStorage.setItem(
      "tka-keyboard-shortcuts-settings",
      encodeShortcutSettings(settings)
    );
  } catch (error) {
    console.warn("Failed to save keyboard shortcut settings:", error);
  }
}

/**
 * Detect operating system
 */
function detectOS(): "macos" | "windows" | "linux" | "unknown" {
  if (!browser) return "unknown";

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("mac") || userAgent.includes("mac")) {
    return "macos";
  } else if (platform.includes("win")) {
    return "windows";
  } else if (platform.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

export function createKeyboardShortcutState() {
  // Current shortcut context
  let currentContext = $state<ShortcutContext>("global");

  // Shortcut settings
  let settings = $state<ShortcutSettings>(loadSettings());

  // Operating system
  const os = detectOS();
  const isMac = os === "macos";

  // Help dialog state
  let showHelp = $state(false);
  let helpLaunch = $state<Required<ShortcutHelpLaunchOptions>>({
    view: "current",
    query: "",
  });
  let helpLaunchVersion = $state(0);

  // Command palette state
  let showCommandPalette = $state(false);

  // Shortcut hint state (for showing tooltips) - derived from settings
  const showHints = $derived(settings.showShortcutHints);

  // Recently activated shortcuts (for feedback)
  let recentlyActivated = $state<string[]>([]);

  function updateCustomBindings(
    updates: Record<string, CustomBinding | null>
  ): void {
    const nextBindings = { ...settings.customBindings };
    for (const [shortcutId, binding] of Object.entries(updates)) {
      if (binding) {
        nextBindings[shortcutId] = binding;
      } else {
        delete nextBindings[shortcutId];
      }
    }

    settings = {
      ...settings,
      customBindings: nextBindings,
    };
    saveSettings(settings);
  }

  return {
    // Context
    get context() {
      return currentContext;
    },
    setContext(context: ShortcutContext) {
      currentContext = context;
    },

    // Settings
    get settings() {
      return settings;
    },
    updateSettings(updates: Partial<ShortcutSettings>) {
      settings = { ...settings, ...updates };
      saveSettings(settings);
    },
    resetSettings() {
      settings = createDefaultShortcutSettings();
      saveSettings(settings);
    },

    // OS detection
    get os() {
      return os;
    },
    get isMac() {
      return isMac;
    },

    // Help dialog
    get showHelp() {
      return showHelp;
    },
    get helpLaunch() {
      return helpLaunch;
    },
    get helpLaunchVersion() {
      return helpLaunchVersion;
    },
    openHelp(options: ShortcutHelpLaunchOptions = {}) {
      helpLaunch = {
        view: options.view ?? "current",
        query: options.query ?? "",
      };
      helpLaunchVersion += 1;
      showHelp = true;
    },
    closeHelp() {
      showHelp = false;
    },
    toggleHelp() {
      showHelp = !showHelp;
    },

    // Command palette
    get showCommandPalette() {
      return showCommandPalette;
    },
    openCommandPalette() {
      showCommandPalette = true;
    },
    closeCommandPalette() {
      showCommandPalette = false;
    },
    toggleCommandPalette() {
      showCommandPalette = !showCommandPalette;
    },

    // Hints
    get showHints() {
      return showHints;
    },
    setShowHints(show: boolean) {
      settings.showShortcutHints = show;
      saveSettings(settings);
    },

    // Recently activated (for visual feedback)
    get recentlyActivated() {
      return recentlyActivated;
    },
    trackActivation(shortcutId: string) {
      recentlyActivated = [shortcutId, ...recentlyActivated.slice(0, 4)];

      // Clear after 2 seconds
      setTimeout(() => {
        recentlyActivated = recentlyActivated.filter((id) => id !== shortcutId);
      }, 2000);
    },

    // Custom binding management
    setCustomBinding(shortcutId: string, binding: CustomBinding) {
      updateCustomBindings({ [shortcutId]: binding });
    },

    removeCustomBinding(shortcutId: string) {
      updateCustomBindings({ [shortcutId]: null });
    },

    updateCustomBindings,

    resetAllCustomBindings() {
      settings = {
        ...settings,
        customBindings: {},
      };
      saveSettings(settings);
    },

    getCustomBinding(shortcutId: string): CustomBinding | undefined {
      return settings.customBindings[shortcutId];
    },

    get customBindingCount() {
      return Object.keys(settings.customBindings).length;
    },

    get hasCustomBindings() {
      return Object.keys(settings.customBindings).length > 0;
    },
  };
}

/**
 * Global keyboard shortcut state instance
 */
export const keyboardShortcutState = createKeyboardShortcutState();
