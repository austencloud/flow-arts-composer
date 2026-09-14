import { describe, expect, it } from "vitest";
import { PropRotAngleManager } from "$lib/shared/pictograph/prop/services/prop-rot-angle-manager";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getPictographGeometryRevision } from "$lib/shared/render/services/pictograph-key-hasher";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

describe("saved QR prop orientation casing", () => {
  it("invalidates only the images whose saved orientation spelling was broken", () => {
    const cell: PictographData = {
      id: "legacy",
      motions: {
        right: createMotionData({
          endOrientation: "centere" as Orientation,
          isVisible: true,
        }),
      },
    };
    expect(getPictographGeometryRevision(cell)).toBe("orientation-case-v1");
    const corrected: PictographData = {
      id: "canonical",
      motions: {
        right: createMotionData({ endOrientation: "centerE", isVisible: true }),
      },
    };
    expect(getPictographGeometryRevision(corrected)).toBeUndefined();
    const invisible: PictographData = {
      id: "invisible",
      motions: {
        right: createMotionData({
          endOrientation: "centere" as Orientation,
          isVisible: false,
        }),
      },
    };
    expect(getPictographGeometryRevision(invisible)).toBeUndefined();
  });
  it.each([
    ["clockin", GridLocation.NORTH, 45],
    ["centerw", GridLocation.CENTER, 180],
    // C4OF's perimeter centerE used the existing zero-degree fallback before
    // its stored spelling was lowercased. It must not lose the entire prop.
    ["centere", GridLocation.NORTHEAST, 0],
  ] as const)(
    "renders legacy %s through both angle entry points",
    (raw, location, angle) => {
      const orientation = raw as Orientation;
      expect(
        PropRotAngleManager.calculateRotation(
          location,
          orientation,
          GridMode.DIAMOND
        )
      ).toBe(angle);
      expect(
        new PropRotAngleManager({
          location,
          orientation,
          gridMode: GridMode.DIAMOND,
        }).getRotationAngle()
      ).toBe(angle);
    }
  );
});
