/**
 * An old person's stoop: the spine bent a little forward, the neck lifting
 * the head back up so the gaze stays ahead rather than on the ground.
 *
 * Applied after the rig has posed the body each frame (the locomotion clip,
 * any IK), as a turn about the body's own left-right axis through each spine
 * joint, so it rides on top of whatever the walk or idle clip is doing. It
 * moves the shoulders and so the hands: run it only while the hands hold
 * nothing.
 */

import { Quaternion, Vector3, type Bone, type Object3D } from "three";

/** How a stoop's angle is shared down the spine. */
export interface StoopShare {
  /** The end of the bone's name: "Spine" matches "mixamorig:Spine" only. */
  bone: string;
  share: number;
}

/**
 * Most of the bend in the upper back, where age puts it; the neck takes some
 * of it back so the face does not drop with the chest.
 */
export const STOOP_SHARES: readonly StoopShare[] = [
  { bone: "Spine", share: 0.25 },
  { bone: "Spine1", share: 0.35 },
  { bone: "Spine2", share: 0.4 },
  { bone: "Neck", share: -0.45 },
];

export interface PostureStoop {
  /** Bend by `radians` forward (0 undoes it). Call once a frame, after posing. */
  apply(radians: number): void;
  /** Whether the bones are still part of `root` (a model swap replaces them). */
  attachedTo(root: Object3D): boolean;
}

interface StoopJoint {
  bone: Bone;
  share: number;
  /** The pose the rig gave the bone, before the stoop. */
  base: Quaternion;
  /** What the stoop last wrote, to tell whether the rig has posed it since. */
  written: Quaternion | null;
}

function findBone(root: Object3D, suffix: string): Bone | undefined {
  let found: Bone | undefined;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name.endsWith(suffix))
      found = o as Bone;
  });
  return found;
}

const scratch = {
  axis: new Vector3(),
  left: new Vector3(),
  right: new Vector3(),
  turn: new Quaternion(),
  world: new Quaternion(),
  parent: new Quaternion(),
};

/**
 * The stoop for a rigged body under `root`, or null when it has no spine or
 * no legs to tell left from right by.
 */
export function createPostureStoop(
  root: Object3D,
  shares: readonly StoopShare[] = STOOP_SHARES
): PostureStoop | null {
  const leftHip = findBone(root, "LeftUpLeg");
  const rightHip = findBone(root, "RightUpLeg");
  if (!leftHip || !rightHip) return null;
  const joints: StoopJoint[] = [];
  for (const { bone: name, share } of shares) {
    const bone = findBone(root, name);
    if (bone?.parent)
      joints.push({ bone, share, base: new Quaternion(), written: null });
  }
  if (joints.length === 0) return null;

  return {
    apply(radians) {
      // The rig re-poses the spine every frame it runs. If it skipped one,
      // the bone still holds the stoop: go back to the rig's pose first, so
      // the bend never piles up.
      for (const joint of joints) {
        if (joint.written && joint.bone.quaternion.equals(joint.written)) {
          joint.bone.quaternion.copy(joint.base);
        }
        joint.base.copy(joint.bone.quaternion);
      }
      // The body's left, from the right hip to the left: a turn about it by a
      // positive angle tips the top of the spine toward where they face.
      leftHip.getWorldPosition(scratch.left);
      rightHip.getWorldPosition(scratch.right);
      scratch.axis.subVectors(scratch.left, scratch.right);
      if (Math.abs(radians) < 1e-5 || scratch.axis.lengthSq() < 1e-10) {
        for (const joint of joints) joint.written = null;
        return;
      }
      scratch.axis.normalize();
      for (const joint of joints) {
        const { bone } = joint;
        scratch.turn.setFromAxisAngle(scratch.axis, radians * joint.share);
        bone.getWorldQuaternion(scratch.world).premultiply(scratch.turn);
        bone.parent!.getWorldQuaternion(scratch.parent).invert();
        bone.quaternion.copy(scratch.parent.multiply(scratch.world));
        bone.updateMatrixWorld(true);
        joint.written = (joint.written ?? new Quaternion()).copy(
          bone.quaternion
        );
      }
    },
    attachedTo(target) {
      let node: Object3D | null = joints[0]!.bone;
      while (node) {
        if (node === target) return true;
        node = node.parent;
      }
      return false;
    },
  };
}
