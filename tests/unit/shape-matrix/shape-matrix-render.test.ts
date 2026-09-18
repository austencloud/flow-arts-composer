/**
 * The Shape Matrix stills are painted by the animation canvas's guide
 * painter. These tests pin the contract that makes a tile and the live guide
 * the same drawing: the animator's colors and stroke, an exact-size raster at
 * the device pixel ratio, and the engine-aligned scale for the hero floor.
 */
import { describe, expect, it, vi } from "vitest";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "$lib/shared/mandala/domain/mandala-overlay-types";
import type { MandalaGuideImageDependencies } from "$lib/shared/mandala/services/mandala-guide-image";
import type {
  MandalaGuidePaintOptions,
  MandalaGuidePaintTarget,
} from "$lib/shared/mandala/services/mandala-guide-painter";
import { mandalaGuideScale } from "$lib/shared/mandala/services/mandala-guide-image";
import { computeEngineAlignedMandalaScale } from "$lib/shared/mandala/services/mandala-path-preparer";
import type { PreparedMandalaPath } from "$lib/shared/mandala/services/types";
import { HERO_TRAIL_PRESET } from "$lib/shared/landing/data/hero-trail-preset";
import {
  engineExtentBoxRatio,
  renderCell,
  renderEngineAligned,
  renderExtentFit,
  renderHeader,
  SHAPE_MATRIX_GUIDE_COLORS,
} from "$lib/shared/shape-matrix/services/shape-matrix-render";
import {
  cellArtworkSrc,
  shapeMatrixArtworkPainterForColors,
  type ShapeMatrixArtworkPainter,
} from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
import type { ShapeMatrixData } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const left: MandalaPaths = {
  left: [{ d: "M 0 0 C 10 0 10 10 20 10", tipIndex: 0 }],
  right: [],
  purple: [],
};

const right: MandalaPaths = {
  left: [],
  right: [{ d: "M 0 0 C -10 0 -10 -10 -20 -10", tipIndex: 0 }],
  purple: [],
};

const flower: Flower = {
  style: "pro",
  turns: 0,
  ori: "in",
  grid: "diamond",
  petals: 0,
};

const matrixData: ShapeMatrixData = {
  axis: [flower],
  left: new Map([["pro-0-in-diamond", left]]),
  right: new Map([["pro-0-in-diamond", right]]),
  props: { left: PropType.STAFF, right: PropType.STAFF },
  tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
  reach: { left: 100, right: 100 },
  clubTipDx: 100,
  geometryKey: "arc:tips",
};

interface Captured {
  target: MandalaGuidePaintTarget;
  options: MandalaGuidePaintOptions;
}

function harness() {
  const calls: Captured[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({})),
    toDataURL: vi.fn(() => "data:image/png;base64,painted"),
  };
  const deps: MandalaGuideImageDependencies = {
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    prepare: (svgPaths, color, hand): PreparedMandalaPath[] =>
      svgPaths.map(() => ({
        path2d: {} as Path2D,
        totalLength: 1,
        color,
        hand,
      })),
    paint: (target, options) => {
      calls.push({ target, options });
    },
  };
  return { calls, canvas, deps };
}

describe("shape matrix stills use the animator's guide painter", () => {
  it("paints with the animator's hand colors and stroke", () => {
    expect(SHAPE_MATRIX_GUIDE_COLORS.left).toBe(HERO_TRAIL_PRESET.leftColor);
    expect(SHAPE_MATRIX_GUIDE_COLORS.right).toBe(HERO_TRAIL_PRESET.rightColor);

    const { calls, deps } = harness();
    renderCell(left, right, 128, 100, { dpr: 1, deps });
    const [call] = calls;
    expect(call?.options.strokeWidth).toBe(
      DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth
    );
    expect(call?.options.paths.map((p) => [p.hand, p.color])).toEqual([
      ["left", HERO_TRAIL_PRESET.leftColor],
      ["right", HERO_TRAIL_PRESET.rightColor],
    ]);
    expect(call?.options.reveal ?? false).toBe(false);
  });

  it("accepts the selected hand colors for both strokes", () => {
    const { calls, deps } = harness();
    renderCell(left, right, 128, 100, {
      dpr: 1,
      deps,
      colors: { left: "#00aa00", right: "#ffee00" },
    });
    expect(
      calls[0]?.options.paths.map((path) => [path.hand, path.color])
    ).toEqual([
      ["left", "#00aa00"],
      ["right", "#ffee00"],
    ]);
  });

  it("repaints a cached tile when its painter palette changes", () => {
    const cell = vi.fn(() => "data:image/png;base64,palette");
    const painter: ShapeMatrixArtworkPainter = {
      cacheKey: "palette:#00aa00|#ffee00",
      cell,
      header: vi.fn(() => ""),
    };

    cellArtworkSrc(matrixData, flower, flower, 128, painter);
    cellArtworkSrc(matrixData, flower, flower, 128, painter);
    expect(cell).toHaveBeenCalledTimes(1);

    painter.cacheKey = "palette:#ed1c24|#2e3192";
    cellArtworkSrc(matrixData, flower, flower, 128, painter);
    expect(cell).toHaveBeenCalledTimes(2);
  });

  it("does not reuse an arc raster for another path geometry", () => {
    const cell = vi.fn(() => "data:image/png;base64,geometry");
    const painter: ShapeMatrixArtworkPainter = {
      cacheKey: "geometry",
      cell,
      header: vi.fn(() => ""),
    };

    cellArtworkSrc(matrixData, flower, flower, 128, painter);
    cellArtworkSrc(
      { ...matrixData, geometryKey: "concave:hands" },
      flower,
      flower,
      128,
      painter
    );

    expect(cell).toHaveBeenCalledTimes(2);
  });

  it("keeps a painter's palette identity when reactive settings mutate", () => {
    const colors = { left: "#00aa00", right: "#ffee00" };
    const painter = shapeMatrixArtworkPainterForColors(colors);

    colors.left = "#ed1c24";
    expect(painter.cacheKey).toBe("palette:#00aa00|#ffee00");
    expect(shapeMatrixArtworkPainterForColors(colors)).not.toBe(painter);
  });

  it("rasterizes at the exact requested size and device pixel ratio", () => {
    const { calls, canvas, deps } = harness();
    const url = renderCell(left, right, 150, 100, { dpr: 2, deps });
    expect(url).toBe("data:image/png;base64,painted");
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
    expect(calls[0]?.target).toMatchObject({
      pixelWidth: 300,
      pixelHeight: 300,
      dpr: 2,
    });
  });

  it("paints a cell filling its tile (extent fit)", () => {
    const { calls, deps } = harness();
    renderCell(left, right, 128, 100, { dpr: 1, deps });
    const merged: MandalaPaths = {
      left: left.left,
      right: right.right,
      purple: [],
    };
    expect(calls[0]?.options.scale).toBeCloseTo(
      mandalaGuideScale(merged, {
        size: 128,
        fit: "extent",
        show: "both",
        tipDx: 100,
      }),
      10
    );
  });

  it("paints a header filling its box like the cells", () => {
    const { calls, deps } = harness();
    renderHeader(left, "left", 128, 100, { dpr: 1, deps });
    expect(calls[0]?.options.scale).toBeCloseTo(
      mandalaGuideScale(left, {
        size: 128,
        fit: "extent",
        show: "left",
        tipDx: 100,
      }),
      10
    );
  });

  it("sizes the hero's extent box so its drawing is the engine's drawing in the full square", () => {
    const merged: MandalaPaths = {
      left: left.left,
      right: right.right,
      purple: [],
    };
    const ratio = engineExtentBoxRatio(merged, 100);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    for (const square of [64, 228, 470, 1400]) {
      const { calls, deps } = harness();
      renderExtentFit(merged, square * ratio, 100, { dpr: 1, deps });
      expect(calls[0]?.options.scale).toBeCloseTo(
        computeEngineAlignedMandalaScale(square),
        10
      );
    }
    // The ratio does not depend on the square: both fits are linear.
    expect(
      computeEngineAlignedMandalaScale(1000) /
        mandalaGuideScale(merged, {
          size: 1000,
          fit: "extent",
          show: "both",
          tipDx: 100,
        })
    ).toBeCloseTo(ratio, 12);
  });

  it("paints a header with only its own hand", () => {
    const { calls, deps } = harness();
    renderHeader(left, "left", 128, 100, { dpr: 1, deps });
    expect(calls[0]?.options.paths.map((p) => p.hand)).toEqual(["left"]);
  });

  it("aligns the hero floor to the engine hand orbit for its square", () => {
    const { calls, deps } = harness();
    const merged: MandalaPaths = {
      left: left.left,
      right: right.right,
      purple: [],
    };
    renderEngineAligned(merged, 470, { dpr: 1, deps });
    expect(calls[0]?.options.scale).toBeCloseTo(
      computeEngineAlignedMandalaScale(470),
      10
    );
  });

  it("paints nothing for a box with no size yet", () => {
    const { calls, deps } = harness();
    expect(renderCell(left, right, 0, 100, { dpr: 1, deps })).toBe("");
    expect(calls).toHaveLength(0);
  });
});
