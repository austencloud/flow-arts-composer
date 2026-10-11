import { describe, expect, it, vi } from "vitest";

const { generatePropSvg } = vi.hoisted(() => ({
  generatePropSvg: vi.fn(async () => ({
    svg: '<svg viewBox="0 0 300 150"></svg>',
    width: 300,
    height: 150,
  })),
}));

vi.mock("#lib/shared/animation-engine/services/svg-generator.js", () => ({
  generatePropSvg,
  generateLeftPropSvg: generatePropSvg,
  generateRightPropSvg: generatePropSvg,
  generateGridSvg: async () => "<svg></svg>",
}));

import { Canvas2DImageLoader } from "../canvas-2d-image-loader";

describe("Canvas2DImageLoader custom-colored model sprites", () => {
  it("picks each hand's capture by hand, not by how red its custom color is", async () => {
    const loader = new Canvas2DImageLoader();
    vi.spyOn(
      loader as unknown as {
        createPropImageFromSVG: () => Promise<HTMLImageElement>;
      },
      "createPropImageFromSVG"
    ).mockResolvedValue({} as HTMLImageElement);

    // An orange left hand and a violet right hand would otherwise swap the
    // blue and red captures.
    await loader.loadPerColorPropImages(
      "doublestar__model",
      "doublestar__model",
      true,
      { left: "#f97316", right: "#8b5cf6" }
    );

    expect(generatePropSvg).toHaveBeenCalledWith(
      "doublestar__model",
      "#f97316",
      "dark",
      "left"
    );
    expect(generatePropSvg).toHaveBeenCalledWith(
      "doublestar__model",
      "#8b5cf6",
      "dark",
      "right"
    );
  });
});
