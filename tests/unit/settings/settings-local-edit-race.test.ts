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
    persister.onSettingsChange.mockImplementation(
      (listener: (settings: RemoteSettings) => void) => {
        persister.listener = listener;
        return () => {
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
    window.dispatchEvent(new Event("online"));
    await flushMicrotasks();

    // The server now holds this edit, so another device's later change must
    // not be ignored for the rest of the session.
    persister.listener?.({ reducedMotion: false });
    await flushMicrotasks();

    expect(service.currentSettings.reducedMotion).toBe(false);
  });
});
