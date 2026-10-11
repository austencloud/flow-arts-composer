import { describe, it, expect } from "vitest";
import { resolveZap2D } from "../../../../src/lib/shared/effects/translators/canvas2d-translator";
import { resolveZap3D } from "../../../../src/lib/shared/effects/translators/webgl3d-translator";
import type { ZapIntent } from "../../../../src/lib/shared/effects/domain/effects-config";

// Full current ZapIntent. Every field is required — a partial literal leaves the
// derived params undefined-driven (a missing `glow` made glowBlur NaN), and the
// translators deliberately do not defend against that: production always feeds a
// default-merged config (migrations.ts merges DEFAULT_EFFECTS_CONFIG.zap).
const baseIntent: ZapIntent = {
  intensity: 0.7,
  colorMode: "custom",
  leftColor: "#88ccff",
  rightColor: "#ff8888",
  frequency: 12,
  mode: "arc",
  branching: 0.3,
  style: "branching",
  wobbleRate: 0.18,
  wobbleAmount: 0.5,
  glow: 0.5,
  jitter: 0.5,
};

describe("resolveZap2D", () => {
  it("passes intent through and derives sensible canvas params", () => {
    const out = resolveZap2D(baseIntent);
    expect(out.intensity).toBe(0.7);
    expect(out.leftColor).toBe("#88ccff");
    expect(out.rightColor).toBe("#ff8888");
    expect(out.coreWidth).toBeGreaterThan(0);
    expect(out.haloWidth).toBeGreaterThan(out.coreWidth);
    expect(out.haloAlpha).toBeGreaterThan(0);
    expect(out.brightness).toBeGreaterThan(0);
  });

  it("honours an override", () => {
    const out = resolveZap2D(baseIntent, { coreWidth: 3 });
    expect(out.coreWidth).toBe(3);
  });
});

describe("resolveZap3D (webgl3d-translator)", () => {
  it("passes intent through and derives sensible 3D params", () => {
    const out = resolveZap3D(baseIntent);
    expect(out.intensity).toBe(0.7);
    // A visible ribbon a few centimetres wide, never the old one-pixel line.
    expect(out.haloWidth).toBeGreaterThan(0.015);
    expect(out.haloWidth).toBeLessThan(0.1);
    expect(out.coreFraction).toBeGreaterThan(0);
    expect(out.coreFraction).toBeLessThan(1);
    expect(out.lightIntensity).toBeGreaterThan(0);
  });

  it("widens the halo with Glow without fattening the core", () => {
    const tight = resolveZap3D({ ...baseIntent, glow: 0 });
    const wide = resolveZap3D({ ...baseIntent, glow: 1 });
    expect(wide.haloWidth).toBeGreaterThan(tight.haloWidth);
    expect(wide.haloWidth * wide.coreFraction).toBeCloseTo(
      tight.haloWidth * tight.coreFraction
    );
  });
});
