import { describe, expect, it } from "vitest";
import { Bone, Group, Object3D, Scene, Skeleton, SkinnedMesh } from "three";
import { captureMountedFrame } from "../../../src/routes/test/flow-fest-native-export/native-capture.js";

function mountedRig() {
  const scene = new Scene();
  const performer = new Group();
  performer.name = "PERFORMER_test";
  scene.add(performer);
  const leftPedal = new Object3D();
  leftPedal.name = "FFS_EUC_LeftPedalCapture";
  leftPedal.position.set(-0.2, 0.3, 0);
  const rightPedal = new Object3D();
  rightPedal.name = "FFS_EUC_RightPedalCapture";
  rightPedal.position.set(0.2, 0.3, 0);
  scene.add(leftPedal, rightPedal);
  return { scene, performer };
}

function addSkin(parent: Object3D, names: string[]) {
  const mesh = new SkinnedMesh();
  const bones = names.map((name) => {
    const bone = new Bone();
    bone.name = name;
    mesh.add(bone);
    return bone;
  });
  mesh.bind(new Skeleton(bones));
  parent.add(mesh);
  return { mesh, bones };
}

describe("mounted native capture", () => {
  it("selects the fullest skin and includes unweighted bone ancestors", () => {
    const { scene, performer } = mountedRig();
    addSkin(performer, ["accessory"]);
    const normalizedRoot = new Group();
    normalizedRoot.position.set(1, 2, 3);
    normalizedRoot.scale.setScalar(2);
    performer.add(normalizedRoot);
    const { mesh, bones } = addSkin(normalizedRoot, ["hips", "foot"]);
    const [hips, foot] = bones;
    if (!hips || !foot) throw new Error("Fixture needs hips and foot");
    const unweightedRoot = new Bone();
    unweightedRoot.name = "root";
    mesh.add(unweightedRoot);
    unweightedRoot.add(hips);
    hips.add(foot);

    const capture = captureMountedFrame(scene, "test", 15);

    expect(capture.timeSeconds).toBe(0.5);
    expect(capture.rootBone).toBe("root");
    expect(capture.bones.map(({ name, parent }) => [name, parent])).toEqual([
      ["root", null],
      ["hips", "root"],
      ["foot", "hips"],
    ]);
    expect(capture.boneRootParentWorld.position).toEqual([1, 2, 3]);
    expect(capture.boneRootParentWorld.scale).toEqual([2, 2, 2]);
    expect(capture.leftPedalWorld.position).toEqual([-0.2, 0.3, 0]);
    expect(capture.rightPedalWorld.position).toEqual([0.2, 0.3, 0]);
  });

  it("rejects a performer whose skin has no bones", () => {
    const { scene, performer } = mountedRig();
    addSkin(performer, []);
    expect(() => captureMountedFrame(scene, "test", 0)).toThrow(
      "Mounted rig test needs one parented root bone"
    );
  });

  it("rejects multiple independent bone roots", () => {
    const { scene, performer } = mountedRig();
    addSkin(performer, ["first", "second"]);
    expect(() => captureMountedFrame(scene, "test", 0)).toThrow(
      "Mounted rig test needs one parented root bone"
    );
  });

  it("rejects a performer without a skinned mesh", () => {
    const { scene } = mountedRig();
    expect(() => captureMountedFrame(scene, "test", 0)).toThrow(
      "Mounted rig test has no skinned mesh"
    );
  });
});
