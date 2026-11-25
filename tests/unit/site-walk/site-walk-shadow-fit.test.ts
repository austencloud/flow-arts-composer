import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  fitShadow,
  shadowMapSize,
} from "../../../src/routes/test/site-walk/look/site-walk-shadow-fit";
import { directionOf } from "../../../src/routes/test/site-walk/look/site-walk-look";

const box = { minX: 0, maxX: 30, minZ: 0, maxZ: 24, height: 6 };

function cameraFor(azimuth: number, elevation: number) {
  const fit = fitShadow(directionOf(azimuth, elevation), box);
  const camera = new OrthographicCamera(
    fit.left,
    fit.right,
    fit.top,
    fit.bottom,
    fit.near,
    fit.far
  );
  camera.position.copy(fit.position);
  camera.lookAt(fit.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { fit, camera };
}

describe("the sun's shadow map", () => {
  it.each([
    [291, 8.5],
    [205, 42],
    [20, 3],
    [120, 70],
  ])(
    "holds the whole site with the light at %d, %d degrees up",
    (azimuth, elevation) => {
      const { camera } = cameraFor(azimuth, elevation);
      for (const x of [box.minX, box.maxX]) {
        for (const z of [box.minZ, box.maxZ]) {
          for (const y of [0, box.height]) {
            const p = new Vector3(x, y, z).project(camera);
            for (const c of [p.x, p.y, p.z])
              expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-6);
          }
        }
      }
    }
  );

  it("gives a shadow the same detail across as up and down", () => {
    for (const elevation of [8.5, 42]) {
      const { fit } = cameraFor(291, elevation);
      const { width, height } = shadowMapSize(fit, 4096 * 4096, 16384);
      const across = (fit.right - fit.left) / width;
      const down = (fit.top - fit.bottom) / height;
      expect(across / down).toBeGreaterThan(0.95);
      expect(across / down).toBeLessThan(1.05);
      expect(width * height).toBeLessThanOrEqual(4096 * 4096);
    }
  });

  it("stays inside the largest picture the card can hold", () => {
    const { fit } = cameraFor(291, 8.5);
    const { width, height } = shadowMapSize(fit, 4096 * 4096, 4096);
    expect(width).toBeLessThanOrEqual(4096);
    expect(height).toBeLessThanOrEqual(4096);
    expect(height).toBeGreaterThan(0);
  });

  it("spends its rows on the ground when the sun is low", () => {
    const { fit } = cameraFor(291, 8.5);
    expect(fit.top - fit.bottom).toBeLessThan((fit.right - fit.left) * 0.4);
  });
});
