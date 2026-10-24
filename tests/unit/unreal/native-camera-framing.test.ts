import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { frameNativeCamera } from "../../../src/lib/shared/3d/unreal/domain/native-camera-framing";

// 2d926cff16 made the web feet height an explicit argument. Standalone
// viewers keep the historical origin, feet at web Y = -1.2
// (UnrealViewerSurface.webFeetY), so native Y = web Y + 1.2.
const STANDALONE_WEB_FEET_Y = -1.2;

describe("native viewer camera framing", () => {
  it.each([366 / 668, 1, 1430 / 900, 3840 / 1080])(
    "keeps performer and prop bounds inside aspect %s",
    (aspect) => {
      const shot = frameNativeCamera(
        { x: 0.1, y: 2, z: 6.2 },
        { x: 0.1, y: 0.55, z: 0 },
        1.2,
        aspect,
        50,
        STANDALONE_WEB_FEET_Y
      );
      const verticalFov =
        (Math.atan(Math.tan((25 * Math.PI) / 180) / aspect) * 360) / Math.PI;
      const camera = new PerspectiveCamera(verticalFov, aspect, 0.1, 100);
      camera.position.set(shot.position.x, shot.position.y, shot.position.z);
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
      camera.updateMatrixWorld();

      // Probe the padded performer sphere through Three's independent camera
      // projection, including feet and an overhead prop, rather than restating
      // the distance calculation under test.
      for (let latitude = -90; latitude <= 90; latitude += 15) {
        for (let longitude = 0; longitude < 360; longitude += 15) {
          const phi = (latitude * Math.PI) / 180;
          const theta = (longitude * Math.PI) / 180;
          const point = new Vector3(
            shot.target.x + 1.8 * Math.cos(phi) * Math.sin(theta),
            shot.target.y + 1.8 * Math.sin(phi),
            shot.target.z + 1.8 * Math.cos(phi) * Math.cos(theta)
          ).project(camera);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(1.00001);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1.00001);
          expect(point.z).toBeGreaterThan(-1);
          expect(point.z).toBeLessThan(1);
        }
      }
      expect(shot.target.x).toBe(0.1);
      expect(shot.target.y).toBeCloseTo(0.55 - STANDALONE_WEB_FEET_Y);
      expect(shot.target.z).toBe(0);
    }
  );

  it("refits an over-distant web portrait shot without changing its direction", () => {
    const target = { x: 0.1, y: 0.55, z: 0 };
    const close = frameNativeCamera(
      { x: 6.2, y: 0.55, z: 0 },
      target,
      1.2,
      0.55,
      50,
      STANDALONE_WEB_FEET_Y
    );
    const distant = frameNativeCamera(
      { x: 60, y: 0.55, z: 0 },
      target,
      1.2,
      0.55,
      50,
      STANDALONE_WEB_FEET_Y
    );
    expect(distant.position.x).toBeCloseTo(close.position.x);
    expect(distant.position.x - distant.target.x).toBeLessThan(5);
    expect(distant.position.y).toBe(distant.target.y);
    expect(distant.position.z).toBe(distant.target.z);
  });

  it("provides a usable direction for coincident eye and target", () => {
    const point = { x: 3, y: 2, z: -4 };
    // Feet at web Y = 0 leaves the target where it was.
    const shot = frameNativeCamera(point, point, 1.2, 1, 50, 0);
    expect(shot.target).toEqual(point);
    expect(shot.position.x).toBe(point.x);
    expect(shot.position.y).toBe(point.y);
    expect(shot.position.z).toBeGreaterThan(point.z);
    expect(Object.values(shot.position).every(Number.isFinite)).toBe(true);
  });
});
