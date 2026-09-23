import { Quaternion, Vector3, type Bone } from "three";
import { describe, expect, it } from "vitest";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sculptHand } from "../../../src/routes/test/grip-lab/hand-sculpt";
import { defaultTeachingKeys, sampleTeachingPose } from "../../../src/routes/test/grip-lab/isolation-teaching";

describe.runIf(avatarAssetsPresent())("Grip Lab photo hand", () => {
  it("finds prefixed ch07 finger bones and applies the North pose without frame-to-frame drift", async () => {
    const { scene } = await loadRig(avatar("ch07"));
    const finger = scene.getObjectByName("mixamorig8RightHandIndex1") as Bone;
    const thumb = scene.getObjectByName("mixamorig8RightHandThumb1") as Bone;
    expect(finger).toBeDefined();
    expect(thumb).toBeDefined();
    const bindFinger = finger.quaternion.clone();
    const bindThumb = thumb.quaternion.clone();
    finger.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5));

    const pose = sampleTeachingPose(2, defaultTeachingKeys());
    sculptHand(scene, "right", pose);
    expect(finger.quaternion.angleTo(bindFinger)).toBeLessThan(1e-4);
    expect(thumb.quaternion.angleTo(bindThumb)).toBeGreaterThan(0.3);
    const firstThumb = thumb.quaternion.clone();
    sculptHand(scene, "right", pose);
    expect(thumb.quaternion.angleTo(firstThumb)).toBeLessThan(1e-4);
  });
});
