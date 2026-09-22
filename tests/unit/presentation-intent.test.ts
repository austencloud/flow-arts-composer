import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailEffect,
  TrailMode,
  type TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { CreatorIntent } from "$lib/shared/foundation/domain/models/creator-intent";
import {
  capturePresentation,
  neutralPresentation,
  resolvePresentation,
  summarizePresentation,
} from "$lib/shared/foundation/services/presentation-intent";

const CUSTOM_COLORS = { left: "#00ff00", right: "#ff00ff" };

function liveEffects() {
  return {
    ...structuredClone(DEFAULT_EFFECTS_CONFIG),
    tipEffectMap: { "*": { effect: "trails" as const }, "1": { effect: "led" as const } },
    activeEffect: "led" as const,
  };
}

function liveTrail() {
  return {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.PERSISTENT,
    effect: TrailEffect.NONE,
    usePathCache: false,
    previewMode: true,
  };
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

describe("capturePresentation", () => {
  it("drops trail workflow fields and the tunnel layer array", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(captured.trail).not.toHaveProperty("usePathCache");
    expect(captured.trail).not.toHaveProperty("previewMode");
    expect(captured.trail).not.toHaveProperty("additionalLayerColors");
    expect(captured.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(captured.trail.effect).toBe(TrailEffect.NONE);
  });

  it("keeps only the effect intents referenced by the tip map", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(captured.effects.trails).toEqual(DEFAULT_EFFECTS_CONFIG.trails);
    expect(captured.effects.led).toEqual(DEFAULT_EFFECTS_CONFIG.led);
    expect(captured.effects).not.toHaveProperty("fire");
    expect(captured.effects).not.toHaveProperty("sparkles");
    expect(captured.effects.version).toBe(DEFAULT_EFFECTS_CONFIG.version);
    expect(captured.effects.activeEffect).toBe("led");
    expect(captured.effects.activePresets).toEqual(DEFAULT_EFFECTS_CONFIG.activePresets);
    expect(captured.effects.effectLayerOverrides).toEqual(
      DEFAULT_EFFECTS_CONFIG.effectLayerOverrides
    );
  });

  it("keeps no intents when the tip map is empty", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: { ...liveEffects(), tipEffectMap: {} },
    });
    expect(captured.effects).not.toHaveProperty("trails");
    expect(captured.effects).not.toHaveProperty("led");
  });

  it("never emits undefined anywhere in the snapshot", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(hasUndefined(captured)).toBe(false);
  });

  it("lowercases and passes colors through, null stays null", () => {
    expect(
      capturePresentation({
        primaryPropColors: { left: "#AABBCC", right: "#DDEEFF" },
        trail: liveTrail(),
        effects: liveEffects(),
      }).primaryPropColors
    ).toEqual({ left: "#aabbcc", right: "#ddeeff" });
    expect(
      capturePresentation({
        primaryPropColors: null,
        trail: liveTrail(),
        effects: liveEffects(),
      }).primaryPropColors
    ).toBeNull();
  });

  it("drops unknown keys carried by stale persisted trail settings", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: { ...liveTrail(), style: "legacy", glowEnabled: true } as unknown as TrailSettings,
      effects: liveEffects(),
    });
    expect(captured.trail).not.toHaveProperty("style");
    expect(captured.trail).not.toHaveProperty("glowEnabled");
  });
});

describe("resolvePresentation", () => {
  it("is absent for undefined intent, legacy intent, and no presentation key", () => {
    expect(resolvePresentation(undefined, "absent").kind).toBe("absent");
    expect(resolvePresentation(null, "absent").kind).toBe("absent");
    expect(resolvePresentation({ effortTimeline: null }, "absent").kind).toBe("absent");
    expect(
      resolvePresentation(
        {
          propConfig: { leftPropType: "staff", rightPropType: "staff", catDogMode: false },
        } as unknown as CreatorIntent,
        "absent"
      ).kind
    ).toBe("absent");
  });

  it("is neutral for an explicit null", () => {
    expect(resolvePresentation({ presentation: null }, "neutral").kind).toBe("neutral");
  });

  it("is recorded and fully populated for a pruned snapshot", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    const resolved = resolvePresentation({ presentation: captured }, "recorded");
    expect(resolved.kind).toBe("recorded");
    if (resolved.kind !== "recorded") return;
    expect(resolved.value.primaryPropColors).toEqual(CUSTOM_COLORS);
    expect(resolved.value.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(resolved.value.trail.usePathCache).toBe(DEFAULT_TRAIL_SETTINGS.usePathCache);
    expect(resolved.value.trail.additionalLayerColors).toEqual(
      DEFAULT_TRAIL_SETTINGS.additionalLayerColors
    );
    expect(resolved.value.effects.fire).toEqual(DEFAULT_EFFECTS_CONFIG.fire);
    expect(resolved.value.effects.tipEffectMap).toEqual(captured.effects.tipEffectMap);
    expect(resolved.value.effects.activeEffect).toBe("led");
  });

  it("normalizes a legacy blueColor before filling defaults", () => {
    const resolved = resolvePresentation(
      {
        presentation: {
          primaryPropColors: null,
          trail: { blueColor: "#111111" },
          effects: { ...DEFAULT_EFFECTS_CONFIG },
        },
      } as unknown as CreatorIntent,
      "legacy-trail"
    );
    expect(resolved.kind).toBe("recorded");
    if (resolved.kind !== "recorded") return;
    expect(resolved.value.trail.leftColor).toBe("#111111");
    expect(resolved.value.trail).not.toHaveProperty("blueColor");
    expect(resolved.value.trail.rightColor).toBe(DEFAULT_TRAIL_SETTINGS.rightColor);
    expect(Object.values(resolved.value.trail)).not.toContain(undefined);
  });

  it("migrates an older effects version up to current", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    const resolved = resolvePresentation(
      { presentation: { ...captured, effects: { ...captured.effects, version: 30 } } },
      "old-version"
    );
    expect(resolved.kind).toBe("recorded");
    if (resolved.kind !== "recorded") return;
    expect(resolved.value.effects.version).toBe(DEFAULT_EFFECTS_CONFIG.version);
    expect(resolved.value.effects.tipEffectMap).toEqual(captured.effects.tipEffectMap);
  });

  it("treats a malformed color pair as the theme default", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    const resolved = resolvePresentation(
      {
        presentation: { ...captured, primaryPropColors: { left: 1, right: 2 } },
      } as unknown as CreatorIntent,
      "bad-colors"
    );
    expect(resolved.kind).toBe("recorded");
    if (resolved.kind !== "recorded") return;
    expect(resolved.value.primaryPropColors).toBeNull();

    const resolvedNonHex = resolvePresentation(
      {
        presentation: {
          ...captured,
          primaryPropColors: { left: "nope", right: "also nope" },
        },
      } as unknown as CreatorIntent,
      "bad-colors-hex"
    );
    expect(resolvedNonHex.kind).toBe("recorded");
    if (resolvedNonHex.kind !== "recorded") return;
    expect(resolvedNonHex.value.primaryPropColors).toBeNull();
  });

  it("falls back to neutral with one warning for garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolvePresentation(
      {
        presentation: { trail: 42, effects: "nope", primaryPropColors: [] },
      } as unknown as CreatorIntent,
      "garbage"
    );
    expect(resolved.kind).toBe("neutral");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("neutralPresentation", () => {
  it("is default trail, default effects, and theme-default colors", () => {
    const neutral = neutralPresentation();
    expect(neutral.primaryPropColors).toBeNull();
    expect(neutral.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
    expect(neutral.effects).toEqual(DEFAULT_EFFECTS_CONFIG);
  });

  it("returns a fresh object each call", () => {
    const a = neutralPresentation();
    const b = neutralPresentation();
    expect(a).not.toBe(b);
    expect(a.effects).not.toBe(b.effects);
  });
});

describe("summarizePresentation", () => {
  it("labels theme-default colors, the trail mode, and distinct tip effects", () => {
    expect(DEFAULT_TRAIL_SETTINGS.mode).toBe(TrailMode.FADE);
    const summary = summarizePresentation(neutralPresentation());
    expect(summary.colors).toBeNull();
    expect(summary.trailLabel).toBe("Fade trail");
    expect(summary.effectLabels).toEqual(["Trails"]);
  });

  it("lists each distinct effect once and reports none for an empty map", () => {
    const value = {
      ...neutralPresentation(),
      primaryPropColors: CUSTOM_COLORS,
      trail: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.OFF },
      effects: {
        ...DEFAULT_EFFECTS_CONFIG,
        tipEffectMap: {
          "*": { effect: "fire" as const },
          "0": { effect: "led" as const },
          "1": { effect: "fire" as const },
        },
      },
    };
    const summary = summarizePresentation(value);
    expect(summary.colors).toEqual(CUSTOM_COLORS);
    expect(summary.trailLabel).toBe("No trail");
    expect(summary.effectLabels).toEqual(["Fire", "LED"]);

    expect(
      summarizePresentation({
        ...value,
        effects: { ...value.effects, tipEffectMap: {} },
      }).effectLabels
    ).toEqual([]);
  });

  it("orders the wildcard first, then tip indices numerically", () => {
    const summary = summarizePresentation({
      ...neutralPresentation(),
      effects: {
        ...DEFAULT_EFFECTS_CONFIG,
        tipEffectMap: {
          "10": { effect: "fire" as const },
          "2": { effect: "trails" as const },
          "*": { effect: "led" as const },
        },
      },
    });
    expect(summary.effectLabels).toEqual(["LED", "Trails", "Fire"]);
  });
});
