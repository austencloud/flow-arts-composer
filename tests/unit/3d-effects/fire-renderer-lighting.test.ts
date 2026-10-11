import { InstancedMesh, Object3D, PointLight, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FireRenderer3D } from "#lib/shared/3d/effects/fire/fire-renderer-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolveFire3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

describe("FireRenderer3D local lighting", () => {
  it("keeps zero-intensity lights in the startup shader signature", () => {
    const parent = new Object3D();
    const renderer = new FireRenderer3D(QualityTier.HIGH);
    renderer.initialize(parent);

    const lights = parent.children.filter(
      (child): child is PointLight => child instanceof PointLight
    );
    expect(lights).toHaveLength(4);
    expect(
      lights.every((light) => light.visible && light.intensity === 0)
    ).toBe(true);

    renderer.dispose();
  });

  it("keeps a fast, stalling wick below the facial-detail washout ceiling", () => {
    const parent = new Object3D();
    const renderer = new FireRenderer3D(QualityTier.HIGH);
    renderer.initialize(parent);
    renderer.updateConfig(resolveFire3D(DEFAULT_EFFECTS_CONFIG.fire));

    renderer.update(
      [
        {
          position: new Vector3(0, 1.6, 0),
          velocityX: 0,
          velocityY: 0,
          velocityZ: 0,
          speed: 10,
          jerk: 60,
        },
      ],
      1 / 60
    );

    const activeLight = parent.children.find(
      (child): child is PointLight =>
        child instanceof PointLight && child.visible
    );
    expect(activeLight).toBeDefined();
    expect(activeLight!.intensity).toBeGreaterThan(0);
    expect(activeLight!.intensity).toBeLessThanOrEqual(0.5);

    renderer.dispose();
  });

  it("keeps path history attached to a stable pooled source id", () => {
    const parent = new Object3D();
    const renderer = new FireRenderer3D(QualityTier.HIGH, {
      poolSize: 200,
      maxDynamicLights: 0,
    });
    renderer.initialize(parent);

    renderer.update(
      [
        {
          sourceId: 1,
          position: new Vector3(0, 1, 0),
          velocityX: 0,
          velocityY: 0,
          velocityZ: 0,
          speed: 0,
        },
      ],
      1 / 60
    );
    renderer.update(
      [
        {
          sourceId: 2,
          position: new Vector3(10, 1, 0),
          velocityX: 0,
          velocityY: 0,
          velocityZ: 0,
          speed: 0,
        },
      ],
      1 / 60
    );

    const mesh = parent.children.find(
      (child): child is InstancedMesh => child instanceof InstancedMesh
    );
    // A positional-array implementation treats source 2 as source 1 moving
    // ten metres in one frame and floods the pool through path spawning.
    expect(mesh?.count).toBeLessThan(60);

    renderer.dispose();
  });

  it("primes one invisible instance for the hidden startup upload", () => {
    const parent = new Object3D();
    const renderer = new FireRenderer3D(QualityTier.HIGH, {
      poolSize: 200,
      maxDynamicLights: 0,
    });
    renderer.initialize(parent);
    renderer.primeGpuUpload();

    const mesh = parent.children.find(
      (child): child is InstancedMesh => child instanceof InstancedMesh
    );
    expect(mesh?.count).toBe(1);
    expect(mesh?.geometry.getAttribute("aSize").getComponent(0, 0)).toBe(0);

    renderer.dispose();
  });
});
