import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedPictographData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const { getImage, drawElementWithTransform } = vi.hoisted(() => ({
  getImage: vi.fn(async () => ({ width: 100, height: 100 })),
  drawElementWithTransform: vi.fn(),
}));

vi.mock("#lib/shared/render/services/svg-image-cache.js", () => ({
  getSvgImageCache: () => ({ getImage }),
}));

vi.mock(
  "#lib/shared/render/services/canvas-2d-transform-helper.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("#lib/shared/render/services/canvas-2d-transform-helper.js")
      >();
    return { ...original, drawElementWithTransform };
  }
);

import { Canvas2DDirectRenderer } from "#lib/shared/render/services/canvas-2d-direct-renderer.js";

const arrowAsset = {
  imageSrc: '<path d="M0 0 L10 10" />',
  viewBox: { width: 100, height: 100, fullViewBox: "0 0 100 100" },
  center: { x: 50, y: 50 },
};

const prepared = {
  _prepared: {
    gridMode: "diamond",
    arrowPositions: {
      [HandSide.LEFT]: { x: 300, y: 475, rotation: 0 },
      [HandSide.RIGHT]: { x: 650, y: 475, rotation: 180 },
    },
    arrowAssets: {
      [HandSide.LEFT]: arrowAsset,
      [HandSide.RIGHT]: arrowAsset,
    },
    arrowMirroring: {
      [HandSide.LEFT]: false,
      [HandSide.RIGHT]: true,
    },
    propPositions: {},
    propAssets: {},
  },
} as unknown as PreparedPictographData;

describe("Canvas2DDirectRenderer arrow hand identity", () => {
  beforeEach(() => {
    getImage.mockClear();
    drawElementWithTransform.mockClear();
  });

  it("draws arrows stored under canonical left/right keys", async () => {
    const renderer = new Canvas2DDirectRenderer();
    await (
      renderer as unknown as {
        drawArrows(
          context: CanvasRenderingContext2D,
          data: NonNullable<PreparedPictographData["_prepared"]>,
          size: number,
          options: { visibility: Record<string, boolean> }
        ): Promise<void>;
      }
    ).drawArrows({} as CanvasRenderingContext2D, prepared._prepared!, 950, {
      visibility: { darkMode: true },
    });

    expect(getImage).toHaveBeenCalledTimes(2);
    expect(drawElementWithTransform).toHaveBeenCalledTimes(2);
    expect(drawElementWithTransform).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ x: 300, y: 475, shouldMirror: false })
    );
    expect(drawElementWithTransform).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ x: 650, y: 475, shouldMirror: true })
    );
  });

  it("respects per-hand visibility with canonical keys", async () => {
    const renderer = new Canvas2DDirectRenderer();
    await (
      renderer as unknown as {
        drawArrows(
          context: CanvasRenderingContext2D,
          data: NonNullable<PreparedPictographData["_prepared"]>,
          size: number,
          options: { visibility: Record<string, boolean> }
        ): Promise<void>;
      }
    ).drawArrows({} as CanvasRenderingContext2D, prepared._prepared!, 950, {
      visibility: { showLeftMotion: false, showRightMotion: true },
    });

    expect(drawElementWithTransform).toHaveBeenCalledTimes(1);
    expect(drawElementWithTransform).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ x: 650, y: 475 })
    );
  });
});
