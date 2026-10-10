import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

// Landing mode: the app services never start, so getSettings() serves the
// read-once copy of what this browser saved.
vi.mock("#lib/shared/application/state/services.svelte.js", () => ({
  areServicesInitialized: () => false,
  getSettingsServiceSync: () => {
    throw new Error("the settings service does not start in landing mode");
  },
  initializeAppServices: vi.fn(async () => {}),
}));

const SAVED_COLORS = { left: "#88aa00", right: "#00aa88" };

async function loadFreshSettingsModule() {
  vi.resetModules();
  return import("../app-state.svelte");
}

describe("pinLandingSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "tka-modern-web-settings",
      JSON.stringify({ primaryPropColors: SAVED_COLORS, gridMode: GridMode.BOX })
    );
  });

  it("serves the saved prop colors when nothing is pinned", async () => {
    const { getSettings } = await loadFreshSettingsModule();
    expect(getSettings().primaryPropColors).toEqual(SAVED_COLORS);
  });

  it("hides the saved prop colors while pinned and keeps the other saved settings", async () => {
    const { getSettings, pinLandingSettings } = await loadFreshSettingsModule();
    pinLandingSettings({ primaryPropColors: null });
    expect(getSettings().primaryPropColors).toBeNull();
    expect(getSettings().gridMode).toBe(GridMode.BOX);
  });

  it("restores the saved prop colors when the pin is released", async () => {
    const { getSettings, pinLandingSettings } = await loadFreshSettingsModule();
    pinLandingSettings({ primaryPropColors: null });
    expect(getSettings().primaryPropColors).toBeNull();
    pinLandingSettings(null);
    expect(getSettings().primaryPropColors).toEqual(SAVED_COLORS);
  });

  it("applies a pin set before the first read", async () => {
    const { getSettings, pinLandingSettings } = await loadFreshSettingsModule();
    pinLandingSettings({ primaryPropColors: null });
    expect(getSettings().primaryPropColors).toBeNull();
    expect(getSettings().gridMode).toBe(GridMode.BOX);
  });
});
