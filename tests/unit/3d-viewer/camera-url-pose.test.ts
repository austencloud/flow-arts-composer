import { describe, expect, it } from "vitest";

import {
  clearCameraUrlPose,
  readCameraUrlPose,
  setCameraUrlPose,
} from "#lib/shared/3d/domain/camera-url-pose.js";

describe("camera URL pose", () => {
  it("round-trips a complete camera pose through the review-link format", () => {
    const url = new URL("https://localhost/review?prop=fan&angle=top");

    setCameraUrlPose(url, {
      position: { x: 1.234, y: -0.005, z: 9.876 },
      target: { x: 0.25, y: 0.5, z: -0.75 },
      fov: 48,
    });

    expect(url.searchParams.get("cam")).toBe("1.23,-0.01,9.88");
    expect(url.searchParams.get("look")).toBe("0.25,0.50,-0.75");
    expect(readCameraUrlPose(url.searchParams, 50)).toEqual({
      position: { x: 1.23, y: -0.01, z: 9.88 },
      target: { x: 0.25, y: 0.5, z: -0.75 },
      fov: 48,
    });
  });

  it("rejects partial or malformed coordinates", () => {
    expect(readCameraUrlPose(new URLSearchParams("cam=1,2,3"), 48)).toBeNull();
    expect(
      readCameraUrlPose(new URLSearchParams("cam=1,2,nope&look=0,0,0"), 48)
    ).toBeNull();
  });

  it("uses the route's field of view when the URL value is invalid", () => {
    const params = new URLSearchParams("cam=1,2,3&look=4,5,6&fov=not-a-number");
    expect(readCameraUrlPose(params, 46)?.fov).toBe(46);
  });

  it("clears only the custom camera coordinates", () => {
    const url = new URL(
      "https://localhost/review?prop=fan&angle=top&cam=1,2,3&look=4,5,6&fov=48"
    );
    clearCameraUrlPose(url);

    expect(url.search).toBe("?prop=fan&angle=top");
  });
});
