import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Settings -> Display card reset. Same mocking shape as cd-slice.test.ts: the jsdom stub pins `browser` to
// false, which short-circuits the manager's constructor entirely.
vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const auth = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  listeners: new Set<(user: { uid: string } | null) => void>(),
  onAuthStateChanged(listener: (user: { uid: string } | null) => void) {
    auth.listeners.add(listener);
    listener(auth.currentUser);
    return () => auth.listeners.delete(listener);
  },
}));

const settingsMock = vi.hoisted(() => ({
  currentSettings: {} as { imageExport?: Record<string, unknown> },
  updateSetting: vi.fn(),
  remoteListeners: new Set<(settings: unknown, userId: string) => void>(),
  onRemoteSettingsApplied(
    listener: (settings: unknown, userId: string) => void
  ) {
    settingsMock.remoteListeners.add(listener);
    return () => settingsMock.remoteListeners.delete(listener);
  },
}));

const visibility = vi.hoisted(() => ({
  darkMode: false,
  observers: new Set<() => void>(),
  isDarkMode() {
    return visibility.darkMode;
  },
  registerObserver(observer: () => void) {
    visibility.observers.add(observer);
  },
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({ getAuthSync: () => auth }));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: settingsMock,
}));
vi.mock(
  "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js",
  () => ({ getAnimationVisibilityManager: () => visibility })
);

const STORAGE_KEY = "tka-image-composition-settings";

async function loadManager() {
  vi.resetModules();
  auth.listeners.clear();
  settingsMock.remoteListeners.clear();
  visibility.observers.clear();
  const { getImageCompositionManager } = await import(
    "./image-composition-state.svelte"
  );
  return getImageCompositionManager();
}

beforeEach(() => {
  localStorage.clear();
  auth.currentUser = null;
  auth.listeners.clear();
  settingsMock.currentSettings = {};
  settingsMock.updateSetting.mockReset();
  settingsMock.remoteListeners.clear();
  visibility.darkMode = false;
  visibility.observers.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("ImageCompositionStateManager.resetDisplayDefaults", () => {
  // The silent failure is a display reset that also throws away the user's
  // column layout or footer text, which look like separate choices to them.
  it("restores the card switches and keeps layout overrides and notes", async () => {
    const { CARD_DISPLAY_KEYS, DEFAULT_IMAGE_COMPOSITION_SETTINGS } =
      await import("./image-composition-state.svelte");
    const store = await loadManager();

    store.setAddWord(false);
    store.setAddBeatNumbers(false);
    store.setAddDifficultyLevel(true);
    store.setShowLoopGlyph(false);
    store.setIncludeStartPlacement(false);
    store.setShowQRCode(false);
    store.setShowMandala(false);
    store.setColumnCountForStepCount(8, 4);
    store.setStartPlacementLayoutForStepCount(8, "column");
    store.setInfoCellChoiceForStepCount(8, "mandala");
    store.setCustomNotesText("My notes");
    store.setShowNotes(true);

    const observer = vi.fn();
    store.registerObserver(observer);
    store.resetDisplayDefaults();

    const after = store.getSettings();
    for (const key of CARD_DISPLAY_KEYS) {
      expect(after[key], key).toBe(DEFAULT_IMAGE_COMPOSITION_SETTINGS[key]);
    }
    expect(store.getColumnCountForStepCount(8)).toBe(4);
    expect(store.getStartPlacementLayoutForStepCount(8)).toBe("column");
    expect(store.getInfoCellChoiceForStepCount(8)).toBe("mandala");
    expect(after.customNotesText).toBe("My notes");
    expect(after.showNotes).toBe(true);
    expect(observer).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.addWord).toBe(true);
    expect(stored.showMandala).toBe(true);
    expect(stored.customNotesText).toBe("My notes");
  });
});
