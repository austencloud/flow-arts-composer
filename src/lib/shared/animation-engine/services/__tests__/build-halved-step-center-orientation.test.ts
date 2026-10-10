
// Regression lock (2026-07-16): dash-half midpoint orientations were rendered
// 90deg off because (CENTER, radial-label) is a lossy representation — the
// interpolated midpoint centerPathAngle is travel-axis-dependent (0 for S<->N,
// PI/2 for E<->W), while renderers assumed a fixed reference. buildHalvedStep
// now emits ABSOLUTE center-family orientations at CENTER; prop and arrow
// renderers roundtrip them exactly. Proof: for 2-turn dashes on every axis, the halved step's midpoint
// orientation must render (prop AND arrow) at the engine's physical staff angle.
import { describe, it, expect } from "vitest";
import { buildHalvedStep } from "#lib/shared/animation-engine/services/build-halved-step.js";
import { calculateStaffAngleAt } from "#lib/shared/animation-engine/services/orientation-at.js";
import { calculateSegmentRotation } from "#lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.js";
import PropRotAngleManager from "#lib/shared/pictograph/prop/services/prop-rot-angle-manager.js";
import {
  createMotionData,
  createPlaceholderMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridMode, GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

const AXES: Array<[GridLocation, GridLocation]> = [
  [GridLocation.SOUTH, GridLocation.NORTH],
  [GridLocation.NORTH, GridLocation.SOUTH],
  [GridLocation.EAST, GridLocation.WEST],
  [GridLocation.WEST, GridLocation.EAST],
  [GridLocation.NORTHEAST, GridLocation.SOUTHWEST],
];

describe("roundtrip: 2-turn dash halves render at the physical staff angle", () => {
  it.each(AXES)("dash %s -> %s", (startLocation, endLocation) => {
    const right = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.DASH,
      startLocation,
      endLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turns: 2,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
      pathShape: "linear",
    });
    const step = {
      id: "probe",
      letter: null,
      gridMode: GridMode.DIAMOND,
      motions: { right, left: createPlaceholderMotion(HandSide.LEFT) },
      stepNumber: 1,
      duration: 1,
      isBlank: false,
    } as unknown as StepData;

    // Ground truth: engine's absolute staff angle at the midpoint, degrees.
    const physicalDeg =
      (((calculateStaffAngleAt(
        {
          motionType: right.motionType,
          rotationDirection: right.rotationDirection,
          startLocation: right.startLocation,
          endLocation: right.endLocation,
          startOrientation: right.startOrientation,
          endOrientation: right.endOrientation,
          turns: 2,
        },
        0.5,
        HandSide.RIGHT
      )! *
        180) /
        Math.PI) %
        360 +
        360) %
      360;

    const halved = buildHalvedStep(step, 0.5);
    expect(halved).not.toBeNull();
    const mid = halved!.motions.right;
    console.log(
      `${startLocation}->${endLocation}: physical=${physicalDeg}deg ori=${mid.endOrientation}`
    );

    // The midpoint orientation must be center-family (absolute), not radial.
    expect(String(mid.endOrientation).startsWith("center")).toBe(true);

    // Prop renderer roundtrip.
    const propDeg = PropRotAngleManager.calculateRotation(
      GridLocation.CENTER,
      mid.endOrientation,
      GridMode.DIAMOND
    );
    expect(propDeg).toBeCloseTo(physicalDeg, 6);

    // Arrow segment-rotation roundtrip.
    const arrowDeg = calculateSegmentRotation(
      mid.endOrientation,
      GridLocation.CENTER,
      startLocation
    );
    expect(arrowDeg).toBeCloseTo(physicalDeg, 6);
  });
});
