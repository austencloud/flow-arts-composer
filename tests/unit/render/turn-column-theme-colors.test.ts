/**
 * Canvas turn numbers take the hand color for the theme they are drawn in,
 * the same palette the arrows and props use. Light mode is the darker pair,
 * dark mode the brighter one. TurnsColumn.svelte already does this; the two
 * canvas paths used the dark pair in both themes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";

const mocks = vi.hoisted(() => ({
  getTurnNumberImage: vi.fn(),
}));

vi.mock("$lib/shared/render/services/svg-asset-loader", () => ({
  getSvgAssetLoader: () => ({
    getTurnNumberImage: mocks.getTurnNumberImage,
  }),
}));

import { drawTurnsColumn } from "$lib/shared/render/services/canvas-2d-glyph-renderer";
import { LayerCompositor } from "$lib/shared/render/services/layer-compositor";

/** Letter A at alpha3 with one turn per hand: blue on top, red below. */
const letterA = {
  id: "pictograph-A",
  letter: "A",
  motions: {
    [HandSide.LEFT]: createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.NORTH,
      turns: 1,
    }),
    [HandSide.RIGHT]: createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      turns: 1,
    }),
  },
} as unknown as PictographData;

const TURNS = "(s, 1, 1)";
const LETTER_DIMENSIONS = { width: 80, height: 100 };

/**
 * drawTintedImage recolors through a scratch OffscreenCanvas; the color it
 * fills with is the color the number is drawn in. Records one per number.
 */
function captureTintColors(): string[] {
  const colors: string[] = [];
  const scratch = {
    drawImage: vi.fn(),
    globalCompositeOperation: "source-over",
    fillStyle: "",
    fillRect: vi.fn(() => {
      colors.push(scratch.fillStyle);
    }),
  };
  class MockOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number
    ) {}
    getContext() {
      return scratch;
    }
  }
  vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
  mocks.getTurnNumberImage.mockResolvedValue({} as CanvasImageSource);
  return colors;
}

function mockContext(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    fillText: vi.fn(),
    filter: "none",
  } as unknown as CanvasRenderingContext2D;
}

const EXPECTED = {
  light: [getMotionColor(HandSide.LEFT, "light"), getMotionColor(HandSide.RIGHT, "light")],
  dark: [getMotionColor(HandSide.LEFT, "dark"), getMotionColor(HandSide.RIGHT, "dark")],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("canvas pictograph turn column", () => {
  it.each([
    ["light", false],
    ["dark", true],
  ] as const)("draws %s-mode hand colors", async (mode, isDarkMode) => {
    const colors = captureTintColors();

    await drawTurnsColumn(mockContext(), letterA, LETTER_DIMENSIONS, 1, isDarkMode, TURNS);

    expect(colors).toEqual(EXPECTED[mode]);
  });

  it("keeps a custom prop color over the theme color", async () => {
    const colors = captureTintColors();

    await drawTurnsColumn(mockContext(), letterA, LETTER_DIMENSIONS, 1, false, TURNS, {
      primaryPropColors: { left: "#00AA55", right: "#AA5500" },
    });

    expect(colors).toEqual(["#00AA55", "#AA5500"]);
  });
});

describe("layer compositor turn column (image export, card fronts)", () => {
  it.each([
    ["light", false],
    ["dark", true],
  ] as const)("draws %s-mode hand colors", async (mode, isDarkMode) => {
    const colors = captureTintColors();
    const compositor = new LayerCompositor() as unknown as {
      drawTurnsColumn: (
        ctx: CanvasRenderingContext2D,
        pictograph: PictographData,
        letterDimensions: { width: number; height: number },
        scale: number,
        darkMode: boolean,
        turnsTuple: string
      ) => Promise<void>;
    };

    await compositor.drawTurnsColumn(
      mockContext(),
      letterA,
      LETTER_DIMENSIONS,
      1,
      isDarkMode,
      TURNS
    );

    expect(colors).toEqual(EXPECTED[mode]);
  });
});
