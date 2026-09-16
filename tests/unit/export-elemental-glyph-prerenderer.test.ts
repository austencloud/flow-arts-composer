import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const imageCacheMocks = vi.hoisted(() => ({
  getImageFromUrl: vi.fn(),
}));

vi.mock("$lib/shared/render/services/svg-image-cache", () => ({
  getSvgImageCache: () => imageCacheMocks,
}));

import { ExportGlyphPrerenderer } from "$lib/shared/animation-engine/services/export-glyph-prerenderer";

function createStep(letter: typeof Letter.A | typeof Letter.W): StepData {
  return {
    letter,
    startPlacement: null,
    endPlacement: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: createMotionData({
        hand: HandSide.LEFT,
        motionType: MotionType.PRO,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.NORTH,
      }),
      right: createMotionData({
        hand: HandSide.RIGHT,
        motionType: MotionType.PRO,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.SOUTH,
      }),
    },
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  } as unknown as StepData;
}

describe("ExportGlyphPrerenderer elemental assets", () => {
  beforeEach(() => {
    imageCacheMocks.getImageFromUrl.mockReset();
    imageCacheMocks.getImageFromUrl.mockResolvedValue({
      width: 200,
      height: 100,
    });
  });

  it("decodes each eligible element once and maps it back to its step", async () => {
    const prerenderer = new ExportGlyphPrerenderer(
      {} as ConstructorParameters<typeof ExportGlyphPrerenderer>[0]
    );

    await prerenderer.prerenderElementalGlyphs([
      createStep(Letter.A),
      createStep(Letter.A),
    ]);

    expect(imageCacheMocks.getImageFromUrl).toHaveBeenCalledOnce();
    expect(imageCacheMocks.getImageFromUrl).toHaveBeenCalledWith(
      "/images/elements/water-v2.webp"
    );
    expect(prerenderer.getElementalGlyphForStep(0)).toMatchObject({
      sourceWidth: 200,
      sourceHeight: 100,
    });
    expect(prerenderer.getElementalGlyphForStep(1)).toBe(
      prerenderer.getElementalGlyphForStep(0)
    );
  });

  it("excludes non-Type-1 letters even when their geometry is classifiable", async () => {
    const prerenderer = new ExportGlyphPrerenderer(
      {} as ConstructorParameters<typeof ExportGlyphPrerenderer>[0]
    );

    await prerenderer.prerenderElementalGlyphs([createStep(Letter.W)]);

    expect(imageCacheMocks.getImageFromUrl).not.toHaveBeenCalled();
    expect(prerenderer.getElementalGlyphForStep(0)).toBeNull();
  });
});
