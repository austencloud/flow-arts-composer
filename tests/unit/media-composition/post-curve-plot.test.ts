import { describe, expect, it } from "vitest";
import {
  CURVE_EDITOR_Y_MAX,
  CURVE_EDITOR_Y_MIN,
  dataToPlotX,
  dataToPlotY,
  plotHeight,
  plotToDataX,
  plotToDataY,
  plotWidth,
  type CurvePlotGeometry,
} from "#lib/shared/share/components/post-studio/editor/post-curve-plot.js";
import {
  POST_EASING_Y_MAX,
  POST_EASING_Y_MIN,
} from "#lib/shared/media-composition/domain/post-project.js";
import { EASING_PRESETS } from "#lib/shared/media-composition/domain/post-project-keyframes.js";

function close(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 9);
}

// A small exact-division geometry of its own rather than PostCurveEditor's
// constants, so this test does not silently drift if those change: a 20px
// pad around 100px data units, with y spanning -1..2 (three units).
const GEOMETRY: CurvePlotGeometry = { padPx: 20, unitPx: 100, yMin: -1, yMax: 2 };

describe("plotWidth / plotHeight", () => {
  it("sizes the plot so a data unit is the same length on both axes", () => {
    close(plotWidth(GEOMETRY), 140); // 20 + 100 + 20
    close(plotHeight(GEOMETRY), 340); // 20 + 3 * 100 + 20
    // The square a curve crosses from (0, 0) to (1, 1) draws as a square.
    close(
      dataToPlotX(1, GEOMETRY) - dataToPlotX(0, GEOMETRY),
      dataToPlotY(0, GEOMETRY) - dataToPlotY(1, GEOMETRY)
    );
  });
});

describe("dataToPlotX / plotToDataX", () => {
  it("maps the x range onto one unit past the pad", () => {
    close(dataToPlotX(0, GEOMETRY), 20);
    close(dataToPlotX(1, GEOMETRY), 120);
    close(dataToPlotX(0.25, GEOMETRY), 45);
  });

  it("inverts back to the original data value", () => {
    close(plotToDataX(dataToPlotX(0.25, GEOMETRY), GEOMETRY), 0.25);
    close(plotToDataX(dataToPlotX(0.75, GEOMETRY), GEOMETRY), 0.75);
  });

  it("clamps pixels outside the plot to [0, 1]", () => {
    close(plotToDataX(-50, GEOMETRY), 0);
    close(plotToDataX(1000, GEOMETRY), 1);
  });
});

describe("dataToPlotY / plotToDataY", () => {
  it("flips y so yMax draws at the top and yMin at the bottom", () => {
    close(dataToPlotY(2, GEOMETRY), 20); // yMax -> top
    close(dataToPlotY(1, GEOMETRY), 120);
    close(dataToPlotY(0, GEOMETRY), 220);
    close(dataToPlotY(-1, GEOMETRY), 320); // yMin -> bottom
  });

  it("inverts back to the original data value", () => {
    close(plotToDataY(dataToPlotY(0.5, GEOMETRY), GEOMETRY), 0.5);
    close(plotToDataY(dataToPlotY(-1, GEOMETRY), GEOMETRY), -1);
  });

  it("clamps pixels outside the plot to [yMin, yMax]", () => {
    close(plotToDataY(0, GEOMETRY), 2);
    close(plotToDataY(1000, GEOMETRY), -1);
  });
});

describe("the curve editor's y range", () => {
  it("shows every preset curve without clamping it", () => {
    for (const preset of Object.values(EASING_PRESETS)) {
      if (preset === "hold") continue;
      for (const y of [preset[1], preset[3]]) {
        expect(y).toBeGreaterThanOrEqual(CURVE_EDITOR_Y_MIN);
        expect(y).toBeLessThanOrEqual(CURVE_EDITOR_Y_MAX);
      }
    }
  });

  it("never edits a value a saved project would reject", () => {
    expect(CURVE_EDITOR_Y_MIN).toBeGreaterThanOrEqual(POST_EASING_Y_MIN);
    expect(CURVE_EDITOR_Y_MAX).toBeLessThanOrEqual(POST_EASING_Y_MAX);
  });
});
