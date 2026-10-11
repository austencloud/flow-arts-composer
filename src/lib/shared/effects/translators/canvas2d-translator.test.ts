import { describe, it, expect } from "vitest";
import {
  resolveBubbles2D,
  resolveInk2D,
  resolvePetals2D,
  resolveSmoke2D,
  resolveSparkles2D,
  resolveZap2D,
} from "./canvas2d-translator";
import type {
  BubblesIntent,
  InkIntent,
  PetalsIntent,
  SmokeIntent,
  SparklesIntent,
  ZapIntent,
} from "../domain/effects-config";
import { SMOKE_PALETTES } from "../domain/smoke-palettes";

describe("resolveZap2D - per-hand color", () => {
  const baseIntent = (): ZapIntent => ({
    intensity: 0.7,
    leftColor: "#ff0000",
    rightColor: "#0000ff",
    frequency: 12,
    mode: "arc",
    branching: 0.3,
    style: "branching",
    wobbleRate: 0.18,
    wobbleAmount: 0.5,
    glow: 0.5,
    jitter: 0.5,
  });

  it("preserves leftColor and rightColor in the output params", () => {
    const out = resolveZap2D(baseIntent());
    expect(out.leftColor).toBe("#ff0000");
    expect(out.rightColor).toBe("#0000ff");
  });

  it("derives glowBlur from the glow knob, not intensity", () => {
    const dim = resolveZap2D({ ...baseIntent(), glow: 0, intensity: 1 });
    const bright = resolveZap2D({ ...baseIntent(), glow: 1, intensity: 0 });
    expect(bright.glowBlur).toBeGreaterThan(dim.glowBlur); // tracks glow…
    expect(dim.glowBlur).toBe(6); // …and is independent of intensity (6 + glow*22)
  });
});

describe("resolveSparkles2D - extended fields", () => {
  it("preserves colorMode, palette, spread, gravity, mode in output params", () => {
    const intent: SparklesIntent = {
      rate: 0.7,
      size: 0.6,
      lifetime: 1.5,
      color: "#67e8f9",
      palette: ["#aaa", "#bbb", "#ccc"],
      colorMode: "palette",
      spread: 12,
      gravity: 0.8,
      mode: "burst",
    };
    const out = resolveSparkles2D(intent);
    expect(out.colorMode).toBe("palette");
    expect(out.palette).toEqual(["#aaa", "#bbb", "#ccc"]);
    expect(out.spread).toBe(12);
    expect(out.gravity).toBe(0.8);
    expect(out.mode).toBe("burst");
    expect(out.poolSize).toBeGreaterThan(0);
    expect(out.baseRadius).toBeGreaterThan(0);
  });
});

describe("resolveBubbles2D - palette resolution + defaults", () => {
  it("resolves the soap palette for intent.palette === 'soap'", () => {
    const intent: BubblesIntent = {
      ambientEmission: 0.3,
      motionEmission: 0.5,
      intensity: 0.6,
      palette: "soap",
      customColor: "#c8e0ff",
      sizeJitter: 0.4,
      buoyancy: 0.5,
      trackingMode: "both_ends",
    };
    const out = resolveBubbles2D(intent);
    expect(out.resolvedPalette.id).toBe("soap");
    expect(out.resolvedPalette.rim).toBe("#c8e0ff");
    expect(out.poolSize).toBeGreaterThan(0);
    expect(out.ambientSpawnRate).toBeGreaterThan(0);
    expect(out.motionSpawnRate).toBeGreaterThan(0);
  });

  it("resolves a custom palette from customColor", () => {
    const intent: BubblesIntent = {
      ambientEmission: 0.3,
      motionEmission: 0.5,
      intensity: 0.6,
      palette: "custom",
      customColor: "#ff8800",
      sizeJitter: 0.4,
      buoyancy: 0.5,
      trackingMode: "both_ends",
    };
    const out = resolveBubbles2D(intent);
    expect(out.resolvedPalette.id).toBe("custom");
    // Rim = base hex, round-tripped through HSL → should be near original.
    expect(out.resolvedPalette.rim.toLowerCase()).toBe("#ff8800");
  });

  it("marks oil palette as iridescent", () => {
    const intent: BubblesIntent = {
      ambientEmission: 0.3,
      motionEmission: 0.5,
      intensity: 0.6,
      palette: "oil",
      customColor: "#000000",
      sizeJitter: 0.4,
      buoyancy: 0.5,
      trackingMode: "both_ends",
    };
    const out = resolveBubbles2D(intent);
    expect(out.resolvedPalette.iridescent).toBe(true);
  });
});

describe("resolvePetals2D - palette resolution + defaults", () => {
  it("resolves the blossom palette for intent.palette === 'blossom'", () => {
    const intent: PetalsIntent = {
      ambientEmission: 0.5,
      motionEmission: 0.4,
      intensity: 0.6,
      palette: "blossom",
      customColor: "#ffb0c8",
      swayAmplitude: 0.6,
      carry: 0.55,
      streakLength: 0.4,
      fallSpeed: 0.4,
      trackingMode: "both_ends",
    };
    const out = resolvePetals2D(intent);
    expect(out.resolvedPalette.id).toBe("blossom");
    expect(out.resolvedPalette.tints.length).toBeGreaterThan(0);
    expect(out.resolvedPalette.sprites.length).toBeGreaterThan(0);
    expect(out.poolSize).toBeGreaterThan(0);
    expect(out.ambientSpawnRate).toBeGreaterThan(0);
    expect(out.motionSpawnRate).toBeGreaterThan(0);
    expect(out.fallBaseSpeed).toBeGreaterThan(0);
    // Airstream knobs pass through from intent.
    expect(out.carry).toBe(0.55);
    expect(out.streakLength).toBe(0.4);
  });

  it("resolves a custom palette from customColor", () => {
    const intent: PetalsIntent = {
      ambientEmission: 0.5,
      motionEmission: 0.4,
      intensity: 0.6,
      palette: "custom",
      customColor: "#ff8800",
      swayAmplitude: 0.6,
      carry: 0.55,
      streakLength: 0.4,
      fallSpeed: 0.4,
      trackingMode: "both_ends",
    };
    const out = resolvePetals2D(intent);
    expect(out.resolvedPalette.id).toBe("custom");
    expect(out.resolvedPalette.tints.length).toBe(3);
    // Base tint = customColor, round-tripped should match.
    expect(out.resolvedPalette.tints[0]!.toLowerCase()).toBe("#ff8800");
  });

  it("marks ash palette with emberEdge flag", () => {
    const intent: PetalsIntent = {
      ambientEmission: 0.3,
      motionEmission: 0.7,
      intensity: 0.5,
      palette: "ash",
      customColor: "#000000",
      swayAmplitude: 0.7,
      carry: 0.6,
      streakLength: 0.5,
      fallSpeed: 0.5,
      trackingMode: "both_ends",
    };
    const out = resolvePetals2D(intent);
    expect(out.resolvedPalette.emberEdge).toBeDefined();
    expect(out.resolvedPalette.emberEdge!.chance).toBeGreaterThan(0);
  });
});

describe("resolveSmoke2D - palette carries behavior", () => {
  function baseIntent(overrides: Partial<SmokeIntent> = {}): SmokeIntent {
    return {
      ambientEmission: 0.5,
      motionEmission: 0.4,
      intensity: 0.5,
      palette: "incense",
      customColor: "#e0e0e0",
      curlStrength: 0.5,
      riseSpeed: 0.5,
      trackingMode: "both_ends",
      ...overrides,
    };
  }

  it("resolves the incense palette colors + behavior multipliers", () => {
    const out = resolveSmoke2D(baseIntent());
    expect(out.resolvedPalette.id).toBe("incense");
    expect(out.resolvedPalette.core).toBe("#d8d8d8");
    expect(out.resolvedPalette.edge).toBe("#f0f0f0");
    expect(out.lifetimeSeconds).toBe(SMOKE_PALETTES.incense.lifetime);
    expect(out.poolSize).toBe(1024);
    expect(out.ambientSpawnRate).toBeGreaterThan(0);
    expect(out.motionSpawnRate).toBeGreaterThan(0);
    expect(out.blendMode).toBe("source-over");
  });

  it("applies palette.curlBias to intent.curlStrength", () => {
    // fog has curlBias 0.5; intent 0.8 × 0.5 = 0.4
    const out = resolveSmoke2D(
      baseIntent({ palette: "fog", curlStrength: 0.8 })
    );
    expect(out.resolvedCurlStrength).toBeCloseTo(0.4, 6);
    expect(out.lifetimeSeconds).toBe(6.0);
  });

  it("applies palette.riseBias to intent.riseSpeed and scales by riseBaseSpeed", () => {
    // genie has riseBias 0.9; intent 1.0 × 0.9 × 280 = 252
    // (2D uses 280 px/s base - Boussinesq buoyancy target)
    const out = resolveSmoke2D(
      baseIntent({ palette: "genie", riseSpeed: 1.0 })
    );
    expect(out.resolvedRiseSpeed).toBeCloseTo(252.0, 4);
    expect(out.riseBaseSpeed).toBe(280);
  });

  it("derives a custom palette from customColor with neutral behavior defaults", () => {
    const out = resolveSmoke2D(
      baseIntent({ palette: "custom", customColor: "#ff8800" })
    );
    expect(out.resolvedPalette.id).toBe("custom");
    // Custom lifetime/curlBias/riseBias are neutral defaults (7.0 / 0.5 / 0.5).
    expect(out.lifetimeSeconds).toBe(7.0);
    // resolvedCurlStrength = 0.5 × 0.5 = 0.25
    expect(out.resolvedCurlStrength).toBeCloseTo(0.25, 6);
    // Core = base, edge = +15% L lightened → distinct colors.
    expect(out.resolvedPalette.core).not.toBe(out.resolvedPalette.edge);
  });

  it("exposes the genie hueShift flag on the resolved palette", () => {
    // Flag is set on the palette so renderers can branch on it once
    // 1i.iii lands. Current renderer ignores it; the data still flows.
    const out = resolveSmoke2D(baseIntent({ palette: "genie" }));
    expect(out.resolvedPalette.hueShift).toBe(true);
  });

  it("allows overrides to replace any resolved default field", () => {
    const out = resolveSmoke2D(baseIntent(), { poolSize: 512, baseRadius: 30 });
    expect(out.poolSize).toBe(512);
    expect(out.baseRadius).toBe(30);
  });
});

describe("resolveInk2D - palette + motion-dominant + stroke width", () => {
  function baseIntent(overrides: Partial<InkIntent> = {}): InkIntent {
    return {
      ambientEmission: 0.2,
      motionEmission: 0.8,
      intensity: 0.6,
      palette: "india",
      customColor: "#0a0a0a",
      viscosity: 0.3,
      splatterIntensity: 0.3,
      trackingMode: "both_ends",
      ...overrides,
    };
  }

  it("resolves the india palette - opaque pigment defaults", () => {
    const out = resolveInk2D(baseIntent());
    expect(out.resolvedPalette.id).toBe("india");
    expect(out.resolvedPalette.pigment).toBe("#0a0a0a");
    expect(out.resolvedPalette.edge).toBe("#1a1a1a");
    // Default palette is opaque pigment, NOT emissive.
    expect(out.resolvedPalette.emissive).toBeFalsy();
    expect(out.opacityMax).toBe(1.0);
    expect(out.ambientSpawnRate).toBe(2);
    expect(out.motionSpawnRate).toBe(60);
    expect(out.motionReferenceSpeed).toBe(3.0);
    expect(out.strokeWidthMin).toBe(2);
    expect(out.strokeWidthMax).toBe(14);
    expect(out.lifetimeSeconds).toBeGreaterThan(0);
    expect(out.maxPointsPerTip).toBeGreaterThan(10);
  });

  it("hard-caps effectiveAmbient at 0.3 even when user dials ambient to max", () => {
    // Ink is motion-dominant by identity. User slider at 1.0 clamps to 0.3
    // in the translator - the renderer never sees >0.3.
    const capped = resolveInk2D(baseIntent({ ambientEmission: 1.0 }));
    expect(capped.effectiveAmbient).toBe(0.3);
    const midRange = resolveInk2D(baseIntent({ ambientEmission: 0.5 }));
    expect(midRange.effectiveAmbient).toBe(0.3);
    const below = resolveInk2D(baseIntent({ ambientEmission: 0.1 }));
    expect(below.effectiveAmbient).toBe(0.1);
  });

  it("watercolor separates the painted mark from detached droplet physics", () => {
    // Palette-carried behavior - watercolor IS watercolor, not "light ink".
    const out = resolveInk2D(baseIntent({ palette: "watercolor" }));
    expect(out.resolvedPalette.watercolor).toBe(true);
    expect(out.resolvedPalette.id).toBe("watercolor");
    expect(out.strokeWidthMax).toBe(13);
    expect(out.strokeLengthPx).toBe(320);
    expect(out.lifetimeSeconds).toBe(2.2);
    expect(out.strokeGravityPx).toBe(0);
    expect(out.gravityPx).toBeGreaterThan(0);
    // Alpha is owned by the translator and remains a translucent wash.
    expect(out.opacityMax).toBe(0.68);
    // Still opaque pigment - watercolor ≠ neon. The cap comes from
    // alpha, not from switching to additive blend.
    expect(out.resolvedPalette.emissive).toBeFalsy();
  });

  it("reserves attached-mark sag for deliberately viscous dense ink", () => {
    const ordinary = resolveInk2D(baseIntent({ palette: "india" }));
    expect(ordinary.strokeLengthPx).toBe(320);
    expect(ordinary.strokeGravityPx).toBe(0);

    const viscous = resolveInk2D(
      baseIntent({ palette: "india", viscosity: 0.8 })
    );
    expect(viscous.strokeGravityPx).toBeGreaterThan(0);
    expect(viscous.strokeGravityPx).toBeLessThan(viscous.gravityPx);
  });

  it("neon palette is the only emissive ink", () => {
    // Neon is the ONLY ink palette that glows. All others composite opaque.
    // One glowing palette reinforces that the default ink read is pigment.
    const out = resolveInk2D(baseIntent({ palette: "neon" }));
    expect(out.resolvedPalette.emissive).toBe(true);
    expect(out.resolvedPalette.id).toBe("neon");
  });

  it("blood + acid palettes resolve to opaque pigment (cross-palette naming)", () => {
    const blood = resolveInk2D(baseIntent({ palette: "blood" }));
    expect(blood.resolvedPalette.id).toBe("blood");
    expect(blood.resolvedPalette.emissive).toBeFalsy();
    expect(blood.resolvedPalette.pigment).toBe("#8f2635");

    const acid = resolveInk2D(baseIntent({ palette: "acid" }));
    expect(acid.resolvedPalette.id).toBe("acid");
    expect(acid.resolvedPalette.emissive).toBeFalsy();
    expect(acid.resolvedPalette.pigment).toBe("#7fd94a");
  });

  it("custom palette derives pigment/edge/pool from customColor", () => {
    const out = resolveInk2D(
      baseIntent({ palette: "custom", customColor: "#ff8800" })
    );
    expect(out.resolvedPalette.id).toBe("custom");
    // Pigment = base customColor round-tripped through HSL.
    expect(out.resolvedPalette.pigment.toLowerCase()).toBe("#ff8800");
    // Edge ≠ pigment (lightened).
    expect(out.resolvedPalette.edge).not.toBe(out.resolvedPalette.pigment);
    // Custom ink is opaque (no flags).
    expect(out.resolvedPalette.emissive).toBeFalsy();
    expect(out.opacityMax).toBe(1.0);
    expect(out.strokeLengthPx).toBe(320);
    expect(out.lifetimeSeconds).toBe(2.2);
    expect(out.maxPointsPerTip).toBe(90);
  });

  it("carries viscosity + splatterIntensity through to params for sprint 2", () => {
    // Sprint 1 renderer ignores these, but the shape must survive the
    // translator so sprint 2's breakup/splatter work has data.
    const out = resolveInk2D(
      baseIntent({ viscosity: 0.7, splatterIntensity: 0.9 })
    );
    expect(out.viscosity).toBe(0.7);
    expect(out.splatterIntensity).toBe(0.9);
  });

  it("allows overrides to replace any resolved default field", () => {
    const out = resolveInk2D(baseIntent(), {
      maxPointsPerTip: 20,
      lifetimeSeconds: 2.0,
    });
    expect(out.maxPointsPerTip).toBe(20);
    expect(out.lifetimeSeconds).toBe(2.0);
  });
});
