import { describe, it, expect } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { EFFECTS_CONFIG_VERSION } from "#lib/shared/effects/domain/effects-config.js";
import {
  CAPSULE_LED_COUNT,
  CYCLE_DURATION_MAX,
  CYCLE_DURATION_MIN,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import {
  GLARE_WEIGHT_MAX,
  GLARE_WEIGHT_MIN,
} from "#lib/shared/animation-engine/domain/led-photometry.js";

describe("DEFAULT_EFFECTS_CONFIG", () => {
  it("has the current schema version", () => {
    expect(DEFAULT_EFFECTS_CONFIG.version).toBe(EFFECTS_CONFIG_VERSION);
  });

  it("has a tipEffectMap with trails as the global default", () => {
    expect(DEFAULT_EFFECTS_CONFIG.tipEffectMap).toEqual({
      "*": { effect: "trails" },
    });
  });

  it("has valid trails intent", () => {
    const t = DEFAULT_EFFECTS_CONFIG.trails;
    expect(t.trackingMode).toBe("both_ends");
    expect(t.thickness).toBe(4);
    expect(t.thickness).toBeGreaterThanOrEqual(1);
    expect(t.thickness).toBeLessThanOrEqual(12);
    expect(t.brightness).toBeGreaterThanOrEqual(0.3);
    expect(t.brightness).toBeLessThanOrEqual(1.0);
    expect(t.leftColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(t.rightColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(t.rainbow).toBe(false);
  });

  it("has valid fire intent", () => {
    const f = DEFAULT_EFFECTS_CONFIG.fire;
    expect(f.intensity).toBeGreaterThanOrEqual(0.45);
    expect(f.intensity).toBeLessThanOrEqual(1.0);
    expect(f.colorBlend).toBeGreaterThanOrEqual(0);
    expect(f.colorBlend).toBeLessThanOrEqual(1);
    expect(f.turbulence).toBeGreaterThanOrEqual(0);
    expect(f.turbulence).toBeLessThanOrEqual(1);
    expect(f.colorCurve).toBeNull();
    expect(f.propColors).toBeNull();
    expect(f.customColors).toBeNull();
  });

  it("has valid led intent", () => {
    const l = DEFAULT_EFFECTS_CONFIG.led;
    expect(l.device.kind).toBe("capsule");
    expect(l.device.ledCount).toBe(CAPSULE_LED_COUNT);
    expect(l.pattern.source).toBe("generator");
    expect(l.cycleDuration).toBeGreaterThanOrEqual(CYCLE_DURATION_MIN);
    expect(l.cycleDuration).toBeLessThanOrEqual(CYCLE_DURATION_MAX);
    expect(l.look.brightness).toBeGreaterThanOrEqual(1);
    expect(l.look.brightness).toBeLessThanOrEqual(5);
    expect(Number.isInteger(l.look.brightness)).toBe(true);
    // The look used to carry `trailFadeRate`, a per-frame persistence decay.
    // The camera-exposure rewrite replaced that instrument outright: what the
    // eye or the sensor integrates is now a shutter, and the bloom around a
    // bright emitter is a glare weight. Asserting the old field passed
    // `undefined` into a numeric matcher and failed on type, not on value.
    expect(l.look.shutter.mode).toBe("eye");
    expect(l.look.glare).toBeGreaterThanOrEqual(GLARE_WEIGHT_MIN);
    expect(l.look.glare).toBeLessThanOrEqual(GLARE_WEIGHT_MAX);
  });

  it("has valid charcoal intent", () => {
    const c = DEFAULT_EFFECTS_CONFIG.charcoal;
    for (const k of ["intensity", "spread", "glow"] as const) {
      expect(c[k]).toBeGreaterThanOrEqual(0);
      expect(c[k]).toBeLessThanOrEqual(1);
    }
  });

  it("uses continuous cool-blue liquid ink as the ink default", () => {
    expect(DEFAULT_EFFECTS_CONFIG.ink).toEqual({
      ambientEmission: 0.06,
      motionEmission: 0.9,
      intensity: 0.64,
      palette: "custom",
      customColor: "#2f8fb3",
      viscosity: 0.28,
      splatterIntensity: 0.06,
      trackingMode: "both_ends",
    });
  });

  it("has activePresets all null", () => {
    expect(DEFAULT_EFFECTS_CONFIG.activePresets).toEqual({
      trails: null,
      fire: null,
      led: null,
      charcoal: null,
      zap: null,
      sparkles: null,
      ghost: null,
      bloom: null,
      goo: null,
      bubbles: null,
      petals: null,
      smoke: null,
      ink: null,
      frost: null,
      silk: null,
      animal: null,
      pulse: null,
    });
  });

  it("has no overrides by default", () => {
    expect(DEFAULT_EFFECTS_CONFIG.overrides).toBeUndefined();
  });

  it("round-trips through JSON.stringify / JSON.parse", () => {
    const serialized = JSON.stringify(DEFAULT_EFFECTS_CONFIG);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(DEFAULT_EFFECTS_CONFIG);
  });
});
