/**
 * The fused Elemental/TnD glyph in Node renders (pictograph CLI, server
 * route). Node has no createImageBitmap and node-canvas cannot decode the
 * WebP the browser draws, so the glyph must come from the PNG that ships
 * beside each WebP, decoded by node-canvas.
 *
 * node-canvas is mocked: its native binary is not guaranteed in CI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const mocks = vi.hoisted(() => ({
  loadImage: vi.fn(),
}));

vi.mock("canvas", () => ({
  loadImage: mocks.loadImage,
}));

import {
  drawElementalGlyph,
  drawPropElementalGlyph,
} from "$lib/shared/render/services/canvas-2d-glyph-renderer";
import { derivePropElementalTypeForStep } from "$lib/shared/shape-matrix/domain/prop-relationship";

/** Letter A at alpha3: w to n and e to s, split-same, the Water element. */
const letterA = {
  id: "pictograph-A",
  letter: "A",
  motions: {
    [HandSide.LEFT]: createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.NORTH,
    }),
    [HandSide.RIGHT]: createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
    }),
  },
} as unknown as PictographData;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("elemental glyph without createImageBitmap (Node)", () => {
  it.each([false, true])(
    "draws the PNG sibling decoded by node-canvas (dark mode %s)",
    async (isDarkMode) => {
      vi.stubGlobal("createImageBitmap", undefined);
      const decoded = { width: 1000, height: 1000 };
      mocks.loadImage.mockResolvedValue(decoded);

      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
        filter: "none",
      } as unknown as CanvasRenderingContext2D;

      await drawElementalGlyph(ctx, letterA, GridMode.DIAMOND, 950, isDarkMode);

      expect(mocks.loadImage).toHaveBeenCalledTimes(1);
      const loadedPath = String(mocks.loadImage.mock.calls[0]?.[0]).replace(
        /\\/g,
        "/"
      );
      expect(loadedPath).toMatch(/\/static\/images\/elements\/water-v2\.png$/);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ctx.drawImage).mock.calls[0]?.[0]).toBe(decoded);
      expect(ctx.filter).toBe("none");
    }
  );

  it("draws the prop-path glyph from its PNG sibling", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const decoded = { width: 1000, height: 1000 };
    mocks.loadImage.mockResolvedValue(decoded);

    // Same hand paths as letter A, one clockwise turn each: a full prop
    // relationship, so the step carries a prop element.
    const withTurns = {
      ...letterA,
      motions: {
        [HandSide.LEFT]: {
          ...letterA.motions[HandSide.LEFT],
          rotationDirection: RotationDirection.CLOCKWISE,
          turns: 1,
        },
        [HandSide.RIGHT]: {
          ...letterA.motions[HandSide.RIGHT],
          rotationDirection: RotationDirection.CLOCKWISE,
          turns: 1,
        },
      },
    } as unknown as PictographData;
    const element = derivePropElementalTypeForStep(withTurns);
    expect(element).not.toBeNull();

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    await drawPropElementalGlyph(ctx, withTurns, 950);

    expect(mocks.loadImage).toHaveBeenCalledTimes(1);
    const loadedPath = String(mocks.loadImage.mock.calls[0]?.[0]).replace(
      /\\/g,
      "/"
    );
    expect(loadedPath).toMatch(/\/static\/images\/elements\/[a-z]+-v\d\.png$/);
    expect(vi.mocked(ctx.drawImage).mock.calls[0]?.[0]).toBe(decoded);
  });
});

describe("elemental glyph with createImageBitmap (browser, worker)", () => {
  it("decodes the WebP itself and never touches node-canvas", async () => {
    const bitmap = { width: 1000, height: 1000 };
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    await drawElementalGlyph(ctx, letterA, GridMode.DIAMOND, 950, false);

    expect(fetchSpy).toHaveBeenCalledWith("/images/elements/water-v2.webp");
    expect(decode).toHaveBeenCalledTimes(1);
    expect(mocks.loadImage).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.drawImage).mock.calls[0]?.[0]).toBe(bitmap);
  });
});
