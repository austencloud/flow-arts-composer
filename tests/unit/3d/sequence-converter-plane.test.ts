import { describe, it, expect } from "vitest";
import {
  motionDataToConfig3D,
  stepDataToConfigs,
} from "#lib/shared/3d/services/sequence-converter.js";
import { Plane } from "@austencloud/scene-3d";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

describe("SequenceConverter plane passthrough", () => {
  it("reads motion.plane when no modeConfig is active", () => {
    const motion = createMotionData({ plane: Plane.WHEEL });
    const config = motionDataToConfig3D(motion);
    expect(config.plane).toBe(Plane.WHEEL);
  });

  it("defaults to WALL when motion has no plane field", () => {
    const motion = createMotionData({});
    const config = motionDataToConfig3D(motion);
    expect(config.plane).toBe(Plane.WALL);
  });

  it("authored motion.plane overrides the viewer fallback", () => {
    const motion = createMotionData({ plane: Plane.FLOOR });
    const modeConfig = {
      facingAngle: 0,
      bluePlane: Plane.WHEEL,
      redPlane: Plane.WHEEL,
      rotationPlane: Plane.WALL,
      leftLateralOffset: 0,
      rightLateralOffset: 0,
    };

    const beat = {
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: motion,
        [HandSide.RIGHT]: createMotionData({ plane: Plane.FLOOR }),
      },
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
      id: "test",
    } as unknown as StepData;

    const result = stepDataToConfigs(beat, Plane.WALL, modeConfig);
    expect(result.left?.plane).toBe(Plane.FLOOR);
  });

  it("uses motion.plane per-hand when modeConfig is absent", () => {
    const leftMotion = createMotionData({
      plane: Plane.FLOOR,
      hand: HandSide.LEFT,
    });
    const rightMotion = createMotionData({
      plane: Plane.WHEEL,
      hand: HandSide.RIGHT,
    });

    const beat = {
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
      id: "test",
    } as unknown as StepData;

    const result = stepDataToConfigs(beat);
    expect(result.left?.plane).toBe(Plane.FLOOR);
    expect(result.right?.plane).toBe(Plane.WHEEL);
  });
});
