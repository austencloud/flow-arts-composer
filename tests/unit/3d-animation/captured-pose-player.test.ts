import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  Bone,
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from "three";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { avatar, loadRig } from "../3d/locomotion-harness";
import {
  captureNativeFrame,
  largestSkinnedMesh,
  posedBones,
} from "../../../src/lib/shared/3d/native-capture/native-capture";
import { CapturedPosePlayer } from "../../../src/lib/shared/3d/native-capture/captured-pose-player";
import { resolveCapturedPropTransforms } from "../../../src/lib/shared/3d/effects/captured-prop-transforms";
import { TipPositionBridge3D } from "../../../src/lib/shared/3d/effects/tip-position-bridge-3d";
import { resolvePropTipAnchors3D } from "../../../src/lib/shared/3d/effects/prop-tip-geometry-3d";
import { MoonFanDiffuserRenderer3D } from "../../../src/lib/shared/3d/effects/led/moon-fan-diffuser-renderer-3d";
import { PropType, propFinishState } from "@austencloud/scene-3d";

function rig() {
  const scene = new Scene();
  const assembly = new Group();
  scene.add(assembly);
  const performer = new Group();
  performer.name = "PERFORMER_test";
  assembly.add(performer);
  const normalization = new Group();
  normalization.position.set(0, 0.2, 0);
  normalization.scale.setScalar(0.1);
  performer.add(normalization);
  const root = new Bone();
  root.name = "Hips";
  const left = new Bone();
  left.name = "LeftHand";
  left.position.set(10, 0, 0);
  const right = new Bone();
  right.name = "RightHand";
  right.position.set(-10, 0, 0);
  root.add(left, right);
  normalization.add(root);
  const skin = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
  normalization.add(skin);
  skin.bind(new Skeleton([left, right]));
  const props = [0, 1].map((index) => {
    const branch = new Group();
    const anchor = new Group();
    const correction = new Group();
    const propRoot = new Group();
    const body = new Group();
    body.name = `${index}-rotated-body`;
    body.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    propRoot.add(body);
    correction.add(propRoot);
    anchor.add(correction);
    branch.add(anchor);
    assembly.add(branch);
    propRoot.position.set(index ? -1 : 1, 1, 0);
    return { branch, anchor, correction, propRoot, body };
  });
  return { scene, performer, normalization, root, left, right, props };
}

function expectMatrix(actual: Matrix4, expected: Matrix4) {
  actual.elements.forEach((value, index) =>
    expect(value).toBeCloseTo(expected.elements[index]!, 6)
  );
}

function sampleMatrix(sample: {
  position: number[];
  quaternion: number[];
  scale: number[];
}) {
  return new Matrix4().compose(
    new Vector3().fromArray(sample.position),
    new Quaternion().fromArray(sample.quaternion),
    new Vector3().fromArray(sample.scale)
  );
}

describe("CapturedPosePlayer", () => {
  for (const character of ["x-bot", "y-bot", "ch01"]) {
    it.runIf(existsSync(avatar(character)))(
      `reproduces every captured ${character} bone through its production avatar wrapper`,
      async () => {
        const model = (await loadRig(avatar(character))).scene;
        const services = createAvatarServices({
          enableLocomotion: false,
          enableRootMotion: false,
          enableFootPlanting: false,
        });
        (
          services.skeleton as unknown as {
            processGLTF(root: Object3D, bounds: null, label: string): void;
          }
        ).processGLTF(model, null, character);
        services.skeleton.setHeight(1.905);
        const { scene, performer } = rig();
        performer.clear();
        performer.add(model);
        performer.position.set(
          -2.4,
          0.8 - services.skeleton.getFeetOffset(),
          3.1
        );
        performer.rotation.y = 0.6;
        const state = services.skeleton.getState();
        for (const [name, axis, angle] of [
          ["Hips", new Vector3(0, 1, 0), 0.12],
          ["Spine2", new Vector3(0, 0, 1), -0.16],
          ["LeftArm", new Vector3(1, 0, 0), 0.5],
          ["LeftForeArm", new Vector3(0, 1, 0), 0.7],
          ["RightHand", new Vector3(0, 0, 1), -0.3],
        ] as const) {
          const bone = state.bones.get(name)!;
          expect(bone, `${character} ${name}`).toBeDefined();
          bone.quaternion.multiply(
            new Quaternion().setFromAxisAngle(axis, angle)
          );
        }
        const frame = captureNativeFrame(scene, "test", 0, 0);
        const bones = posedBones(largestSkinnedMesh(performer)!);
        const recordedWorld = bones.map((bone) => bone.matrixWorld.clone());
        const recordedPerformerInverse = performer.matrixWorld.clone().invert();
        const root = frame.bones.find((bone) => bone.parent === null)!;
        expect(root.rootParentWorld).toBeDefined();
        expect(
          sampleMatrix(root.rootParentWorld!).equals(
            sampleMatrix(frame.performerWorld)
          )
        ).toBe(false);
        const player = new CapturedPosePlayer(scene, "test", {
          frames: [frame],
          durationSeconds: 1,
        });
        for (const bone of bones) {
          bone.position.add(new Vector3(0.03, -0.02, 0.04));
          bone.quaternion.multiply(
            new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.15)
          );
        }
        performer.position.set(4.2, 1.5, -3.7);
        performer.rotation.y = -0.9;
        player.apply(0);
        let largestPositionError = 0;
        bones.forEach((bone, index) => {
          const expected = performer.matrixWorld
            .clone()
            .multiply(recordedPerformerInverse)
            .multiply(recordedWorld[index]!);
          expectMatrix(bone.matrixWorld, expected);
          largestPositionError = Math.max(
            largestPositionError,
            new Vector3()
              .setFromMatrixPosition(bone.matrixWorld)
              .distanceTo(new Vector3().setFromMatrixPosition(expected))
          );
        });
        expect(largestPositionError).toBeLessThan(1e-6);
        player.restore();
      }
    );
  }

  it("replays every bone including unweighted ancestors at a relocated, rotated, scaled performer", () => {
    const fixture = rig();
    const { scene, performer, root, left, props } = fixture;
    performer.position.set(4, 2, -3);
    performer.rotation.y = 0.6;
    performer.scale.setScalar(1.3);
    root.position.set(1, 3, 2);
    root.rotation.z = 0.7;
    props[0]!.body.rotation.x = 0.4;
    const frame = captureNativeFrame(scene, "test", 0, 0);
    const untouched = JSON.stringify(frame);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [frame],
      durationSeconds: 1,
    });
    root.position.set(99, 99, 99);
    left.rotation.z = 0.8;
    performer.position.set(-3, 1, 5);
    performer.rotation.set(0.3, -0.9, 0.1);
    performer.scale.set(0.8, 1.2, 1.7);
    player.apply(0.3);
    for (const bone of [root, left, fixture.right]) {
      const captured = frame.bones.find((entry) => entry.name === bone.name)!;
      expectMatrix(
        bone.matrixWorld,
        performer.matrixWorld.clone().multiply(sampleMatrix(captured.component))
      );
    }
    const relativeRoot = sampleMatrix(frame.performerWorld)
      .invert()
      .multiply(sampleMatrix(frame.leftProp.propRootWorld));
    expectMatrix(
      props[0]!.propRoot.matrixWorld,
      performer.matrixWorld.clone().multiply(relativeRoot)
    );
    expect(JSON.stringify(frame)).toBe(untouched);
  });

  it("interpolates the parent hierarchy before composing children, including the loop seam", () => {
    const { scene, root, left } = rig();
    const first = captureNativeFrame(scene, "test", 0, 0);
    root.rotation.z = Math.PI / 2;
    const second = captureNativeFrame(scene, "test", 15, 1);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [first, second],
      durationSeconds: 1,
    });
    for (const time of [0.25, 0.75, -0.25, 1.25]) {
      player.apply(time);
      const position = left.getWorldPosition(new Vector3());
      expect(position.x).toBeCloseTo(Math.SQRT1_2, 6);
      expect(position.y).toBeCloseTo(0.2 + Math.SQRT1_2, 6);
      expect(
        root.quaternion.angleTo(
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4)
        )
      ).toBeLessThan(1e-6);
    }
    player.apply(1);
    expect(left.getWorldPosition(new Vector3()).x).toBeCloseTo(1, 6);
  });

  it("matches native quarter-frame bone and prop-root nlerp while the visual body uses slerp", () => {
    const { scene, root, left, props } = rig();
    const prop = props[0]!;
    const first = captureNativeFrame(scene, "test", 0, 0);
    const angle = (2 * Math.PI) / 3;
    root.rotation.z = angle;
    prop.propRoot.rotation.y = angle;
    prop.body.rotation.z = angle;
    const second = captureNativeFrame(scene, "test", 15, 1);
    // The equivalent negative quaternion must still follow the shortest path.
    const capturedRoot = second.bones.find((bone) => bone.name === root.name)!;
    capturedRoot.component.quaternion = capturedRoot.component.quaternion.map(
      (value) => -value
    ) as [number, number, number, number];
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [first, second],
      durationSeconds: 1,
    });
    for (const [time, amount] of [
      [0.125, 0.25],
      [0.625, 0.75],
    ] as const) {
      player.apply(time);
      const nativeAngle =
        2 *
        Math.atan2(
          amount * Math.sin(angle / 2),
          1 - amount + amount * Math.cos(angle / 2)
        );
      const expectedBone = new Quaternion().setFromAxisAngle(
        new Vector3(0, 0, 1),
        nativeAngle
      );
      expect(root.quaternion.angleTo(expectedBone)).toBeLessThan(1e-6);
      expect(left.getWorldPosition(new Vector3()).x).toBeCloseTo(
        Math.cos(nativeAngle),
        6
      );
      expect(left.getWorldPosition(new Vector3()).y).toBeCloseTo(
        0.2 + Math.sin(nativeAngle),
        6
      );
      expect(Math.abs(nativeAngle - angle * amount)).toBeGreaterThan(0.01);
      const expectedRoot = new Matrix4().compose(
        new Vector3(...first.leftProp.propRootWorld.position),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), nativeAngle),
        new Vector3(1, 1, 1)
      );
      expectMatrix(prop.propRoot.matrixWorld, expectedRoot);
      expectMatrix(
        prop.body.matrixWorld,
        expectedRoot
          .clone()
          .multiply(new Matrix4().makeRotationZ(angle * amount))
      );
    }
  });

  it("clamps nonlooping clips and sanitizes a nonfinite clock", () => {
    const { scene, root } = rig();
    const first = captureNativeFrame(scene, "test", 0, 0);
    root.position.x = 10;
    const second = captureNativeFrame(scene, "test", 15, 1);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [first, second],
      durationSeconds: 1,
      loop: false,
    });
    player.apply(100);
    expect(root.position.x).toBeCloseTo(10);
    player.apply(-10);
    expect(root.position.x).toBeCloseTo(0);
    player.apply(Number.NaN);
    expect(root.position.x).toBeCloseTo(0);
  });

  it("preserves the reflected prop and its separate visual rotation", () => {
    const { scene, performer, props } = rig();
    const prop = props[0]!;
    prop.propRoot.scale.set(-1, 1, 1);
    prop.propRoot.rotation.y = 0.6;
    prop.body.rotation.z = 0.8;
    const first = captureNativeFrame(scene, "test", 0, 0);
    prop.body.rotation.z = -0.2;
    const second = captureNativeFrame(scene, "test", 15, 1);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [first, second],
      durationSeconds: 1,
    });
    prop.propRoot.scale.setScalar(4);
    prop.body.rotation.set(2, 1, 3);
    performer.position.set(7, -1, 4);
    performer.rotation.y = -0.3;
    player.apply(0.25);
    const expectedRoot = performer.matrixWorld
      .clone()
      .multiply(sampleMatrix(first.leftProp.propRootWorld));
    const expectedBody = expectedRoot
      .clone()
      .multiply(new Matrix4().makeRotationZ(0.3));
    expectMatrix(prop.propRoot.matrixWorld, expectedRoot);
    expectMatrix(prop.body.matrixWorld, expectedBody);
    // An asymmetric point detects accidentally dropping or applying reflection twice.
    const point = new Vector3(0.17, 0.29, -0.11);
    expect(
      point
        .clone()
        .applyMatrix4(prop.body.matrixWorld)
        .distanceTo(point.applyMatrix4(expectedBody))
    ).toBeLessThan(1e-6);
  });

  it("attaches emitters to off-sample captured wicks through a transformed performer and effects parent", () => {
    const { scene, performer, props } = rig();
    const prop = props[0]!;
    const propScale = 0.75;
    const staffHalfLength = 0.45 * propScale;
    prop.propRoot.scale.set(-propScale, propScale, propScale);
    prop.propRoot.rotation.y = 0.25;
    prop.body.rotation.z = -0.4;
    const first = captureNativeFrame(scene, "test", 0, 0, undefined, [
      true,
      false,
    ]);
    prop.propRoot.position.set(1.8, 0.9, -0.4);
    prop.propRoot.rotation.y = 1.7;
    prop.body.rotation.z = 1.1;
    const second = captureNativeFrame(scene, "test", 15, 1, undefined, [
      true,
      false,
    ]);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [first, second],
      durationSeconds: 1,
    });
    performer.position.set(4, 1.7, -3);
    performer.rotation.set(0.2, -0.7, 0.1);
    performer.scale.set(1.2, 0.9, 1.1);
    const effectsParent = new Group();
    effectsParent.position.set(0.2, -0.3, 0.1);
    effectsParent.rotation.y = 0.35;
    // Production EffectsGroup is a sibling of the named Avatar3D performer.
    performer.parent!.add(effectsParent);
    const otherPerformer = new Group();
    scene.add(otherPerformer);
    expect(resolveCapturedPropTransforms(effectsParent)).toBeUndefined();
    player.apply(0.125); // Quarter frame, with both root and body interpolation active.
    const captured = resolveCapturedPropTransforms(effectsParent)!;
    expect(captured.map(({ visible }) => visible)).toEqual([true, false]);
    expect(resolveCapturedPropTransforms(otherPerformer)).toBeUndefined();
    const bridge = new TipPositionBridge3D();
    const build = { ...propFinishState.build, fanBuild: "fire" as const };
    for (const propType of [PropType.STAFF, PropType.FAN]) {
      const anchors = resolvePropTipAnchors3D(
        propType,
        staffHalfLength / propScale,
        build
      );
      const result = bridge.updateFromMatrix(
        0,
        captured[0]!.bodyToEffects,
        staffHalfLength,
        1 / 60,
        propType,
        build,
        propScale
      );
      expect(result.tips).toHaveLength(anchors.length);
      result.tips.forEach((tip, index) => {
        const anchor = anchors[index]!.offset;
        const actual = effectsParent.localToWorld(
          new Vector3(tip.position.x, tip.position.y, tip.position.z)
        );
        const wick = prop.body.localToWorld(
          new Vector3(anchor.x, anchor.y, anchor.z)
        );
        expect(actual.distanceTo(wick)).toBeLessThan(1e-6);
      });
    }
    // The complete matrix also attaches a surface effect without dropping the reflection.
    const diffuser = new MoonFanDiffuserRenderer3D();
    diffuser.initialize(effectsParent);
    diffuser.update({
      bodyToEffects: captured[0]!.bodyToEffects,
      rigLocalCenter: { x: 0, y: 0, z: 0 },
      ledColors: [],
      brightness: 1,
    });
    scene.updateMatrixWorld(true);
    const front = effectsParent.children[0]!;
    const surfacePoint = new Vector3(0.1, 0.2, 0);
    expect(
      front
        .localToWorld(surfacePoint.clone())
        .distanceTo(
          prop.body.localToWorld(
            surfacePoint.clone().add(new Vector3(0, 0, 0.012))
          )
        )
    ).toBeLessThan(1e-6);
    player.restore();
    expect(resolveCapturedPropTransforms(effectsParent)).toBeUndefined();
    // Returning to live mode releases the temporary manual surface matrix too.
    diffuser.update({
      propState: {
        worldPosition: { x: 0, y: 0, z: 0 },
        worldRotation: new Quaternion(),
      },
      rigLocalCenter: { x: 2, y: 3, z: 4 },
      ledColors: [],
      brightness: 1,
    });
    expect(front.matrixAutoUpdate).toBe(true);
    expect(front.position.toArray()).toEqual([2, 3, 4.012]);
    diffuser.dispose();
  });

  it("restores every overwritten local pose and visibility before the live solver resumes", () => {
    const { scene, root, left, props } = rig();
    const frame = captureNativeFrame(scene, "test", 0, 0, undefined, [
      false,
      true,
    ]);
    const player = new CapturedPosePlayer(scene, "test", {
      frames: [frame],
      durationSeconds: 1,
    });
    root.position.set(3, 2, 1);
    left.rotation.x = 0.8;
    props[0]!.propRoot.position.set(5, 6, 7);
    props[0]!.body.rotation.y = 0.9;
    scene.updateMatrixWorld(true);
    props[0]!.body.matrixAutoUpdate = false;
    props[0]!.body.matrix.elements[4] = 0.3;
    const objects = [root, left, props[0]!.propRoot, props[0]!.body];
    const before = objects.map((object) => object.matrix.clone());
    player.apply(0);
    expect(props[0]!.branch.visible).toBe(false);
    player.apply(0.4);
    player.restore();
    objects.forEach((object, index) =>
      expectMatrix(object.matrix, before[index]!)
    );
    expect(props[0]!.propRoot.matrixAutoUpdate).toBe(true);
    expect(props[0]!.body.matrixAutoUpdate).toBe(false);
    expect(props[0]!.branch.visible).toBe(true);
    root.position.x = 42;
    player.apply(0);
    player.restore();
    expect(root.position.x).toBe(42);
    player.restore();
    expect(root.position.x).toBe(42);
  });

  it("rebinds a replaced prop body after restoring the detached model", () => {
    const { scene, props } = rig();
    const frame = captureNativeFrame(scene, "test", 0, 0);
    const clip = { frames: [frame], durationSeconds: 1 };
    const oldRoot = props[0]!.propRoot;
    const oldBody = props[0]!.body;
    oldRoot.position.set(8, 9, 10);
    oldBody.rotation.y = 0.6;
    scene.updateMatrixWorld(true);
    const oldRootBefore = oldRoot.matrix.clone();
    const oldBodyBefore = oldBody.matrix.clone();
    const player = new CapturedPosePlayer(scene, "test", clip);
    player.apply(0);
    expect(player.isAttached()).toBe(true);

    props[0]!.correction.remove(oldRoot);
    expect(player.isAttached()).toBe(false);
    player.restore();
    expectMatrix(oldRoot.matrix, oldRootBefore);
    expectMatrix(oldBody.matrix, oldBodyBefore);
    expect(CapturedPosePlayer.canBind(scene, "test")).toBe(false);

    const replacementRoot = new Group();
    const replacementBody = new Group();
    replacementBody.name = "0-rotated-body";
    replacementBody.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    replacementRoot.add(replacementBody);
    props[0]!.correction.add(replacementRoot);
    expect(CapturedPosePlayer.canBind(scene, "test")).toBe(true);
    const rebound = new CapturedPosePlayer(scene, "test", clip);
    rebound.apply(0);
    scene.updateMatrixWorld(true);
    expectMatrix(
      replacementRoot.matrixWorld,
      sampleMatrix(frame.leftProp.propRootWorld)
    );
    expectMatrix(
      replacementBody.matrixWorld,
      sampleMatrix(frame.leftProp.rotatedBodyWorld)
    );
    rebound.restore();
  });

  it("rejects a missing bone or incomplete frame before modifying the scene", () => {
    const { scene, left, root } = rig();
    const frame = captureNativeFrame(scene, "test", 0, 0);
    const incomplete = { ...frame, bones: frame.bones.slice(1) };
    expect(
      () =>
        new CapturedPosePlayer(scene, "test", {
          frames: [frame, incomplete],
          durationSeconds: 1,
        })
    ).toThrow(/incomplete bone frame/);
    left.name = "MissingHand";
    expect(
      () =>
        new CapturedPosePlayer(scene, "test", {
          frames: [frame],
          durationSeconds: 1,
        })
    ).toThrow(/hierarchy differs/);
    expect(root.position.length()).toBe(0);
  });
});
