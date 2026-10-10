import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
} from "three";
import { createInstanceFrustumCuller } from "#lib/shared/3d/rendering/instance-frustum-culling.js";

function buildTreeBatch() {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, 3);
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -10));
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, -60));
  mesh.setMatrixAt(2, new Matrix4().makeTranslation(0, 0, 10));
  mesh.instanceMatrix.needsUpdate = true;
  const root = new Group();
  root.add(mesh);
  return { geometry, material, mesh, root };
}

function buildCamera() {
  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe("instance frustum culling", () => {
  it("selects one non-overlapping distance tier before frustum submission", () => {
    const near = buildTreeBatch();
    const camera = buildCamera();
    const culler = createInstanceFrustumCuller(near.root, {
      minRenderedVerticesPerBatch: 0,
      minimumDistanceMeters: 0,
      maximumDistanceMeters: 50,
    });

    const stats = culler.update(camera);

    expect(stats.visibleInstances).toBe(1);
    expect(stats.visibleBatches).toBe(1);
    expect(stats.distanceRejectedInstances).toBe(1);
    expect(stats.frustumRejectedInstances).toBe(1);
    expect(near.mesh.count).toBe(1);
    expect(near.mesh.visible).toBe(true);

    culler.restore();
    expect(near.mesh.count).toBe(3);
    near.geometry.dispose();
    near.material.dispose();
  });

  it("submits the matching middle tier without duplicating near instances", () => {
    const middle = buildTreeBatch();
    const camera = buildCamera();
    const culler = createInstanceFrustumCuller(middle.root, {
      minRenderedVerticesPerBatch: 0,
      minimumDistanceMeters: 50,
      maximumDistanceMeters: 100,
    });

    const stats = culler.update(camera);

    expect(stats.visibleInstances).toBe(1);
    expect(stats.visibleBatches).toBe(1);
    expect(stats.distanceRejectedInstances).toBe(2);
    expect(stats.frustumRejectedInstances).toBe(0);
    expect(middle.mesh.count).toBe(1);

    culler.restore();
    middle.geometry.dispose();
    middle.material.dispose();
  });

  it("holds the submitted set through sub-threshold camera jitter", () => {
    const batch = buildTreeBatch();
    const camera = buildCamera();
    const culler = createInstanceFrustumCuller(batch.root, {
      minRenderedVerticesPerBatch: 0,
      cameraPositionThresholdMeters: 0.5,
      cameraRotationThresholdRadians: 0.01,
    });

    culler.update(camera);
    camera.position.x = 0.2;
    camera.rotation.y = 0.005;
    camera.updateMatrixWorld(true);
    const held = culler.update(camera);

    expect(held.updates).toBe(1);
    expect(held.skippedUpdates).toBe(1);

    camera.position.x = 1;
    camera.updateMatrixWorld(true);
    const refreshed = culler.update(camera);
    expect(refreshed.updates).toBe(2);

    culler.restore();
    batch.geometry.dispose();
    batch.material.dispose();
  });
});
