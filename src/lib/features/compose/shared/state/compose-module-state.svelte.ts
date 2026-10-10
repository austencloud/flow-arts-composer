/**
 * Compose Module State (Shared)
 *
 * Manages shared state for the Compose module:
 * - Current tab (arrange, browse)
 * - Current animation mode for playback (single, tunnel, mirror, grid, side-by-side)
 * - Sequence browser panel visibility and mode
 * - Playback overlay state
 *
 * Tab structure:
 * - tabs/arrange/ (folder: setup/) - Bento mode selection and sequence configuration
 * - tabs/browse/ - Saved compositions gallery
 *
 * Playback is an overlay, not a tab - triggered from Arrange or Browse
 */

import type { AnimationMode } from "../domain/animation-mode";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { createPersistenceHelper } from "#lib/shared/state/utils/persistent-state.js";

const debug = createComponentLogger("ComposeModuleState");

// Tab types - Playback is an overlay, not a tab
export type ComposeTab = "arrange" | "browse" | "timeline";

// Re-export AnimationMode for backwards compatibility
export type ComposeMode = AnimationMode;

export type BrowserTargetMode =
  | "primary"
  | "secondary"
  | "grid-0"
  | "grid-1"
  | "grid-2"
  | "grid-3";

// LocalStorage keys
const STORAGE_KEYS = {
  CURRENT_TAB: "compose-current-tab",
  CURRENT_MODE: "compose-current-mode",
} as const;

// Source tab for playback overlay (where to return when closed)
export type PlaybackSource = "arrange" | "browse";

export type ComposeModuleState = {
  // Current tab (arrange, browse)
  readonly currentTab: ComposeTab;

  // Current animation mode (for playback) - single, tunnel, mirror, grid, side-by-side
  readonly currentMode: ComposeMode;

  // Sequence browser panel
  readonly isSequenceBrowserOpen: boolean;
  readonly browserMode: BrowserTargetMode;

  // Playback overlay state
  readonly isPlaybackOpen: boolean;
  readonly playbackSource: PlaybackSource;

  // Tab switching
  setCurrentTab: (tab: ComposeTab) => void;

  // Mode switching (for playback configuration)
  setCurrentMode: (mode: ComposeMode) => void;

  // Browser panel
  openSequenceBrowser: (mode: BrowserTargetMode) => void;
  closeSequenceBrowser: () => void;

  // Playback overlay
  openPlayback: (source: PlaybackSource) => void;
  closePlayback: () => void;

  // Navigation helpers
  goToArrange: () => void;
  goToBrowse: () => void;
  goToTimeline: () => void;

  reset: () => void;

  // Tear down the standalone reactive scope created by the factory
  destroy: () => void;
};

// Persistence helpers
const tabPersistence = createPersistenceHelper({
  key: STORAGE_KEYS.CURRENT_TAB,
  defaultValue: "arrange" as ComposeTab,
});

const modePersistence = createPersistenceHelper({
  key: STORAGE_KEYS.CURRENT_MODE,
  defaultValue: "single" as ComposeMode,
});

export function createComposeModuleState(): ComposeModuleState {
  // Migrate old "compose" or "playback" tab values to "arrange"
  const storedTab = tabPersistence.load();
  const migratedTab: ComposeTab =
    (storedTab as string) === "compose" || (storedTab as string) === "playback"
      ? "arrange"
      : storedTab;

  // Current tab (persisted)
  let currentTab = $state<ComposeTab>(migratedTab);

  // Current animation mode (persisted) - used for playback configuration
  let currentMode = $state<ComposeMode>(modePersistence.load());

  // Auto-save tab and mode changes.
  // Uses $effect.root() because this factory runs outside component context;
  // capture the disposer so the scope can be torn down via destroy().
  let cleanupEffects: (() => void) | null = $effect.root(() => {
    $effect(() => {
      void currentTab;
      tabPersistence.setupAutoSave(currentTab);
    });

    $effect(() => {
      void currentMode;
      modePersistence.setupAutoSave(currentMode);
    });
  });

  // Sequence browser panel (not persisted - always starts closed)
  let isSequenceBrowserOpen = $state<boolean>(false);
  let browserMode = $state<BrowserTargetMode>("primary");

  // Playback overlay state (not persisted - always starts closed)
  let isPlaybackOpen = $state<boolean>(false);
  let playbackSource = $state<PlaybackSource>("arrange");

  return {
    // Getters
    get currentTab() {
      return currentTab;
    },
    get currentMode() {
      return currentMode;
    },
    get isSequenceBrowserOpen() {
      return isSequenceBrowserOpen;
    },
    get browserMode() {
      return browserMode;
    },
    get isPlaybackOpen() {
      return isPlaybackOpen;
    },
    get playbackSource() {
      return playbackSource;
    },

    // Tab switching
    setCurrentTab(tab: ComposeTab) {
      currentTab = tab;
      debug.log("Tab changed to", tab);
    },

    // Mode switching (for playback configuration)
    setCurrentMode(mode: ComposeMode) {
      currentMode = mode;
      debug.log("Mode changed to", mode);
    },

    // Browser panel
    openSequenceBrowser(mode: BrowserTargetMode) {
      debug.log("Opening browser for", mode, {
        currentlyOpen: isSequenceBrowserOpen,
        currentMode: browserMode,
      });

      browserMode = mode;
      isSequenceBrowserOpen = true;
      debug.log("Browser opened for", mode);
    },

    closeSequenceBrowser() {
      isSequenceBrowserOpen = false;
      debug.log("Browser closed");
    },

    // Playback overlay
    openPlayback(source: PlaybackSource) {
      playbackSource = source;
      isPlaybackOpen = true;
      debug.log("Opening playback from", source);
    },

    closePlayback() {
      isPlaybackOpen = false;
      debug.log("Closing playback, returning to", playbackSource);
    },

    // Navigation helpers
    goToArrange() {
      currentTab = "arrange";
      debug.log("Navigating to Arrange");
    },

    goToBrowse() {
      currentTab = "browse";
      debug.log("Navigating to Browse");
    },

    goToTimeline() {
      currentTab = "timeline";
      debug.log("Navigating to Timeline");
    },

    reset() {
      currentTab = "arrange";
      currentMode = "single";
      isSequenceBrowserOpen = false;
      browserMode = "primary";
      isPlaybackOpen = false;
      playbackSource = "arrange";

      tabPersistence.save("arrange");
      modePersistence.save("single");
      debug.log("Reset");
    },

    // Teardown
    destroy() {
      if (cleanupEffects) {
        cleanupEffects();
        cleanupEffects = null;
        debug.log("Destroyed reactive scope");
      }
    },
  };
}

// Singleton instance
let composeModuleStateInstance: ComposeModuleState | null = null;

export function getComposeModuleState(): ComposeModuleState {
  if (!composeModuleStateInstance) {
    composeModuleStateInstance = createComposeModuleState();
  }
  return composeModuleStateInstance;
}
