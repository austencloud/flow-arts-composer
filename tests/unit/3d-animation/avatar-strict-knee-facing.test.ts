/**
 * Strict knee facing
 *
 * Before its baked clip arrives, a Composer performer plays on the live
 * prop-authoritative solve, which plants each foot and bends the leg back to
 * it. That solve aimed every knee at world +Z. A performer facing +Z looked
 * right; one the stage turns to face the camera (Blossom and Ember stand their
 * cast at a half turn) had both knees driven backwards through the joint,
 * deepened by the automatic crouch, until the clip swapped in. The bake always
 * runs facing +Z, which is why only the live phase showed it.
 *
 * Measured the way the gait report measures it (`analyzeKneeAnatomy`, the
 * shank against where a straight leg would have put the ankle), on real rigs,
 * so a pole or hinge regression reads as the defect a viewer sees.
 */

import path from "node:path";
import fs from "node:fs";
import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  AvatarAnimator,
  ElbowPoleComputer,
  IKSolver,
  KneeHingeAxisCalibrator,
  kneeHingeReferenceAxis,
  type BoneChain,
} from "@austencloud/scene-3d";
import { analyzeKneeAnatomy } from "#lib/shared/3d/diagnostics/gait/knee-anatomy.js";
import type { FootFrame, GaitFrame, Vec3 } from "#lib/shared/3d/diagnostics/gait/gait-frame.js";
import { avatar, avatarAssetsPresent, loadRig, type LoadedRig } from "../3d/locomotion-harness";

type StrictLegProbe = {
  strictKneePole: (state: { leftLegChain: BoneChain; rightLegChain: BoneChain }) => Vector3;
  plantLeg: (
    chain: BoneChain,
    foot: { position: Vector3; rotation: Quaternion },
    kneeHingeAxis: Vector3,
    pole: Vector3
  ) => void;
};

const personal = path.resolve(path.dirname(avatar("ch01")), "../bakeoff/personal-metaperson.glb");
const RIGS: Array<[string, string]> = [
  ["ch01", avatar("ch01")],
  ["ch07", avatar("ch07")],
  ...(fs.existsSync(personal) ? [["Austen", personal] as [string, string]] : []),
];
// How far the strict solve's automatic crouch may lower the hips.
const CROUCH_M = 0.25;

const vec = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

function legFrame(chain: BoneChain): FootFrame {
  const hip = chain.root.getWorldPosition(new Vector3());
  const knee = chain.middle.getWorldPosition(new Vector3());
  const ankle = chain.effector.getWorldPosition(new Vector3());
  const kneeAngle = (hip.clone().sub(knee).angleTo(ankle.clone().sub(knee)) * 180) / Math.PI;
  return { hip: vec(hip), knee: vec(knee), ankle: vec(ankle), toe: null, kneeAngle, claimedContact: -1 };
}

/** One frame in the gait probe's shape, facing read off the hip line as the sampler does. */
function sample(rig: LoadedRig): GaitFrame {
  const right = rig.rightLeg.root.getWorldPosition(new Vector3())
    .sub(rig.leftLeg.root.getWorldPosition(new Vector3()));
  const hips = rig.skeleton.getBone("Hips")!.getWorldPosition(new Vector3());
  return {
    t: 0, dt: 1 / 30, root: { x: 0, y: 0, z: 0 },
    facing: Math.atan2(right.z, -right.x),
    hips: vec(hips), left: legFrame(rig.leftLeg), right: legFrame(rig.rightLeg),
  };
}

/** A rig turned to `yaw`, crouched over feet planted where it stood, as the live solve leaves it. */
async function crouchedRig(file: string, yaw: number) {
  const rig = await loadRig(file);
  const stage = new Group();
  stage.rotation.y = yaw;
  stage.add(rig.scene);
  stage.updateMatrixWorld(true);
  const legs = { leftLegChain: rig.leftLeg, rightLegChain: rig.rightLeg };
  const animator = new AvatarAnimator(
    new IKSolver(),
    { getState: () => legs, getBone: (name: string) => rig.skeleton.getBone(name) } as never,
    new ElbowPoleComputer()
  ) as unknown as StrictLegProbe;
  const reference = kneeHingeReferenceAxis(rig.leftLeg.root, rig.rightLeg.root);
  const plants = [rig.leftLeg, rig.rightLeg].map((chain) => ({
    chain,
    axis: new KneeHingeAxisCalibrator().compute(chain, reference),
    foot: {
      position: chain.effector.getWorldPosition(new Vector3()),
      rotation: chain.effector.getWorldQuaternion(new Quaternion()),
    },
  }));
  const hips = rig.skeleton.getBone("Hips")!;
  const lowered = hips.getWorldPosition(new Vector3());
  lowered.y -= CROUCH_M;
  hips.position.copy(hips.parent!.worldToLocal(lowered));
  hips.updateWorldMatrix(true, true);
  return { rig, animator, legs, plants };
}

function expectKneesForward(rig: LoadedRig, plants: Array<{ chain: BoneChain; foot: { position: Vector3 } }>) {
  const anatomy = analyzeKneeAnatomy([sample(rig)]);
  // Both knees bent far enough for their direction to be measured at all.
  expect(anatomy.minConditionedFraction).toBe(1);
  expect(anatomy.left.reversedFraction, "left knee bends backwards").toBe(0);
  expect(anatomy.right.reversedFraction, "right knee bends backwards").toBe(0);
  for (const { chain, foot } of plants) {
    expect(chain.effector.getWorldPosition(new Vector3()).distanceTo(foot.position)).toBeLessThan(0.002);
  }
}

describe.skipIf(!avatarAssetsPresent())("strict leg solve bends knees the way the body faces", () => {
  for (const [id, file] of RIGS) {
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      it(`${id} facing ${Math.round((yaw * 180) / Math.PI)} degrees`, async () => {
        const { rig, animator, legs, plants } = await crouchedRig(file, yaw);
        for (const { chain, axis, foot } of plants) {
          animator.plantLeg(chain, foot, axis, animator.strictKneePole(legs));
        }
        expectKneesForward(rig, plants);
      }, 60_000);
    }

    it(`${id} keeps its knees forward even when handed the old world +Z pole at a half turn`, async () => {
      // The pole the live solve used before the fix. The anatomical hold must
      // catch any caller that still gets it wrong, before the frame is drawn.
      const { rig, animator, plants } = await crouchedRig(file, Math.PI);
      for (const { chain, axis, foot } of plants) {
        animator.plantLeg(chain, foot, axis, new Vector3(0, 0, 1));
      }
      expectKneesForward(rig, plants);
    }, 60_000);
  }
});
