import { describe, expect, it } from "vitest";
import {
  castFrameBox,
  castFrameCenter,
  fitCastDistance,
  isViewerCameraNearCast,
  projectedBoxFill,
} from "#lib/shared/3d/camera/viewer-camera-framing.js";

const FLOOR = -1.3;
function line(count: number, spacing = 1.6) {
  return Array.from({ length: count }, (_, i) => ({
    position: { x: (i - (count - 1) / 2) * spacing, z: 0 },
    reach: 1.3,
  }));
}
function snapshot(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number }
) {
  return { position, target, rotation: { x: 0, y: 0, z: 0 }, fov: 50 };
}

describe("cast framing distance", () => {
  it("fills the requested height for one performer and for a crew", () => {
    for (const count of [1, 7]) {
      const box = castFrameBox(line(count), FLOOR)!;
      const center = castFrameCenter(box);
      const direction = { x: 0, y: 0.3, z: 1 };
      const distance = fitCastDistance(center, direction, box, {
        fovDeg: 50,
        aspect: 16 / 9,
        heightFill: 0.6,
        maxWidthFill: 0.88,
      });
      const l = Math.hypot(0, 0.3, 1);
      const eye = {
        x: center.x,
        y: center.y + (0.3 / l) * distance,
        z: center.z + (1 / l) * distance,
      };
      const fill = projectedBoxFill(eye, center, box, 50, 16 / 9);
      expect(fill.inFront).toBe(true);
      expect(fill.width).toBeLessThanOrEqual(0.881);
      // Height lands on target unless the width limit holds the camera back.
      if (fill.width < 0.87) expect(fill.height).toBeCloseTo(0.6, 2);
    }
  });

  it("lets the width limit hold a wide line back on a portrait phone", () => {
    const box = castFrameBox(line(7, 0.9), FLOOR)!;
    const center = castFrameCenter(box);
    const distance = fitCastDistance(center, { x: 0, y: 0, z: 1 }, box, {
      fovDeg: 50,
      aspect: 390 / 844,
    });
    const fill = projectedBoxFill(
      { x: center.x, y: center.y, z: center.z + distance },
      center,
      box,
      50,
      390 / 844
    );
    expect(fill.width).toBeCloseTo(0.88, 2);
    expect(fill.height).toBeLessThan(0.6);
  });

  it("frames a seven-person crew far closer than its bounding sphere would", () => {
    const box = castFrameBox(line(7), FLOOR)!;
    const center = castFrameCenter(box);
    const distance = fitCastDistance(center, { x: 0, y: 0, z: 1 }, box, {
      fovDeg: 50,
      aspect: 16 / 9,
    });
    expect(distance).toBeLessThan(12);
    expect(distance).toBeGreaterThan(3);
  });
});

describe("saved camera sanity", () => {
  const box = castFrameBox(line(7), FLOOR)!;

  it("keeps a healthy orbit around the cast", () => {
    expect(
      isViewerCameraNearCast(
        snapshot({ x: 0, y: 2, z: 8 }, { x: 0.5, y: 0, z: 0 }),
        box
      )
    ).toBe(true);
  });

  it("drops a collapsed pivot", () => {
    expect(
      isViewerCameraNearCast(
        snapshot({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 2.6 }),
        box
      )
    ).toBe(false);
  });

  it("drops the pose wheel travel left far off the cast", () => {
    // The pose from the reported visit: camera and pivot ~66 m out.
    expect(
      isViewerCameraNearCast(
        snapshot(
          { x: 35.812, y: 26.649, z: 48.509 },
          { x: 34.454, y: 26.45, z: 47.555 }
        ),
        box
      )
    ).toBe(false);
  });

  it("drops an eye beyond orbit range even when it aims at the cast", () => {
    expect(
      isViewerCameraNearCast(
        snapshot({ x: 0, y: 20, z: 40 }, { x: 0, y: 0, z: 0 }),
        box
      )
    ).toBe(false);
  });
});
