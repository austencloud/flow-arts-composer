import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type AuthUser = { uid: string; isAnonymous?: boolean } | null;
type AuthListener = (user: AuthUser) => void;
type RemoteSettings = { imageExport?: Record<string, unknown> };
type RemoteListener = (settings: RemoteSettings | null, userId: string) => void;

// The jsdom stub pins `browser` to false, which short-circuits the manager's
// constructor entirely and would make every write assertion below vacuous.
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

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
  onRemoteSettingsApplied(listener: RemoteListener) {
    settingsMock.remoteListeners.add(listener);
    return () => settingsMock.remoteListeners.delete(listener);
  },
  emitRemote(settings: RemoteSettings | null, userId: string) {
    settingsMock.remoteListeners.forEach((listener) =>
      listener(settings, userId)
    );
  },
}));

/** Stand-in for the global AnimationVisibilityManager the `an` slice borrows. */
const visibility = vi.hoisted(() => ({
  darkMode: false,
  observers: new Set<() => void>(),
  isDarkMode() {
    return visibility.darkMode;
  },
  registerObserver(observer: () => void) {
    visibility.observers.add(observer);
  },
  /** What `an`'s `replaceAll` does to this manager on a link with dark mode. */
  applyDarkMode(value: boolean) {
    visibility.darkMode = value;
    visibility.observers.forEach((observer) => observer());
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

const { captureCdSlice, seedFromCdSlice } = await import("./cd-slice");
const { DEFAULT_IMAGE_COMPOSITION_SETTINGS } =
  await import("$lib/shared/share/state/image-composition-state.svelte");

type CompositionManager = ReturnType<
  (typeof import("$lib/shared/share/state/image-composition-state.svelte"))["getImageCompositionManager"]
>;

const STORAGE_KEY = "tka-image-composition-settings";
const COLUMN_KEY = `${STORAGE_KEY}:column-preferences-v1`;
const STEPS = 8;

async function loadManager(): Promise<CompositionManager> {
  vi.resetModules();
  auth.listeners.clear();
  settingsMock.remoteListeners.clear();
  visibility.observers.clear();
  const { getImageCompositionManager } =
    await import("$lib/shared/share/state/image-composition-state.svelte");
  return getImageCompositionManager();
}

beforeEach(() => {
  localStorage.clear();
  auth.currentUser = null;
  auth.listeners.clear();
  updateSetting.mockReset();
  settingsMock.currentSettings = {};
  settingsMock.remoteListeners.clear();
  visibility.darkMode = false;
  visibility.observers.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("cd slice", () => {
  it("returns null for a factory-fresh PERSISTED load", async () => {
    const store = await loadManager();
    expect(captureCdSlice(store, STEPS)).toBeNull();
  });

  it("diffs against what a factory-fresh load actually holds", async () => {
    // The fx trap: boot migrations can make a fresh load differ from the raw
    // constant. Every ENCODED field must survive a real load untouched...
    const store = await loadManager();
    const live = store.getSettings();
    for (const field of [
      "addWord",
      "addStepNumbers",
      "addDifficultyLevel",
      "includeStartPlacement",
      "showLoopGlyph",
      "showNotes",
      "customNotesText",
      "showQRCode",
      "showMandala",
      "startPlacementLayout",
    ] as const) {
      expect(live[field]).toEqual(DEFAULT_IMAGE_COMPOSITION_SETTINGS[field]);
    }
    expect(live.customName).toBeUndefined();

    // ...while the identity fields do NOT: the auth observer stamps them on
    // every load, which is one of the reasons they are excluded.
    expect(live.columnCountPreferenceOwner).toBe("guest");
    expect(live.columnCountPreferenceVersion).toBe(1);
    expect(captureCdSlice(store, STEPS)).toBeNull();
  });

  it("captures only the flat keys that differ", async () => {
    const store = await loadManager();
    store.setShowQRCode(false);
    store.setAddDifficultyLevel(true);

    expect(captureCdSlice(store, STEPS)).toEqual({
      rest: { settings: { showQRCode: false, addDifficultyLevel: true } },
    });
  });

  it("captures cols for the viewed length only", async () => {
    const store = await loadManager();
    store.setColumnCountForStepCount(STEPS, 4);
    store.setColumnCountForStepCount(16, 8);

    expect(captureCdSlice(store, STEPS)?.cols).toBe(4);
    expect(captureCdSlice(store, 16)?.cols).toBe(8);
    expect(captureCdSlice(store, 12)).toBeNull();
  });

  it("treats an explicit Auto (null) as no cols", async () => {
    const store = await loadManager();
    store.setColumnCountForStepCount(STEPS, 4);
    store.setColumnCountForStepCount(STEPS, null);

    expect(captureCdSlice(store, STEPS)).toBeNull();
  });

  it("captures the viewed length's start layout and info-cell override", async () => {
    const store = await loadManager();
    store.setStartPlacementLayoutForStepCount(STEPS, "column");
    store.setInfoCellChoiceForStepCount(STEPS, "mandala");
    store.setStartPlacementLayoutForStepCount(16, "column");

    expect(captureCdSlice(store, STEPS)).toEqual({
      rest: { startLayout: "column", infoCell: "mandala" },
    });
  });

  it("never encodes dark mode — the an slice owns it", async () => {
    const store = await loadManager();
    visibility.applyDarkMode(true);

    expect(store.getSettings().darkMode).toBe(true);
    expect(captureCdSlice(store, STEPS)).toBeNull();
  });

  it("never encodes the sender's identity provenance", async () => {
    auth.currentUser = { uid: "sender-1" };
    const store = await loadManager();
    store.setColumnCountForStepCount(STEPS, 4);

    const payload = captureCdSlice(store, STEPS);
    expect(store.getSettings().columnCountPreferenceOwner).toBe(
      "user:sender-1"
    );
    const encoded = JSON.stringify(payload);
    expect(encoded).not.toContain("sender-1");
    expect(encoded).not.toContain("columnCountPreferenceOwner");
    expect(encoded).not.toContain("columnCountPreferenceVersion");
    expect(payload).toEqual({ cols: 4 });
  });

  it("round-trips: capture -> seed -> replaceAll -> capture is identity", async () => {
    const sender = await loadManager();
    sender.setShowMandala(false);
    sender.setShowNotes(true);
    sender.setCustomNotesText("Jam night");
    sender.setCustomName("Austen");
    sender.setStartPlacementLayout("column");
    sender.setColumnCountForStepCount(STEPS, 4);
    sender.setInfoCellChoiceForStepCount(STEPS, "none");
    const payload = captureCdSlice(sender, STEPS)!;

    localStorage.clear();
    const recipient = await loadManager();
    recipient.replaceAll(
      seedFromCdSlice(payload, STEPS, recipient.getSettings())
    );

    expect(captureCdSlice(recipient, STEPS)).toEqual(payload);
    expect(recipient.getColumnCountForStepCount(STEPS)).toBe(4);
    expect(recipient.showMandala).toBe(false);
    expect(recipient.customNotesText).toBe("Jam night");
    expect(recipient.customName).toBe("Austen");
    expect(recipient.getInfoCellChoiceForStepCount(STEPS)).toBe("none");
  });

  it("seeds onto defaults and keeps the recipient's excluded state", async () => {
    const recipient = await loadManager();
    recipient.setCustomName("Recipient");
    recipient.setColumnCountForStepCount(16, 8);
    visibility.applyDarkMode(true);
    const current = recipient.getSettings();

    const seeded = seedFromCdSlice({ cols: 4 }, STEPS, current);

    // Encoded fields reset to defaults (the sender diffed against them).
    expect(seeded.showQRCode).toBe(
      DEFAULT_IMAGE_COMPOSITION_SETTINGS.showQRCode
    );
    expect(seeded.customName).toBeUndefined();
    // Excluded fields keep the recipient's live values.
    expect(seeded.darkMode).toBe(true);
    expect(seeded.columnCountPreferenceOwner).toBe(
      current.columnCountPreferenceOwner
    );
    expect(seeded.columnCountOverrides["16"]).toBe(8);
    expect(seeded.columnCountOverrides[String(STEPS)]).toBe(4);
    expect(seeded.addUserInfo).toBe(seeded.showNotes);
  });

  it("forces explicit Auto for the viewed length when the sender is at Auto", async () => {
    // Otherwise the recipient's own numeric choice would leak into a borrowed view.
    const recipient = await loadManager();
    recipient.setColumnCountForStepCount(STEPS, 4);
    recipient.setStartPlacementLayoutForStepCount(STEPS, "column");

    const seeded = seedFromCdSlice(
      { rest: { settings: { showMandala: false } } },
      STEPS,
      recipient.getSettings()
    );

    expect(seeded.columnCountOverrides[String(STEPS)]).toBeNull();
    expect(seeded.startPlacementLayoutOverrides[String(STEPS)]).toBeUndefined();
  });

  it("suspend -> apply -> tweak -> restore -> resume writes zero times", async () => {
    const store = await loadManager();
    const before = store.getSettings();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    store.setPersistenceSuspended(true);
    store.replaceAll(
      seedFromCdSlice(
        { cols: 4, rest: { settings: { showQRCode: false } } },
        STEPS,
        store.getSettings()
      )
    );

    // A recipient tweaking during the session stays session-local too.
    store.setShowMandala(false);
    store.setColumnCountForStepCount(STEPS, 2);
    // And so does the dark mode an `an` override applies to the shared manager
    // this store mirrors.
    visibility.applyDarkMode(true);

    store.replaceAll(before);
    store.setPersistenceSuspended(false);

    expect(setItem).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();
    expect(store.getSettings()).toEqual(before);

    // Guard against a vacuous spy: same spy, same store, only the suspension
    // flag differs — and now both local keys are written.
    store.setColumnCountForStepCount(STEPS, 2);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(setItem).toHaveBeenCalledWith(
      `${COLUMN_KEY}:guest`,
      expect.any(String)
    );
  });

  it("never writes a borrowed session into the recipient's ACCOUNT", async () => {
    auth.currentUser = { uid: "recipient-1" };
    const store = await loadManager();
    const before = store.getSettings();
    updateSetting.mockClear();

    store.setPersistenceSuspended(true);
    store.replaceAll(seedFromCdSlice({ cols: 4 }, STEPS, store.getSettings()));
    store.setShowQRCode(false);
    store.replaceAll(before);
    store.setPersistenceSuspended(false);

    expect(updateSetting).not.toHaveBeenCalled();

    // Anti-vacuity: the same edit, unsuspended, does reach the account.
    store.setShowQRCode(false);
    expect(updateSetting).toHaveBeenCalledWith(
      "imageExport",
      expect.objectContaining({ showQRCode: false })
    );
  });

  it("defers a remote snapshot that lands mid-session", async () => {
    // Auth restore races a cold link load, so this is the common path.
    auth.currentUser = { uid: "recipient-1" };
    const store = await loadManager();
    const before = store.getSettings();
    updateSetting.mockClear();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    store.setPersistenceSuspended(true);
    store.replaceAll(
      seedFromCdSlice(
        { rest: { settings: { showMandala: false } } },
        STEPS,
        store.getSettings()
      )
    );

    settingsMock.emitRemote(
      { imageExport: { showMandala: true, addWord: false } },
      "recipient-1"
    );

    // The link's card is untouched by the recipient's own settings arriving.
    expect(store.showMandala).toBe(false);
    expect(store.addWord).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();

    store.replaceAll(before);
    store.setPersistenceSuspended(false);

    // ...and it is adopted once the visitor's own state is back.
    expect(store.addWord).toBe(false);
  });

  describe("full snapshot", () => {
    it("emits every encoded flat field at defaults (customName only when set) and round-trips", async () => {
      const store = await loadManager();
      const full = captureCdSlice(store, STEPS, { full: true });
      expect(full).not.toBeNull();
      expect(Object.keys(full!.rest!.settings!).sort()).toEqual(
        [
          "addWord",
          "addStepNumbers",
          "addDifficultyLevel",
          "includeStartPlacement",
          "showLoopGlyph",
          "showNotes",
          "customNotesText",
          "showQRCode",
          "showMandala",
          "startPlacementLayout",
        ].sort()
      );
      // Auto columns stay absent -- the seed writes them as an explicit null.
      expect("cols" in full!).toBe(false);

      store.setPersistenceSuspended(true);
      store.replaceAll(seedFromCdSlice(full!, STEPS, store.getSettings()));
      expect(captureCdSlice(store, STEPS, { full: true })).toEqual(full);
      expect(captureCdSlice(store, STEPS)).toBeNull();
      store.setPersistenceSuspended(false);
    });
  });
});
