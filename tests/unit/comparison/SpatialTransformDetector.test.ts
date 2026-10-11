import { beforeEach, describe, expect, it } from "vitest";
import { SpatialTransformDetector } from "#lib/shared/comparison/services/spatial-transform-detector.js";
import { GridLocation } from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";

describe("SpatialTransformDetector", () => {
  let detector: SpatialTransformDetector;

  beforeEach(() => {
    detector = new SpatialTransformDetector();
  });

  describe("rotateLocation", () => {
    it("should not change location for 0 steps", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 0)).toBe(GridLocation.NORTH);
      expect(detector.rotateLocation(GridLocation.EAST, 0)).toBe(GridLocation.EAST);
    });

    it("should rotate north 1 step clockwise to northeast", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 1)).toBe(GridLocation.NORTHEAST);
    });

    it("should rotate north 2 steps clockwise to east", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 2)).toBe(GridLocation.EAST);
    });

    it("should rotate north 4 steps clockwise to south", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 4)).toBe(GridLocation.SOUTH);
    });

    it("should handle full rotation (8 steps) returning to start", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 8)).toBe(GridLocation.NORTH);
      expect(detector.rotateLocation(GridLocation.SOUTHEAST, 8)).toBe(GridLocation.SOUTHEAST);
    });

    it("should handle negative steps (counter-clockwise)", () => {
      // -1 step from north = northwest
      expect(detector.rotateLocation(GridLocation.NORTH, -1)).toBe(GridLocation.NORTHWEST);
      // -2 steps from north = west
      expect(detector.rotateLocation(GridLocation.NORTH, -2)).toBe(GridLocation.WEST);
    });

    it("should handle steps > 8 by wrapping", () => {
      // 9 steps = 1 step
      expect(detector.rotateLocation(GridLocation.NORTH, 9)).toBe(GridLocation.NORTHEAST);
      // 10 steps = 2 steps
      expect(detector.rotateLocation(GridLocation.NORTH, 10)).toBe(GridLocation.EAST);
    });

    it("should correctly rotate all cardinal directions by 2 steps (90°)", () => {
      expect(detector.rotateLocation(GridLocation.NORTH, 2)).toBe(GridLocation.EAST);
      expect(detector.rotateLocation(GridLocation.EAST, 2)).toBe(GridLocation.SOUTH);
      expect(detector.rotateLocation(GridLocation.SOUTH, 2)).toBe(GridLocation.WEST);
      expect(detector.rotateLocation(GridLocation.WEST, 2)).toBe(GridLocation.NORTH);
    });

    it("should correctly rotate all intercardinal directions by 2 steps (90°)", () => {
      expect(detector.rotateLocation(GridLocation.NORTHEAST, 2)).toBe(GridLocation.SOUTHEAST);
      expect(detector.rotateLocation(GridLocation.SOUTHEAST, 2)).toBe(GridLocation.SOUTHWEST);
      expect(detector.rotateLocation(GridLocation.SOUTHWEST, 2)).toBe(GridLocation.NORTHWEST);
      expect(detector.rotateLocation(GridLocation.NORTHWEST, 2)).toBe(GridLocation.NORTHEAST);
    });
  });

  describe("getAngularDistance", () => {
    it("should return 0 for same location", () => {
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.NORTH)).toBe(0);
      expect(detector.getAngularDistance(GridLocation.SOUTHEAST, GridLocation.SOUTHEAST)).toBe(0);
    });

    it("should return 1 for adjacent locations (45°)", () => {
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.NORTHEAST)).toBe(1);
      expect(detector.getAngularDistance(GridLocation.NORTHEAST, GridLocation.NORTH)).toBe(1);
    });

    it("should return 2 for 90° separation", () => {
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.EAST)).toBe(2);
      expect(detector.getAngularDistance(GridLocation.EAST, GridLocation.NORTH)).toBe(2);
    });

    it("should return 4 for opposite locations (180°)", () => {
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.SOUTH)).toBe(4);
      expect(detector.getAngularDistance(GridLocation.EAST, GridLocation.WEST)).toBe(4);
      expect(detector.getAngularDistance(GridLocation.NORTHEAST, GridLocation.SOUTHWEST)).toBe(4);
    });

    it("should return shortest distance (never > 4)", () => {
      // 5 steps CW = 3 steps CCW, so result should be 3
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.SOUTHWEST)).toBe(3);
      // 6 steps CW = 2 steps CCW, so result should be 2
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.WEST)).toBe(2);
      // 7 steps CW = 1 step CCW, so result should be 1
      expect(detector.getAngularDistance(GridLocation.NORTH, GridLocation.NORTHWEST)).toBe(1);
    });
  });

  describe("getAllTransforms", () => {
    it("should return 8 transforms (0° to 315°)", () => {
      const transforms = detector.getAllTransforms();
      expect(transforms.length).toBe(8);
    });

    it("should have rotation steps 0-7", () => {
      const transforms = detector.getAllTransforms();
      const steps = transforms.map((t) => t.rotationSteps);
      expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("should have gridModeToggled true for odd steps, false for even", () => {
      const transforms = detector.getAllTransforms();

      // Even steps (0, 2, 4, 6) - no grid mode toggle
      expect(transforms[0].gridModeToggled).toBe(false); // 0 steps
      expect(transforms[2].gridModeToggled).toBe(false); // 2 steps (90°)
      expect(transforms[4].gridModeToggled).toBe(false); // 4 steps (180°)
      expect(transforms[6].gridModeToggled).toBe(false); // 6 steps (270°)

      // Odd steps (1, 3, 5, 7) - grid mode toggles (diamond ↔ box)
      expect(transforms[1].gridModeToggled).toBe(true); // 1 step (45°)
      expect(transforms[3].gridModeToggled).toBe(true); // 3 steps (135°)
      expect(transforms[5].gridModeToggled).toBe(true); // 5 steps (225°)
      expect(transforms[7].gridModeToggled).toBe(true); // 7 steps (315°)
    });
  });
});
