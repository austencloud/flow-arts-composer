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

describe("video auto color", () => {
  it("gently lifts a dark clip without chasing bright LED pixels", () => {
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
    expect(grade.brightness).toBeGreaterThan(1);
    expect(grade.brightness).toBeLessThanOrEqual(1.25);
    expect(grade.contrast).toBeLessThan(1);
    expect(grade.saturation).toBeLessThanOrEqual(1.06);
  });

  it("keeps a clipped bright stage from getting brighter", () => {
    const grade = analyzeVideoColor([
      frame(Array.from({ length: 400 }, () => [250, 245, 240])),
    ]);
    expect(grade.brightness).toBeLessThan(1);
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
