import { describe, expect, it } from "vitest";
import {
  Frustum,
  InstancedMesh,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Sphere,
} from "three";

import { VegetationManager } from "./instanced-vegetation";
import type { VegetationData } from "../workers/chunk-generator.worker";

function tree(x: number, z: number, scale = 1): VegetationData {
  return { type: "tree1", x, y: 0, z, rotation: 0, scale } as VegetationData;
}

function setup() {
  const scene = new Scene();
  const manager = new VegetationManager(scene, {
    useGLTFModels: false,
    maxInstancesPerCategory: 64,
    maxGrassInstances: 64,
  });
  const mesh = scene.children.find(
    (child): child is InstancedMesh =>
      child instanceof InstancedMesh && child.name === "vegetation_tree1"
  );
  if (!mesh) throw new Error("tree1 batch missing");
  return { scene, manager, mesh };
}

// Every live instance's own sphere must sit inside the mesh's sphere, or three.js
// culls a tree that is on screen.
function expectCoversEveryInstance(mesh: InstancedMesh): void {
  const bounds = mesh.boundingSphere;
  expect(bounds).not.toBeNull();
  mesh.geometry.computeBoundingSphere();
  const matrix = new Matrix4();
  const instance = new Sphere();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    instance.copy(mesh.geometry.boundingSphere!).applyMatrix4(matrix);
    const reach = bounds!.center.distanceTo(instance.center) + instance.radius;
    expect(reach).toBeLessThanOrEqual(bounds!.radius + 1e-4);
  }
}

describe("VegetationManager culling bounds", () => {
  it("keeps frustum culling on for every batch", () => {
    const { scene } = setup();
    const batches = scene.children.filter((c) => c instanceof InstancedMesh);
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(batch.frustumCulled).toBe(true);
  });

  it("bounds every instance, not just the base model at the origin", () => {
    const { manager, mesh } = setup();
    manager.addChunkVegetation("10,0,10", 320, 320, [tree(1, 1), tree(30, 30, 3)]);
    manager.addChunkVegetation("-5,0,0", -160, 0, [tree(4, 4, 2)]);

    expect(mesh.count).toBe(3);
    expectCoversEveryInstance(mesh);

    // A camera beside the far trees, looking at them, must not cull the batch.
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(350, 2, 380);
    camera.lookAt(350, 2, 350);
    camera.updateMatrixWorld();
    mesh.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    expect(frustum.intersectsObject(mesh)).toBe(true);
  });

  it("recomputes the bounds when chunks arrive and leave", () => {
    const { manager, mesh } = setup();
    manager.addChunkVegetation("0,0,0", 0, 0, [tree(2, 2)]);
    const nearRadius = mesh.boundingSphere!.radius;

    manager.addChunkVegetation("20,0,20", 640, 640, [tree(5, 5)]);
    expectCoversEveryInstance(mesh);
    expect(mesh.boundingSphere!.radius).toBeGreaterThan(nearRadius * 10);

    manager.removeChunkVegetation("20,0,20");
    manager.rebuildDirtyBatches();
    expect(mesh.count).toBe(1);
    expectCoversEveryInstance(mesh);
    expect(mesh.boundingSphere!.radius).toBeCloseTo(nearRadius, 4);
  });

  it("toggles shadow casting on every batch", () => {
    const { scene, manager } = setup();
    manager.setCastShadow(false);
    for (const batch of scene.children.filter((c) => c instanceof InstancedMesh)) {
      expect(batch.castShadow).toBe(false);
    }
  });
});
