import { describe, expect, it } from "vitest";
import {
  dataToPlotX,
  dataToPlotY,
  plotToDataX,
  plotToDataY,
  type CurvePlotGeometry,
} from "$lib/shared/share/components/post-studio/editor/post-curve-plot";

function close(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 9);
}

// Matches PostCurveEditor's own 200x200 SVG: a 20px pad around a 160px square,
// with y spanning POST_EASING_Y_MIN..POST_EASING_Y_MAX (-1..2) rather than
// PostCurveEditor's actual constants, so this test does not silently drift if
// those change - it fixes its own small, exact-division geometry instead.
const GEOMETRY: CurvePlotGeometry = { padPx: 20, plotPx: 160, yMin: -1, yMax: 2 };

describe("dataToPlotX / plotToDataX", () => {
  it("maps the x range onto the padded plot square", () => {
    close(dataToPlotX(0, GEOMETRY), 20);
    close(dataToPlotX(1, GEOMETRY), 180);
    close(dataToPlotX(0.25, GEOMETRY), 60);
  });

  it("inverts back to the original data value", () => {
    close(plotToDataX(dataToPlotX(0.25, GEOMETRY), GEOMETRY), 0.25);
    close(plotToDataX(dataToPlotX(0.75, GEOMETRY), GEOMETRY), 0.75);
  });

  it("clamps pixels outside the plot square to [0, 1]", () => {
    close(plotToDataX(-50, GEOMETRY), 0);
    close(plotToDataX(1000, GEOMETRY), 1);
  });
});

describe("dataToPlotY / plotToDataY", () => {
  it("flips y so yMax draws at the top and yMin at the bottom", () => {
    close(dataToPlotY(2, GEOMETRY), 20); // yMax -> top
    close(dataToPlotY(-1, GEOMETRY), 180); // yMin -> bottom
    close(dataToPlotY(0.5, GEOMETRY), 100); // midpoint of the 3-unit span
  });

  it("inverts back to the original data value", () => {
    close(plotToDataY(dataToPlotY(0.5, GEOMETRY), GEOMETRY), 0.5);
    close(plotToDataY(dataToPlotY(-1, GEOMETRY), GEOMETRY), -1);
  });

  it("clamps pixels outside the plot square to [yMin, yMax]", () => {
    close(plotToDataY(0, GEOMETRY), 2);
    close(plotToDataY(400, GEOMETRY), -1);
  });
});
