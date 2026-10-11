import { describe, it, expect } from "vitest";
import { StripPatternEngine } from "#lib/features/poi/services/strip-pattern-engine.js";
import { getPixel, setPixel, createEmptyPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PatternParams, RGBColor } from "#lib/shared/poi/domain/strip-pattern.js";

// Polyfill ImageData for Node environment
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height!;
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  };
}

function defaultParams(overrides: Partial<PatternParams> = {}): PatternParams {
  return {
    primaryColor: { r: 255, g: 0, b: 0 },
    speed: 1.0,
    brightness: 1.0,
    ...overrides,
  };
}

describe("StripPatternEngine", () => {
  const engine = new StripPatternEngine();

  describe("presets", () => {
    it("lists 7 built-in presets", () => {
      expect(engine.getPresets()).toHaveLength(7);
      const ids = engine.getPresets().map((p) => p.id);
      expect(ids).toContain("solid");
      expect(ids).toContain("gradient");
      expect(ids).toContain("rainbow-sweep");
      expect(ids).toContain("pulse");
      expect(ids).toContain("prop-colors");
      expect(ids).toContain("chase");
      expect(ids).toContain("comet");
    });

    it("throws for unknown preset", () => {
      expect(() => engine.generate("nonexistent", 10, 10, defaultParams())).toThrow(
        "Unknown preset: nonexistent"
      );
    });
  });

  describe("solid preset", () => {
    it("fills every pixel with the primary color", () => {
      const pattern = engine.generate("solid", 10, 5, defaultParams());
      expect(pattern.ledCount).toBe(10);
      expect(pattern.frameCount).toBe(5);
      for (let f = 0; f < 5; f++) {
        for (let led = 0; led < 10; led++) {
          const px = getPixel(pattern, f, led);
          expect(px.r).toBe(255);
          expect(px.g).toBe(0);
          expect(px.b).toBe(0);
        }
      }
    });

    it("applies brightness scaling", () => {
      const pattern = engine.generate("solid", 4, 2, defaultParams({ brightness: 0.5 }));
      const px = getPixel(pattern, 0, 0);
      expect(px.r).toBe(128); // 255 * 0.5 ≈ 128
      expect(px.g).toBe(0);
    });
  });

  describe("gradient preset", () => {
    it("interpolates from primary to secondary along LEDs", () => {
      const params = defaultParams({
        primaryColor: { r: 255, g: 0, b: 0 },
        secondaryColor: { r: 0, g: 0, b: 255 },
      });
      const pattern = engine.generate("gradient", 3, 1, params);
      // First LED = pure red
      const first = getPixel(pattern, 0, 0);
      expect(first.r).toBe(255);
      expect(first.b).toBe(0);
      // Last LED = pure blue
      const last = getPixel(pattern, 0, 2);
      expect(last.r).toBe(0);
      expect(last.b).toBe(255);
    });
  });

  describe("rainbow-sweep preset", () => {
    it("produces varying hues along the strip", () => {
      const pattern = engine.generate("rainbow-sweep", 20, 10, defaultParams());
      // First and last LED in the same frame should differ
      const first = getPixel(pattern, 0, 0);
      const last = getPixel(pattern, 0, 19);
      const same = first.r === last.r && first.g === last.g && first.b === last.b;
      expect(same).toBe(false);
    });
  });

  describe("toImageData", () => {
    it("produces correct dimensions and preserves pixel colors", () => {
      const pattern = engine.generate("solid", 8, 4, defaultParams());
      const imageData = engine.toImageData(pattern);
      expect(imageData.width).toBe(4);
      expect(imageData.height).toBe(8);

      // Verify each pixel in the exported image matches the pattern
      for (let f = 0; f < 4; f++) {
        for (let led = 0; led < 8; led++) {
          const pixel = getPixel(pattern, f, led);
          const idx = (led * 4 + f) * 4;
          expect(imageData.data[idx]).toBe(pixel.r);
          expect(imageData.data[idx + 1]).toBe(pixel.g);
          expect(imageData.data[idx + 2]).toBe(pixel.b);
          expect(imageData.data[idx + 3]).toBe(255);
        }
      }
    });
  });

  describe("brightness limiting", () => {
    it("caps bright columns more than dim columns", () => {
      const pattern = createEmptyPattern(4, 2, "test");
      for (let led = 0; led < 4; led++) {
        setPixel(pattern, 0, led, { r: 255, g: 255, b: 255 }); // bright column
        setPixel(pattern, 1, led, { r: 10, g: 10, b: 10 });    // dim column
      }

      const limited = engine.applyBrightnessLimit(pattern, 21, 0.226, 8);

      // Bright column: heavily limited
      const brightPx = getPixel(limited, 0, 0);
      expect(brightPx.r).toBe(0); // floor(0.226/1.0) = 0, scale = 0

      // Dim column: avgBright ≈ 0.039, floor(0.226/0.039) = 5, scale = 5/21 ≈ 0.238
      const dimPx = getPixel(limited, 1, 0);
      expect(dimPx.r).toBeGreaterThan(0);
      expect(dimPx.r).toBeLessThan(10);
    });

    it("preserves dark patterns unchanged (capped at maxBright)", () => {
      const pattern = createEmptyPattern(4, 1, "test");
      for (let led = 0; led < 4; led++) {
        setPixel(pattern, 0, led, { r: 1, g: 1, b: 1 });
      }
      const limited = engine.applyBrightnessLimit(pattern, 21, 0.226, 8);
      const px = getPixel(limited, 0, 0);
      expect(px.r).toBe(1);
    });
  });
});
