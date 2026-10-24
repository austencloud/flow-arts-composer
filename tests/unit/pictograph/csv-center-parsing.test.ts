/**
 * CSV parsing keeps the center point instead of coercing it.
 *
 * `mapLocation` used to turn `c` into NORTH and `mapOrientation` turned
 * centerN..centerNW into `in`, so a center row added to a dataframe would have
 * loaded as a wrong perimeter row. Gap 7 of
 * docs/superpowers/specs/2026-10-22-center-point-beyond-level-3.md.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapLocation,
  mapOrientation,
} from "#lib/shared/foundation/services/implementations/data/enum-mapper.js";
import { csvPictographParser } from "#lib/shared/pictograph/shared/services/csv-pictograph-parser.js";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

afterEach(() => vi.restoreAllMocks());

describe("enum mapper: center tokens", () => {
  it("maps c to the center location without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapLocation("c")).toBe(GridLocation.CENTER);
    expect(mapLocation(" C ")).toBe(GridLocation.CENTER);
    expect(warn).not.toHaveBeenCalled();
  });

  it("maps every center orientation to itself without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const center = [
      Orientation.CENTER_N,
      Orientation.CENTER_NE,
      Orientation.CENTER_E,
      Orientation.CENTER_SE,
      Orientation.CENTER_S,
      Orientation.CENTER_SW,
      Orientation.CENTER_W,
      Orientation.CENTER_NW,
    ];
    for (const orientation of center) {
      expect(mapOrientation(orientation)).toBe(orientation);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("still maps the perimeter tokens and still warns on unknown ones", () => {
    expect(mapLocation("nw")).toBe(GridLocation.NORTHWEST);
    expect(mapOrientation("counter")).toBe(Orientation.COUNTER);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapLocation("middle")).toBe(GridLocation.NORTH);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("CSV pictograph parser: a row with a hand at center", () => {
  it("keeps the center location and the tau placement", () => {
    // A fixture row for the parser, not a claim that this step is a TKA letter.
    const pictograph = csvPictographParser.parseCSVRowToPictograph(
      {
        letter: "τ-",
        startPlacement: "tau1",
        endPlacement: "tau1",
        timing: "none",
        direction: "none",
        leftMotionType: "static",
        leftRotationDirection: "noRotation",
        leftStartLocation: "c",
        leftEndLocation: "c",
        rightMotionType: "static",
        rightRotationDirection: "noRotation",
        rightStartLocation: "n",
        rightEndLocation: "n",
      },
      GridMode.DIAMOND
    );
    expect(pictograph.startPlacement).toBe(GridPlacement.TAU1);
    expect(pictograph.motions[HandSide.LEFT]?.startLocation).toBe(
      GridLocation.CENTER
    );
    expect(pictograph.motions[HandSide.LEFT]?.endLocation).toBe(
      GridLocation.CENTER
    );
    expect(pictograph.motions[HandSide.RIGHT]?.startLocation).toBe(
      GridLocation.NORTH
    );
  });
});
