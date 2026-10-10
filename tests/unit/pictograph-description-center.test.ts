import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { describePictograph } from "#lib/shared/pictograph/shared/domain/utils/pictograph-description.js";

describe("center pictograph description", () => {
  it("speaks the center location instead of exposing its storage code", () => {
    const left = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.STATIC,
      startLocation: GridLocation.CENTER,
      endLocation: GridLocation.CENTER,
      isVisible: true,
    });

    expect(describePictograph({ motions: { left } })).toContain(
      "Left hand static hold at center."
    );
  });
});
