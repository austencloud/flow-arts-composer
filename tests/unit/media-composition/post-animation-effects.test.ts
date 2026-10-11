import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  copyPostAnimationEffects,
  postAnimationEffectsConfig,
  postAnimationTrailSettings,
} from "#lib/shared/media-composition/domain/post-animation-effects.svelte.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

describe("post animation effects", () => {
  it("copies restored reactive effects for a scoped preview without a DataCloneError", () => {
    const restored = JSON.parse(JSON.stringify(DEFAULT_EFFECTS_CONFIG));
    const state = createEffectsConfigState(restored, { persist: false });
    state.setActiveEffect("trails");
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

  it("restores every saved trail rendering setting without borrowing viewer values", () => {
    const viewer = {
      ...DEFAULT_TRAIL_SETTINGS,
      mode: TrailMode.OFF,
      fadeDurationMs: 900,
      hideProps: false,
    };
    const saved = {
      ...DEFAULT_TRAIL_SETTINGS,
      mode: TrailMode.PERSISTENT,
      fadeDurationMs: 6400,
      glowBlur: 7,
      hideProps: true,
      usePathCache: false,
      previewMode: true,
      additionalLayerColors: [{ left: "#112233", right: "#445566" }],
      tailLength: 75,
    };
    const result = postAnimationTrailSettings(viewer, DEFAULT_EFFECTS_CONFIG, {
      enabled: true,
      trackingMode: saved.trackingMode,
      thickness: DEFAULT_EFFECTS_CONFIG.trails.thickness,
      brightness: DEFAULT_EFFECTS_CONFIG.trails.brightness,
      tailLength: saved.tailLength,
      leftColor: DEFAULT_EFFECTS_CONFIG.trails.leftColor,
      rightColor: DEFAULT_EFFECTS_CONFIG.trails.rightColor,
      settings: saved,
    });
    expect(result).toMatchObject({
      mode: TrailMode.PERSISTENT,
      fadeDurationMs: 6400,
      glowBlur: 7,
      hideProps: true,
      usePathCache: false,
      previewMode: true,
      additionalLayerColors: saved.additionalLayerColors,
      tailLength: 75,
    });
    expect(viewer.mode).toBe(TrailMode.OFF);
  });
});

describe("postAnimationEffectsConfig", () => {
  const TRAIL = {
    enabled: true,
    trackingMode: TrackingMode.BOTH_ENDS,
    thickness: 7,
    brightness: 0.5,
    tailLength: 12,
    leftColor: "#111111",
    rightColor: "#222222",
  };

  it("copies the appearance's own effects and leaves the source alone", () => {
    const effects = { ...DEFAULT_EFFECTS_CONFIG, activeEffect: "fire" as const };
    const config = postAnimationEffectsConfig({ effects }, DEFAULT_EFFECTS_CONFIG);
    expect(config).toEqual(effects);
    expect(config).not.toBe(effects);
    expect(config.trails).not.toBe(effects.trails);
  });

  it("folds a trail look over the fallback when the appearance has no effects of its own", () => {
    const config = postAnimationEffectsConfig(
      { trail: TRAIL },
      DEFAULT_EFFECTS_CONFIG
    );
    expect(config.activeEffect).toBe("trails");
    expect(config.tipEffectMap).toEqual({ "*": { effect: "trails" } });
    expect(config.trails).toMatchObject({
      thickness: 7,
      brightness: 0.5,
      leftColor: "#111111",
    });
    const off = postAnimationEffectsConfig(
      { trail: { ...TRAIL, enabled: false } },
      DEFAULT_EFFECTS_CONFIG
    );
    expect(off.activeEffect).toBe("none");
    expect(off.tipEffectMap).toEqual({});
  });

  it("gives back a copy of the fallback for no appearance", () => {
    const config = postAnimationEffectsConfig(null, DEFAULT_EFFECTS_CONFIG);
    expect(config).toEqual(DEFAULT_EFFECTS_CONFIG);
    expect(config).not.toBe(DEFAULT_EFFECTS_CONFIG);
  });
});
