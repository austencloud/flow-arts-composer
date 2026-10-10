
import { describe, it, expect, beforeAll } from "vitest";
import { LedThresholdDetector } from "#lib/features/video/video-trails/services/led-threshold-detector.js";
import type { DetectionConfig } from "#lib/features/video/video-trails/domain/types.js";

// jsdom doesn't implement ImageData. Provide a minimal polyfill that stores
// the pixel data exactly like the browser version so the detector can read it.
beforeAll(() => {
  if (typeof globalThis.ImageData === "undefined") {
    class ImageDataPolyfill {
      readonly data: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    (globalThis as any).ImageData = ImageDataPolyfill;
  }
});

const DEFAULT_CONFIG: DetectionConfig = {
  threshold: 0.5,
  sensitivity: 1.0,
  colorWeights: { r: 0.2126, g: 0.7152, b: 0.0722 },
  minArea: 1,
  maxEndpoints: 4,
};

function createTestFrame(width: number, height: number, brightSpots: { x: number; y: number; brightness: number }[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  for (const spot of brightSpots) {
    const idx = (spot.y * width + spot.x) * 4;
    const val = Math.round(spot.brightness * 255);
    data[idx] = val; data[idx + 1] = val; data[idx + 2] = val;
  }
  return new ImageData(data, width, height);
}

describe("LedThresholdDetector", () => {
  it("detects bright pixels above threshold", () => {
    const detector = new LedThresholdDetector();
    const frame = createTestFrame(10, 10, [{ x: 5, y: 5, brightness: 1.0 }]);
    const endpoints = detector.detect(frame, DEFAULT_CONFIG);
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints[0].x).toBe(5);
    expect(endpoints[0].y).toBe(5);
    expect(endpoints[0].brightness).toBeGreaterThan(0.5);
  });

  it("ignores pixels below threshold", () => {
    const detector = new LedThresholdDetector();
    const frame = createTestFrame(10, 10, [{ x: 5, y: 5, brightness: 0.2 }]);
    const endpoints = detector.detect(frame, { ...DEFAULT_CONFIG, threshold: 0.5 });
    expect(endpoints.length).toBe(0);
  });

  it("respects maxEndpoints limit", () => {
    const detector = new LedThresholdDetector();
    const frame = createTestFrame(20, 20, [
      { x: 2, y: 2, brightness: 1.0 },
      { x: 8, y: 8, brightness: 0.9 },
      { x: 14, y: 14, brightness: 0.8 },
      { x: 18, y: 18, brightness: 0.7 },
      { x: 4, y: 16, brightness: 0.6 },
    ]);
    const endpoints = detector.detect(frame, { ...DEFAULT_CONFIG, maxEndpoints: 2 });
    expect(endpoints.length).toBeLessThanOrEqual(2);
    expect(endpoints[0].brightness).toBeGreaterThanOrEqual(endpoints[1]?.brightness ?? 0);
  });

  it("assigns propIndex via k-means clustering when 2+ endpoints", () => {
    const detector = new LedThresholdDetector();
    const frame = createTestFrame(100, 10, [
      { x: 10, y: 5, brightness: 1.0 },
      { x: 90, y: 5, brightness: 1.0 },
    ]);
    const endpoints = detector.detect(frame, { ...DEFAULT_CONFIG, maxEndpoints: 4 });
    if (endpoints.length >= 2) {
      expect(endpoints[0].propIndex).not.toBe(endpoints[1].propIndex);
    }
  });

  it("has correct name and capabilities", () => {
    const detector = new LedThresholdDetector();
    expect(detector.name).toBe("LED Threshold");
    expect(detector.capabilities.supportsLive).toBe(true);
    expect(detector.capabilities.requiresGPU).toBe(false);
  });
});
