import { afterEach, describe, expect, it, vi } from "vitest";
import { Object3D, Quaternion, Vector3 } from "three";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolvePetals3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
import { PetalPoolRenderer3D } from "#lib/shared/3d/effects/petals/petal-pool-renderer-3d.js";
import { createPetalSurfaceGeometry } from "#lib/shared/3d/effects/petals/petal-surface-geometry.js";
import { petalGroundClearance } from "#lib/shared/3d/effects/petals/petal-ground-contact.js";
import type { PetalTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";

afterEach(() => vi.restoreAllMocks());

function source(floorY: number, height: number): PetalTipSource3D {
  return {
    effect: "petals",
    sourceId: 1,
    propIndex: 0,
    tipIndex: 0,
    position: { x: 0, y: height, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 2,
    currentStep: 0,
    propColor: "#ffffff",
    collisionFloorY: floorY,
    params: {
      ...resolvePetals3D(DEFAULT_EFFECTS_CONFIG.petals),
      poolSize: 2,
      ambientEmission: 0,
      motionEmission: 1,
      motionTipRate: 100,
      fallBaseSpeed: 1.5,
      carry: 0,
    },
  };
}

function attributes(parent: Object3D, poolIndex = 0) {
  const mesh = parent.children[poolIndex] as import("three").InstancedMesh;
  const geometry = mesh.geometry;
  return {
    mesh,
    center: geometry.getAttribute("aCenter"),
    quaternion: geometry.getAttribute("aQuaternion"),
    alpha: geometry.getAttribute("aAlpha"),
  };
}

describe("petal groundfall", () => {
  it("keeps airborne petals visible beyond their old timer and uses the floor copied at spawn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new PetalPoolRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source(0, 6);
    renderer.update([tip], 1 / 60);
    tip.params.motionEmission = 0;
    tip.collisionFloorY = -9;
    for (let frame = 0; frame < 180; frame++) renderer.update([tip], 1 / 60);
    const { mesh, alpha } = attributes(parent);
    expect(mesh.count).toBeGreaterThan(0);
    expect(alpha.getX(0)).toBeGreaterThan(0.1);
    renderer.dispose();
  });

  it("lands above the original floor, settles, reuses capacity, and clears", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new PetalPoolRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source(-0.6, 0.4);
    renderer.update([tip], 1 / 60);
    tip.params.motionEmission = 0;
    tip.collisionFloorY = -5;
    for (let frame = 0; frame < 150; frame++) renderer.update([tip], 1 / 60);
    const { mesh, center, quaternion } = attributes(parent, 1);
    expect(mesh.count).toBeGreaterThan(0);
    const q = new Quaternion(
      quaternion.getX(0),
      quaternion.getY(0),
      quaternion.getZ(0),
      quaternion.getW(0)
    );
    expect(new Vector3(0, 0, 1).applyQuaternion(q).y).toBeGreaterThan(0.9);
    expect(center.getY(0)).toBeGreaterThan(-0.6);
    expect(center.getY(0)).toBeLessThan(-0.45);

    tip.position.y = 0.8;
    tip.params.motionEmission = 1;
    renderer.update([tip], 1 / 60);
    const flying = attributes(parent);
    expect(flying.mesh.count).toBe(1);
    expect(flying.center.getY(0)).toBeGreaterThan(0.5);
    renderer.update([tip], 1 / 60);
    expect(flying.mesh.count).toBe(2);
    expect(mesh.count).toBe(0);
    renderer.clear();
    expect(mesh.count).toBe(0);
    expect(flying.mesh.count).toBe(0);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("completes fade-in when a petal lands immediately and keeps grounded petals visible nearby", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new PetalPoolRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source(0, 0);
    renderer.update([tip], 1 / 60);
    tip.params.motionEmission = 0;
    for (let frame = 0; frame < 45; frame++) renderer.update([tip], 1 / 60);
    const grounded = attributes(parent, 1);
    expect(grounded.mesh.count).toBe(1);
    expect(grounded.alpha.getX(0)).toBeGreaterThan(0.3);
    expect(attributes(parent).mesh.count).toBe(0);
    const flyingFade = (
      attributes(parent).mesh.material as import("three").ShaderMaterial
    ).uniforms.uNearFadeEnd.value;
    const groundFade = (
      grounded.mesh.material as import("three").ShaderMaterial
    ).uniforms.uNearFadeEnd.value;
    expect(groundFade).toBeLessThan(flyingFade);
    renderer.dispose();
  });

  it("retains the bed after emission stops, then retires old petals", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new PetalPoolRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source(0, 0);
    renderer.update([tip], 1 / 60);
    const grounded = attributes(parent, 1);
    for (let frame = 0; frame < 800; frame++) renderer.update([], 0.05);
    expect(grounded.mesh.count).toBe(1);
    expect(grounded.alpha.getX(0)).toBeGreaterThan(0.3);
    for (let frame = 0; frame < 400; frame++) renderer.update([], 0.05);
    expect(grounded.mesh.count).toBe(0);
    renderer.dispose();
  });

  it("keeps all curved vertices above the floor through varied contact angles", () => {
    const geometry = createPetalSurfaceGeometry();
    const positions = geometry.getAttribute("position");
    const vertex = new Vector3();
    const angles = [
      new Quaternion(),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 1).normalize(), 1.7),
    ];
    for (const orientation of angles) {
      const size = 0.08;
      const clearance = petalGroundClearance(size, orientation);
      for (let index = 0; index < positions.count; index++) {
        vertex
          .fromBufferAttribute(positions, index)
          .multiplyScalar(size * 2)
          .applyQuaternion(orientation);
        expect(clearance + vertex.y).toBeGreaterThanOrEqual(-0.000001);
      }
    }
    geometry.dispose();
  });
});
