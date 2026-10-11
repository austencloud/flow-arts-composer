import { describe, expect, it } from "vitest";
import {
  mirrorMotion,
  flipMotion,
} from "#lib/shared/create/services/motion-transforms.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandPath,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

describe("reflected hand paths", () => {
  for (const [name, reflect] of [
    ["mirror", mirrorMotion],
    ["flip", flipMotion],
  ] as const) {
    it(`${name} reverses authored arc direction alongside prop rotation`, () => {
      for (const [path, expected] of [
        [HandPath.CLOCKWISE, HandPath.COUNTER_CLOCKWISE],
        [HandPath.COUNTER_CLOCKWISE, HandPath.CLOCKWISE],
      ] as const) {
        const source = createMotionData({
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.EAST,
          rotationDirection: RotationDirection.CLOCKWISE,
          handPath: path,
        });
        const reflected = reflect(source);

        expect(reflected.handPath).toBe(expected);
        expect(reflected.rotationDirection).toBe(
          RotationDirection.COUNTER_CLOCKWISE
        );
        expect(source.handPath).toBe(path);
      }
    });

    it(`${name} preserves nondirectional and unset hand paths`, () => {
      for (const path of [
        HandPath.DASH,
        HandPath.STATIC,
        HandPath.HASH_IN,
        HandPath.HASH_OUT,
        null,
      ]) {
        expect(reflect(createMotionData({ handPath: path })).handPath).toBe(
          path
        );
      }
      expect(reflect(createMotionData()).handPath).toBeNull();
    });
  }

  it("mirrors a south-to-east quarter arc into a south-to-west quarter arc in mandala geometry", () => {
    const source = createMotionData({
      motionType: MotionType.ANTI,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.EAST,
      arrowLocation: GridLocation.EAST,
      handPath: HandPath.COUNTER_CLOCKWISE,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
    });
    const reflected = mirrorMotion(source);
    const path = calculate(
      [{ motions: { left: reflected } }],
      undefined,
      undefined,
      undefined,
      { dx: 0, dy: 0 }
    ).left[0]!.d;
    const endpoints = [
      ...path.matchAll(
        /C\s+[-\d.]+\s+[-\d.]+,\s+[-\d.]+\s+[-\d.]+,\s+([-\d.]+)\s+([-\d.]+)/g
      ),
    ];
    const midpoint = endpoints[Math.floor(endpoints.length / 2)]!;

    expect(reflected.endLocation).toBe(GridLocation.WEST);
    expect(Number(midpoint[1])).toBeLessThan(0);
    expect(Number(midpoint[2])).toBeGreaterThan(0);
  });
});
