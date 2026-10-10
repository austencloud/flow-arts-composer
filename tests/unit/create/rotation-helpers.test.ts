import { describe, expect, it } from "vitest";
import {
  getShortestRotationStepsBetweenLocations,
  rotateLocation,
} from "#lib/shared/create/services/rotation-helpers.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

describe("getShortestRotationStepsBetweenLocations", () => {
  it.each([
    [GridLocation.NORTH, GridLocation.NORTH, 0],
    [GridLocation.NORTH, GridLocation.NORTHEAST, 1],
    [GridLocation.NORTH, GridLocation.NORTHWEST, -1],
    [GridLocation.NORTH, GridLocation.EAST, 2],
    [GridLocation.NORTH, GridLocation.WEST, -2],
    [GridLocation.WEST, GridLocation.NORTH, 2],
    [GridLocation.NORTH, GridLocation.SOUTH, 4],
  ])("maps %s to %s as %s signed steps", (from, to, expected) => {
    expect(getShortestRotationStepsBetweenLocations(from, to)).toBe(expected);
  });

  it("rejects rotation between center and a perimeter point", () => {
    expect(
      getShortestRotationStepsBetweenLocations(
        GridLocation.CENTER,
        GridLocation.NORTH
      )
    ).toBeNull();
    expect(
      getShortestRotationStepsBetweenLocations(
        GridLocation.NORTH,
        GridLocation.CENTER
      )
    ).toBeNull();
  });
});

describe("rotateLocation", () => {
  it.each([
    [GridLocation.NORTH, 1, GridLocation.NORTHEAST],
    [GridLocation.NORTHEAST, 1, GridLocation.EAST],
    [GridLocation.EAST, 1, GridLocation.SOUTHEAST],
    [GridLocation.SOUTHEAST, 1, GridLocation.SOUTH],
    [GridLocation.SOUTH, 1, GridLocation.SOUTHWEST],
    [GridLocation.SOUTHWEST, 1, GridLocation.WEST],
    [GridLocation.WEST, 1, GridLocation.NORTHWEST],
    [GridLocation.NORTHWEST, 1, GridLocation.NORTH],
    [GridLocation.NORTH, -1, GridLocation.NORTHWEST],
  ])("rotates %s by %s step to %s", (from, steps, expected) => {
    expect(rotateLocation(from, steps)).toBe(expected);
  });

  it("leaves center unchanged", () => {
    expect(rotateLocation(GridLocation.CENTER, 1)).toBe(GridLocation.CENTER);
    expect(rotateLocation(GridLocation.CENTER, -1)).toBe(GridLocation.CENTER);
  });
});
