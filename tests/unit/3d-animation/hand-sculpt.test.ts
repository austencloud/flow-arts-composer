import { Quaternion, Vector3, type Bone } from "three";
import { describe, expect, it } from "vitest";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sculptHand } from "../../../src/routes/test/grip-lab/hand-sculpt";
import {
  defaultTeachingKeys,
  sampleTeachingPose,
} from "../../../src/routes/test/grip-lab/isolation-teaching";

describe.runIf(avatarAssetsPresent())("Grip Lab photo hand", () => {
  it("finds prefixed ch07 finger bones and applies the North pose without frame-to-frame drift", async () => {
    const { scene } = await loadRig(avatar("ch07"));
    const finger = scene.getObjectByName("mixamorig8RightHandIndex1") as Bone;
    const indexTip = scene.getObjectByName("mixamorig8RightHandIndex3") as Bone;
    const thumb = scene.getObjectByName("mixamorig8RightHandThumb1") as Bone;
    const ring = scene.getObjectByName("mixamorig8RightHandRing1") as Bone;
    expect(finger).toBeDefined();
    expect(thumb).toBeDefined();
    expect(ring).toBeDefined();
    const bindRing = ring.quaternion.clone();
    finger.quaternion.multiply(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5)
    );
    thumb.quaternion.multiply(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.4)
    );
    ring.quaternion.multiply(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5)
    );
    const contactIndex = finger.quaternion.clone();
    const contactIndexTip = indexTip.quaternion.clone();
    const contactThumb = thumb.quaternion.clone();

    const pose = sampleTeachingPose(2, defaultTeachingKeys());
    sculptHand(scene, "right", pose);
    expect(finger.quaternion.angleTo(contactIndex)).toBeLessThan(1e-4);
    expect(indexTip.quaternion.angleTo(contactIndexTip)).toBeCloseTo(0.65, 2);
    expect(thumb.quaternion.angleTo(contactThumb)).toBeCloseTo(0.45, 2);
    expect(ring.quaternion.angleTo(bindRing)).toBeCloseTo(0.42, 2);
    const firstThumb = thumb.quaternion.clone();
    const firstIndexTip = indexTip.quaternion.clone();
    finger.quaternion.copy(contactIndex);
    indexTip.quaternion.copy(contactIndexTip);
    thumb.quaternion.copy(contactThumb);
    sculptHand(scene, "right", pose);
    expect(finger.quaternion.angleTo(contactIndex)).toBeLessThan(1e-4);
    expect(indexTip.quaternion.angleTo(firstIndexTip)).toBeLessThan(1e-4);
    expect(thumb.quaternion.angleTo(firstThumb)).toBeLessThan(1e-4);
    thumb.quaternion.copy(contactThumb);
    sculptHand(scene, "right", {
      ...pose,
      thumbSpread: pose.thumbSpread - 0.2,
    });
    expect(thumb.quaternion.angleTo(firstThumb)).toBeGreaterThan(0.15);
    indexTip.quaternion.copy(contactIndexTip);
    sculptHand(scene, "right", {
      ...pose,
      indexJoint3: -0.2,
    });
    expect(indexTip.quaternion.angleTo(firstIndexTip)).toBeCloseTo(0.2, 2);
  });
});
