import {
  Matrix4,
  Quaternion,
  Vector3,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from "three";
import type { TeachingPose } from "./isolation-teaching";

type HandSide = "left" | "right";
type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const jointWeights = [0.5, 0.35, 0.15] as const;
const PHOTO_THUMB_SPREAD = (25 * Math.PI) / 180;
const NORTH_THUMB_OPPOSITION = 0.45;
// At North the index tip must not curl back into a hook; the other fingertips
// can rest against the shaft without making a closed fist.
const NORTH_INDEX_TIP_RELEASE = 1.05;
const NORTH_SUPPORT_CURL = 0.42;
// Draw the four fingers into a loose, curved wall instead of a broad fan.
// Their knuckles stay in place; only the rays from each knuckle converge.
const NORTH_FINGER_SPLAY: Partial<Record<Finger, number>> = {
  index: 0.12,
  middle: 0.06,
  ring: -0.06,
  pinky: -0.12,
};
interface HandBone {
  bone: Bone;
  bindRotation: Quaternion;
}

const cache = new WeakMap<Object3D, Map<string, HandBone>>();

function handBones(root: Object3D): Map<string, HandBone> {
  const previous = cache.get(root);
  if (previous) return previous;
  const bones = new Map<string, HandBone>();
  root.traverse((object) => {
    if (object.type !== "SkinnedMesh") return;
    const skeleton = (object as SkinnedMesh).skeleton;
    const bindWorld = skeleton.boneInverses.map((inverse) =>
      inverse.clone().invert()
    );
    const index = new Map(skeleton.bones.map((bone, i) => [bone, i]));
    const position = new Vector3();
    const scale = new Vector3();
    for (let i = 0; i < skeleton.bones.length; i += 1) {
      const bone = skeleton.bones[i]!;
      const parentIndex = index.get(bone.parent as Bone);
      const local =
        parentIndex === undefined
          ? bindWorld[i]!
          : new Matrix4().multiplyMatrices(
              bindWorld[parentIndex]!.clone().invert(),
              bindWorld[i]!
            );
      const bindRotation = new Quaternion();
      local.decompose(position, bindRotation, scale);
      const name = bone.name
        .replace(/^.*:/, "")
        .replace(/^mixamorig\d*/i, "")
        .toLowerCase();
      if (!bones.has(name)) bones.set(name, { bone, bindRotation });
    }
  });
  cache.set(root, bones);
  return bones;
}

/** Lab-only edits run after contact posing. Each frame starts from the solver's pose. */
export function sculptHand(
  root: Object3D,
  side: HandSide,
  pose: TeachingPose
): void {
  const bones = handBones(root);
  const prefix = `${side}hand`;
  const wrist = bones.get(prefix)?.bone;
  if (!wrist) return;
  wrist.quaternion.multiply(
    new Quaternion().setFromAxisAngle(X, pose.wristBend)
  );
  wrist.quaternion.multiply(
    new Quaternion().setFromAxisAngle(Y, pose.wristTwist)
  );

  for (const finger of [
    "thumb",
    "index",
    "middle",
    "ring",
    "pinky",
  ] as const satisfies readonly Finger[]) {
    const curl = pose[`${finger}Curl`];
    for (let joint = 1; joint <= 3; joint += 1) {
      const entry = bones.get(`${prefix}${finger}${joint}`);
      if (!entry) continue;
      const { bone, bindRotation } = entry;
      // Keep the solver's thumb and index near the shaft while the supporting
      // fingers relax. Oppose the thumb across the shaft at North below.
      if (finger !== "thumb" && finger !== "index") {
        bone.quaternion.slerp(bindRotation, pose.gripRelaxation);
      }
      const northWeight = pose.gripRelaxation;
      const indexRelease = finger === "index" && joint === 3
        ? NORTH_INDEX_TIP_RELEASE * northWeight : 0;
      const supportCurl = finger !== "thumb" && finger !== "index" && joint <= 2
        ? NORTH_SUPPORT_CURL * northWeight : 0;
      const jointEdit = pose[`${finger}Joint${joint as 1 | 2 | 3}`];
      bone.quaternion.multiply(
        new Quaternion().setFromAxisAngle(
          X, curl * jointWeights[joint - 1]! + indexRelease + supportCurl + jointEdit
        )
      );
      if (joint === 1 && finger !== "thumb") {
        bone.quaternion.multiply(
          new Quaternion().setFromAxisAngle(
            Z,
            (NORTH_FINGER_SPLAY[finger] ?? 0) * northWeight
          )
        );
      }
      if (finger === "thumb" && joint === 1 && pose.gripRelaxation > 0) {
        bone.quaternion.multiply(
          new Quaternion().setFromAxisAngle(
            X,
            NORTH_THUMB_OPPOSITION *
              (pose.thumbSpread / PHOTO_THUMB_SPREAD) *
              pose.gripRelaxation
          )
        );
      }
    }
  }
  wrist.updateWorldMatrix(true, true);
}
