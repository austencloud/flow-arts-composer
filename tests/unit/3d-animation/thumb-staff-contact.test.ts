import { Bone, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  FINGER_BONES,
  GripType,
  type FingerBoneName,
  type FingerChains,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/domain/models/GripPose";
import { FingerAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator";

type Joint = readonly [
  position: readonly [number, number, number],
  rotation: readonly [number, number, number, number],
];

// These are the ch07 Mixamo bind transforms measured from
// static/models/avatars/_optimized/ch07.glb. Keeping the fixture to the hand
// hierarchy makes the contact regression reproducible without loading a GLB in
// the unit test environment.
const LEFT_JOINTS: Record<FingerBoneName, Joint> = {
  Thumb1: [
    [-0.028069, 0.028744, 0.011982],
    [0.141243, 0.041516, 0.278929, 0.94896],
  ],
  Thumb2: [
    [-0.00644, 0.032916, 0],
    [0.048114, 0, 0, 0.998842],
  ],
  Thumb3: [
    [0.001265, 0.031019, 0],
    [-0.086597, 0, 0, 0.996243],
  ],
  Index1: [
    [-0.033214, 0.08979, 0.001316],
    [0.008228, 0.000057, 0.006895, 0.999942],
  ],
  Index2: [
    [0.000043, 0.029921, 0],
    [0.079888, 0, 0, 0.996804],
  ],
  Index3: [
    [-0.000012, 0.02839, 0],
    [0.033743, 0, 0, 0.999431],
  ],
  Middle1: [
    [-0.008624, 0.09096, -0.001355],
    [-0.003392, 0.000001, -0.000162, 0.999994],
  ],
  Middle2: [
    [0.000041, 0.032432, 0],
    [0.119804, 0, 0, 0.992798],
  ],
  Middle3: [
    [-0.00003, 0.03041, 0],
    [-0.02949, 0, 0, 0.999565],
  ],
  Ring1: [
    [0.011622, 0.089244, -0.001404],
    [0.005576, -0.000236, -0.04228, 0.99909],
  ],
  Ring2: [
    [-0.000019, 0.027664, 0],
    [0.120953, 0, 0, 0.992658],
  ],
  Ring3: [
    [0.00001, 0.027499, 0],
    [0.004968, 0, 0, 0.999988],
  ],
  Pinky1: [
    [0.030216, 0.084092, 0.001807],
    [-0.003999, 0.000205, -0.051095, 0.998686],
  ],
  Pinky2: [
    [-0.000024, 0.024889, 0],
    [0.087851, 0, 0, 0.996134],
  ],
  Pinky3: [
    [-0.000002, 0.021438, 0],
    [0.117597, 0, 0, 0.993061],
  ],
};

function mirrorJoint([position, rotation]: Joint): Joint {
  return [
    [-position[0], position[1], position[2]],
    [rotation[0], -rotation[1], -rotation[2], rotation[3]],
  ];
}

function addJoint(parent: Bone, name: FingerBoneName, joint: Joint): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.fromArray(joint[0]);
  bone.quaternion.copy(new Quaternion().fromArray(joint[1]));
  parent.add(bone);
  return bone;
}

function createCh07Hand(side: "left" | "right"): {
  hand: Bone;
  fingers: Map<FingerBoneName, Bone>;
} {
  const joints =
    side === "left"
      ? LEFT_JOINTS
      : (Object.fromEntries(
          FINGER_BONES.map((name) => [name, mirrorJoint(LEFT_JOINTS[name])])
        ) as Record<FingerBoneName, Joint>);
  const hand = new Bone();
  const fingers = new Map<FingerBoneName, Bone>();

  for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const) {
    let parent = hand;
    for (const segment of [1, 2, 3] as const) {
      const name = `${finger}${segment}` as FingerBoneName;
      const bone = addJoint(parent, name, joints[name]);
      fingers.set(name, bone);
      parent = bone;
    }
  }
  hand.updateMatrixWorld(true);
  return { hand, fingers };
}

describe("ch07 square-thumb contact", () => {
  it("brings each thumb toward the curled index side without collapsing it", () => {
    const left = createCh07Hand("left");
    const right = createCh07Hand("right");
    const chains: FingerChains = { left: left.fingers, right: right.fingers };
    const animator = new FingerAnimator();

    animator.initialize(chains);
    animator.setGrips(GripType.SQUARE, GripType.SQUARE);
    animator.setBlendSpeed(100);
    animator.update(1);
    left.hand.updateMatrixWorld(true);
    right.hand.updateMatrixWorld(true);

    for (const { hand, fingers } of [left, right]) {
      const thumb = fingers.get("Thumb3")!.getWorldPosition(new Vector3());
      const index = fingers.get("Index2")!.getWorldPosition(new Vector3());
      const palm = hand
        .getWorldPosition(new Vector3())
        .distanceTo(fingers.get("Middle1")!.getWorldPosition(new Vector3()));
      const contactRatio = thumb.distanceTo(index) / palm;

      expect(contactRatio).toBeGreaterThan(0.12);
      expect(contactRatio).toBeLessThan(0.5);
    }
  });
});
