import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";

type RemoteSettings = Record<string, unknown>;

const auth = vi.hoisted(() => ({
  currentUser: { uid: "user-b" } as { uid: string } | null,
}));
const persister = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<RemoteSettings | null>>(),
  saveSettings: vi.fn<(settings: RemoteSettings) => Promise<void>>(),
  onSettingsChange: vi.fn(),
  listener: null as ((settings: RemoteSettings) => void) | null,
  subscribeCount: 0,
  unsubscribeCount: 0,
}));

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/shared/auth/firebase", () => ({ auth }));
vi.mock("$lib/shared/settings/get-settings-persister", () => ({
  getSettingsPersister: () => persister,
}));
vi.mock("$lib/shared/3d/undo/get-scene-undo-manager", () => ({
  getSceneUndoManager: () => ({
    registerDomain: () => {},
    captureState: () => {},
    commitState: () => {},
  }),
}));
vi.mock("$lib/shared/settings/utils/background-preloader", () => ({
  updateBodyBackground: () => {},
}));
vi.mock("$lib/shared/theme/services/theme-service", () => ({
  updateTheme: () => {},
}));
vi.mock("$lib/shared/settings/utils/background-theme-calculator", () => ({
  applyThemeForBackground: () => {},
}));
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: () => ({
      isDarkMode: () => false,
      setDarkMode: () => {},
    }),
  })
);
vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logSettingChange: vi.fn(async () => {}),
}));
vi.mock("$lib/shared/utils/debug-logger", () => ({
  createComponentLogger: () => ({
    info: () => {},
    success: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

const SETTINGS_KEY = "tka-modern-web-settings";
const LEGACY_QUEUE_KEY = "tka-settings-offline-queue";
const DEBOUNCE_MS = 300;

async function loadSettingsService() {
  vi.resetModules();
  const module =
    await import("$lib/shared/settings/state/settings-state.svelte");
  return module.settingsService;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (promise continuations) run under fake timers. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/**
 * Replay the offline queue on ONE service instance. Dispatching a real
 * `online` event is unusable here: every loadSettingsService() call re-imports
 * the module, and each instance stays registered on the shared jsdom window,
 * so one event drives every instance against the same persister mock.
 */
function drainOfflineQueue(service: unknown): Promise<void> {
  return (service as { processOfflineQueue(): Promise<void> })
    .processOfflineQueue();
}

describe("settings edited while a remote copy is in flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockReset();
    persister.loadSettings.mockResolvedValue(null);
    persister.saveSettings.mockReset();
    persister.saveSettings.mockResolvedValue();
    persister.onSettingsChange.mockReset();
    persister.listener = null;
    persister.subscribeCount = 0;
    persister.unsubscribeCount = 0;
    persister.onSettingsChange.mockImplementation(
      (listener: (settings: RemoteSettings) => void) => {
        persister.subscribeCount += 1;
        persister.listener = listener;
        return () => {
          persister.unsubscribeCount += 1;
          persister.listener = null;
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a toggle made while the account document is still loading", async () => {
    const load = deferred<RemoteSettings | null>();
    persister.loadSettings.mockReturnValue(load.promise);

    const service = await loadSettingsService();
    const syncing = service.initializeFirebaseSync();
    await flushMicrotasks();

    // The UI is interactive during the load: the user turns haptics off.
    await service.updateSetting("hapticFeedback", false);
    expect(service.currentSettings.hapticFeedback).toBe(false);

    // The account document — written before this toggle — arrives late.
    load.resolve({ hapticFeedback: true, reducedMotion: true });
    await syncing;
    await flushMicrotasks();

    expect(service.currentSettings.hapticFeedback).toBe(false);
    // Remote keys the user did not touch still apply.
    expect(service.currentSettings.reducedMotion).toBe(true);

    // The local mirror must not carry the reverted value either.
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").hapticFeedback
    ).toBe(false);

    // And the debounced upload must publish the user's choice, not the
    // stale remote value it just overwrote.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ hapticFeedback: false })
    );
  });

  it("keeps the newer toggle when a snapshot echoes an earlier in-flight save", async () => {
    persister.loadSettings.mockResolvedValue({
      hapticFeedback: true,
      reducedMotion: false,
    });

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();
    expect(persister.listener).toBeTypeOf("function");

    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    persister.saveSettings
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    await service.updateSetting("hapticFeedback", false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // The first write lands; the second is still open.
    firstSave.resolve();
    await flushMicrotasks();

    // Firestore echoes the document as of the first write only.
    persister.listener?.({ hapticFeedback: false, reducedMotion: false });
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(true);
    expect(service.currentSettings.hapticFeedback).toBe(false);

    secondSave.resolve();
    await flushMicrotasks();
  });

  it("keeps Cosmic when the user picks it while the account document loads", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ backgroundType: BackgroundType.OCEAN })
    );
    const load = deferred<RemoteSettings | null>();
    persister.loadSettings.mockReturnValue(load.promise);

    const service = await loadSettingsService();
    const syncing = service.initializeFirebaseSync();
    await flushMicrotasks();

    // Cosmic is also the default, so only the edit record distinguishes a
    // deliberate choice from "never chosen".
    await service.updateSetting("backgroundType", BackgroundType.COSMIC);

    load.resolve({ backgroundType: BackgroundType.OCEAN });
    await syncing;
    await flushMicrotasks();

    expect(service.currentSettings.backgroundType).toBe(BackgroundType.COSMIC);
  });

  it("still lets the account document outrank an edit made before sign-in", async () => {
    auth.currentUser = null;
    const service = await loadSettingsService();

    // Browser-local settings are shared by every identity on this device.
    await service.updateSetting("hapticFeedback", false);

    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockResolvedValue({ hapticFeedback: true });
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    expect(service.currentSettings.hapticFeedback).toBe(true);
  });

  it("re-pins an edit whose upload failed so a later snapshot cannot revert it", async () => {
    persister.loadSettings.mockResolvedValue({ reducedMotion: false });
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    persister.saveSettings.mockRejectedValueOnce(new Error("offline"));
    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    persister.listener?.({ reducedMotion: false });
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(true);
  });

  it("releases the pin once the queued offline payload reaches the server", async () => {
    persister.loadSettings.mockResolvedValue({ reducedMotion: false });
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    persister.saveSettings.mockRejectedValueOnce(new Error("offline"));
    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Back online: the queued payload replays successfully.
    persister.saveSettings.mockResolvedValue();
    await drainOfflineQueue(service);
    await flushMicrotasks();

    // The server now holds this edit, so another device's later change must
    // not be ignored for the rest of the session.
    persister.listener?.({ reducedMotion: false });
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(false);
  });
});

describe("writes that settle out of order", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockReset();
    persister.loadSettings.mockResolvedValue({
      hapticFeedback: true,
      reducedMotion: false,
    });
    persister.saveSettings.mockReset();
    persister.saveSettings.mockResolvedValue();
    persister.onSettingsChange.mockReset();
    persister.listener = null;
    persister.subscribeCount = 0;
    persister.unsubscribeCount = 0;
    persister.onSettingsChange.mockImplementation(
      (listener: (settings: RemoteSettings) => void) => {
        persister.subscribeCount += 1;
        persister.listener = listener;
        return () => {
          persister.unsubscribeCount += 1;
          persister.listener = null;
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never opens a second write while one is still in flight", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    const firstSave = deferred<void>();
    persister.saveSettings.mockReturnValueOnce(firstSave.promise);

    await service.updateSetting("hapticFeedback", false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Two open writes can settle in either order; the older one failing after
    // the newer succeeded would drop its stale snapshot into the offline queue.
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    firstSave.resolve();
    await flushMicrotasks();

    // The coalesced re-run carries everything, including the edit made while
    // the first write was open.
    expect(persister.saveSettings).toHaveBeenCalledTimes(2);
    expect(persister.saveSettings.mock.calls[1][0]).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
    });
  });

  it("leaves the newest values queued when failing writes settle in reverse order", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    // Hold every write open so the test, not the mock, decides settle order.
    const saves: Array<{
      reject: (reason?: unknown) => void;
      settled: boolean;
    }> = [];
    persister.saveSettings.mockImplementation(() => {
      const pending = deferred<void>();
      saves.push({ reject: pending.reject, settled: false });
      return pending.promise;
    });

    await service.updateSetting("hapticFeedback", false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Fail every open write newest-first, so the OLDEST write's catch runs
    // last and gets the final word on the offline queue.
    for (let round = 0; round < 5; round += 1) {
      const open = saves.filter((save) => !save.settled);
      if (open.length === 0) break;
      for (const save of [...open].reverse()) {
        save.settled = true;
        save.reject(new Error("offline"));
      }
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await flushMicrotasks();
    }

    const queued = JSON.parse(
      localStorage.getItem(`${LEGACY_QUEUE_KEY}:user-b`) ?? "{}"
    );
    // A reconnect replays this payload, so it must not be older than what the
    // user last chose.
    expect(queued.settings).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
    });
  });

  it("does not start a concurrent write for an edit made during an offline replay", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    // Queued after init, so the replay is driven by the reconnect below rather
    // than by init's own drain.
    localStorage.setItem(
      `${LEGACY_QUEUE_KEY}:user-b`,
      JSON.stringify({
        settings: { hapticFeedback: true, reducedMotion: false },
        sequence: 4,
        session: "a-previous-page-load",
        timestamp: Date.now(),
      })
    );

    persister.saveSettings.mockClear();
    const replay = deferred<void>();
    persister.saveSettings.mockReturnValueOnce(replay.promise);

    // Reconnect. Driven directly rather than through an `online` event:
    // every earlier loadSettingsService() instance is still listening on the
    // shared jsdom window and would replay against the same mock.
    const replayDone = drainOfflineQueue(service);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    // The user edits while the replay is still open.
    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // A second write here could settle before the replay, letting the older
    // replayed payload win on the server.
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    replay.resolve();
    await replayDone;
    await flushMicrotasks();

    expect(persister.saveSettings).toHaveBeenCalledTimes(2);
    expect(persister.saveSettings.mock.calls[1][0]).toMatchObject({
      reducedMotion: true,
    });
  });

  it("queues a failed edit whose sequence is lower than a previous page load's", async () => {
    // A queue entry left by an earlier page load, stamped with that session's
    // much higher edit sequence.
    localStorage.setItem(
      `${LEGACY_QUEUE_KEY}:user-b`,
      JSON.stringify({
        settings: { hapticFeedback: true },
        sequence: 5,
        session: "a-previous-page-load",
        timestamp: Date.now(),
      })
    );

    // Still offline, so init's replay fails and leaves that entry in place —
    // which is exactly when its stale sequence gets compared against this
    // session's. This reload's edit counter starts at zero.
    persister.saveSettings.mockRejectedValue(new Error("offline"));

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    const stillQueued = JSON.parse(
      localStorage.getItem(`${LEGACY_QUEUE_KEY}:user-b`) ?? "{}"
    );
    expect(stillQueued.sequence).toBe(5);

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Sequence 1 from this session must not be judged "older" than the 5 a
    // previous session persisted — that would silently drop the edit.
    const queued = JSON.parse(
      localStorage.getItem(`${LEGACY_QUEUE_KEY}:user-b`) ?? "{}"
    );
    expect(queued.settings).toMatchObject({ reducedMotion: true });
  });

  it("refuses to let an older payload replace a newer queued one", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    persister.saveSettings.mockRejectedValue(new Error("offline"));

    await service.updateSetting("hapticFeedback", false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    const queueKey = `${LEGACY_QUEUE_KEY}:user-b`;
    const newest = JSON.parse(localStorage.getItem(queueKey) ?? "{}");
    expect(typeof newest.sequence).toBe("number");

    // Hand the queue a stale entry carrying a lower revision, as an older
    // write settling late would.
    const service2 = service as unknown as {
      queueOfflineChange: (
        settings: RemoteSettings,
        userId: string,
        sequence: number
      ) => void;
    };
    service2.queueOfflineChange(
      { hapticFeedback: true, reducedMotion: false },
      "user-b",
      newest.sequence - 1
    );

    expect(JSON.parse(localStorage.getItem(queueKey) ?? "{}")).toMatchObject({
      settings: { hapticFeedback: false, reducedMotion: true },
    });
  });
});

describe("session lifecycle fencing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockReset();
    persister.loadSettings.mockResolvedValue({ hapticFeedback: true });
    persister.saveSettings.mockReset();
    persister.saveSettings.mockResolvedValue();
    persister.onSettingsChange.mockReset();
    persister.listener = null;
    persister.subscribeCount = 0;
    persister.unsubscribeCount = 0;
    persister.onSettingsChange.mockImplementation(
      (listener: (settings: RemoteSettings) => void) => {
        persister.subscribeCount += 1;
        persister.listener = listener;
        return () => {
          persister.unsubscribeCount += 1;
          persister.listener = null;
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not orphan the live subscription when a torn-down init finishes late", async () => {
    const staleLoad = deferred<RemoteSettings | null>();
    persister.loadSettings.mockReturnValueOnce(staleLoad.promise);

    const service = await loadSettingsService();
    const staleInit = service.initializeFirebaseSync();
    await flushMicrotasks();

    // Sign out and back into the SAME account: the stale continuation's UID
    // check still passes, so only a lifecycle generation can fence it.
    service.cleanup();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    staleLoad.resolve({ hapticFeedback: true });
    await staleInit;
    await flushMicrotasks();

    service.cleanup();
    await flushMicrotasks();

    // Every subscription that was opened must have been closed; an orphaned
    // handle leaks a live Firestore listener for the page's lifetime.
    expect(persister.unsubscribeCount).toBe(persister.subscribeCount);
  });

  it("drops a load that resolves after the same account signed out and back in", async () => {
    const staleLoad = deferred<RemoteSettings | null>();
    persister.loadSettings.mockReturnValueOnce(staleLoad.promise);

    const service = await loadSettingsService();
    const staleInit = service.initializeFirebaseSync();
    await flushMicrotasks();

    service.cleanup();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockResolvedValueOnce({ reducedMotion: true });
    await service.initializeFirebaseSync();
    await flushMicrotasks();
    expect(service.currentSettings.reducedMotion).toBe(true);

    // The stale load carries a DIFFERENT value, and its UID check still
    // passes, so only a generation check can stop it landing on top of the
    // newer document.
    staleLoad.resolve({ reducedMotion: false });
    await staleInit;
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(true);
  });

  it("re-registers the online retry listener after a sign-out and sign-in", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    // Spy only from here, so listeners left behind by other tests' module
    // instances cannot be mistaken for this service re-registering.
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");

    service.cleanup();
    await flushMicrotasks();
    expect(
      removeListener.mock.calls.filter(([type]) => type === "online")
    ).toHaveLength(1);

    await service.initializeFirebaseSync();
    await flushMicrotasks();

    // Without this the singleton loses offline retry for the page's lifetime
    // the first time anyone signs out.
    expect(
      addListener.mock.calls.filter(([type]) => type === "online")
    ).toHaveLength(1);

    addListener.mockRestore();
    removeListener.mockRestore();
  });
});
