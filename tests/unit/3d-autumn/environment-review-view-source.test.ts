import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import {
  environmentReviewPresetFromPose,
  inspectEnvironmentReviewTarget,
  readEnvironmentReviewPose,
} from "#lib/shared/3d/environments/review/environment-review-view-source.js";

describe("environment review view source", () => {
  it("round-trips a copied camera pose into an equivalent preset", () => {
    const pose = {
      x: -6.25,
      y: 2.1,
      z: 8.4,
      yaw: -0.72,
      pitch: 0.18,
    };
    const preset = environmentReviewPresetFromPose(pose, 58);
    const camera = new PerspectiveCamera(preset.fov, 1, 0.1, 100);
    camera.position.fromArray(preset.position);
    camera.lookAt(...preset.target);
    camera.updateMatrixWorld(true);

    const replayed = readEnvironmentReviewPose(camera);
    expect(replayed.x).toBeCloseTo(pose.x, 4);
    expect(replayed.y).toBeCloseTo(pose.y, 4);
    expect(replayed.z).toBeCloseTo(pose.z, 4);
    expect(replayed.yaw).toBeCloseTo(pose.yaw, 4);
    expect(replayed.pitch).toBeCloseTo(pose.pitch, 4);
  });

  it("identifies the exact GPU instance, material, origin, and hit point", () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    material.name = "Autumn Hero B PBR";
    const trees = new InstancedMesh(new BoxGeometry(2, 4, 2), material, 2);
    trees.name = "Mesh_0.001";
    trees.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0));
    trees.setMatrixAt(1, new Matrix4().makeTranslation(8, 0, 0));
    trees.instanceMatrix.needsUpdate = true;
    scene.add(trees);

    const camera = new PerspectiveCamera(58, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const target = inspectEnvironmentReviewTarget(scene, camera);
    expect(target).toMatchObject({
      object: "Mesh_0.001",
      instance: 0,
      materials: ["Autumn Hero B PBR"],
      origin: { x: 0, y: 0, z: 0 },
    });
    expect(target?.point.z).toBeCloseTo(1, 4);
    expect(target?.distance).toBeCloseTo(7, 4);
  });
});
