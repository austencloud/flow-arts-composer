import { describe, it, expect } from "vitest";
import { toTrailPassPayload } from "#lib/shared/render-graph/translators/trail-translator.js";
import type { TrailsIntent } from "#lib/shared/effects/domain/effects-config.js";
import { MIN_TAIL_WIDTH_RATIO, FADE_EXPONENT } from "#lib/shared/render-graph/math/trail-mesh.js";

const baseIntent: TrailsIntent = {
  trackingMode: "both_ends",
  thickness: 1,
  brightness: 1,
  leftColor: "#0000ff",
  rightColor: "#ff0000",
  rainbow: false,
};

describe("TrailTranslator.toTrailPassPayload", () => {
  it("emits one tip state per path delta", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [
        { tipId: "blue", path: [] },
        { tipId: "red", path: [] },
      ],
      elapsedSeconds: 0,
    });
    expect(payload.tips).toHaveLength(2);
    expect(payload.tips.map((t) => t.tipId)).toEqual(["blue", "red"]);
  });

  it("maps blueColor/redColor by tipId", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [
        { tipId: "blue", path: [] },
        { tipId: "red", path: [] },
      ],
      elapsedSeconds: 0,
    });
    expect(payload.tips[0]!.color).toEqual([0, 0, 1, 1]);
    expect(payload.tips[1]!.color).toEqual([1, 0, 0, 1]);
  });

  it("applies brightness as alpha channel", () => {
    const payload = toTrailPassPayload(
      { ...baseIntent, brightness: 0.5 },
      {
        tips: [{ tipId: "blue", path: [] }],
        elapsedSeconds: 0,
      },
    );
    expect(payload.tips[0]!.color[3]).toBe(0.5);
  });

  it("scales thickness monotonically with intent.thickness", () => {
    const thin = toTrailPassPayload(
      { ...baseIntent, thickness: 1 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    const thick = toTrailPassPayload(
      { ...baseIntent, thickness: 12 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    expect(thick.tips[0]!.thickness).toBeGreaterThan(thin.tips[0]!.thickness);
  });

  it("clamps thickness outside [1,12]", () => {
    const below = toTrailPassPayload(
      { ...baseIntent, thickness: -5 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    const atMin = toTrailPassPayload(
      { ...baseIntent, thickness: 1 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    const above = toTrailPassPayload(
      { ...baseIntent, thickness: 9999 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    const atMax = toTrailPassPayload(
      { ...baseIntent, thickness: 12 },
      { tips: [{ tipId: "blue", path: [] }], elapsedSeconds: 0 },
    );
    expect(below.tips[0]!.thickness).toBe(atMin.tips[0]!.thickness);
    expect(above.tips[0]!.thickness).toBe(atMax.tips[0]!.thickness);
  });

  it("passes the path through verbatim", () => {
    const path: Array<[number, number]> = [[0, 0], [0.5, 0.5], [0.8, 0.2]];
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path }],
      elapsedSeconds: 0,
    });
    expect(payload.tips[0]!.path).toBe(path);
  });

  it("switches to hue cycling when rainbow=true", () => {
    const rainbow: TrailsIntent = { ...baseIntent, rainbow: true };
    const atZero = toTrailPassPayload(rainbow, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
    });
    const later = toTrailPassPayload(rainbow, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 10,
    });
    expect(atZero.tips[0]!.color).not.toEqual(later.tips[0]!.color);
  });

  it("honors colorOverrides over intent colors", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
      colorOverrides: { blue: [0.1, 0.2, 0.3, 0.4] },
    });
    expect(payload.tips[0]!.color).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("honors blendOverrides over the default alpha mode", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
      blendOverrides: { blue: "additive" },
    });
    expect(payload.tips[0]!.blendMode).toBe("additive");
  });

  it("defaults to alpha blending when no override is given", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
    });
    expect(payload.tips[0]!.blendMode).toBe("alpha");
  });

  it("carries Canvas2D-parity taper and fade constants", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
    });
    expect(payload.tips[0]!.taperTailRatio).toBe(MIN_TAIL_WIDTH_RATIO);
    expect(payload.tips[0]!.fadeExponent).toBe(FADE_EXPONENT);
  });

  it("sets a non-zero glow so the halo shader activates", () => {
    const payload = toTrailPassPayload(baseIntent, {
      tips: [{ tipId: "blue", path: [] }],
      elapsedSeconds: 0,
    });
    expect(payload.tips[0]!.glow).toBeGreaterThan(0);
  });
});
