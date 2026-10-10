import { describe, it, expect } from "vitest";
import {
  BUILT_IN_PRESETS,
  type IPatternPreset,
} from "#lib/shared/poi/domain/pattern-presets.js";
import {
  getPixel,
  type PatternParams,
} from "#lib/shared/poi/domain/strip-pattern.js";
import { stripPatternToImageData } from "#lib/shared/poi/domain/strip-pattern-image.js";

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
    primaryColor: { r: 0, g: 255, b: 136 },
    secondaryColor: { r: 59, g: 130, b: 246 },
    speed: 1,
    brightness: 1,
    ...overrides,
  };
}

const LED_COUNT = 32;
const FRAME_COUNT = 64;

function generateAll(): Map<string, ReturnType<IPatternPreset["generate"]>> {
  const params = defaultParams();
  const byId = new Map<string, ReturnType<IPatternPreset["generate"]>>();
  for (const preset of BUILT_IN_PRESETS) {
    byId.set(preset.id, preset.generate(LED_COUNT, FRAME_COUNT, params));
  }
  return byId;
}

/** All bytes across every frame, concatenated, for a cheap identity comparison. */
function flattenBytes(pattern: ReturnType<IPatternPreset["generate"]>): Uint8Array {
  const out = new Uint8Array(pattern.frameCount * pattern.ledCount * 3);
  let offset = 0;
  for (const frame of pattern.frames) {
    out.set(frame.colors, offset);
    offset += frame.colors.length;
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Start index of chase's contiguous lit block: the lit LED whose circular
 * predecessor is unlit. Unambiguous even when the block wraps past the
 * end of the strip, unlike scanning for "the first lit LED".
 */
function chaseHeadIndex(pattern: ReturnType<IPatternPreset["generate"]>, frameIndex: number): number {
  const ledCount = pattern.ledCount;
  const lit = Array.from({ length: ledCount }, (_, led) => {
    const px = getPixel(pattern, frameIndex, led);
    return px.r > 0 || px.g > 0 || px.b > 0;
  });
  for (let led = 0; led < ledCount; led++) {
    const prev = (led - 1 + ledCount) % ledCount;
    if (lit[led] && !lit[prev]) return led;
  }
  return -1;
}

/**
 * Index of comet's single full-brightness head pixel (the only LED whose
 * intensity ties the frame's max — the tail is strictly dimmer).
 */
function cometHeadIndex(pattern: ReturnType<IPatternPreset["generate"]>, frameIndex: number): number {
  let best = -1;
  let bestBrightness = -1;
  for (let led = 0; led < pattern.ledCount; led++) {
    const px = getPixel(pattern, frameIndex, led);
    const brightness = px.r + px.g + px.b;
    if (brightness > bestBrightness) {
      bestBrightness = brightness;
      best = led;
    }
  }
  return best;
}

/**
 * Checks that a sweeping pattern's head moves by a consistent step size
 * frame-to-frame, INCLUDING the wrap from the last real frame back to
 * frame 0 (which is what playback does once elapsed time exceeds one
 * loop, via getPixel's frameCount modulo). A seam shows up as a wrap step
 * wildly different from the interior steps.
 */
function assertSeamlessSweep(
  pattern: ReturnType<IPatternPreset["generate"]>,
  headIndexOf: (pattern: ReturnType<IPatternPreset["generate"]>, frameIndex: number) => number
): void {
  const ledCount = pattern.ledCount;
  const heads = Array.from({ length: pattern.frameCount }, (_, f) => headIndexOf(pattern, f));
  const circularStep = (from: number, to: number) => ((to - from) % ledCount + ledCount) % ledCount;

  const interiorSteps: number[] = [];
  for (let f = 0; f < heads.length - 1; f++) {
    interiorSteps.push(circularStep(heads[f]!, heads[f + 1]!));
  }
  const wrapStep = circularStep(heads[heads.length - 1]!, heads[0]!);

  const avgInterior = interiorSteps.reduce((a, b) => a + b, 0) / interiorSteps.length;

  // Allow rounding slack (integer LED positions), but the wrap step must
  // land within one LED of the average interior step - not an arbitrary
  // jump - to count as seamless.
  expect(Math.abs(wrapStep - avgInterior)).toBeLessThanOrEqual(1);
}

describe("BUILT_IN_PRESETS", () => {
  it("includes chase and comet alongside the original five", () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "solid",
      "gradient",
      "rainbow-sweep",
      "pulse",
      "prop-colors",
      "chase",
      "comet",
    ]);
  });

  it("every generator produces a pattern with the requested dimensions and byte lengths", () => {
    const params = defaultParams();
    for (const preset of BUILT_IN_PRESETS) {
      const pattern = preset.generate(LED_COUNT, FRAME_COUNT, params);
      expect(pattern.ledCount).toBe(LED_COUNT);
      expect(pattern.frameCount).toBe(FRAME_COUNT);
      expect(pattern.frames).toHaveLength(FRAME_COUNT);
      for (const frame of pattern.frames) {
        expect(frame.colors).toHaveLength(LED_COUNT * 3);
      }
    }
  });

  it("no two generators produce byte-identical frame data for default params", () => {
    const patterns = generateAll();
    const entries = [...patterns.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, patternA] = entries[i]!;
        const [idB, patternB] = entries[j]!;
        const equal = bytesEqual(flattenBytes(patternA), flattenBytes(patternB));
        expect(equal, `${idA} vs ${idB} produced identical bytes`).toBe(false);
      }
    }
  });

  describe("chase", () => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === "chase")!;

    it("lights a hard-edged block covering roughly 15% of the strip", () => {
      const pattern = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams());
      const litCount = Array.from({ length: LED_COUNT }, (_, led) => {
        const px = getPixel(pattern, 0, led);
        return px.r > 0 || px.g > 0 || px.b > 0 ? 1 : 0;
      }).reduce((a, b) => a + b, 0);
      const expected = Math.max(1, Math.round(LED_COUNT * 0.15));
      expect(litCount).toBe(expected);
    });

    it("loops seamlessly: the head advances at a constant rate through the wrap", () => {
      const pattern = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams());
      assertSeamlessSweep(pattern, chaseHeadIndex);
    });
  });

  describe("comet", () => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === "comet")!;

    it("has a single full-brightness head and a decaying tail", () => {
      const pattern = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams());
      const brightnesses = Array.from({ length: LED_COUNT }, (_, led) => {
        const px = getPixel(pattern, 0, led);
        return px.r + px.g + px.b;
      });
      const maxBrightness = Math.max(...brightnesses);
      const headCount = brightnesses.filter((b) => b === maxBrightness).length;
      expect(headCount).toBe(1);

      // Some pixels should be lit but dimmer than the head (the tail).
      const dimLit = brightnesses.filter((b) => b > 0 && b < maxBrightness);
      expect(dimLit.length).toBeGreaterThan(0);
    });

    it("reads differently from chase (has a tail) and pulse (hard head, no sine)", () => {
      const params = defaultParams();
      const comet = preset.generate(LED_COUNT, FRAME_COUNT, params);
      const chase = BUILT_IN_PRESETS.find((p) => p.id === "chase")!.generate(
        LED_COUNT,
        FRAME_COUNT,
        params
      );
      const pulse = BUILT_IN_PRESETS.find((p) => p.id === "pulse")!.generate(
        LED_COUNT,
        FRAME_COUNT,
        params
      );
      expect(bytesEqual(flattenBytes(comet), flattenBytes(chase))).toBe(false);
      expect(bytesEqual(flattenBytes(comet), flattenBytes(pulse))).toBe(false);
    });

    it("loops seamlessly: the head advances at a constant rate through the wrap", () => {
      const pattern = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams());
      assertSeamlessSweep(pattern, cometHeadIndex);
    });
  });

  describe("brightness", () => {
    it("every generator respects params.brightness (dimmer output at brightness=0.5)", () => {
      for (const preset of BUILT_IN_PRESETS) {
        const full = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams({ brightness: 1 }));
        const half = preset.generate(LED_COUNT, FRAME_COUNT, defaultParams({ brightness: 0.5 }));

        let fullTotal = 0;
        let halfTotal = 0;
        for (let led = 0; led < LED_COUNT; led++) {
          const pf = getPixel(full, 0, led);
          const ph = getPixel(half, 0, led);
          fullTotal += pf.r + pf.g + pf.b;
          halfTotal += ph.r + ph.g + ph.b;
        }
        expect(halfTotal, `${preset.id} did not dim under brightness=0.5`).toBeLessThanOrEqual(
          fullTotal
        );
        if (fullTotal > 0) {
          expect(halfTotal, `${preset.id} brightness=0.5 produced no dimming`).toBeLessThan(
            fullTotal
          );
        }
      }
    });
  });
});

describe("stripPatternToImageData", () => {
  it("round-trips: ImageData pixel (frame, led) matches getPixel(pattern, frame, led)", () => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === "gradient")!;
    const pattern = preset.generate(8, 4, defaultParams());
    const imageData = stripPatternToImageData(pattern);

    expect(imageData.width).toBe(4);
    expect(imageData.height).toBe(8);

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
