import { describe, it, expect } from "vitest";
import { migrateLedConfig } from "#lib/shared/animation-engine/domain/types/led-config-migration.js";
import {
  CAPSULE_LED_COUNT,
  DEFAULT_LED_INTENT,
  DEFAULT_LED_LOOK,
  PROP_BLUE,
  PROP_RED,
  hexToRgb255,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import {
  CAMERA_EXPOSURE_MAX_S,
  CAMERA_EXPOSURE_MIN_S,
  GLARE_WEIGHT_MAX,
  GLARE_WEIGHT_MIN,
} from "#lib/shared/animation-engine/domain/led-photometry.js";

describe("migrateLedConfig", () => {
  it("returns the default config for missing / malformed input", () => {
    for (const input of [undefined, null, 42, "solid", [], {}, { patternId: 7 }]) {
      expect(migrateLedConfig(input)).toEqual(DEFAULT_LED_INTENT);
    }
  });

  it("maps a v1 solid pattern to a capsule running the solid generator", () => {
    const result = migrateLedConfig({
      patternId: "solid",
      patternSpeed: 1,
      primaryColor: "#00ff88",
      secondaryColor: "#ffffff",
      colorMode: "unified",
    });

    expect(result.device).toEqual({ kind: "capsule", ledCount: CAPSULE_LED_COUNT });
    expect(result.pattern).toMatchObject({
      source: "generator",
      generatorId: "solid",
    });
    expect(
      result.pattern.source === "generator" ? result.pattern.params.primaryColor : null
    ).toEqual(hexToRgb255("#00ff88"));
  });

  it("keeps the split/quad solid aliases on the capsule", () => {
    for (const patternId of ["split", "quad"]) {
      const result = migrateLedConfig({ patternId, primaryColor: "#ff0000" });
      expect(result.device.kind).toBe("capsule");
      expect(result.device.ledCount).toBe(CAPSULE_LED_COUNT);
    }
  });

  it("maps v1 prop-matched color mode onto the prop-colors generator", () => {
    const result = migrateLedConfig({
      patternId: "solid",
      colorMode: "prop-matched",
      primaryColor: "#00ff88",
    });

    expect(result.pattern).toMatchObject({
      source: "generator",
      generatorId: "prop-colors",
    });
    if (result.pattern.source !== "generator") throw new Error("expected a generator");
    expect(result.pattern.params.primaryColor).toEqual(hexToRgb255(PROP_BLUE));
    expect(result.pattern.params.secondaryColor).toEqual(hexToRgb255(PROP_RED));
  });

  it("maps the v1 spectrum family to a 200-LED pixel staff running rainbow-sweep", () => {
    for (const patternId of ["rainbow", "warm-shift", "cool-shift", "neon"]) {
      const result = migrateLedConfig({ patternId, patternSpeed: 1 });
      expect(result.device).toEqual({ kind: "pixel-staff", ledCount: 200 });
      expect(result.pattern).toMatchObject({
        source: "generator",
        generatorId: "rainbow-sweep",
      });
    }
  });

  it("falls back to the default device for v1 patterns with no v2 equivalent", () => {
    const result = migrateLedConfig({ patternId: "breathe", primaryColor: "#00ff88" });
    expect(result.device).toEqual(DEFAULT_LED_INTENT.device);
    expect(result.pattern).toEqual(DEFAULT_LED_INTENT.pattern);
  });

  it("maps the old trailFadeRate/bloomIntensity look onto shutter/glare, dropping glowRadius", () => {
    const result = migrateLedConfig({
      patternId: "solid",
      glowRadius: 2.5,
      trailFadeRate: 0.98,
      bloomIntensity: 0.15,
      brightness: 5,
    });

    // 0.98 is the top of the old trailFadeRate band, so it maps to the
    // longest eye time constant (0.4s).
    expect(result.look.shutter).toEqual({ mode: "eye", timeConstantSeconds: 0.4 });
    // 0.15 is the top of the old bloomIntensity band, so it maps to the
    // widest glare weight.
    expect(result.look.glare).toBeCloseTo(GLARE_WEIGHT_MAX, 5);
    expect(result.look.brightness).toBe(5);
    expect(result.look).not.toHaveProperty("glowRadius");
  });

  it("maps a short old trailFadeRate to a short eye time constant", () => {
    const result = migrateLedConfig({ patternId: "solid", trailFadeRate: 0.8, bloomIntensity: 0 });
    expect(result.look.shutter).toEqual({ mode: "eye", timeConstantSeconds: 0.04 });
    expect(result.look.glare).toBeCloseTo(GLARE_WEIGHT_MIN, 5);
  });

  it("keeps the look even when the pattern has no v2 equivalent", () => {
    const result = migrateLedConfig({ patternId: "chase-v1-unknown", trailFadeRate: 0.89 });
    expect(result.look.shutter.mode).toBe("eye");
    expect(
      result.look.shutter.mode === "eye" ? result.look.shutter.timeConstantSeconds : NaN
    ).toBeCloseTo(0.22, 5);
  });

  it("ignores non-numeric or missing look fields", () => {
    const result = migrateLedConfig({
      patternId: "solid",
      glowRadius: "wide",
      trailFadeRate: Number.NaN,
      bloomIntensity: null,
    });

    expect(result.look).toEqual(DEFAULT_LED_LOOK);
  });

  it("recovers a brightness level from a resolved 0-1 float", () => {
    // The runtime overlay config stored 0.2/0.4/.../1.0 rather than 1-5.
    expect(migrateLedConfig({ patternId: "solid", brightness: 0.6 }).look.brightness).toBe(3);
    expect(migrateLedConfig({ patternId: "solid", brightness: 1 }).look.brightness).toBe(5);
    expect(migrateLedConfig({ patternId: "solid", brightness: 0.2 }).look.brightness).toBe(1);
  });

  it("clamps out-of-range brightness levels", () => {
    expect(migrateLedConfig({ patternId: "solid", brightness: 9 }).look.brightness).toBe(5);
    expect(migrateLedConfig({ patternId: "solid", brightness: -3 }).look.brightness).toBe(1);
  });

  it("converts the v1 speed multiplier to a clamped cycle duration", () => {
    expect(migrateLedConfig({ patternId: "solid", patternSpeed: 1 }).cycleDuration).toBe(3);
    expect(migrateLedConfig({ patternId: "solid", patternSpeed: 2 }).cycleDuration).toBe(1.5);
    // 3 / 0.1 = 30s, exactly the ceiling; anything slower clamps to it.
    expect(migrateLedConfig({ patternId: "solid", patternSpeed: 0.01 }).cycleDuration).toBe(30);
    expect(migrateLedConfig({ patternId: "solid", patternSpeed: 1000 }).cycleDuration).toBe(0.2);
  });

  it("passes an already-current-shape config through, normalizing its numbers", () => {
    const v2 = {
      device: { kind: "pixel-staff", ledCount: 72 },
      pattern: { source: "generator", generatorId: "comet", params: {} },
      cycleDuration: 999,
      look: {
        shutter: { mode: "camera", exposureSeconds: 1.5 },
        glare: 0.6,
        brightness: 4,
      },
    };

    const result = migrateLedConfig(v2);
    expect(result.device).toEqual({ kind: "pixel-staff", ledCount: 72 });
    expect(result.pattern).toEqual(v2.pattern);
    expect(result.cycleDuration).toBe(30);
    expect(result.look).toEqual(v2.look);
  });

  it("clamps an already-current-shape shutter/glare to their supported bounds", () => {
    const result = migrateLedConfig({
      device: { kind: "capsule", ledCount: 2 },
      pattern: { source: "generator", generatorId: "solid", params: {} },
      cycleDuration: 3,
      look: {
        shutter: { mode: "camera", exposureSeconds: 999 },
        glare: 5,
        brightness: 3,
      },
    });

    expect(result.look.shutter).toEqual({
      mode: "camera",
      exposureSeconds: CAMERA_EXPOSURE_MAX_S,
    });
    expect(result.look.glare).toBe(GLARE_WEIGHT_MAX);

    const tooShort = migrateLedConfig({
      device: { kind: "capsule", ledCount: 2 },
      pattern: { source: "generator", generatorId: "solid", params: {} },
      cycleDuration: 3,
      look: { shutter: { mode: "camera", exposureSeconds: 0.01 }, glare: 0.1, brightness: 3 },
    });
    expect(tooShort.look.shutter).toEqual({
      mode: "camera",
      exposureSeconds: CAMERA_EXPOSURE_MIN_S,
    });
    expect(tooShort.look.glare).toBe(GLARE_WEIGHT_MIN);
  });

  it("still migrates a legacy-shape look nested under an already-v2 device/pattern", () => {
    const result = migrateLedConfig({
      device: { kind: "capsule", ledCount: 2 },
      pattern: { source: "generator", generatorId: "solid", params: {} },
      cycleDuration: 3,
      look: { glowRadius: 1, trailFadeRate: 0.98, bloomIntensity: 0, brightness: 2 },
    });

    expect(result.look.shutter).toEqual({ mode: "eye", timeConstantSeconds: 0.4 });
    expect(result.look.glare).toBeCloseTo(GLARE_WEIGHT_MIN, 5);
    expect(result.look.brightness).toBe(2);
  });

  it("never throws on adversarial input", () => {
    const nasty: unknown[] = [
      { patternId: "solid", primaryColor: "not-a-color" },
      { patternId: "rainbow", primaryColor: 12345 },
      { device: {}, pattern: {} },
      { device: { kind: "pixel-staff" }, pattern: null },
      Object.create(null),
    ];
    for (const input of nasty) {
      expect(() => migrateLedConfig(input)).not.toThrow();
    }
  });

  it("does not mutate or alias the default config", () => {
    const result = migrateLedConfig(undefined);
    result.look.glare = 0.99;
    expect(DEFAULT_LED_INTENT.look.glare).toBe(DEFAULT_LED_LOOK.glare);
  });
});
