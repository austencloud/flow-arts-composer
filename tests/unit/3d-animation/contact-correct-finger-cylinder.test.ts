import { describe, expect, it } from "vitest";
import { Bone, Quaternion, Vector3 } from "three";
import { FingerAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator";
import {
  FINGER_BONES,
  GripType,
  type FingerBoneName,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/domain/models/GripPose";
import { AvatarSkeletonBuilder } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarSkeletonBuilder";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { Plane } from "../../../node_modules/@austencloud/scene-3d/src/lib/domain/enums/Plane";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";

function makeHand(): Map<FingerBoneName, Bone> {
  const hand = new Bone();
  const fingers = new Map<FingerBoneName, Bone>();
  for (const name of FINGER_BONES) {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(0.018 * (fingers.size % 3), 0.026, 0);
    const parent =
      fingers.size % 3 === 0
        ? hand
        : fingers.get(FINGER_BONES[fingers.size - 1]!)!;
    parent.add(bone);
    fingers.set(name, bone);
  }
  hand.updateWorldMatrix(true, true);
  return fingers;
}

describe("contact-correct finger cylinder", () => {
  it("measures all five distal chains against the finite authored cylinder", () => {
    const animator = new FingerAnimator();
    animator.initialize({ left: makeHand(), right: makeHand() });
    animator.setGrips(GripType.SQUARE, GripType.IDLE);
    animator.update(1);
    animator.setCylinderContactStrict(true);
    animator.setCylinderContact("left", {
      a: new Vector3(0, -0.05, 0),
      b: new Vector3(0, 0.16, 0),
      radiusM: 0.012,
      lengthM: 0.21,
    });
    animator.setCylinderContact("right", null);
    animator.solveCylinderContacts();

    const left = animator.getCylinderContactReport("left");
    expect(left.map((finger) => finger.finger)).toEqual([
      "thumb",
      "index",
      "middle",
      "ring",
      "pinky",
    ]);
    expect(left.every((finger) => finger.available)).toBe(true);
    expect(left.every((finger) => finger.signedClearanceM !== null)).toBe(true);
    expect(
      animator
        .getCylinderContactReport("right")
        .every((finger) => finger.available === false)
    ).toBe(true);
  });

  it("does not retain the prior contact pose when strict mode resolves again", () => {
    const animator = new FingerAnimator();
    animator.initialize({ left: makeHand(), right: makeHand() });
    animator.setGrips(GripType.SQUARE, GripType.IDLE);
    animator.update(1);
    animator.setCylinderContactStrict(true);
    const cylinder = {
      a: new Vector3(0, -0.05, 0),
      b: new Vector3(0, 0.16, 0),
      radiusM: 0.012,
      lengthM: 0.21,
    };
    animator.setCylinderContact("left", cylinder);
    animator.solveCylinderContacts();
    const first = animator
      .getCylinderContactReport("left")
      .map((finger) => finger.signedClearanceM);
    animator.solveCylinderContacts();
    expect(
      animator
        .getCylinderContactReport("left")
        .map((finger) => finger.signedClearanceM)
    ).toEqual(first);
  });
});

describe.runIf(avatarAssetsPresent())("contact-correct catalog hands", () => {
  for (const id of ["ch07", "ch18"]) {
    it(`${id} exposes every right-hand chain to the finite-cylinder solver`, async () => {
      const { scene } = await loadRig(avatar(id));
      const builder = new AvatarSkeletonBuilder() as unknown as {
        processGLTF(
          root: import("three").Object3D,
          bounds: { height: number; minY: number },
          label: string
        ): void;
        state: {
          fingerChains: {
            left: Map<FingerBoneName, Bone>;
            right: Map<FingerBoneName, Bone>;
          } | null;
        };
      };
      builder.processGLTF(scene, { height: 1.7, minY: 0 }, id);
      const chains = builder.state.fingerChains;
      expect(chains, `${id} has mapped fingers`).not.toBeNull();
      const index = chains!.right
        .get("Index1")!
        .getWorldPosition(new Vector3());
      const pinky = chains!.right
        .get("Pinky1")!
        .getWorldPosition(new Vector3());
      const midpoint = index.clone().lerp(pinky, 0.5);
      const axis = pinky.clone().sub(index).normalize();
      const animator = new FingerAnimator();
      animator.initialize(chains!);
      animator.setGrips(GripType.IDLE, GripType.SQUARE);
      animator.update(1);
      animator.setCylinderContactStrict(true);
      animator.setCylinderContact("right", {
        a: midpoint.clone().addScaledVector(axis, -0.45),
        b: midpoint.clone().addScaledVector(axis, 0.45),
        radiusM: 0.012,
        lengthM: 0.9,
      });
      animator.solveCylinderContacts();
      expect(
        animator
          .getCylinderContactReport("right")
          .every(
            (finger) => finger.available && finger.signedClearanceM !== null
          )
      ).toBe(true);
    });
  }
});

describe.runIf(avatarAssetsPresent())(
  "contact-correct full avatar solve",
  () => {
    for (const id of ["ch07", "ch18"]) {
      it(`${id} repeats a one-hand authored target without changing it`, async () => {
        const { scene } = await loadRig(avatar(id));
        const services = createAvatarServices({
          enableLocomotion: false,
          enableRootMotion: false,
          enableFootPlanting: false,
        });
        const skeleton = services.skeleton as unknown as {
          processGLTF(
            root: import("three").Object3D,
            bounds: { height: number; minY: number },
            label: string
          ): void;
        };
        skeleton.processGLTF(scene, { height: 1.7, minY: 0 }, id);
        const state = services.skeleton.getState();
        expect(state.fingerChains).not.toBeNull();
        services.fingers.initialize(state.fingerChains!, state.meshes);
        const chain = services.skeleton.getRightArmChain()!;
        const target = chain.effector
          .getWorldPosition(new Vector3())
          .add(new Vector3(0, 0, 0.01));
        const prop = {
          worldPosition: target.clone(),
          worldRotation: new Quaternion(),
          staffRotationAngle: 0,
          plane: Plane.WALL,
        } as never;
        const before = target.clone();
        const samples: number[] = [];
        for (let phase = 0; phase <= 4; phase += 1) {
          services.animator.setPropsAndBlend(null, prop, undefined, {
            red: new Quaternion(),
            blue: null,
          });
          services.animator.update(1 / 120);
          services.fingers.setGrips(GripType.IDLE, GripType.SQUARE);
          services.fingers.update(1 / 120);
          services.fingers.setCylinderContactStrict(true);
          services.fingers.setCylinderContact("right", {
            a: target.clone().add(new Vector3(0, -0.45, 0)),
            b: target.clone().add(new Vector3(0, 0.45, 0)),
            radiusM: (0.019 / 2) * 1.075,
            lengthM: 0.9,
          });
          services.fingers.solveCylinderContacts();
          samples.push(
            chain.effector.getWorldPosition(new Vector3()).distanceTo(target)
          );
          expect(prop.worldPosition).toEqual(before);
        }
        expect(Math.max(...samples)).toBeLessThan(0.2);
      });
    }
  }
);
