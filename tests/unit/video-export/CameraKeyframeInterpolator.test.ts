import { describe, it, expect } from "vitest";
import { interpolateKeyframes } from "#lib/shared/video-export/services/camera-keyframe-interpolator.js";
import type { CameraKeyframe } from "#lib/shared/video-export/domain/camera-keyframe.js";

function makeKeyframe(
  t: number,
  pos: [number, number, number],
  quat: [number, number, number, number] = [0, 0, 0, 1],
  fov = 50
): CameraKeyframe {
  return { timestamp: t, position: pos, quaternion: quat, fov };
}

describe("CameraKeyframeInterpolator", () => {

  it("returns the only keyframe for a single-keyframe buffer", () => {
    const keyframes = [makeKeyframe(0, [1, 2, 3])];
    const result = interpolateKeyframes(keyframes, 5.0);
    expect(result.position).toEqual([1, 2, 3]);
    expect(result.fov).toBe(50);
  });

  it("clamps to first keyframe before t=0", () => {
    const keyframes = [makeKeyframe(1.0, [0, 0, 0]), makeKeyframe(2.0, [10, 0, 0])];
    const result = interpolateKeyframes(keyframes, 0.5);
    expect(result.position).toEqual([0, 0, 0]);
  });

  it("clamps to last keyframe after buffer ends", () => {
    const keyframes = [makeKeyframe(0, [0, 0, 0]), makeKeyframe(1, [10, 0, 0])];
    const result = interpolateKeyframes(keyframes, 5.0);
    expect(result.position).toEqual([10, 0, 0]);
  });

  it("linearly interpolates position at midpoint", () => {
    const keyframes = [makeKeyframe(0, [0, 0, 0]), makeKeyframe(1, [10, 0, 0])];
    const result = interpolateKeyframes(keyframes, 0.5);
    expect(result.position[0]).toBeCloseTo(5, 5);
    expect(result.position[1]).toBeCloseTo(0, 5);
    expect(result.position[2]).toBeCloseTo(0, 5);
  });

  it("linearly interpolates FOV", () => {
    const keyframes = [
      makeKeyframe(0, [0, 0, 0], [0, 0, 0, 1], 40),
      makeKeyframe(1, [0, 0, 0], [0, 0, 0, 1], 60),
    ];
    const result = interpolateKeyframes(keyframes, 0.5);
    expect(result.fov).toBeCloseTo(50, 5);
  });

  it("slerps quaternion between identity and 90-deg Y rotation", () => {
    const q0: [number, number, number, number] = [0, 0, 0, 1];
    const sin45 = Math.sin(Math.PI / 4);
    const cos45 = Math.cos(Math.PI / 4);
    const q1: [number, number, number, number] = [0, sin45, 0, cos45];

    const keyframes = [makeKeyframe(0, [0, 0, 0], q0), makeKeyframe(1, [0, 0, 0], q1)];
    const result = interpolateKeyframes(keyframes, 0.5);

    const sin225 = Math.sin(Math.PI / 8);
    const cos225 = Math.cos(Math.PI / 8);
    expect(result.quaternion[0]).toBeCloseTo(0, 4);
    expect(result.quaternion[1]).toBeCloseTo(sin225, 4);
    expect(result.quaternion[2]).toBeCloseTo(0, 4);
    expect(result.quaternion[3]).toBeCloseTo(cos225, 4);
  });

  it("handles multi-segment interpolation", () => {
    const keyframes = [
      makeKeyframe(0, [0, 0, 0]),
      makeKeyframe(1, [10, 0, 0]),
      makeKeyframe(2, [10, 10, 0]),
    ];
    const result = interpolateKeyframes(keyframes, 1.5);
    expect(result.position[0]).toBeCloseTo(10, 5);
    expect(result.position[1]).toBeCloseTo(5, 5);
    expect(result.position[2]).toBeCloseTo(0, 5);
  });
});
