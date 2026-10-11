import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { ArrowRotationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

describe("full quarter-turn arrow rotation", () => {
  it.each([
    [MotionType.PRO, RotationDirection.CLOCKWISE],
    [MotionType.ANTI, RotationDirection.COUNTER_CLOCKWISE],
  ] as const)(
    "keeps %s rotation geometric and independent of the numeric turn amount",
    async (motionType, rotationDirection) => {
      const calculator = new ArrowRotationCalculator();
      const quarter = createMotionData({
        motionType,
        rotationDirection,
        startOrientation: Orientation.CLOCK_IN,
        turns: 0.25,
      });
      const half = createMotionData({ ...quarter, turns: 0.5 });

      await expect(
        calculator.calculateRotation(quarter, GridLocation.NORTHEAST)
      ).resolves.toBe(0);
      await expect(
        calculator.calculateRotation(half, GridLocation.NORTHEAST)
      ).resolves.toBe(0);
    }
  );

  it.each([
    MotionType.PRO,
    MotionType.ANTI,
    MotionType.STATIC,
    MotionType.DASH,
  ])(
    "returns a finite %s transform for both directions at every perimeter location",
    async (motionType) => {
      const calculator = new ArrowRotationCalculator();
      const locations = [
        GridLocation.NORTH,
        GridLocation.NORTHEAST,
        GridLocation.EAST,
        GridLocation.SOUTHEAST,
        GridLocation.SOUTH,
        GridLocation.SOUTHWEST,
        GridLocation.WEST,
        GridLocation.NORTHWEST,
      ];

      for (const rotationDirection of [
        RotationDirection.CLOCKWISE,
        RotationDirection.COUNTER_CLOCKWISE,
      ]) {
        for (const location of locations) {
          const rotation = await calculator.calculateRotation(
            createMotionData({
              motionType,
              rotationDirection,
              startOrientation: Orientation.CLOCK_IN,
              turns: 0.25,
            }),
            location
          );
          expect(Number.isFinite(rotation)).toBe(true);
        }
      }
    }
  );

  it.each([MotionType.STATIC, MotionType.DASH])(
    "leaves %s CENTER at zero because its asset encodes the absolute center axis",
    async (motionType) => {
      const calculator = new ArrowRotationCalculator();

      for (const startOrientation of [
        Orientation.CENTER_N,
        Orientation.CENTER_NE,
        Orientation.CENTER_E,
        Orientation.CENTER_SE,
        Orientation.CENTER_S,
        Orientation.CENTER_SW,
        Orientation.CENTER_W,
        Orientation.CENTER_NW,
      ]) {
        await expect(
          calculator.calculateRotation(
            createMotionData({
              motionType,
              rotationDirection: RotationDirection.CLOCKWISE,
              startOrientation,
              turns: 0.25,
            }),
            GridLocation.CENTER
          )
        ).resolves.toBe(0);
      }
    }
  );
});
