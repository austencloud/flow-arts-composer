/**
 * Settings changes made before the settings service starts.
 *
 * Public pages (the Guide, the Shape Engine) don't start the settings service
 * when they load, but their prop pickers still change saved settings. Such a
 * change has to start the service and reach it, in the order it was made.
 * When it was dropped instead, the colours silently stayed put and nothing
 * was saved, and no app route could show it, because app routes start the
 * service at load.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIRST = { left: "#ed1c24", right: "#3575e2" };
const SECOND = { left: "#22c55e", right: "#a855f7" };
const START_TIMEOUT = { timeout: 20_000 };

async function loadSettingsModules() {
  const services =
    await import("$lib/shared/application/state/services.svelte");
  const appState =
    await import("$lib/shared/application/state/app-state.svelte");
  return { services, appState };
}

describe("settings changes made before the settings service starts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts the service and keeps the change", async () => {
    const { services, appState } = await loadSettingsModules();
    expect(services.areServicesInitialized()).toBe(false);

    appState.updateSetting("primaryPropColors", FIRST);

    await vi.waitFor(
      () => expect(services.areServicesInitialized()).toBe(true),
      START_TIMEOUT
    );
    expect(appState.getSettings().primaryPropColors).toEqual(FIRST);
  }, 30_000);

  it("lands changes made while it starts in the order they were made", async () => {
    const { services, appState } = await loadSettingsModules();

    void appState.updateSettings({ primaryPropColors: FIRST });
    appState.updateSetting("primaryPropColors", SECOND);

    await vi.waitFor(
      () => expect(services.areServicesInitialized()).toBe(true),
      START_TIMEOUT
    );
    expect(appState.getSettings().primaryPropColors).toEqual(SECOND);
  }, 30_000);

  it("applies a change at once when the service is already running", async () => {
    // App routes read settings right after writing them, in the same step.
    const { services, appState } = await loadSettingsModules();
    await services.initializeAppServices();

    appState.updateSetting("primaryPropColors", SECOND);

    expect(appState.getSettings().primaryPropColors).toEqual(SECOND);
  }, 30_000);
});
