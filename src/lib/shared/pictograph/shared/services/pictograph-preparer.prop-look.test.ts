import { describe, expect, it } from "vitest";
import { PictographPreparer } from "./pictograph-preparer";
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

describe("PictographPreparer prop look cache", () => {
  it("prepares a fresh prop asset when the live workspace changes looks", async () => {
    const requestedLooks: unknown[] = [];
    const preparer = new PictographPreparer(
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
          options: { propLook?: unknown }
        ) => {
          requestedLooks.push(options.propLook);
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
    const options = { leftPropType: PropType.BUUGENG };

    await preparer.prepareSingle(pictograph, {
      ...options,
      propLook: "pictograph",
    });
    await preparer.prepareSingle(pictograph, { ...options, propLook: "model" });

    expect(requestedLooks).toEqual(["pictograph", "model"]);
  });
});
