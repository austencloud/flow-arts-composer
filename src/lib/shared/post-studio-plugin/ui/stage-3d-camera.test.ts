import { describe, expect, it } from "vitest";
import {
  STAGE_3D_FRONT_TURN_RAD,
  STAGE_3D_LOW_TARGET_HEIGHT,
  stage3DTargetLift,
  stage3DCameraPose,
  stage3DFramedPose,
  turnStagePose,
  type StageBaseShot,
  type StageCameraPose,
} from "./stage-3d-camera";

const DEG = Math.PI / 180;
const GROUND = 0.2;
const DISTANCE = 6;

/** A choreographer-style framing: 36° up, 6 m from the cast on the floor. */
const BASE: StageBaseShot = {
  position: {
    x: 0,
    y: GROUND + DISTANCE * Math.sin(36 * DEG),
    z: -DISTANCE * Math.cos(36 * DEG),
  },
  target: { x: 0, y: GROUND + 0.55, z: 0 },
  groundY: GROUND,
};

function eyeToTarget(pose: StageCameraPose): number {
  return Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z
  );
}

function expectPoseClose(a: StageCameraPose, b: StageCameraPose): void {
  for (const key of ["x", "y", "z"] as const) {
    expect(a.position[key]).toBeCloseTo(b.position[key], 9);
    expect(a.target[key]).toBeCloseTo(b.target[key], 9);
  }
}

describe("stage3DFramedPose", () => {
  it("gives the base pose back at 36° and zoom 1", () => {
    expectPoseClose(stage3DFramedPose(BASE), BASE);
    expectPoseClose(stage3DFramedPose(BASE, 36, 1), BASE);
  });

  it("keeps the shot's distance and ground direction and swaps the angle", () => {
    const low = stage3DFramedPose(BASE, 20);
    expect(low.position.y - GROUND).toBeCloseTo(DISTANCE * Math.sin(20 * DEG));
    expect(-low.position.z).toBeCloseTo(DISTANCE * Math.cos(20 * DEG));
    expect(low.position.x).toBeCloseTo(0);
    expect(low.target.x).toBe(BASE.target.x);
    expect(low.target.z).toBe(BASE.target.z);
  });

  it("aims a low camera at chest height and leaves 36° on the waist", () => {
    expect(stage3DTargetLift(36, 0.55)).toBe(0);
    expect(stage3DTargetLift(50, 0.55)).toBe(0);
    expect(stage3DTargetLift(28, 0.55)).toBeCloseTo(0.225);
    expect(stage3DFramedPose(BASE, 20).target.y).toBeCloseTo(
      GROUND + STAGE_3D_LOW_TARGET_HEIGHT
    );
    expect(stage3DFramedPose(BASE, 5).target.y).toBeCloseTo(
      GROUND + STAGE_3D_LOW_TARGET_HEIGHT
    );
  });

  it("scales the eye's distance to the target and keeps its direction", () => {
    const elevated = stage3DFramedPose(BASE, 20);
    const zoomed = stage3DFramedPose(BASE, 20, 0.6);
    expect(eyeToTarget(zoomed)).toBeCloseTo(eyeToTarget(elevated) * 0.6);
    const along = (pose: StageCameraPose) => {
      const length = eyeToTarget(pose);
      return [
        (pose.position.x - pose.target.x) / length,
        (pose.position.y - pose.target.y) / length,
        (pose.position.z - pose.target.z) / length,
      ];
    };
    along(zoomed).forEach((value, index) =>
      expect(value).toBeCloseTo(along(elevated)[index]!)
    );
  });

  it("clamps zoom and elevation to the clip's ranges", () => {
    expectPoseClose(stage3DFramedPose(BASE, 90, 5), stage3DFramedPose(BASE, 60, 2));
    expectPoseClose(stage3DFramedPose(BASE, 0, 0), stage3DFramedPose(BASE, 5, 0.35));
  });
});

describe("stage3DCameraPose", () => {
  it("frames front and orbit at the clip's elevation and zoom", () => {
    const stage = { shot: "front" as const, elevation: 20, zoom: 0.6 };
    const front = turnStagePose(
      stage3DFramedPose(BASE, 20, 0.6),
      STAGE_3D_FRONT_TURN_RAD
    );
    expectPoseClose(stage3DCameraPose(stage, BASE, 1.2), front);
    expectPoseClose(
      stage3DCameraPose({ ...stage, shot: "orbit" }, BASE, 1.2),
      turnStagePose(front, 1.2)
    );
  });

  it("leaves an existing clip's front shot where it was", () => {
    expectPoseClose(
      stage3DCameraPose({ shot: "front" }, BASE, 0),
      turnStagePose(BASE, STAGE_3D_FRONT_TURN_RAD)
    );
  });

  it("ignores zoom and elevation on a saved shot", () => {
    const camera = {
      position: { x: 1, y: 2, z: 3 },
      target: { x: 0, y: 1, z: 0 },
    };
    expect(
      stage3DCameraPose(
        { shot: "saved", camera, zoom: 0.5, elevation: 10 },
        BASE,
        0
      )
    ).toEqual(camera);
    expectPoseClose(
      stage3DCameraPose({ shot: "saved", zoom: 0.5, elevation: 10 }, BASE, 0),
      stage3DCameraPose({ shot: "front" }, BASE, 0)
    );
  });
});
