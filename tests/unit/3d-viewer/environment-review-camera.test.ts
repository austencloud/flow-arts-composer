import { describe, expect, it } from "vitest";
import { CAMERA_DEFAULTS } from "@austencloud/camera-3d";
import { BoxGeometry, Group, Mesh } from "three";
import {
  collectEnvironmentCameraCollisionMeshes,
  resolveEnvironmentReviewOrbitLift,
  resolveEnvironmentReviewWalkPose,
  sampleEnvironmentCameraSurfaceY,
} from "#lib/shared/3d/environments/review/environment-review-camera.js";

describe("environment review walk camera", () => {
  it("preserves the approved eye position when switching from a fixed shot", () => {
    const preset = {
      position: [0, 2.1, 7] as const,
      target: [0, 1.3, 0] as const,
      fov: 58,
    };

    const pose = resolveEnvironmentReviewWalkPose(preset);

    expect(
      pose.playerPosition.y + CAMERA_DEFAULTS.FIRST_PERSON_CAMERA_OFFSET
    ).toBeCloseTo(preset.position[1], 8);
    expect(pose.playerPosition.x).toBe(preset.position[0]);
    expect(pose.playerPosition.z).toBe(preset.position[2]);
  });

  it("faces the fixed shot target without an initial camera jump", () => {
    const pose = resolveEnvironmentReviewWalkPose({
      position: [0, 2.1, 7],
      target: [0, 1.3, 0],
      fov: 58,
    });

    expect(pose.yaw).toBeCloseTo(Math.PI, 8);
    expect(pose.pitch).toBeGreaterThan(0);
    expect(pose.pitch).toBeLessThan(0.2);
  });

  it("keeps a zero-length review direction finite", () => {
    const pose = resolveEnvironmentReviewWalkPose({
      position: [2, 3, 4],
      target: [2, 3, 4],
      fov: 58,
    });

    expect(pose.yaw).toBe(0);
    expect(pose.pitch).toBe(0);
  });

  it("selects only authored camera-collision ground meshes", () => {
    const root = new Group();
    const ground = new Mesh(new BoxGeometry(10, 1, 10));
    ground.userData.tka_camera_collision = true;
    ground.position.y = -0.5;
    const tree = new Mesh(new BoxGeometry(1, 6, 1));
    root.add(ground, tree);
    root.updateMatrixWorld(true);

    const collisions = collectEnvironmentCameraCollisionMeshes(root);

    expect(collisions).toEqual([ground]);
    expect(sampleEnvironmentCameraSurfaceY(collisions, 0, 0)).toBeCloseTo(0, 5);
  });

  it("lifts a restored orbit enough to keep both eye and target above terrain", () => {
    const lift = resolveEnvironmentReviewOrbitLift(
      { x: 0, y: -0.4, z: 4 },
      { x: 0, y: -1, z: 0 },
      0,
      0
    );

    expect(lift.amount).toBeCloseTo(1.02, 8);
    expect(-0.4 + lift.amount).toBeGreaterThanOrEqual(0.35);
    expect(-1 + lift.amount).toBeGreaterThanOrEqual(0.02);
  });

  it("leaves an already safe orbit unchanged", () => {
    expect(
      resolveEnvironmentReviewOrbitLift(
        { x: 0, y: 2, z: 4 },
        { x: 0, y: 0.5, z: 0 },
        0,
        0
      ).amount
    ).toBe(0);
  });
});
