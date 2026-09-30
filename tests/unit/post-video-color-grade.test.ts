import { describe, expect, it } from "vitest";
import {
  analyzeVideoColor,
  videoColorFilter,
} from "$lib/shared/media-composition/domain/post-video-color-grade";

function frame(colors: readonly [number, number, number][]): ImageData {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b], index) => {
    data.set([r, g, b, 255], index * 4);
  });
  return {
    data,
    width: colors.length,
    height: 1,
    colorSpace: "srgb",
  } as ImageData;
}

type Rgb = readonly [number, number, number];

/** Evenly spaced grays from `from` to `to`, inclusive. */
function ramp(from: number, to: number, length: number): Rgb[] {
  return Array.from({ length }, (_, index) => {
    const value = Math.round(from + ((to - from) * index) / (length - 1));
    return [value, value, value] as const;
  });
}

/** CSS brightness then contrast, in the same order as videoColorFilter,
 * before the browser clamps to the displayable range. */
function outputLevel(input: number, brightness: number, contrast: number) {
  return ((input / 255) * brightness - 0.5) * contrast + 0.5;
}

function outputChannel(input: number, brightness: number, contrast: number) {
  return Math.round(
    Math.min(255, Math.max(0, outputLevel(input, brightness, contrast))) * 255
  );
}

describe("video auto color", () => {
  it("sinks a hazy black floor to black and keeps the midtones where they were", () => {
    const grade = analyzeVideoColor([
      frame([...ramp(31, 85, 1000), ...ramp(85, 200, 1000)]),
    ]);
    expect(grade.contrast).toBeGreaterThan(1.1);
    expect(outputChannel(0, grade.brightness, grade.contrast)).toBe(0);
    expect(outputChannel(31, grade.brightness, grade.contrast)).toBeLessThan(
      22
    );
    const mid = outputChannel(85, grade.brightness, grade.contrast);
    expect(mid).toBeGreaterThanOrEqual(86);
    expect(mid).toBeLessThanOrEqual(92);
  });

  it("lifts a dim stage without turning its black gray", () => {
    const grade = analyzeVideoColor([
      frame([
        ...ramp(0, 34, 800),
        ...ramp(34, 120, 800),
        ...Array.from({ length: 40 }, () => [255, 40, 15] as const),
      ]),
    ]);
    expect(grade.brightness).toBeLessThanOrEqual(1.2);
    expect(outputChannel(0, grade.brightness, grade.contrast)).toBe(0);
    expect(
      outputChannel(34, grade.brightness, grade.contrast)
    ).toBeGreaterThanOrEqual(37);
  });

  it("brings an overexposed stage down without graying black", () => {
    const grade = analyzeVideoColor([
      frame(Array.from({ length: 400 }, () => [250, 245, 240])),
    ]);
    expect(outputChannel(250, grade.brightness, grade.contrast)).toBeLessThan(
      250
    );
    expect(outputChannel(0, grade.brightness, grade.contrast)).toBe(0);
  });

  it("never clips more than a sliver of a bright scene", () => {
    const pixels = ramp(20, 250, 2000);
    const grade = analyzeVideoColor([frame(pixels)]);
    expect(grade.contrast).toBeGreaterThan(1);
    const clipped = pixels.filter(
      ([v]) => outputLevel(v, grade.brightness, grade.contrast) > 1
    );
    expect(clipped.length / pixels.length).toBeLessThanOrEqual(0.02);
  });

  it("adds colour to dull footage and leaves vivid footage alone", () => {
    const dull = analyzeVideoColor([
      frame(
        ramp(40, 200, 400).map(([v]) => [v, v, Math.min(255, v + 13)] as const)
      ),
    ]);
    const vivid = analyzeVideoColor([
      frame(Array.from({ length: 400 }, () => [200, 60, 40] as const)),
    ]);
    expect(dull.saturation).toBe(1.15);
    expect(vivid.saturation).toBe(1);
  });

  it("returns neutral settings when frames cannot be measured", () => {
    expect(analyzeVideoColor([])).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
    });
    expect(videoColorFilter(null)).toBe("none");
    expect(
      videoColorFilter({ brightness: 1, contrast: 1, saturation: 1 })
    ).toBe("none");
  });

  it("uses the same filter expression for preview and export", () => {
    expect(
      videoColorFilter({
        brightness: 0.75,
        contrast: 1.25,
        saturation: 0.5,
        hue: -90,
      })
    ).toBe("brightness(0.75) contrast(1.25) saturate(0.5) hue-rotate(-90deg)");
    expect(
      videoColorFilter({ brightness: 1.2, contrast: 1.06, saturation: 1 })
    ).toBe("brightness(1.2) contrast(1.06) saturate(1) hue-rotate(0deg)");
  });
});
