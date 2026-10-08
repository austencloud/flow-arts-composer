import { describe, it, expect, vi } from "vitest";

// MotionData's factory transitively pulls firebase/auth at load time (see
// wasd-screen-direction.test.ts); the tuple math itself is pure.
vi.mock("$lib/shared/auth/state/authState.svelte", () => ({
  authState: { effectiveUserId: null },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
}));

import { directionalTupleCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { MotionType, RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { arrowDirectionalTuples } from "@tka/render-core";

// A float's tuples follow its hand path: clockwise turns the nudge, counter-
// clockwise reflects it. The path used to be read on the other grid's points,
// so every float took the reflected tuples and clockwise floats in the
// hand-tuned letters (G, H, I, L, P, Q, R) sat up to 85 px off. The default
// float nudge (30, -30) hides the bug, so this uses an asymmetric nudge.
const float = (startLocation: GridLocation, endLocation: GridLocation) =>
  createMotionData({
    motionType: MotionType.FLOAT,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation,
    endLocation,
  });

const turning = [[10, 20], [-20, 10], [-10, -20], [20, -10]];
const reflected = [[-20, -10], [10, -20], [20, 10], [-10, 20]];

const cases = [
  { name: "diamond clockwise S→W", start: GridLocation.SOUTH, end: GridLocation.WEST, want: turning },
  { name: "diamond counter-clockwise W→S", start: GridLocation.WEST, end: GridLocation.SOUTH, want: reflected },
  { name: "box clockwise NE→SE", start: GridLocation.NORTHEAST, end: GridLocation.SOUTHEAST, want: turning },
  { name: "box counter-clockwise SE→NE", start: GridLocation.SOUTHEAST, end: GridLocation.NORTHEAST, want: reflected },
];

describe("float directional tuples follow the hand path", () => {
  for (const c of cases) {
    it(`${c.name}, matching the MCP renderer`, () => {
      const motion = float(c.start, c.end);
      const app = directionalTupleCalculator.generateDirectionalTuples(motion, 10, 20);
      expect(app).toEqual(c.want);
      expect(
        arrowDirectionalTuples(
          {
            motionType: "float",
            rotationDirection: "noRotation",
            startLocation: c.start,
            endLocation: c.end,
          },
          10,
          20
        )
      ).toEqual(app);
    });
  }
});
