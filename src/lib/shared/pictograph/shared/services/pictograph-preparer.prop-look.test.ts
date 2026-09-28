import { describe, expect, it } from "vitest";
import { PictographPreparer } from "./pictograph-preparer";
import type { PropSvgLoadOptions } from "../../prop/services/types";
import { createMotionData } from "../domain/models/motion-data";
import { createPictographData } from "../domain/factories/create-pictograph-data";
import { Letter } from "../../../foundation/domain/models/letter";
import { GridLocation } from "../../grid/domain/enums/grid-enums";
import { PropType } from "../../prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../domain/enums/pictograph-enums";

function createPreparer(
  onLoad: (options: PropSvgLoadOptions | undefined) => void
): PictographPreparer {
  return new PictographPreparer(
    {
      coordinateArrowLifecycle: async () => ({
        positions: {},
        assets: {},
        mirroring: {},
      }),
    } as never,
    {
      loadPropSvg: async (
        _placement: unknown,
        _motion: unknown,
        _grid: unknown,
        options: PropSvgLoadOptions | undefined
      ) => {
        onLoad(options);
        return {
          svgData: {
            svgContent: "<svg />",
            viewBox: { width: 100, height: 100 },
            center: { x: 50, y: 50 },
          },
        };
      },
    } as never,
    {
      calculatePlacement: async () => ({
        positionX: 475,
        positionY: 475,
        rotationAngle: 0,
      }),
    } as never
  );
}

const pictograph = createPictographData({
  letter: Letter.G,
  motions: {
    left: createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
    }),
  },
});

describe("PictographPreparer prop look cache", () => {
  it("prepares a fresh prop asset when the live workspace changes looks", async () => {
    const requestedLooks: unknown[] = [];
    const preparer = createPreparer((options) =>
      requestedLooks.push(options?.propLook)
    );
    const options = { leftPropType: PropType.BUUGENG };

    await preparer.prepareSingle(pictograph, {
      ...options,
      propLook: "pictograph",
    });
    await preparer.prepareSingle(pictograph, { ...options, propLook: "model" });

    expect(requestedLooks).toEqual(["pictograph", "model"]);
  });

  it("hands the triangle grip to the loader and prepares afresh per grip, in either look", async () => {
    const requested: unknown[] = [];
    const preparer = createPreparer((options) =>
      requested.push([options?.triangleGrip, options?.propLook])
    );
    const triangle = { leftPropType: PropType.TRIANGLE };

    await preparer.prepareSingle(pictograph, {
      ...triangle,
      triangleGrip: "corner",
    });
    await preparer.prepareSingle(pictograph, {
      ...triangle,
      triangleGrip: "side",
    });
    await preparer.prepareSingle(pictograph, {
      ...triangle,
      triangleGrip: "side",
      propLook: "model",
    });
    // The same grip and look again is a cache hit.
    await preparer.prepareSingle(pictograph, {
      ...triangle,
      triangleGrip: "side",
    });

    expect(requested).toEqual([
      ["corner", undefined],
      ["side", undefined],
      ["side", "model"],
    ]);
  });

  it("keeps serving other props from cache when only the grip changes", async () => {
    let loads = 0;
    const preparer = createPreparer(() => loads++);
    const staff = { leftPropType: PropType.STAFF };

    await preparer.prepareSingle(pictograph, {
      ...staff,
      triangleGrip: "corner",
    });
    await preparer.prepareSingle(pictograph, { ...staff, triangleGrip: "side" });

    expect(loads).toBe(1);
  });
});
