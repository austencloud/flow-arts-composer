import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Settings → Display's pictograph "Reset to defaults" leans on this method. The
// silent failure would be a reset that redraws but never reaches storage, so
// the old switches come back on the next visit.
const updateSetting = vi.fn(async () => {});

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: { settings: { visibility: {} }, updateSetting },
}));

async function loadManager() {
  vi.resetModules();
  const mod = await import("../visibility-state.svelte");
  const vm = new mod.VisibilityStateManager();
  await vm.ensureSettingsLoaded();
  return { vm, DEFAULTS: mod.DEFAULT_VISIBILITY_SETTINGS };
}

describe("VisibilityStateManager.resetToDefaults", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateSetting.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns every switch to its default, notifies once and persists once", async () => {
    const { vm, DEFAULTS } = await loadManager();
    vm.setGridVisibility(false);
    vm.setHandPointVisibility("none");
    vm.setGlyphVisibility("tkaGlyph", false);
    vm.setGlyphVisibility("propTndGlyph", true);
    vm.setGlyphVisibility("reversalIndicators", false);
    vm.setStepNumbersVisibility(false);
    await vi.runAllTimersAsync();
    updateSetting.mockClear();

    const observer = vi.fn();
    vm.registerObserver(observer, ["all"]);
    vm.resetToDefaults();

    expect(vm.getState()).toEqual(DEFAULTS);
    expect(observer).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    expect(updateSetting).toHaveBeenCalledTimes(1);
    expect(updateSetting).toHaveBeenCalledWith("visibility", { ...DEFAULTS });
  });

  it("keeps the defaults literal unshared, so later toggles never mutate it", async () => {
    const { vm, DEFAULTS } = await loadManager();
    vm.resetToDefaults();
    vm.setGridVisibility(false);
    expect(DEFAULTS.showGrid).toBe(true);
  });
});
