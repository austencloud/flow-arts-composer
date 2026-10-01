import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import {
  copyPostAnimationEffects,
  postAnimationTrailSettings,
} from "$lib/shared/share/components/post-studio/post-animation-effects.svelte";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
  TrailMode,
} from "$lib/shared/animation-engine/domain/types/trail-types";

describe("post animation effects", () => {
  it("copies restored reactive effects for a scoped preview without a DataCloneError", () => {
    const restored = JSON.parse(JSON.stringify(DEFAULT_EFFECTS_CONFIG));
    const state = createEffectsConfigState(restored, { persist: false });
    state.setActiveEffect("trails");
    expect(() => structuredClone(state.config)).toThrow();

    const copy = copyPostAnimationEffects(state.config);
    expect(copy.activeEffect).toBe("trails");
    expect(() => structuredClone(copy)).not.toThrow();
    copy.activeEffect = "none";
    expect(state.activeEffect).toBe("trails");
  });

  it("renders a post trail look and motion settings even when viewer trails are off", () => {
    const base = { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.OFF };
    const effects = {
      ...DEFAULT_EFFECTS_CONFIG,
      trails: {
        ...DEFAULT_EFFECTS_CONFIG.trails,
        thickness: 8,
        brightness: 0.55,
        leftColor: "#ff4d1c",
        rightColor: "#ffc046",
      },
    };
    const result = postAnimationTrailSettings(base, effects, {
      enabled: true,
      trackingMode: TrackingMode.LEFT_END,
      thickness: 8,
      brightness: 0.55,
      tailLength: 80,
      leftColor: "#ff4d1c",
      rightColor: "#ffc046",
    });

    expect(result).toMatchObject({
      mode: TrailMode.FADE,
      trackingMode: TrackingMode.LEFT_END,
      tailLength: 80,
      lineWidth: 8,
      maxOpacity: 0.55,
      minOpacity: 0.165,
      leftColor: "#ff4d1c",
      rightColor: "#ffc046",
    });
    expect(base.mode).toBe(TrailMode.OFF);
  });
});
