import { describe, expect, it, vi } from "vitest";
import type {
  MandalaPaths,
  MandalaRenderOptions,
} from "#lib/shared/mandala/domain/mandala-types.js";
import {
  renderMandalaToCanvas,
  renderMandalaSVG,
  resolveMandalaRenderExtent,
} from "#lib/shared/mandala/services/mandala-renderer.js";
import {
  ENGINE_GRID_RADIUS,
  MANDALA_GRID_RADIUS,
  MANDALA_STANDARD_TIP_DX,
} from "#lib/shared/mandala/domain/mandala-constants.js";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { resolveMandalaTipOffsets } from "#lib/shared/mandala/services/mandala-path-preparer.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";
import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const emptyPaths: MandalaPaths = { left: [], right: [], purple: [] };
const standardExtent =
  MANDALA_GRID_RADIUS +
  (MANDALA_STANDARD_TIP_DX * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
const quarterTurn: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        startOrientation: "out",
        endOrientation: "out",
        turns: 0,
      },
      right: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "out",
        endOrientation: "out",
        turns: 0,
      },
    },
  },
];

function options(
  overrides: Partial<MandalaRenderOptions> = {}
): MandalaRenderOptions {
  return {
    size: 500,
    style: "stroke",
    show: "both",
    ...overrides,
  };
}

describe("mandala render fitting", () => {
  it("keeps the established enlarged scale for compact paths", () => {
    const paths: MandalaPaths = {
      ...emptyPaths,
      left: [{ d: "M -24 0 C -12 -18 12 18 24 0", tipIndex: 0 }],
    };

    expect(resolveMandalaRenderExtent(paths, options())).toBe(standardExtent);
  });

  it("shrinks paths whose real geometry exceeds the standard prop reach", () => {
    const paths: MandalaPaths = {
      ...emptyPaths,
      left: [{ d: "M -260 0 C -180 -40 180 40 260 0", tipIndex: 0 }],
    };

    expect(resolveMandalaRenderExtent(paths, options())).toBe(260);

    const svg = renderMandalaSVG(paths, options());
    expect(svg).toContain("scale(0.9158)");

    const scale = vi.fn();
    const context = {
      canvas: { width: 500, height: 500 },
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale,
      stroke: vi.fn(),
      globalAlpha: 1,
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "butt",
    } as unknown as CanvasRenderingContext2D;
    vi.stubGlobal("Path2D", class TestPath2D {});
    try {
      renderMandalaToCanvas(context, paths, {
        ...options({ show: "left" }),
        offsetX: 0,
        offsetY: 0,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const expectedScale = 250 / (260 * 1.05);
    expect(scale).toHaveBeenCalledWith(expectedScale, expectedScale);
  });

  it("keeps the shipped staff geometry at the established scale", () => {
    const tips = resolveMandalaTipOffsets(
      PropType.STAFF,
      TrackingMode.BOTH_ENDS,
      "baseline"
    );
    const paths = calculateMandalaGeometry(
      quarterTurn,
      PropType.STAFF,
      PropType.STAFF,
      undefined,
      { left: tips, right: tips }
    );

    expect(resolveMandalaRenderExtent(paths, options())).toBe(standardExtent);
  });

  it.each([
    PropType.BIGSTAFF,
    PropType.BIGFAN,
    PropType.BIGDOUBLESTAR,
  ])("fits the shipped %s geometry inside the render extent", (propType) => {
    const tips = resolveMandalaTipOffsets(
      propType,
      TrackingMode.BOTH_ENDS,
      "baseline"
    );
    const paths = calculateMandalaGeometry(
      quarterTurn,
      propType,
      propType,
      undefined,
      { left: tips, right: tips }
    );

    expect(resolveMandalaRenderExtent(paths, options())).toBeGreaterThan(
      standardExtent
    );
  });

  it("fits only the color that will actually be painted", () => {
    const paths: MandalaPaths = {
      left: [{ d: "M -30 0 C -20 -10 20 10 30 0", tipIndex: 0 }],
      right: [{ d: "M -320 0 C -200 -20 200 20 320 0", tipIndex: 0 }],
      purple: [],
    };

    expect(resolveMandalaRenderExtent(paths, options({ show: "left" }))).toBe(
      standardExtent
    );
    expect(resolveMandalaRenderExtent(paths, options({ show: "both" }))).toBe(
      320
    );
  });
});
