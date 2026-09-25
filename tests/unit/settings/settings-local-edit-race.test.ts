import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

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

/** A stored queue entry: one change per setting, tagged with its edit. */
function queueEntry(
  changes: RemoteSettings,
  session: string,
  sequence: number
): string {
  return JSON.stringify({
    version: 2,
    changes: Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [
        key,
        { value, session, sequence },
      ])
    ),
  });
}

/** The values a reconnect would replay from the queue under `key`. */
function queuedValues(key: string): RemoteSettings | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  const { changes } = JSON.parse(stored) as {
    changes: Record<string, { value: unknown }>;
  };
  return Object.fromEntries(
    Object.entries(changes).map(([setting, change]) => [setting, change.value])
  );
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

  it("applies another device's change that arrives while an edit waits to upload", async () => {
    persister.loadSettings.mockResolvedValue({
      hapticFeedback: true,
      reducedMotion: false,
    });
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    await service.updateSetting("hapticFeedback", false);

    // Another device's change lands inside the upload debounce. Dropping it
    // left this tab holding the old value, ready to upload it again.
    persister.listener?.({ hapticFeedback: true, reducedMotion: true });
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(true);
    expect(service.currentSettings.hapticFeedback).toBe(false);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenLastCalledWith({
      hapticFeedback: false,
    });
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

    // The coalesced re-run carries the edit made while the first write was
    // open, and nothing the first write already confirmed.
    expect(persister.saveSettings).toHaveBeenCalledTimes(2);
    expect(persister.saveSettings.mock.calls[1][0]).toEqual({
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

    // A reconnect replays this queue, so it must not hold anything older than
    // what the user last chose.
    expect(queuedValues(`${LEGACY_QUEUE_KEY}:user-b`)).toMatchObject({
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
      queueEntry(
        { hapticFeedback: true, reducedMotion: false },
        "a-previous-page-load",
        4
      )
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

  it("keeps a newer failed payload when an older replay's success settles after it", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    const queueKey = `${LEGACY_QUEUE_KEY}:user-b`;
    localStorage.setItem(
      queueKey,
      queueEntry(
        { hapticFeedback: true, reducedMotion: false },
        "a-previous-page-load",
        7
      )
    );

    persister.saveSettings.mockClear();
    const oldReplay = deferred<void>();
    persister.saveSettings
      .mockReturnValueOnce(oldReplay.promise)
      .mockRejectedValueOnce(new Error("offline"));

    const draining = drainOfflineQueue(service);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    // The user edits mid-replay; the write coalesces behind the open replay.
    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    // The old replay succeeds. Releasing its slot immediately starts the
    // coalesced newer save, which fails fast and queues the newer payload —
    // all before the replay's own continuation resumes.
    oldReplay.resolve();
    await draining;
    await flushMicrotasks();

    expect(persister.saveSettings).toHaveBeenCalledTimes(2);

    // That continuation must not clear a queue entry it never replayed, nor
    // release pins belonging to the newer edit. Losing this drops the user's
    // choice from the server, the queue, and the pin set at once.
    expect(queuedValues(queueKey)).toMatchObject({ reducedMotion: true });
    expect(service.currentSettings.reducedMotion).toBe(true);
  });

  it("leaves a queue entry that was replaced while the replay was open", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    const queueKey = `${LEGACY_QUEUE_KEY}:user-b`;
    localStorage.setItem(
      queueKey,
      queueEntry({ reducedMotion: false }, "a-previous-page-load", 7)
    );

    persister.saveSettings.mockClear();
    const oldReplay = deferred<void>();
    persister.saveSettings.mockReturnValueOnce(oldReplay.promise);

    const draining = drainOfflineQueue(service);
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);

    // Another tab writes a newer payload to the shared key while this replay
    // is open. Ordering alone cannot prevent this — only entry identity can.
    localStorage.setItem(
      queueKey,
      queueEntry({ reducedMotion: true }, "another-tab", 2)
    );

    oldReplay.resolve();
    await draining;
    await flushMicrotasks();

    expect(queuedValues(queueKey)).toMatchObject({ reducedMotion: true });
  });

  it("queues a failed edit whose sequence is lower than a previous page load's", async () => {
    // A queue entry left by an earlier page load for the same setting, stamped
    // with that session's much higher edit sequence.
    localStorage.setItem(
      `${LEGACY_QUEUE_KEY}:user-b`,
      queueEntry({ reducedMotion: false }, "a-previous-page-load", 5)
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
    expect(stillQueued.changes.reducedMotion.sequence).toBe(5);

    await service.updateSetting("reducedMotion", true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Sequence 1 from this session must not be judged "older" than the 5 a
    // previous session persisted — that would silently drop the edit.
    expect(queuedValues(`${LEGACY_QUEUE_KEY}:user-b`)).toMatchObject({
      reducedMotion: true,
    });
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
    const newestSequence = newest.changes?.reducedMotion?.sequence;
    expect(typeof newestSequence).toBe("number");

    // Hand the queue stale edits carrying a lower revision, as an older write
    // settling late would.
    const service2 = service as unknown as {
      queueFailedEdits: (
        userId: string,
        edits: RemoteSettings,
        sequence: number
      ) => void;
    };
    service2.queueFailedEdits(
      "user-b",
      { hapticFeedback: true, reducedMotion: false },
      newestSequence - 1
    );

    expect(queuedValues(queueKey)).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
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

describe("prop choices follow the account", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockReset();
    persister.loadSettings.mockResolvedValue({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      propType: PropType.STAFF,
      catDogMode: false,
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

  it("restores the account's props at sign-in", async () => {
    persister.loadSettings.mockResolvedValue({
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
      propType: PropType.FAN,
      catDogMode: true,
    });

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    expect(service.currentSettings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
  });

  it("switches props when another tab changes them", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    persister.listener?.({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
    });
    await flushMicrotasks();

    expect(service.currentSettings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    });
    // A reload starts from this browser copy, so it must not keep the old prop.
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
    ).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    });
  });

  it("keeps the newest Shift+P prop when its upload fails and an older copy arrives", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    persister.saveSettings
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    await service.updateSettings({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // Two more presses while the first write is still open.
    await service.updateSettings({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
    });
    await service.updateSettings({
      leftPropType: PropType.BIGSTAFF,
      rightPropType: PropType.BIGSTAFF,
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    firstSave.resolve();
    await flushMicrotasks();
    expect(persister.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leftPropType: PropType.BIGSTAFF,
        rightPropType: PropType.BIGSTAFF,
      })
    );

    // The last press fails to upload, so the account still holds the first
    // press when the next snapshot arrives.
    secondSave.reject(new Error("offline"));
    await flushMicrotasks();

    persister.listener?.({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
      hapticFeedback: false,
    });
    await flushMicrotasks();

    // The snapshot landed, but the unconfirmed prop outranks it.
    expect(service.currentSettings.hapticFeedback).toBe(false);
    expect(service.currentSettings).toMatchObject({
      leftPropType: PropType.BIGSTAFF,
      rightPropType: PropType.BIGSTAFF,
    });
  });

  it("keeps a one-hand pick whole while the account document loads", async () => {
    const load = deferred<RemoteSettings | null>();
    persister.loadSettings.mockReturnValue(load.promise);

    const service = await loadSettingsService();
    const syncing = service.initializeFirebaseSync();
    await flushMicrotasks();

    // A left-hand pick: the right hand stays a staff and cat dog turns on.
    await service.updateSettings({ leftPropType: PropType.FAN });

    load.resolve({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
      catDogMode: false,
    });
    await syncing;
    await flushMicrotasks();

    // The account's right hand must not be spliced onto the local left.
    expect(service.currentSettings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
  });

  it("uploads a prop picked before the account sync started", async () => {
    const service = await loadSettingsService();

    // Signed in, but the sync has not started, so nothing can be written yet.
    await service.updateSettings({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persister.saveSettings).not.toHaveBeenCalled();

    await service.initializeFirebaseSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    expect(service.currentSettings.leftPropType).toBe(PropType.FAN);
    expect(persister.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        leftPropType: PropType.FAN,
        rightPropType: PropType.FAN,
      })
    );

    // With the pick on the server, other tabs' changes land here again.
    persister.listener?.({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
      catDogMode: false,
    });
    await flushMicrotasks();
    expect(service.currentSettings.leftPropType).toBe(PropType.CLUB);
  });

  it("uploads the whole prop pair, and only the pair, when one hand changes", async () => {
    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await flushMicrotasks();

    await service.updateSetting("rightPropType", PropType.FAN);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    // The left hand was not edited, but the pair is one choice: another tab
    // must never receive this right hand spliced onto its own left.
    expect(persister.saveSettings).toHaveBeenCalledTimes(1);
    expect(persister.saveSettings.mock.calls[0][0]).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      propType: PropType.STAFF,
      catDogMode: true,
    });
  });

  it("keeps this device's props off the account when the account read fails", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
        propType: PropType.CLUB,
        catDogMode: false,
      })
    );
    persister.loadSettings.mockRejectedValue(new Error("client is offline"));

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();

    expect(persister.saveSettings).not.toHaveBeenCalled();

    // The account's copy still lands once the connection is back.
    persister.listener?.({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
    });
    await flushMicrotasks();
    expect(service.currentSettings.leftPropType).toBe(PropType.FAN);
  });
});

describe("one account document shared by several tabs", () => {
  // Stands in for the Firestore document. A write merges into it and every
  // open listener sees the result at once, the way latency compensation shows
  // each tab a write before the server acknowledges it.
  let server: RemoteSettings = {};
  const listeners = new Set<(settings: RemoteSettings) => void>();
  const queueKey = `${LEGACY_QUEUE_KEY}:user-b`;

  function commit(payload: RemoteSettings): void {
    Object.assign(server, structuredClone(payload));
    for (const listener of [...listeners]) listener({ ...server });
  }

  function failNextWrite(): void {
    persister.saveSettings.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
  }

  async function openTab() {
    const tab = await loadSettingsService();
    await tab.initializeFirebaseSync();
    await flushMicrotasks();
    return tab;
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushMicrotasks();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    server = { hapticFeedback: true, reducedMotion: false };
    listeners.clear();
    persister.loadSettings.mockReset();
    persister.loadSettings.mockImplementation(async () => ({ ...server }));
    persister.saveSettings.mockReset();
    persister.saveSettings.mockImplementation(async (payload) =>
      commit(payload)
    );
    persister.onSettingsChange.mockReset();
    persister.onSettingsChange.mockImplementation(
      (listener: (settings: RemoteSettings) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not send back another tab's change that landed while this tab was saving", async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    // Tab A's write reaches the document but is slow to be acknowledged, as
    // it is through a flaky connection.
    const ack = deferred<void>();
    persister.saveSettings.mockImplementationOnce(async (payload) => {
      commit(payload);
      await ack.promise;
    });
    await tabA.updateSetting("hapticFeedback", false);
    await settle();

    // Tab B changes a different setting while A's write is still open.
    await tabB.updateSetting("reducedMotion", true);
    await settle();
    expect(server.reducedMotion).toBe(true);

    ack.resolve();
    await flushMicrotasks();

    // A's next write, for an unrelated setting, must not carry A's old copy of
    // B's setting back to the account and on to every other device.
    await tabA.updateSetting("musicianMode", true);
    await settle();

    expect(server).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
      musicianMode: true,
    });
    expect(tabA.currentSettings.reducedMotion).toBe(true);
    expect(tabB.currentSettings.reducedMotion).toBe(true);
  });

  it("replays only the edits an earlier page load could not upload", async () => {
    const earlier = await openTab();
    failNextWrite();
    await earlier.updateSetting("reducedMotion", true);
    await settle();
    // That page goes away with its edit still queued.
    earlier.cleanup();

    // Meanwhile another device turns haptics off.
    commit({ hapticFeedback: false });

    const later = await openTab();
    await settle();

    // The queued edit lands. Nothing else the earlier page held comes back.
    expect(server).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
    });
    expect(later.currentSettings.hapticFeedback).toBe(false);
    expect(localStorage.getItem(queueKey)).toBeNull();
  });

  it("keeps a tab's failed edit when another tab's failure shares the queue", async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    // Both tabs lose an upload, one after the other, into the same queue.
    failNextWrite();
    await tabA.updateSetting("hapticFeedback", false);
    await settle();
    failNextWrite();
    await tabB.updateSetting("reducedMotion", true);
    await settle();

    // Tab A reconnects first and replays the shared queue.
    await drainOfflineQueue(tabA);
    await flushMicrotasks();

    expect(server).toMatchObject({
      hapticFeedback: false,
      reducedMotion: true,
    });
    expect(localStorage.getItem(queueKey)).toBeNull();

    // A later change from another device must not knock A's edit back out.
    commit({ musicianMode: true });
    expect(tabA.currentSettings.hapticFeedback).toBe(false);
  });

  it("retires a whole-settings queue entry written before per-key queueing", async () => {
    server.hapticFeedback = false;
    localStorage.setItem(
      queueKey,
      JSON.stringify({
        settings: { hapticFeedback: true, reducedMotion: false },
        sequence: 3,
        session: "a-page-load-before-the-upgrade",
        timestamp: Date.now(),
      })
    );

    const tab = await openTab();
    await settle();

    // Nothing in a whole-settings copy says which values were edits, so
    // replaying it would put back every value it held.
    expect(server.hapticFeedback).toBe(false);
    expect(tab.currentSettings.hapticFeedback).toBe(false);
    expect(localStorage.getItem(queueKey)).toBeNull();
  });

  it("uploads the values a reset to defaults restores", async () => {
    server.hapticFeedback = false;
    const tab = await openTab();
    expect(tab.currentSettings.hapticFeedback).toBe(false);

    await tab.resetToDefaults();
    await settle();

    expect(server.hapticFeedback).toBe(true);
    expect(tab.currentSettings.hapticFeedback).toBe(true);
  });
});
