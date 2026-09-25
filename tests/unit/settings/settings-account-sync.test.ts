import { beforeEach, describe, expect, it, vi } from "vitest";
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

async function loadSettingsService() {
  vi.resetModules();
  const module =
    await import("$lib/shared/settings/state/settings-state.svelte");
  return module.settingsService;
}

describe("account settings synchronization", () => {
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
