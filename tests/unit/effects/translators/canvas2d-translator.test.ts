import { describe, it, expect } from "vitest";
import {
  resolveTrails2D,
  resolveFire2D,
  resolveLed2D,
  resolveCharcoal2D,
  foldTrailIntentIntoSettings,
} from "#lib/shared/effects/translators/canvas2d-translator.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";

describe("resolveTrails2D", () => {
  const intent = DEFAULT_EFFECTS_CONFIG.trails;

  it("maps thickness directly to lineWidth", () => {
    expect(resolveTrails2D({ ...intent, thickness: 6 }).lineWidth).toBe(6);
  });

  it("maps brightness to maxOpacity 1:1", () => {
    expect(resolveTrails2D({ ...intent, brightness: 0.8 }).maxOpacity).toBe(
      0.8
    );
  });

  it("derives minOpacity as brightness * 0.3", () => {
    const out = resolveTrails2D({ ...intent, brightness: 1.0 });
    expect(out.minOpacity).toBeCloseTo(0.3, 5);
  });

  it("uses the restrained factory glow when no override is supplied", () => {
    expect(resolveTrails2D(intent).glowBlur).toBe(2.5);
  });

  it("override glowBlur wins", () => {
    expect(resolveTrails2D(intent, { glowBlur: 10 }).glowBlur).toBe(10);
  });

  it("preserves color fields from intent", () => {
    const out = resolveTrails2D({
      ...intent,
      leftColor: "#abc123",
      rightColor: "#def456",
    });
    expect(out.leftColor).toBe("#abc123");
    expect(out.rightColor).toBe("#def456");
  });
});

describe("foldTrailIntentIntoSettings", () => {
  const base = DEFAULT_TRAIL_SETTINGS;
  const intent = DEFAULT_EFFECTS_CONFIG.trails;

  it("returns base unchanged when no intent is supplied", () => {
    expect(foldTrailIntentIntoSettings(base, undefined)).toBe(base);
    expect(foldTrailIntentIntoSettings(base, null)).toBe(base);
  });

  it("folds the effects-config visuals over the legacy base", () => {
    const out = foldTrailIntentIntoSettings(base, {
      ...intent,
      thickness: 8,
      brightness: 0.9,
      leftColor: "#abc123",
      rightColor: "#def456",
    });
    expect(out.lineWidth).toBe(8);
    expect(out.maxOpacity).toBe(0.9);
    expect(out.minOpacity).toBeCloseTo(0.27, 5);
    expect(out.leftColor).toBe("#abc123");
    expect(out.rightColor).toBe("#def456");
  });

  it("preserves rendering params (mode, fade, tailLength, trackingMode) from base", () => {
    const out = foldTrailIntentIntoSettings(base, { ...intent, thickness: 8 });
    expect(out.mode).toBe(base.mode);
    expect(out.fadeDurationMs).toBe(base.fadeDurationMs);
    expect(out.tailLength).toBe(base.tailLength);
    expect(out.trackingMode).toBe(base.trackingMode);
  });

  it("matches resolveTrails2D's intent→visual mapping", () => {
    const folded = foldTrailIntentIntoSettings(base, intent);
    const resolved = resolveTrails2D(intent);
    expect(folded.lineWidth).toBe(resolved.lineWidth);
    expect(folded.maxOpacity).toBe(resolved.maxOpacity);
    expect(folded.minOpacity).toBe(resolved.minOpacity);
  });
});

describe("resolveFire2D", () => {
  const intent = DEFAULT_EFFECTS_CONFIG.fire;

  it("preserves intent fields", () => {
    const out = resolveFire2D({ ...intent, intensity: 0.85, turbulence: 0.3 });
    expect(out.intensity).toBe(0.85);
    expect(out.turbulence).toBe(0.3);
  });

  it("override flickerRate wins", () => {
    expect(resolveFire2D(intent, { flickerRate: 12 }).flickerRate).toBe(12);
  });
});

describe("resolveLed2D", () => {
  const intent = DEFAULT_EFFECTS_CONFIG.led;

  it("preserves intent fields", () => {
    const out = resolveLed2D({
      ...intent,
      cycleDuration: 4.5,
      look: { ...intent.look, brightness: 3 },
    });
    expect(out.cycleDuration).toBe(4.5);
    expect(out.look.brightness).toBe(3);
  });

  it("defaults dotRadius to 2", () => {
    expect(resolveLed2D(intent).dotRadius).toBe(2);
  });
});

describe("resolveCharcoal2D", () => {
  const intent = DEFAULT_EFFECTS_CONFIG.charcoal;

  it("preserves semantic fields", () => {
    const out = resolveCharcoal2D({ ...intent, intensity: 0.9 });
    expect(out.intensity).toBe(0.9);
  });

  it("defaults particleCount to 200", () => {
    expect(resolveCharcoal2D(intent).particleCount).toBe(200);
  });

  it("keeps 3D emission styles out of the 2D motion controls", () => {
    const steelWool = resolveCharcoal2D({
      ...intent,
      emissionStyle: "steel-wool",
    });
    const forgeBurst = resolveCharcoal2D({
      ...intent,
      emissionStyle: "forge-burst",
    });

    expect({ ...steelWool, emissionStyle: undefined }).toEqual({
      ...forgeBurst,
      emissionStyle: undefined,
    });
  });
});
