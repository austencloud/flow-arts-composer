import { describe, expect, it } from "vitest";
import { generatePlacementKey } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const AVAILABLE_KEYS = [
  "static_to_layer1_alpha",
  "static_to_layer1_beta",
  "static",
];

function staticMotion(color: HandSide) {
  return createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: GridLocation.WEST,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: color,
  });
}

describe("solo arrow placement keys", () => {
  const left = staticMotion(HandSide.LEFT);
  const right = staticMotion(HandSide.RIGHT);

  it("resolves an invisible placeholder exactly like an absent partner", () => {
    const absentPartner: PictographData = {
      id: "solo-absent",
      motions: { left },
    };
    const placeholderPartner: PictographData = {
      id: "solo-placeholder",
      motions: { left, right: { ...right, isVisible: false } },
    };

    const absentKey = generatePlacementKey(left, absentPartner, AVAILABLE_KEYS);
    const placeholderKey = generatePlacementKey(
      left,
      placeholderPartner,
      AVAILABLE_KEYS
    );

    expect(absentKey).toBe("static_to_layer1_alpha");
    expect(placeholderKey).toBe(absentKey);
  });

  it("keeps a genuinely paired beta pictograph beta-specific", () => {
    const paired: PictographData = {
      id: "paired-beta",
      letter: "G" as PictographData["letter"],
      motions: { left, right },
    };

    expect(generatePlacementKey(left, paired, AVAILABLE_KEYS)).toBe(
      "static_to_layer1_beta"
    );
  });
});
