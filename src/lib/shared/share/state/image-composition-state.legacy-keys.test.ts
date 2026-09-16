import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Same mocking shape as cd-slice.test.ts: the jsdom stub pins `browser` to
// false, which short-circuits the manager's constructor entirely.
vi.mock("$app/environment", () => ({
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

vi.mock("$lib/shared/auth/firebase", () => ({ getAuthSync: () => auth }));
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: settingsMock,
}));
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
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

describe("image composition settings position -> placement rename", () => {
  it("honors pre-rename includeStartPosition and startPositionLayoutOverrides from localStorage", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        includeStartPosition: false,
        startPositionLayoutOverrides: { "8": "column" },
      })
    );

    const store = await loadManager();

    expect(store.includeStartPlacement).toBe(false);
    expect(store.hasStartPlacementLayoutOverride(8)).toBe(true);
    expect(store.getStartPlacementLayoutForStepCount(8)).toBe("column");
  });

  it("honors a pre-rename flat startPositionLayout", async () => {
    // A non-empty override map keeps the unrelated old "column default -> row
    // default" boot migration (loadSettings) from firing, so this isolates
    // the rename mapping from that separate, pre-existing migration.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startPositionLayout: "column",
        startPositionLayoutOverrides: { "4": "column" },
      })
    );

    const store = await loadManager();

    expect(store.startPlacementLayout).toBe("column");
  });

  it("prefers the new spelling when both are present", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        includeStartPosition: false,
        includeStartPlacement: true,
        startPositionLayoutOverrides: { "8": "column" },
        startPlacementLayoutOverrides: { "8": "row" },
      })
    );

    const store = await loadManager();

    expect(store.includeStartPlacement).toBe(true);
    expect(store.getStartPlacementLayoutForStepCount(8)).toBe("row");
  });

  it("is idempotent: re-saving and reloading the migrated output changes nothing further", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        includeStartPosition: false,
        startPositionLayoutOverrides: { "8": "column" },
      })
    );

    const first = await loadManager();
    const firstSnapshot = first.getSettings();

    // Simulate the local copy being re-saved and re-loaded (writeLocalCopy ->
    // readLocalCopy), the exact belt-and-suspenders path this migration
    // exists for: the seed no longer carries any legacy key.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(firstSnapshot));
    const second = await loadManager();

    expect(second.includeStartPlacement).toBe(firstSnapshot.includeStartPlacement);
    expect(second.getStartPlacementLayoutForStepCount(8)).toBe(
      firstSnapshot.startPlacementLayoutOverrides["8"]
    );
  });
});
