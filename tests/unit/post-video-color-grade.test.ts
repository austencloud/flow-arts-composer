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

/** CSS brightness then contrast, in the same order as videoColorFilter. */
function outputChannel(input: number, brightness: number, contrast: number) {
  return Math.round(
    Math.min(
      255,
      Math.max(0, ((input / 255) * brightness - 0.5) * contrast + 0.5) * 255
    )
  );
}

describe("video auto color", () => {
  it("keeps black and a gray curtain dark under bright LED pixels", () => {
    const pixels: [number, number, number][] = Array.from(
      { length: 300 },
      () => [35, 32, 31]
    );
    pixels.push(
      ...Array.from(
        { length: 20 },
        () => [255, 40, 15] as [number, number, number]
      )
    );
    const grade = analyzeVideoColor([frame(pixels)]);
    expect(outputChannel(0, grade.brightness, grade.contrast)).toBe(0);
    expect(
      outputChannel(35, grade.brightness, grade.contrast)
    ).toBeLessThanOrEqual(35);
    expect(
      outputChannel(40, grade.brightness, grade.contrast)
    ).toBeLessThanOrEqual(40);
    expect(grade.saturation).toBe(1);
  });

  it("darkens a clipped bright stage without turning black gray", () => {
    const grade = analyzeVideoColor([
      frame(Array.from({ length: 400 }, () => [250, 245, 240])),
    ]);
    expect(outputChannel(250, grade.brightness, grade.contrast)).toBeLessThan(
      250
    );
    expect(outputChannel(0, grade.brightness, grade.contrast)).toBe(0);
  });

  it("deepens the shadows of a washed-out scene while retaining its highlights", () => {
    const grade = analyzeVideoColor([
      frame([
        ...Array.from({ length: 200 }, () => [65, 65, 65] as const),
        ...Array.from({ length: 200 }, () => [180, 180, 180] as const),
      ]),
    ]);
    const low = outputChannel(65, grade.brightness, grade.contrast);
    const high = outputChannel(180, grade.brightness, grade.contrast);
    expect(low).toBeLessThan(65);
    expect(high).toBeGreaterThanOrEqual(180);
    expect(high).toBeLessThan(250);
  });

  it("leaves a scene with a full tonal range neutral", () => {
    const grade = analyzeVideoColor([
      frame([
        ...Array.from({ length: 100 }, () => [0, 0, 0] as const),
        ...Array.from({ length: 200 }, () => [128, 128, 128] as const),
        ...Array.from({ length: 100 }, () => [240, 240, 240] as const),
      ]),
    ]);
    expect(grade).toEqual({ brightness: 1, contrast: 1, saturation: 1 });
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
