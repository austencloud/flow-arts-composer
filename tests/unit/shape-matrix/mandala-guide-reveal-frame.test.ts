/**
 * The Create front door's Shape preview draws a matrix tile's mandala from
 * start to finish. The reveal frame paints with the tile's own options,
 * measures paths for the dash reveal, and lands on the tile's picture: a
 * complete guide, no reveal, at progress 1.
 */
import { describe, expect, it, vi } from "vitest";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  createMandalaGuideRevealFrame,
  type MandalaGuideImageDependencies,
} from "#lib/shared/mandala/services/mandala-guide-image.js";
import type {
  MandalaGuidePaintOptions,
  MandalaGuidePaintTarget,
} from "#lib/shared/mandala/services/mandala-guide-painter.js";
import type { PreparedMandalaPath } from "#lib/shared/mandala/services/types.js";
import {
  createCellRevealFrame,
  mergeCellPaths,
  renderCell,
  shapeMatrixGuideOptions,
  SHAPE_MATRIX_GUIDE_COLORS,
  SHAPE_MATRIX_GUIDE_STROKE_WIDTH,
} from "#lib/shared/shape-matrix/services/shape-matrix-render.js";

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

function harness() {
  const paints: {
    target: MandalaGuidePaintTarget;
    options: MandalaGuidePaintOptions;
  }[] = [];
  const measures: boolean[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({})),
    toDataURL: vi.fn(() => "data:image/png;base64,still"),
  };
  const deps: MandalaGuideImageDependencies = {
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    prepare: (svgPaths, color, hand, options): PreparedMandalaPath[] => {
      measures.push(options?.measure ?? true);
      return svgPaths.map(() => ({
        path2d: {} as Path2D,
        totalLength: 1,
        color,
        hand,
      }));
    },
    paint: (target, options) => {
      paints.push({ target, options });
    },
  };
  return { canvas, deps, paints, measures };
}

const asCanvas = (canvas: object) => canvas as unknown as HTMLCanvasElement;

describe("mandala guide reveal frame", () => {
  it("sizes the canvas like the still and measures paths for the reveal", () => {
    const { canvas, deps, measures } = harness();
    const frame = createMandalaGuideRevealFrame(
      asCanvas(canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 2 }),
      deps
    );
    expect(frame).not.toBeNull();
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(240);
    expect(measures).toEqual([true, true]);
  });

  it("paints a partial reveal below 1 and the complete guide at 1", () => {
    const { canvas, deps, paints } = harness();
    const frame = createMandalaGuideRevealFrame(
      asCanvas(canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 1 }),
      deps
    )!;
    frame.paint(0.4);
    frame.paint(1);
    expect(paints[0]?.options.reveal).toBe(true);
    expect(paints[0]?.options.progress).toBeCloseTo(0.4);
    expect(paints[1]?.options.reveal).toBe(false);
  });

  it("counts a NaN progress as done, not a stale partial dash", () => {
    const { canvas, deps, paints } = harness();
    const frame = createMandalaGuideRevealFrame(
      asCanvas(canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 1 }),
      deps
    )!;
    frame.paint(Number.NaN);
    expect(paints[0]?.options.reveal).toBe(false);
    expect(paints[0]?.options.progress).toBe(1);
  });

  it("finishes on the tile's own paint options", () => {
    const tile = harness();
    renderCell(left, right, 120, 100, { dpr: 1, deps: tile.deps });
    const reveal = harness();
    createCellRevealFrame(asCanvas(reveal.canvas), left, right, 120, 100, {
      dpr: 1,
      deps: reveal.deps,
    })!.paint(1);
    const still = tile.paints[0]!;
    const done = reveal.paints[0]!;
    expect(done.target.pixelWidth).toBe(still.target.pixelWidth);
    expect(done.options.scale).toBe(still.options.scale);
    expect(done.options.strokeWidth).toBe(SHAPE_MATRIX_GUIDE_STROKE_WIDTH);
    expect(done.options.paths.map((path) => [path.hand, path.color])).toEqual([
      ["left", SHAPE_MATRIX_GUIDE_COLORS.left],
      ["right", SHAPE_MATRIX_GUIDE_COLORS.right],
    ]);
  });

  it("returns null without a size or a 2D context", () => {
    const { canvas, deps } = harness();
    expect(
      createMandalaGuideRevealFrame(
        asCanvas(canvas),
        mergeCellPaths(left, right),
        shapeMatrixGuideOptions("both", 0, 100, "extent"),
        deps
      )
    ).toBeNull();
    const blind = { ...canvas, getContext: () => null };
    expect(
      createMandalaGuideRevealFrame(
        asCanvas(blind),
        mergeCellPaths(left, right),
        shapeMatrixGuideOptions("both", 120, 100, "extent"),
        deps
      )
    ).toBeNull();
  });
});
