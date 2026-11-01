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

describe("VisibilityStateManager.resetKeysToDefaults", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateSetting.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Settings → Display resets the pictograph and the card separately. The
  // silent failure is one section's Reset also restoring the other's switches.
  it("restores only the named keys and leaves the rest as the user set them", async () => {
    vi.resetModules();
    const mod = await import("../visibility-state.svelte");
    const vm = new mod.VisibilityStateManager();
    await vm.ensureSettingsLoaded();
    vm.setGridVisibility(false);
    vm.setGlyphVisibility("reversalIndicators", false);
    vm.setGlyphVisibility("handColorKey", false);
    await vi.runAllTimersAsync();
    updateSetting.mockClear();

    const observer = vi.fn();
    vm.registerObserver(observer, ["all"]);
    vm.resetKeysToDefaults(mod.PICTOGRAPH_VISIBILITY_KEYS);

    expect(vm.getGridVisibility()).toBe(true);
    expect(vm.getRawGlyphVisibility("reversalIndicators")).toBe(false);
    expect(vm.getRawGlyphVisibility("handColorKey")).toBe(false);
    expect(observer).toHaveBeenCalledTimes(1);

    vm.resetKeysToDefaults(mod.CARD_VISIBILITY_KEYS);
    expect(vm.getRawGlyphVisibility("reversalIndicators")).toBe(true);
    expect(vm.getRawGlyphVisibility("handColorKey")).toBe(true);

    await vi.runAllTimersAsync();
    expect(updateSetting).toHaveBeenCalledTimes(1);
    expect(mod.PICTOGRAPH_VISIBILITY_KEYS).not.toContain("handColorKey");
    expect(mod.PICTOGRAPH_VISIBILITY_KEYS).toContain("stepNumbers");
  });
});
