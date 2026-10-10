import { describe, expect, it } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { FanViewpoint } from "#lib/features/lab/tabs/fan-relations/domain/fan-relation-types.js";
import {
  buildFanPropState,
  describeHeadingSeparation,
  describeWorldHeading,
  getFanHeadingDegrees,
  getFanSceneLayout,
  getHeadingSeparationDegrees,
  getProjectionDescription,
  getWorldHeadingVector,
} from "#lib/features/lab/tabs/fan-relations/services/fan-relation-geometry.js";

describe("fan relation geometry", () => {
  it("preserves the supplied W observation as two local labels with one world heading", () => {
    const leftHeading = getFanHeadingDegrees(
      GridLocation.NORTHWEST,
      Orientation.CLOCK_OUT,
      GridMode.SKEWED
    );
    const rightHeading = getFanHeadingDegrees(
      GridLocation.NORTHEAST,
      Orientation.COUNTER_OUT,
      GridMode.SKEWED
    );

    expect(leftHeading).toBe(270);
    expect(rightHeading).toBe(270);
    expect(
      describeWorldHeading(getWorldHeadingVector(rightHeading, Plane.WALL))
    ).toBe("Sky");
    expect(getHeadingSeparationDegrees(rightHeading, leftHeading)).toBe(0);
  });

  it("keeps center orientation absolute instead of inventing a radial reference", () => {
    const heading = getFanHeadingDegrees(
      GridLocation.CENTER,
      Orientation.CENTER_E,
      GridMode.SKEWED
    );

    expect(heading).toBe(0);
    expect(
      describeWorldHeading(getWorldHeadingVector(heading, Plane.WALL))
    ).toBe("Performer right");

    const state = buildFanPropState({
      location: GridLocation.CENTER,
      orientation: Orientation.CENTER_E,
      gridMode: GridMode.SKEWED,
      presentationPlane: Plane.WALL,
    });
    expect(state.worldPosition.toArray()).toEqual([0, 0, 0]);
  });

  it("uses a fan-sized hand grid instead of the staff hand radius", () => {
    const layout = getFanSceneLayout({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      propType: PropType.FAN,
      basePropLength: 0.864,
    });

    expect(layout.handRadius).toBeCloseTo(0.41472, 5);
    expect(layout.handRadius).toBeLessThan(0.52);

    const state = buildFanPropState({
      location: GridLocation.EAST,
      orientation: Orientation.OUT,
      gridMode: GridMode.DIAMOND,
      presentationPlane: Plane.WALL,
      handRadius: layout.handRadius,
    });
    expect(state.worldPosition.length()).toBeCloseTo(layout.handRadius, 6);
  });

  it("grows the outer field for Big Fan without moving the hand ring", () => {
    const shared = {
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      basePropLength: 0.864,
    };
    const standard = getFanSceneLayout({
      ...shared,
      propType: PropType.FAN,
    });
    const big = getFanSceneLayout({
      ...shared,
      propType: PropType.BIGFAN,
    });

    expect(big.handRadius).toBe(standard.handRadius);
    expect(big.outerRadius).toBeGreaterThan(standard.outerRadius * 1.6);
    expect(big.gridSize).toBeGreaterThan(big.outerRadius);
  });

  it("moves the working plane forward only when a hand crosses the body", () => {
    const natural = getFanSceneLayout({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      propType: PropType.BIGFAN,
      basePropLength: 0.864,
    });
    const crossed = getFanSceneLayout({
      leftLocation: GridLocation.WEST,
      rightLocation: GridLocation.EAST,
      propType: PropType.BIGFAN,
      basePropLength: 0.864,
    });

    expect(natural.crossBodyDemand).toBe(0);
    expect(natural.forwardOffset).toBeCloseTo(0.3, 6);
    expect(crossed.crossBodyDemand).toBe(1);
    expect(crossed.forwardOffset).toBeCloseTo(0.42, 6);
  });

  it("keeps hand placement fixed when the fan presentation plane changes", () => {
    const shared = {
      location: GridLocation.EAST,
      orientation: Orientation.OUT,
      gridMode: GridMode.DIAMOND,
    };
    const wall = buildFanPropState({
      ...shared,
      presentationPlane: Plane.WALL,
    });
    const floor = buildFanPropState({
      ...shared,
      presentationPlane: Plane.FLOOR,
    });

    expect(floor.worldPosition.toArray()).toEqual(wall.worldPosition.toArray());
    expect(floor.plane).toBe(Plane.FLOOR);
    expect(wall.plane).toBe(Plane.WALL);
    expect(floor.worldRotation.equals(wall.worldRotation)).toBe(false);
  });

  it("changes only the projection diagnosis when the camera moves", () => {
    const audience = getProjectionDescription(
      Plane.FLOOR,
      FanViewpoint.AUDIENCE
    );
    const above = getProjectionDescription(Plane.FLOOR, FanViewpoint.ABOVE);

    expect(audience.faceOn).toBe(false);
    expect(audience.text).toContain("line-like projection");
    expect(above.faceOn).toBe(true);
  });

  it("retains opposite depth headings when the audience sees two edge-on fans", () => {
    const leftHeading = getFanHeadingDegrees(
      GridLocation.EAST,
      Orientation.COUNTER,
      GridMode.DIAMOND
    );
    const rightHeading = getFanHeadingDegrees(
      GridLocation.WEST,
      Orientation.COUNTER,
      GridMode.DIAMOND
    );

    expect(
      describeWorldHeading(getWorldHeadingVector(leftHeading, Plane.FLOOR))
    ).toBe("Downstage");
    expect(
      describeWorldHeading(getWorldHeadingVector(rightHeading, Plane.FLOOR))
    ).toBe("Upstage");
    expect(
      getProjectionDescription(Plane.FLOOR, FanViewpoint.AUDIENCE).text
    ).toContain("share the same line-like projection");
  });

  it("describes heading separation without assigning a fan relation", () => {
    expect(describeHeadingSeparation(0)).toBe("Same heading");
    expect(describeHeadingSeparation(90)).toBe("Perpendicular headings");
    expect(describeHeadingSeparation(180)).toBe("Opposite headings");
    expect(describeHeadingSeparation(45)).toBe("45° apart");
  });
});
