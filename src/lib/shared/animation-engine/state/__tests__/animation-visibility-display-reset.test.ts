// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANIMATION_DISPLAY_KEYS,
  AnimationVisibilityStateManager,
} from "../animation-visibility-state.svelte";

// Settings → Display's animation "Reset to defaults". The silent failure is a
// display reset that also wipes the user's tempo, effort or dark mode, which
// the broader resetToDefaults() does.
const STORAGE_KEY = "animation-visibility-settings";

describe("AnimationVisibilityStateManager.resetDisplayDefaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores what the canvas shows and leaves behaviour and theme alone", () => {
    const vm = new AnimationVisibilityStateManager();
    const defaults = new AnimationVisibilityStateManager({
      ephemeral: true,
    }).getSettings();

    vm.updateSettings({
      gridMode: "none",
      props: false,
      wordHeader: false,
      mandala: false,
      tkaGlyph: false,
      elementalGlyph: true,
      leftPathLines: true,
      rightPathLines: true,
      speed: 1.5,
      playbackMode: "step",
      effortPreset: "glide",
      pathShape: "concave",
      motionAwarePaths: true,
    });
    vm.setDarkMode(false);

    const observer = vi.fn();
    vm.registerObserver(observer);
    vm.resetDisplayDefaults();

    const after = vm.getSettings();
    for (const key of ANIMATION_DISPLAY_KEYS) {
      expect(after[key], key).toEqual(defaults[key]);
    }
    expect(after.speed).toBe(1.5);
    expect(after.playbackMode).toBe("step");
    expect(after.effortPreset).toBe("glide");
    expect(after.pathShape).toBe("concave");
    expect(after.motionAwarePaths).toBe(true);
    expect(after.darkMode).toBe(false);
    expect(observer).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.gridMode).toBe("8point");
    expect(stored.props).toBe(true);
    expect(stored.speed).toBe(1.5);
  });
});
