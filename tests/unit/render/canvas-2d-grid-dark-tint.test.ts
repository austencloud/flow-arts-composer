import { afterEach, describe, expect, it, vi } from "vitest";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const mocks = vi.hoisted(() => ({
  gridImage: { id: "grid" } as unknown as CanvasImageSource,
  nonRadialImage: { id: "non-radial" } as unknown as CanvasImageSource,
}));

vi.mock("$lib/shared/render/services/svg-asset-loader", () => ({
  getSvgAssetLoader: () => ({
    getGridImage: () => mocks.gridImage,
    getNonRadialPointsImage: () => mocks.nonRadialImage,
  }),
}));

import { Canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";

// White at 85% alpha, the color the old `invert(1) opacity(0.85)` filter
// turned the black-on-transparent grid SVGs into.
const DARK_GRID_TINT = "rgba(255, 255, 255, 0.85)";

type DrawGrid = (
  ctx: CanvasRenderingContext2D,
  size: number,
  gridMode: GridMode,
  isDarkMode: boolean,
  showNonRadial: boolean
) => Promise<void>;

function setup() {
  const scratchContexts: {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    globalCompositeOperation: string;
    fillStyle: string;
  }[] = [];

  class MockOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number
    ) {}

    getContext() {
      const scratch = {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        globalCompositeOperation: "source-over",
        fillStyle: "",
      };
      scratchContexts.push(scratch);
      return scratch;
    }
  }

  vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

  const ctx = {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    filter: "none",
  } as unknown as CanvasRenderingContext2D;

  const renderer = new Canvas2DDirectRenderer();
  const drawGrid = (
    renderer as unknown as { drawGrid: DrawGrid }
  ).drawGrid.bind(renderer);

  return { ctx, drawGrid, scratchContexts, MockOffscreenCanvas };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Canvas2DDirectRenderer dark grid", () => {
  // node-canvas (the pictograph CLI and the server render route) ignores
  // ctx.filter, which left dark-mode grid points black on a dark background.
  it("alpha-tints the grid and non-radial points without a canvas filter", async () => {
    const { ctx, drawGrid, scratchContexts, MockOffscreenCanvas } = setup();

    await drawGrid(ctx, 950, GridMode.DIAMOND, true, true);

    expect(ctx.filter).toBe("none");
    expect(scratchContexts).toHaveLength(2);
    const [gridScratch, nonRadialScratch] = scratchContexts;
    expect(gridScratch?.drawImage).toHaveBeenCalledWith(
      mocks.gridImage,
      0,
      0,
      950,
      950
    );
    expect(nonRadialScratch?.drawImage).toHaveBeenCalledWith(
      mocks.nonRadialImage,
      0,
      0,
      950,
      950
    );
    for (const scratch of scratchContexts) {
      expect(scratch.globalCompositeOperation).toBe("source-in");
      expect(scratch.fillStyle).toBe(DARK_GRID_TINT);
      expect(scratch.fillRect).toHaveBeenCalledWith(0, 0, 950, 950);
    }
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.any(MockOffscreenCanvas),
      0,
      0,
      950,
      950,
      0,
      0,
      950,
      950
    );
  });

  it("keeps the box-mode rotation when tinting", async () => {
    const { ctx, drawGrid, scratchContexts } = setup();

    await drawGrid(ctx, 950, GridMode.BOX, true, false);

    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(scratchContexts).toHaveLength(1);
    expect(scratchContexts[0]?.fillStyle).toBe(DARK_GRID_TINT);
    expect(ctx.filter).toBe("none");
  });

  it("draws the grid untinted in light mode", async () => {
    const { ctx, drawGrid, scratchContexts } = setup();

    await drawGrid(ctx, 950, GridMode.DIAMOND, false, false);

    expect(scratchContexts).toHaveLength(0);
    expect(ctx.drawImage).toHaveBeenCalledWith(mocks.gridImage, 0, 0, 950, 950);
    expect(ctx.filter).toBe("none");
  });
});
