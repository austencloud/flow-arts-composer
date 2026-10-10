import { afterEach, describe, expect, it, vi } from "vitest";
import { DARK_MONOCHROME_IMAGE_COLOR } from "@tka/render-composition";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";

const mocks = vi.hoisted(() => ({
  getLetterAsset: vi.fn(),
}));

vi.mock("#lib/shared/render/services/svg-asset-loader.js", () => ({
  getSvgAssetLoader: () => ({
    getLetterAsset: mocks.getLetterAsset,
  }),
}));

import { drawTKAGlyph } from "#lib/shared/render/services/canvas-2d-glyph-renderer.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("dark Choreo Card cell glyph contrast", () => {
  it.each([
    Letter.G,
    Letter.H,
    Letter.I,
    Letter.S,
    Letter.T,
    Letter.U,
    Letter.V,
  ])("alpha-tints the %s glyph without a canvas filter", async (letter) => {
    const scratchContext = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      globalCompositeOperation: "source-over",
      fillStyle: "",
    };

    class MockOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number
      ) {}

      getContext() {
        return scratchContext;
      }
    }

    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
    mocks.getLetterAsset.mockResolvedValue({
      image: {} as CanvasImageSource,
      dimensions: { width: 80, height: 100 },
    });

    const ctx = {
      drawImage: vi.fn(),
      filter: "none",
    } as unknown as CanvasRenderingContext2D;

    await drawTKAGlyph(ctx, letter, 950, true);

    expect(scratchContext.globalCompositeOperation).toBe("source-in");
    expect(scratchContext.fillStyle).toBe(DARK_MONOCHROME_IMAGE_COLOR);
    expect(scratchContext.fillRect).toHaveBeenCalledWith(0, 0, 80, 100);
    expect(ctx.filter).toBe("none");
    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.any(MockOffscreenCanvas),
      0,
      0,
      80,
      100,
      50,
      800,
      80,
      100
    );
  });
});
