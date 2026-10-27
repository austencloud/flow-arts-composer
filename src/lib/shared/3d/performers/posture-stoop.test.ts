import { describe, expect, it } from "vitest";
import { Bone, Group, Quaternion, Vector3 } from "three";
import { createPostureStoop } from "./posture-stoop";

/** A Mixamo-named standing body facing +z: hips, a four-joint spine, a head, two hips. */
function standingBody(facing = 0): { root: Group; holder: Group } {
  const bone = (
    name: string,
    x: number,
    y: number,
    z: number,
    parent?: Bone
  ) => {
    const b = new Bone();
    b.name = `mixamorig:${name}`;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const hips = bone("Hips", 0, 1, 0);
  const spine = bone("Spine", 0, 0.1, 0, hips);
  const spine1 = bone("Spine1", 0, 0.12, 0, spine);
  const spine2 = bone("Spine2", 0, 0.14, 0, spine1);
  const neck = bone("Neck", 0, 0.16, 0, spine2);
  bone("Head", 0, 0.1, 0, neck);
  bone("LeftUpLeg", 0.1, -0.05, 0, hips);
  bone("RightUpLeg", -0.1, -0.05, 0, hips);
  const root = new Group();
  root.add(hips);
  const holder = new Group();
  holder.rotation.y = facing;
  holder.add(root);
  holder.updateMatrixWorld(true);
  return { root, holder };
}

function worldOf(root: Group, name: string): Vector3 {
  return root
    .getObjectByName(`mixamorig:${name}`)!
    .getWorldPosition(new Vector3());
}

/** Undo the stoop the way a rig does, by posing every bone afresh. */
function rigPoses(root: Group): void {
  root.traverse((o) => o.quaternion.copy(new Quaternion()));
  root.updateMatrixWorld(true);
}

describe("posture stoop", () => {
  it("bends the chest and head toward where the body faces", () => {
    const { root } = standingBody();
    const before = worldOf(root, "Head");
    createPostureStoop(root)!.apply(0.3);
    const head = worldOf(root, "Head");
    expect(head.z).toBeGreaterThan(before.z + 0.05);
    expect(head.y).toBeLessThan(before.y);
    expect(head.x).toBeCloseTo(0, 5);
    // The hips and legs stay where they were.
    expect(worldOf(root, "LeftUpLeg").z).toBeCloseTo(0, 5);
  });

  it("bends forward for a body facing another way", () => {
    const facing = Math.PI / 2; // three.js rotation.y: +z turns to +x
    const { root } = standingBody(facing);
    createPostureStoop(root)!.apply(0.3);
    const head = worldOf(root, "Head");
    expect(head.x).toBeGreaterThan(0.05);
    expect(head.z).toBeCloseTo(0, 5);
  });

  it("does not pile up when the rig skips a frame, and undoes at 0", () => {
    const { root } = standingBody();
    const stoop = createPostureStoop(root)!;
    stoop.apply(0.3);
    const once = worldOf(root, "Head");
    // No re-pose between frames: the same stoop, not twice the bend.
    stoop.apply(0.3);
    stoop.apply(0.3);
    expect(worldOf(root, "Head").distanceTo(once)).toBeLessThan(1e-6);
    // A re-pose then a stoop lands in the same place.
    rigPoses(root);
    stoop.apply(0.3);
    expect(worldOf(root, "Head").distanceTo(once)).toBeLessThan(1e-6);
    // Easing out to 0 with no re-pose returns the rig's own pose.
    stoop.apply(0);
    expect(worldOf(root, "Head").z).toBeCloseTo(0, 6);
  });

  it("keeps the face up: the head tips less than the chest", () => {
    const { root } = standingBody();
    createPostureStoop(root)!.apply(0.3);
    const up = new Vector3(0, 1, 0);
    const tilt = (name: string) => {
      const q = root
        .getObjectByName(`mixamorig:${name}`)!
        .getWorldQuaternion(new Quaternion());
      return up.clone().applyQuaternion(q).angleTo(up);
    };
    expect(tilt("Spine2")).toBeCloseTo(0.3, 5);
    expect(tilt("Head")).toBeLessThan(tilt("Spine2"));
  });

  it("knows when a model swap has replaced its bones", () => {
    const { root, holder } = standingBody();
    const stoop = createPostureStoop(root)!;
    expect(stoop.attachedTo(holder)).toBe(true);
    holder.remove(root);
    expect(stoop.attachedTo(holder)).toBe(false);
  });

  it("is null for a body with no legs to find its left by", () => {
    const root = new Group();
    const spine = new Bone();
    spine.name = "Spine";
    root.add(spine);
    expect(createPostureStoop(root)).toBeNull();
  });
});
