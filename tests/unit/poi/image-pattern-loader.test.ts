import { describe, it, expect } from "vitest";
import { fromImageData, fromDiscImage, fromStripImage } from "#lib/features/poi/services/image-pattern-loader.js";
import { getPixel } from "#lib/shared/poi/domain/strip-pattern.js";

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

describe("ImagePatternLoader", () => {
  describe("disc mode (default)", () => {
    it("uses polar sampling — frameCount based on circumference", () => {
      const size = 10;
      const data = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = 255;
        data[i * 4 + 3] = 255;
      }
      const imageData = new ImageData(data, size, size);
      const pattern = fromImageData(imageData, 8);

      expect(pattern.ledCount).toBe(8);
      expect(pattern.frameCount).toBeGreaterThanOrEqual(180);
      expect(pattern.metadata.source).toBe("image-upload");
    });

    it("samples solid color uniformly", () => {
      const size = 20;
      const data = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4 + 1] = 200;
        data[i * 4 + 3] = 255;
      }
      const imageData = new ImageData(data, size, size);
      const pattern = fromDiscImage(imageData, 10);

      const midLed = Math.floor(pattern.ledCount / 2);
      expect(pattern.frames[0]!.colors[midLed * 3 + 1]).toBeGreaterThan(150);
    });
  });

  describe("strip mode", () => {
    it("maps columns to frames and rows to LEDs", () => {
      const data = new Uint8ClampedArray([
        255, 0, 0, 255,     0, 255, 0, 255,
        0, 0, 255, 255,     255, 255, 255, 255,
        0, 0, 0, 255,       255, 255, 0, 255,
      ]);
      const imageData = new ImageData(data, 2, 3);
      const pattern = fromStripImage(imageData, 3);

      expect(pattern.ledCount).toBe(3);
      expect(pattern.frameCount).toBe(2);
      expect(getPixel(pattern, 0, 0)).toEqual({ r: 255, g: 0, b: 0 });
      expect(getPixel(pattern, 1, 2)).toEqual({ r: 255, g: 255, b: 0 });
    });
  });
});
