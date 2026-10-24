import { assertCaptureGripAttachment } from "../../../src/routes/test/flow-fest-native-export/capture-grip.js";
import { describe, expect, it } from "vitest";
import { Bone, BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, Skeleton, SkinnedMesh } from "three";
import { captureNativeFrame, productionRigReady, renderedPropBranches } from "../../../src/routes/test/flow-fest-native-export/native-capture.js";
import { stepDataToConfigs } from "#lib/shared/3d/services/sequence-converter.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

function rig() {
  const scene = new Scene();
  const root = new Group(); scene.add(root);
  const performer = new Group(); performer.name = "PERFORMER_visibility"; root.add(performer);
  const bone = new Bone(); bone.name = "Root"; performer.add(bone);
  const left = new Bone(); left.name = "LeftHand"; bone.add(left);
  const right = new Bone(); right.name = "RightHand"; bone.add(right);
  const skin = new SkinnedMesh(); skin.bind(new Skeleton([bone, left, right])); performer.add(skin);
  const branches = [0, 1].map(side => {
    const branch = new Group(); root.add(branch);
    const anchor = new Group(); branch.add(anchor);
    const correction = new Group(); anchor.add(correction);
    const prop = new Group(); correction.add(prop);
    const body = new Group(); body.name = "test-rotated-body"; prop.add(body);
    body.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    branch.position.x = side ? 1 : -1;
    return branch;
  });
  return { scene, branches };
}

describe("native hidden-hand capture", () => {
  it("finds the two named props even when effect meshes share the rig", () => {
    const { scene, branches } = rig();
    const performer = scene.getObjectByName("PERFORMER_visibility")!;
    branches[0]!.name = "PERFORMER_PROP_LEFT";
    branches[1]!.name = "PERFORMER_PROP_RIGHT";
    const effects = new Group();
    effects.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    performer.parent!.add(effects);
    expect(renderedPropBranches(performer)).toEqual(branches);
    expect(productionRigReady(scene, "visibility")).toBe(true);
    branches[1]!.clear();
    expect(productionRigReady(scene, "visibility")).toBe(false);
  });

  it("uses canonical absent and explicitly hidden motion semantics", () => {
    const motion = createMotionData({});
    const convert = (motions: unknown) => stepDataToConfigs({ motions, stepNumber: 1 } as StepData);
    expect(convert({ left: motion }).left).not.toBeNull();
    expect(convert({ left: motion }).right).toBeNull();
    expect(convert({ left: { ...motion, isVisible: false }, right: motion }).left).toBeNull();
    expect(convert({ left: { ...motion, isVisible: false }, right: motion }).right).not.toBeNull();
  });

  it("retains both hidden transform trees and records visibility independently of transforms", () => {
    const { scene, branches } = rig();
    const visible = captureNativeFrame(scene, "visibility", 0, 0);
    for (const branch of branches) branch.visible = false;
    expect(productionRigReady(scene, "visibility")).toBe(true);
    const hidden = captureNativeFrame(scene, "visibility", 0, 0, undefined, [false, false]);
    expect(visible.propVisibility).toEqual([true, true]);
    expect(hidden.propVisibility).toEqual([false, false]);
    expect(hidden.leftProp).toEqual(visible.leftProp);
    expect(hidden.rightProp).toEqual(visible.rightProp);
  });
});

it("checks attachment only for visible props while requiring a fresh measurement", () => {
  const attachment = { gripRelaxation: 0, leftPalmWorld: [10, 0, 0] as [number, number, number],
    rightPalmWorld: [0, 0, 0] as [number, number, number],
    leftRenderedGripWorld: [0, 0, 0] as [number, number, number],
    rightRenderedGripWorld: [0, 0, 0] as [number, number, number] };
  expect(() => assertCaptureGripAttachment(attachment, true, [false, true])).not.toThrow();
  expect(() => assertCaptureGripAttachment(attachment, true, [true, true])).toThrow("detached");
  expect(() => assertCaptureGripAttachment(attachment, false, [false, false])).toThrow("fresh");
});
