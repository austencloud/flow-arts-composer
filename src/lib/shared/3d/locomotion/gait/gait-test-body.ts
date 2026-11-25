/** For tests: the clips' own skeleton as a body. */
import { Bone, Group, Quaternion, Vector3 } from "three";
import type { GaitClipSet } from "./gait-clips";

export function gaitTestBody(clips: GaitClipSet, size = 1): { root: Group; bone: (name: string) => Bone } {
  const { bones, parents, restQ, restP } = clips.skeleton;
  const root = new Group();
  root.scale.setScalar(size);
  const made = bones.map((name) => Object.assign(new Bone(), { name: `mixamorig:${name}` }));
  const turn = (i: number) => new Quaternion().fromArray(restQ, i * 4);
  const place = (i: number) => new Vector3().fromArray(restP, i * 3);
  made.forEach((bone, i) => {
    const p = parents[i]!;
    const back = p < 0 ? new Quaternion() : turn(p).invert();
    bone.position.copy(place(i));
    if (p >= 0) bone.position.sub(place(p)).applyQuaternion(back);
    bone.quaternion.copy(back.multiply(turn(i)));
    (p < 0 ? root : made[p]!).add(bone);
  });
  return { root, bone: (name) => made[bones.indexOf(name)]! };
}
