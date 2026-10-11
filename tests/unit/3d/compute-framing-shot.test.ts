import { describe, expect, it } from "vitest";

import { computeFramingShot } from "#lib/shared/3d/camera/compute-framing-shot.js";

const PERFORMERS = [
  { x: -5, z: -4 },
  { x: 5, z: -4 },
  { x: -5, z: 4 },
  { x: 5, z: 4 },
];

function cameraDistance(aspectRatio: number): number {
  const shot = computeFramingShot({
    performers: PERFORMERS,
    plane: "wall",
    groundOffset: 0,
    fovDeg: 50,
    aspectRatio,
  });
  return Math.hypot(
    shot.eye.x - shot.target.x,
    shot.eye.y - shot.target.y,
    shot.eye.z - shot.target.z
  );
}

describe("computeFramingShot", () => {
  it("moves back for portrait canvases whose horizontal frustum is narrower", () => {
    const portrait = cameraDistance(0.6);
    const square = cameraDistance(1);
    const landscape = cameraDistance(16 / 9);

    expect(portrait).toBeGreaterThan(square);
    expect(square).toBeGreaterThan(landscape);
  });

  it("preserves the square-frustum behavior when aspect ratio is omitted", () => {
    const legacy = computeFramingShot({
      performers: PERFORMERS,
      plane: "wall",
      groundOffset: 0,
    });
    const square = computeFramingShot({
      performers: PERFORMERS,
      plane: "wall",
      groundOffset: 0,
      aspectRatio: 1,
    });

    expect(legacy).toEqual(square);
  });
});
