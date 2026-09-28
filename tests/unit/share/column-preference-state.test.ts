import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthUser = { uid: string; isAnonymous?: boolean } | null;
type AuthListener = (user: AuthUser) => void;
type RemoteSettings = {
  imageExport?: {
    columnCountOverrides?: Record<string, number | null>;
    columnCountPreferenceVersion?: number;
    columnCountPreferenceOwner?: string;
  };
};
type RemoteListener = (settings: RemoteSettings | null, userId: string) => void;

const auth = vi.hoisted(() => ({
  currentUser: null as AuthUser,
  listeners: new Set<AuthListener>(),
  onAuthStateChanged(listener: AuthListener) {
    auth.listeners.add(listener);
    listener(auth.currentUser);
    return () => auth.listeners.delete(listener);
  },
  setUser(user: AuthUser) {
    auth.currentUser = user;
    auth.listeners.forEach((listener) => listener(user));
  },
}));
const updateSetting = vi.hoisted(() => vi.fn());
const settingsMock = vi.hoisted(() => ({
  currentSettings: {} as RemoteSettings,
  updateSetting,
  remoteListeners: new Set<RemoteListener>(),
  lastRemote: undefined as
    | { settings: RemoteSettings | null; userId: string }
    | undefined,
  onRemoteSettingsApplied(listener: RemoteListener) {
    settingsMock.remoteListeners.add(listener);
    if (settingsMock.lastRemote) {
      listener(
        settingsMock.lastRemote.settings,
        settingsMock.lastRemote.userId
      );
    }
    return () => settingsMock.remoteListeners.delete(listener);
  },
  emitRemote(
    settings: RemoteSettings | null,
    userId = auth.currentUser?.uid ?? "guest-does-not-have-remote-settings"
  ) {
    settingsMock.lastRemote = { settings, userId };
    settingsMock.remoteListeners.forEach((listener) =>
      listener(settings, userId)
    );
  },
}));

const firebaseBootstrap = vi.hoisted(() => ({
  loads: vi.fn(),
  // Holds the load open so a test can look at the cards while Firebase loads.
  gate: null as Promise<void> | null,
  // Loading the real bootstrap registers its Auth instance with loaded-auth,
  // which is how the manager hears about sign-in. The fake does the same.
  async load() {
    firebaseBootstrap.loads();
    if (firebaseBootstrap.gate) await firebaseBootstrap.gate;
    const { registerLoadedAuth } = await import("$lib/shared/auth/loaded-auth");
    registerLoadedAuth(auth as never);
    return {};
  },
}));

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/shared/auth/firebase", () => firebaseBootstrap.load());
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: settingsMock,
}));
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: () => ({
      isDarkMode: () => false,
      registerObserver: () => {},
    }),
  })
);

import { createExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";

type ImageCompositionManager = ReturnType<
  (typeof import("$lib/shared/share/state/image-composition-state.svelte"))["getImageCompositionManager"]
>;

const EXPORT_OPTIONS_KEY = "tka_export_options";
const IMAGE_COMPOSITION_KEY = "tka-image-composition-settings";
// Firebase Auth's saved user record, in localStorage as on Safari and iOS.
const SAVED_USER_KEY = "firebase:authUser:test-api-key:[DEFAULT]";

describe("card column preferences", () => {
  let composition: ImageCompositionManager;

  /**
   * A fresh page. The app loads Firebase at startup; public pages such as the
   * home page do not (`firebaseLoaded: false`).
   */
  async function loadManager({
    firebaseLoaded = true,
  } = {}): Promise<ImageCompositionManager> {
    vi.resetModules();
    // resetModules keeps a mocked module's first result. Mock it again so
    // this page's Firebase load registers with this page's loaded-auth.
    vi.doMock("$lib/shared/auth/firebase", () => firebaseBootstrap.load());
    auth.listeners.clear();
    settingsMock.remoteListeners.clear();
    if (firebaseLoaded) await import("$lib/shared/auth/firebase");
    const { getImageCompositionManager } =
      await import("$lib/shared/share/state/image-composition-state.svelte");
    return getImageCompositionManager();
  }

  beforeEach(async () => {
    localStorage.clear();
    auth.currentUser = null;
    auth.listeners.clear();
    firebaseBootstrap.gate = null;
    updateSetting.mockReset();
    settingsMock.currentSettings = {};
    settingsMock.remoteListeners.clear();
    settingsMock.lastRemote = undefined;
    composition = await loadManager();
    firebaseBootstrap.loads.mockClear();
  });

  describe("on a page that has not loaded Firebase", () => {
    it("restores a returning guest's choice without loading Firebase", async () => {
      composition.setColumnCountForStepCount(12, 3);

      const page = await loadManager({ firebaseLoaded: false });

      await vi.waitFor(() =>
        expect(page.getColumnCountForStepCount(12)).toBe(3)
      );
      // A stray import() lands a few ticks later; give it time to show.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(firebaseBootstrap.loads).not.toHaveBeenCalled();
    });

    it("loads Firebase for a saved account and never shows it the guest's choice", async () => {
      composition.setColumnCountForStepCount(8, 8);
      localStorage.setItem(SAVED_USER_KEY, "{}");
      auth.currentUser = { uid: "user-1" };
      let finishLoading!: () => void;
      firebaseBootstrap.gate = new Promise((resolve) => {
        finishLoading = resolve;
      });

      const page = await loadManager({ firebaseLoaded: false });

      await vi.waitFor(() =>
        expect(firebaseBootstrap.loads).toHaveBeenCalledTimes(1)
      );
      expect(page.getColumnCountForStepCount(8)).toBeNull();

      finishLoading();
      await vi.waitFor(() => expect(auth.listeners.size).toBe(1));
      expect(page.getColumnCountForStepCount(8)).toBeNull();
      page.setColumnCountForStepCount(16, 8);
      expect(updateSetting).toHaveBeenCalledWith(
        "imageExport",
        expect.objectContaining({
          // The guest's 8 reaches the account only as an explicit Auto.
          columnCountOverrides: { "8": null, "16": 8 },
          columnCountPreferenceOwner: "user:user-1",
        })
      );
    });

    it("follows a sign-in once something else loads Firebase", async () => {
      const page = await loadManager({ firebaseLoaded: false });
      page.setColumnCountForStepCount(8, 8);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(page.getColumnCountForStepCount(8)).toBe(8);

      // The visitor opens sign-in, which loads the Firebase bootstrap.
      await import("$lib/shared/auth/firebase");
      auth.setUser({ uid: "user-1" });

      expect(page.getColumnCountForStepCount(8)).toBeNull();
    });
  });

  it("defaults 8- and 16-step cards to Auto for a pristine guest", () => {
    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(composition.getColumnCountForStepCount(16)).toBeNull();
  });

  it("persists an explicit guest choice without promoting it into account settings", () => {
    composition.setColumnCountForStepCount(16, 8);

    expect(composition.getColumnCountForStepCount(16)).toBe(8);
    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();

    const persisted = JSON.parse(
      localStorage.getItem(IMAGE_COMPOSITION_KEY) ?? "{}"
    );
    expect(persisted).toMatchObject({
      columnCountOverrides: { "16": 8 },
      columnCountPreferenceVersion: 1,
      columnCountPreferenceOwner: "guest",
    });
  });

  it("persists three columns for a 12-step card", async () => {
    composition.setColumnCountForStepCount(12, 3);

    expect(composition.getColumnCountForStepCount(12)).toBe(3);

    const reloaded = await loadManager();
    expect(reloaded.getColumnCountForStepCount(12)).toBe(3);
  });

  it("keeps an explicit guest choice across a real module reload", async () => {
    composition.setColumnCountForStepCount(8, 8);

    const reloaded = await loadManager();

    expect(reloaded.getColumnCountForStepCount(8)).toBe(8);
  });

  it("persists an explicit Auto choice as null", () => {
    composition.setColumnCountForStepCount(8, 4);
    composition.setColumnCountForStepCount(16, 8);
    composition.setColumnCountForStepCount(16, null);

    expect(composition.getSettings().columnCountOverrides).toEqual({
      "8": 4,
      "16": null,
    });
  });

  it("saves an authenticated user's explicit choice with identity provenance", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();

    composition.setColumnCountForStepCount(16, 8);

    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({
        columnCountOverrides: { "16": 8 },
        columnCountPreferenceVersion: 1,
        columnCountPreferenceOwner: "user:user-1",
      })
    );
  });

  it("migrates an unmarked local 8 to Auto before it reaches the card", async () => {
    localStorage.setItem(
      IMAGE_COMPOSITION_KEY,
      JSON.stringify({ columnCountOverrides: { "8": 8, "16": 8 } })
    );

    const reloaded = await loadManager();

    expect(reloaded.getColumnCountForStepCount(8)).toBeNull();
    expect(reloaded.getColumnCountForStepCount(16)).toBeNull();
    const persisted = JSON.parse(
      localStorage.getItem(IMAGE_COMPOSITION_KEY) ?? "{}"
    );
    expect(persisted.columnCountOverrides).toEqual({});
    expect(JSON.stringify(persisted)).not.toContain('"8":8');
  });

  it("does not carry a guest's explicit 8 into a newly signed-in account", () => {
    composition.setColumnCountForStepCount(8, 8);
    expect(composition.getColumnCountForStepCount(8)).toBe(8);

    auth.setUser({ uid: "new-user" });

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
  });

  it("keeps a live guest choice when Firebase provisions that same guest anonymously", () => {
    composition.setColumnCountForStepCount(8, 8);

    auth.setUser({ uid: "anonymous-1", isAnonymous: true });

    expect(composition.getColumnCountForStepCount(8)).toBe(8);
    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({
        columnCountOverrides: { "8": 8 },
        columnCountPreferenceOwner: "user:anonymous-1",
      })
    );
  });

  it("keeps preferences isolated while switching between guest and account identities", () => {
    composition.setColumnCountForStepCount(8, 8);
    auth.setUser({ uid: "user-1" });
    expect(composition.getColumnCountForStepCount(8)).toBeNull();

    composition.setColumnCountForStepCount(16, 8);
    auth.setUser(null);

    expect(composition.getColumnCountForStepCount(8)).toBe(8);
    expect(composition.getColumnCountForStepCount(16)).toBeNull();
  });

  it("treats an existing account document with no image settings as Auto", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();
    composition.setColumnCountForStepCount(8, 8);
    composition = await loadManager();
    updateSetting.mockReset();

    settingsMock.emitRemote({}, "user-1");

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({
        columnCountOverrides: {},
        columnCountPreferenceOwner: "user:user-1",
      })
    );
  });

  it("migrates an existing account's unmarked remote 8 to explicit Auto", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();

    settingsMock.emitRemote(
      { imageExport: { columnCountOverrides: { "8": 8, "16": 8 } } },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(composition.getColumnCountForStepCount(16)).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({
        columnCountOverrides: { "8": null, "16": null },
        columnCountPreferenceVersion: 1,
        columnCountPreferenceOwner: "user:user-1",
      })
    );
  });

  it("preserves a remote 8 only when the same account explicitly owns it", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();

    settingsMock.emitRemote(
      {
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBe(8);
  });

  it("ignores retired short-sequence keys without creating a migration write loop", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();

    settingsMock.emitRemote(
      {
        imageExport: {
          columnCountOverrides: { "2": null, "8": null },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("ignores a late snapshot from the previous account", async () => {
    auth.currentUser = { uid: "user-2" };
    composition = await loadManager();

    settingsMock.emitRemote(
      {
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("replays an authoritative snapshot that arrived before the manager subscribed", async () => {
    auth.currentUser = { uid: "user-1" };
    settingsMock.lastRemote = {
      userId: "user-1",
      settings: {
        imageExport: {
          columnCountOverrides: { "16": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
    };

    const reloaded = await loadManager();

    expect(reloaded.getColumnCountForStepCount(16)).toBe(8);
  });

  it("keeps a same-account choice made after boot when an older snapshot arrives", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();
    composition.setColumnCountForStepCount(8, null);
    updateSetting.mockReset();

    settingsMock.emitRemote(
      {
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({
        columnCountOverrides: { "8": null },
      })
    );
  });

  it("does not echo when Firestore confirms the current explicit choice", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();
    composition.setColumnCountForStepCount(8, 8);
    updateSetting.mockReset();

    settingsMock.emitRemote(
      {
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-1",
        },
      },
      "user-1"
    );

    expect(composition.getColumnCountForStepCount(8)).toBe(8);
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("does not let an unrelated card setting block the account's Auto columns", async () => {
    auth.currentUser = { uid: "user-1" };
    composition = await loadManager();
    composition.setColumnCountForStepCount(8, 8);
    composition = await loadManager();

    composition.setShowNotes(true);
    settingsMock.emitRemote({}, "user-1");

    expect(composition.getColumnCountForStepCount(8)).toBeNull();
  });

  it("erases the retired browser-global columnCount during construction", () => {
    localStorage.setItem(
      EXPORT_OPTIONS_KEY,
      JSON.stringify({ image: { columnCount: 8 } })
    );

    const exportOptions = createExportOptionsState();
    expect(exportOptions.getImageOptions()).not.toHaveProperty("columnCount");

    const persisted = JSON.parse(
      localStorage.getItem(EXPORT_OPTIONS_KEY) ?? "{}"
    );
    expect(persisted.image).not.toHaveProperty("columnCount");
  });
});
