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

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/shared/auth/loaded-auth.js", () => ({ loadedAuth: auth }));
vi.mock("#lib/shared/settings/get-settings-persister.js", () => ({
  getSettingsPersister: () => persister,
}));
vi.mock("#lib/shared/3d/undo/get-scene-undo-manager.js", () => ({
  getSceneUndoManager: () => ({
    registerDomain: () => {},
    captureState: () => {},
    commitState: () => {},
  }),
}));
vi.mock("#lib/shared/settings/utils/background-preloader.js", () => ({
  updateBodyBackground: () => {},
}));
vi.mock("#lib/shared/theme/services/theme-service.js", () => ({
  updateTheme: () => {},
}));
vi.mock("#lib/shared/settings/utils/background-theme-calculator.js", () => ({
  applyThemeForBackground: () => {},
}));
vi.mock(
  "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js",
  () => ({
    getAnimationVisibilityManager: () => ({
      isDarkMode: () => false,
      setDarkMode: () => {},
    }),
  })
);
// Setting changes import the analytics logger without awaiting it; left real,
// posthog-js can still be loading when the worker closes ("Closing rpc while
// fetch was pending" failed CI on 2026-10-08 with every test green).
vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logSettingChange: vi.fn(async () => {}),
}));
// A bare package name resolves the same on every machine, so even a real
// logger never pulls the full posthog-js bundle into this file. Any property
// path is a callable no-op (never a thenable), so a real logger cannot throw.
vi.mock("posthog-js", () => {
  const noop: unknown = new Proxy(() => undefined, {
    get: (_target, key) => (key === "then" ? undefined : noop),
    apply: () => undefined,
  });
  return { default: noop };
});
vi.mock("#lib/shared/utils/debug-logger.js", () => ({
  createComponentLogger: () => ({
    info: () => {},
    success: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

const SETTINGS_KEY = "tka-modern-web-settings";
const LEGACY_QUEUE_KEY = "tka-settings-offline-queue";

async function loadSettingsService() {
  vi.resetModules();
  const module =
    await import("#lib/shared/settings/state/settings-state.svelte.js");
  return module.settingsService;
}

describe("account settings synchronization", () => {
  // The logger stub above did not take on CI on 2026-10-10: the real logger
  // and posthog-js were still loading at teardown, and Vitest failed the run
  // with every test green. Each test resets modules and fires its own import,
  // so wait for it before the next reset; that settles it either way.
  afterEach(async () => {
    await import("#lib/shared/analytics/services/posthog-activity-logger.js");
  });

  beforeEach(() => {
    localStorage.clear();
    auth.currentUser = { uid: "user-b" };
    persister.loadSettings.mockReset();
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

  it("carries guest confirmation choices into a newly created account", async () => {
    auth.currentUser = null;
    const service = await loadSettingsService();
    await service.updateSetting("skipClearConfirmation", true);
    await service.updateSetting("skipLoopConfirmation", true);
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
    ).toMatchObject({
      skipClearConfirmation: true,
      skipLoopConfirmation: true,
    });

    auth.currentUser = { uid: "new-account" };
    persister.loadSettings.mockResolvedValue(null);
    await service.initializeFirebaseSync();

    expect(persister.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        skipClearConfirmation: true,
        skipLoopConfirmation: true,
      })
    );
  });

  it("keeps an existing account's confirmation choices on login", async () => {
    auth.currentUser = null;
    const service = await loadSettingsService();
    await service.updateSetting("skipClearConfirmation", true);
    await service.updateSetting("skipLoopConfirmation", true);

    auth.currentUser = { uid: "existing-account" };
    persister.loadSettings.mockResolvedValue({
      skipClearConfirmation: false,
      skipLoopConfirmation: false,
    });
    await service.initializeFirebaseSync();

    expect(service.currentSettings.skipClearConfirmation).toBe(false);
    expect(service.currentSettings.skipLoopConfirmation).toBe(false);
    expect(persister.saveSettings).not.toHaveBeenCalled();
  });

  it("publishes a missing account document and seeds it with Auto, not a stale local 8", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-a",
        },
      })
    );
    persister.loadSettings.mockResolvedValue(null);
    const service = await loadSettingsService();
    const listener = vi.fn();
    service.onRemoteSettingsApplied(listener);

    await service.initializeFirebaseSync();

    expect(listener).toHaveBeenCalledWith(null, "user-b");
    expect(persister.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        imageExport: expect.objectContaining({
          columnCountOverrides: { "8": null },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-b",
        }),
      })
    );
  });

  it("replays a remote result to managers that subscribe after initial sync", async () => {
    const remote = {
      imageExport: {
        columnCountOverrides: { "16": 8 },
        columnCountPreferenceVersion: 1,
        columnCountPreferenceOwner: "user:user-b",
      },
    };
    persister.loadSettings.mockResolvedValue(remote);
    const service = await loadSettingsService();

    await service.initializeFirebaseSync();
    const listener = vi.fn();
    service.onRemoteSettingsApplied(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(remote, "user-b");
  });

  it("clears a stale local imageExport slice when the account document omits it", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        imageExport: {
          columnCountOverrides: { "8": 8 },
          columnCountPreferenceVersion: 1,
          columnCountPreferenceOwner: "user:user-b",
        },
      })
    );
    persister.loadSettings.mockResolvedValue({ reducedMotion: true });
    const service = await loadSettingsService();

    await service.initializeFirebaseSync();

    expect(service.currentSettings.imageExport).toBeUndefined();
  });

  it("retires the unowned offline queue instead of replaying it into the current account", async () => {
    localStorage.setItem(
      LEGACY_QUEUE_KEY,
      JSON.stringify({
        settings: {
          imageExport: { columnCountOverrides: { "8": 8 } },
        },
      })
    );
    persister.loadSettings.mockResolvedValue(null);

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();

    expect(localStorage.getItem(LEGACY_QUEUE_KEY)).toBeNull();
    expect(persister.saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        imageExport: expect.objectContaining({
          columnCountOverrides: { "8": 8 },
        }),
      })
    );
  });

  it("does not replay another account's scoped queue", async () => {
    const userAQueueKey = `${LEGACY_QUEUE_KEY}:${encodeURIComponent("user-a")}`;
    localStorage.setItem(
      userAQueueKey,
      JSON.stringify({
        settings: {
          imageExport: {
            columnCountOverrides: { "8": 8 },
            columnCountPreferenceVersion: 1,
            columnCountPreferenceOwner: "user:user-a",
          },
        },
      })
    );
    persister.loadSettings.mockResolvedValue(null);

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();

    expect(localStorage.getItem(userAQueueKey)).not.toBeNull();
    expect(persister.saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        imageExport: expect.objectContaining({
          columnCountOverrides: { "8": 8 },
        }),
      })
    );
  });

  it("sanitizes a current-account queue before uploading it", async () => {
    const userBQueueKey = `${LEGACY_QUEUE_KEY}:${encodeURIComponent("user-b")}`;
    localStorage.setItem(
      userBQueueKey,
      JSON.stringify({
        version: 2,
        changes: {
          imageExport: {
            value: { columnCountOverrides: { "8": 8 } },
            session: "a-previous-page-load",
            sequence: 1,
          },
        },
      })
    );
    persister.loadSettings.mockResolvedValue(null);

    const service = await loadSettingsService();
    await service.initializeFirebaseSync();

    expect(persister.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        imageExport: expect.objectContaining({
          columnCountOverrides: { "8": null },
          columnCountPreferenceOwner: "user:user-b",
        }),
      })
    );
    expect(localStorage.getItem(userBQueueKey)).toBeNull();
  });

  it("migrates a legacy background name without rewriting the rest of the account", async () => {
    persister.loadSettings.mockResolvedValue({
      backgroundType: "deepOcean",
      hapticFeedback: false,
    });
    const service = await loadSettingsService();

    await service.initializeFirebaseSync();

    expect(service.currentSettings.backgroundType).toBe(BackgroundType.OCEAN);
    expect(persister.saveSettings).toHaveBeenCalledWith({
      backgroundType: BackgroundType.OCEAN,
    });
  });

  it("persists the selected Celestial environment in the local settings owner", async () => {
    const service = await loadSettingsService();

    await service.updateSetting("backgroundType", BackgroundType.CELESTIAL);

    expect(service.currentSettings.backgroundType).toBe(
      BackgroundType.CELESTIAL
    );
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")).toEqual(
      expect.objectContaining({ backgroundType: BackgroundType.CELESTIAL })
    );
  });
});
