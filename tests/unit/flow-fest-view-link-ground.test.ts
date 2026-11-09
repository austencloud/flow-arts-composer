import { describe, expect, it } from "vitest";
import {
  STANDING_PITCH_LIMIT_RADIANS,
  standReviewArrivalOnGround,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-review-camera-ground";
import { parseFlowFestViewLink } from "../../src/routes/test/flow-fest-sim/flow-fest-view-link";

const GROUND_BODY_Y = 21;
const EYE_ABOVE_BODY = 0.8;

describe("shared view links arrive standing", () => {
  it("marks a parsed link as standing on the ground", () => {
    const camera = parseFlowFestViewLink(
      new URLSearchParams("cam=104,45,-86&look=118,25,-104&fov=60")
    );
    expect(camera?.standOnGround).toBe(true);
  });

  it("puts a body from a sky-high link on the terrain and keeps its spot", () => {
    const { body } = standReviewArrivalOnGround({
      body: { x: 104, y: 44.2, z: -86 },
      groundBodyY: GROUND_BODY_Y,
      eyeAboveBody: EYE_ABOVE_BODY,
      cameraWorld: [104, 45, -86],
      targetWorld: [118, 25, -104],
      pitch: 0.83,
    });
    expect(body).toEqual({ x: 104, y: GROUND_BODY_Y, z: -86 });
  });

  it("re-aims the view from the standing eye instead of staring down", () => {
    const { pitch } = standReviewArrivalOnGround({
      body: { x: 104, y: 44.2, z: -86 },
      groundBodyY: GROUND_BODY_Y,
      eyeAboveBody: EYE_ABOVE_BODY,
      cameraWorld: [104, 45, -86],
      targetWorld: [118, 21, -104],
      pitch: 0.83,
    });
    // The eye is now 0.8 m above the look point and about 23 m from it.
    expect(pitch).toBeCloseTo(Math.atan2(0.8, Math.hypot(14, 18)), 5);
  });

  it("never arrives looking steeper than the standing limit", () => {
    const { pitch } = standReviewArrivalOnGround({
      body: { x: 0, y: 80, z: 0 },
      groundBodyY: GROUND_BODY_Y,
      eyeAboveBody: EYE_ABOVE_BODY,
      cameraWorld: [0, 80.8, 0],
      targetWorld: [0.5, -40, 0.5],
      pitch: 1.5,
    });
    expect(pitch).toBe(STANDING_PITCH_LIMIT_RADIANS);
  });

  it("lifts a body that would start under the terrain", () => {
    const { body } = standReviewArrivalOnGround({
      body: { x: 5, y: 9, z: 5 },
      groundBodyY: GROUND_BODY_Y,
      eyeAboveBody: EYE_ABOVE_BODY,
      cameraWorld: [5, 9.8, 5],
      targetWorld: [25, 9.8, 5],
      pitch: 0,
    });
    expect(body.y).toBe(GROUND_BODY_Y);
  });

  it("leaves a body standing on a low deck where the link was copied", () => {
    const input = {
      body: { x: 5, y: GROUND_BODY_Y + 1.2, z: 5 },
      groundBodyY: GROUND_BODY_Y,
      eyeAboveBody: EYE_ABOVE_BODY,
      cameraWorld: [5, GROUND_BODY_Y + 2, 5] as [number, number, number],
      targetWorld: [25, GROUND_BODY_Y + 2, 5] as [number, number, number],
      pitch: 0.1,
    };
    expect(standReviewArrivalOnGround(input)).toEqual({
      body: input.body,
      pitch: 0.1,
    });
  });
});
