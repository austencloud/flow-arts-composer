import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GripType, type AuthoredContactPose } from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sampleStaffIsolation } from "$lib/shared/3d/performers/staff-isolation";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const HEIGHT = 1.905;
const NEUTRAL: AuthoredContactPose = {
  pelvisOffset: { x: 0, y: 0, z: 0 },
  torsoYawRad: 0,
  torsoLeanRad: 0,
  torsoPitchRad: 0,
  elbowPole: { x: -0.2, y: -0.8, z: 0.35 },
};
const WEST: AuthoredContactPose = {
  pelvisOffset: { x: -0.035, y: 0, z: 0.025 },
  torsoYawRad: 0.9,
  torsoLeanRad: 0.1,
  torsoPitchRad: 0,
  elbowPole: { x: -0.2, y: -0.6, z: 1 },
};

function poseAt(phase: number): AuthoredContactPose {
  const t = phase <= 2 ? 0 : phase >= 3 ? 1 : phase - 2;
  const interpolate = (a: number, b: number) => a + (b - a) * t;
  return {
    pelvisOffset: {
      x: interpolate(NEUTRAL.pelvisOffset.x, WEST.pelvisOffset.x),
      y: interpolate(NEUTRAL.pelvisOffset.y, WEST.pelvisOffset.y),
      z: interpolate(NEUTRAL.pelvisOffset.z, WEST.pelvisOffset.z),
    },
    torsoYawRad: interpolate(NEUTRAL.torsoYawRad, WEST.torsoYawRad),
    torsoLeanRad: interpolate(NEUTRAL.torsoLeanRad, WEST.torsoLeanRad),
    torsoPitchRad: 0,
    elbowPole: {
      x: interpolate(NEUTRAL.elbowPole.x, WEST.elbowPole.x),
      y: interpolate(NEUTRAL.elbowPole.y, WEST.elbowPole.y),
      z: interpolate(NEUTRAL.elbowPole.z, WEST.elbowPole.z),
    },
  };
}

async function setup() {
  const { scene } = await loadRig(avatar("ch07"));
  const services = createAvatarServices({
    enableLocomotion: false,
    enableRootMotion: false,
    enableFootPlanting: false,
  });
  (
    services.skeleton as unknown as {
      processGLTF(root: import("three").Object3D, bounds: null, label: string): void;
    }
  ).processGLTF(scene, null, "ch07");
  services.skeleton.setHeight(HEIGHT);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateWorldMatrix(true, true);
  root.updateMatrixWorld(true);
  const state = services.skeleton.getState();
  services.fingers.initialize(state.fingerChains!, state.meshes);
  services.fingers.setGrips(GripType.IDLE, GripType.SQUARE);
  services.fingers.setCylinderContactStrict(true);
  services.animator.setContactMode("prop-authoritative");
  const chains = [
    services.skeleton.getLeftArmChain()!,
    services.skeleton.getRightArmChain()!,
    services.skeleton.getLeftLegChain()!,
    services.skeleton.getRightLegChain()!,
  ];
  const lengths = chains.map((chain) => [
    chain.root.getWorldPosition(new Vector3()).distanceTo(chain.middle.getWorldPosition(new Vector3())),
    chain.middle.getWorldPosition(new Vector3()).distanceTo(chain.effector.getWorldPosition(new Vector3())),
  ]);
  const feet = chains.slice(2).map((chain) => chain.effector.getWorldPosition(new Vector3()));
  return { services, state, chains, lengths, feet, root };
}

function sample(
  rig: Awaited<ReturnType<typeof setup>>,
  phase: number,
  pose: AuthoredContactPose
) {
  const authored = sampleStaffIsolation(phase);
  const target = authored.worldPosition.clone().add(ORIGIN);
  const orientation = authored.worldRotation.clone().multiply(
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
  );
  rig.services.animator.setAuthoredContactPose(pose);
  rig.services.animator.setPropsAndBlend(null, { ...authored, worldPosition: target }, undefined, {
    blue: null,
    red: orientation,
  });
  rig.services.fingers.update(1 / 120);
  rig.services.animator.update(1 / 120);
  rig.root.updateWorldMatrix(true, true);
  const lengths = rig.chains.map((chain) => [
    chain.root.getWorldPosition(new Vector3()).distanceTo(chain.middle.getWorldPosition(new Vector3())),
    chain.middle.getWorldPosition(new Vector3()).distanceTo(chain.effector.getWorldPosition(new Vector3())),
  ]);
  const bones = [...rig.state.bones.values()];
  return {
    hips: rig.state.bones.get("Hips")!.getWorldPosition(new Vector3()),
    torsoForward: new Vector3(0, 0, 1).applyQuaternion(
      rig.state.bones.get("Spine2")!.getWorldQuaternion(new Quaternion())
    ),
    feet: rig.chains.slice(2).map((chain) => chain.effector.getWorldPosition(new Vector3())),
    lengths,
    points: bones.map((bone) => bone.getWorldPosition(new Vector3())),
    rotations: bones.map((bone) => bone.getWorldQuaternion(new Quaternion())),
  };
}

describe.runIf(avatarAssetsPresent())("authored contact body pose", () => {
  it("holds the authored body through North-to-West without chasing targets or moving feet", async () => {
    const rig = await setup();
    const phase2 = sample(rig, 2, poseAt(2));
    const neutralAtHalf = sample(rig, 2.5, NEUTRAL);
    const phase25 = sample(rig, 2.5, poseAt(2.5));
    const phase3 = sample(rig, 3, poseAt(3));

    // A neutral authored pose must stay put even while the staff travels across
    // the body. Its only permitted vertical adjustment is leg reach for the
    // already-planted feet, which this fixture does not need.
    expect(neutralAtHalf.hips.distanceTo(phase2.hips)).toBeLessThan(1e-7);
    expect(phase3.hips.x - phase2.hips.x).toBeCloseTo(-0.035, 6);
    expect(phase3.hips.z - phase2.hips.z).toBeCloseTo(0.025, 6);

    // With performer forward +Z, positive authored yaw must carry the chest
    // toward stage left (+X). Positive lean is intentionally stage right (-X).
    expect(phase3.torsoForward.x).toBeGreaterThan(0.5);
    expect(phase3.torsoForward.x).toBeGreaterThan(phase25.torsoForward.x);

    for (const frame of [phase2, phase25, phase3]) {
      for (const [chain, expected] of frame.lengths.entries()) {
        expect(frame.lengths[chain]![0]).toBeCloseTo(rig.lengths[chain]![0], 6);
        expect(frame.lengths[chain]![1]).toBeCloseTo(rig.lengths[chain]![1], 6);
      }
      frame.feet.forEach((foot, index) =>
        expect(foot.distanceTo(rig.feet[index]!)).toBeLessThan(0.002)
      );
    }

    const held = sample(rig, 3, poseAt(3));
    held.points.forEach((point, index) =>
      expect(point.distanceTo(phase3.points[index]!)).toBeLessThan(1e-7)
    );
    held.rotations.forEach((rotation, index) =>
      expect(rotation.angleTo(phase3.rotations[index]!)).toBeLessThan(5e-4)
    );

    const coldRig = await setup();
    const cold = sample(coldRig, 3, poseAt(3));
    cold.points.forEach((point, index) =>
      expect(point.distanceTo(phase3.points[index]!)).toBeLessThan(1e-7)
    );
    cold.rotations.forEach((rotation, index) =>
      // Matrix-to-quaternion conversion on this GLB differs by less than
      // 0.03° after a cold load; a materially different elbow route does not.
      expect(rotation.angleTo(phase3.rotations[index]!)).toBeLessThan(5e-4)
    );
  }, 15_000);
});
