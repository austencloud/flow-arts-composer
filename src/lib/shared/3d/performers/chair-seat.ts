/**
 * Sitting a character properly in a chair: thighs along the seat, shins down,
 * feet flat on the ground a little apart, hands resting on the thighs, and
 * the body placed so the underside of the thighs meets the seat top.
 *
 * The shared sitting clip (sitting-idle-b) was made for a low seat: knees
 * drawn up, arms round them, feet in the air. On a chair the legs and arms are
 * re-bent after the clip poses them, every frame.
 *
 * Copied from the Flow Fest jam's crowd (flow-fest-jam-crowd.ts: seatOnChair's
 * chair pose, measureSeat and the sitting clip remap), which solved it first.
 * The jam poses figures on a detached skeleton at the world origin facing +z;
 * here every target is worked out in the character root's own space, so a
 * sitter can stand anywhere, face any way and be uniformly scaled.
 */

import {
  AnimationClip,
  Quaternion,
  Vector3,
  type Bone,
  type KeyframeTrack,
  type Object3D,
  type SkinnedMesh,
} from "three";

/** How far behind the chair's centre the hips sit, metres (the jam's CHAIR_HIPS_X). */
export const SEATED_HIPS_BEHIND_CHAIR = 0.1;

/** Ankle bone height above the sole, metres. */
const ANKLE_ABOVE_SOLE = 0.08;

/** What a sitting body measures, in its root's space. */
export interface SeatMeasure {
  /** The underside of the buttocks and thighs. */
  seatY: number;
  /** Lowest and highest points of the posed body. */
  minY: number;
  maxY: number;
  /** How far forward of the root (+z) the pelvis sits. */
  hipsForward: number;
}

/** Three bones of a leg or arm, root to tip. */
interface Limb {
  upper: Bone;
  lower: Bone;
  end: Bone;
  /** +1 for the left side of the body, -1 for the right (+x is the figure's left). */
  side: number;
}

export interface ChairPose {
  /** The character's root; every target below is in its space. */
  root: Object3D;
  /** The ground under the chair, root space. */
  floorY: number;
  legs: Limb[];
  arms: Limb[];
}

/**
 * Every bone name in a model. Not one mesh's skeleton: in several characters
 * the first skinned mesh is the eyelashes or the shoes, bound to a handful of
 * bones with no arms and sometimes no hips. (That is why the scene package's
 * seated-audience loader can only seat a few of the characters.)
 */
export function boneNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((child) => {
    if ((child as Bone).isBone) names.add(child.name);
  });
  return names;
}

/** What comes before "Hips" in a rig's bone names ("mixamorig:", "mixamorig1", ""). */
export function bonePrefix(names: Iterable<string>): string {
  for (const name of names) {
    const at = name.indexOf("Hips");
    if (at !== -1) return name.slice(0, at);
  }
  return "";
}

/**
 * The sitting clip on this model's bones: every rotation, plus the pelvis
 * position from centimetres to metres so the hips drop to seat height.
 */
export function sittingClipFor(
  model: Object3D,
  raw: AnimationClip,
  clipPrefix: string
): AnimationClip {
  const names = boneNames(model);
  const modelPrefix = bonePrefix(names);
  const tracks: KeyframeTrack[] = [];
  for (const track of raw.tracks) {
    const dot = track.name.lastIndexOf(".");
    if (dot === -1) continue;
    const bone = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const hipsPosition = property === ".position" && bone.includes("Hips");
    if (property === ".position" && !hipsPosition) continue;
    const core =
      clipPrefix && bone.startsWith(clipPrefix)
        ? bone.slice(clipPrefix.length)
        : bone;
    const target = `${modelPrefix}${core}`;
    if (!names.has(target)) continue;
    const cloned = track.clone();
    cloned.name = `${target}${property}`;
    if (hipsPosition)
      for (let i = 0; i < cloned.values.length; i++)
        cloned.values[i] = cloned.values[i]! * 0.01;
    tracks.push(cloned);
  }
  return new AnimationClip(raw.name || "sitting-idle", raw.duration, tracks);
}

const scratchVertex = new Vector3();

/**
 * Lowest skinned vertex among those mostly weighted to the pelvis and thighs,
 * in root space: where the body meets a seat. Every piece counts; in some
 * characters the biggest piece is the shirt, with nothing below the waist.
 */
export function measureSeat(
  meshes: readonly SkinnedMesh[],
  root: Object3D
): SeatMeasure {
  root.updateMatrixWorld(true);
  let seatY = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of meshes) {
    const seatBones = new Set<number>();
    mesh.skeleton.bones.forEach((b, i) => {
      if (/(Hips|UpLeg)$/.test(b.name)) seatBones.add(i);
    });
    const position = mesh.geometry.getAttribute("position");
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    mesh.skeleton.update();
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, scratchVertex);
      scratchVertex.applyMatrix4(mesh.matrixWorld);
      root.worldToLocal(scratchVertex);
      minY = Math.min(minY, scratchVertex.y);
      maxY = Math.max(maxY, scratchVertex.y);
      let best = 0;
      let bestBone = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > best) {
          best = w;
          bestBone = skinIndex.getComponent(i, k);
        }
      }
      if (seatBones.has(bestBone)) seatY = Math.min(seatY, scratchVertex.y);
    }
  }
  let hips: Object3D | undefined;
  root.traverse((o) => {
    if (!hips && (o as Bone).isBone && o.name.endsWith("Hips")) hips = o;
  });
  const hipsAt = hips
    ? root.worldToLocal(hips.getWorldPosition(new Vector3()))
    : new Vector3();
  return { seatY, minY, maxY, hipsForward: hipsAt.z };
}

const ik = {
  hip: new Vector3(),
  knee: new Vector3(),
  tip: new Vector3(),
  target: new Vector3(),
  dir: new Vector3(),
  pole: new Vector3(),
  from: new Vector3(),
  to: new Vector3(),
  turn: new Quaternion(),
  world: new Quaternion(),
  parent: new Quaternion(),
  keep: new Quaternion(),
};

/** Turn a bone in world space so the direction `from` points along `to`. */
function swing(bone: Bone, from: Vector3, to: Vector3): void {
  ik.turn.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(ik.world).premultiply(ik.turn);
  bone.parent!.getWorldQuaternion(ik.parent).invert();
  bone.quaternion.copy(ik.parent.multiply(ik.world));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone reach, in world space: bend the limb so its tip lands on `target`,
 * the middle joint pushed toward the `pole` direction. The tip keeps its
 * world orientation.
 */
function reach(limb: Limb, target: Vector3, pole: Vector3): void {
  const { hip, knee, tip, dir } = ik;
  limb.end.getWorldQuaternion(ik.keep);
  limb.upper.getWorldPosition(hip);
  limb.lower.getWorldPosition(knee);
  limb.end.getWorldPosition(tip);
  const l1 = hip.distanceTo(knee);
  const l2 = knee.distanceTo(tip);
  dir.subVectors(target, hip);
  const d = Math.min(
    Math.max(dir.length(), Math.abs(l1 - l2) + 1e-3),
    (l1 + l2) * 0.999
  );
  dir.normalize();
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  ik.pole.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  // Where the middle joint goes, then turn the upper bone onto it.
  ik.to
    .copy(hip)
    .addScaledVector(dir, cos * l1)
    .addScaledVector(ik.pole, Math.sqrt(Math.max(0, 1 - cos * cos)) * l1)
    .sub(hip);
  ik.from.subVectors(knee, hip);
  swing(limb.upper, ik.from, ik.to);
  // Then the lower bone onto the target.
  limb.lower.getWorldPosition(knee);
  limb.end.getWorldPosition(tip);
  ik.from.subVectors(tip, knee);
  ik.to.copy(hip).addScaledVector(dir, d).sub(knee);
  swing(limb.lower, ik.from, ik.to);
  limb.end.parent!.getWorldQuaternion(ik.parent).invert();
  limb.end.quaternion.copy(ik.parent.multiply(ik.keep));
  limb.end.updateMatrixWorld(true);
}

function limb(
  root: Object3D,
  upper: string,
  lower: string,
  end: string,
  side: number
): Limb | null {
  const found = new Map<string, Bone>();
  root.traverse((o) => {
    if (!(o as Bone).isBone) return;
    for (const name of [upper, lower, end])
      if (o.name.endsWith(name)) found.set(name, o as Bone);
  });
  const [a, b, c] = [found.get(upper), found.get(lower), found.get(end)];
  return a && b && c ? { upper: a, lower: b, end: c, side } : null;
}

/** The limbs to re-bend, or null for a rig without both legs. */
export function chairPoseFor(root: Object3D, floorY = 0): ChairPose | null {
  const legs = [
    limb(root, "LeftUpLeg", "LeftLeg", "LeftFoot", 1),
    limb(root, "RightUpLeg", "RightLeg", "RightFoot", -1),
  ];
  const arms = [
    limb(root, "LeftArm", "LeftForeArm", "LeftHand", 1),
    limb(root, "RightArm", "RightForeArm", "RightHand", -1),
  ];
  if (legs.some((l) => !l)) return null;
  return {
    root,
    floorY,
    legs: legs as Limb[],
    arms: arms.filter((a): a is Limb => !!a),
  };
}

const local = {
  hip: new Vector3(),
  knee: new Vector3(),
  target: new Vector3(),
  pole: new Vector3(),
};

/**
 * Re-bend the clip's limbs for a chair. Run after the mixer poses the body,
 * every frame. The figure faces +z in root space.
 */
export function applyChairPose(pose: ChairPose): void {
  const { root } = pose;
  root.updateMatrixWorld(true);
  const knees: Vector3[] = [];
  for (const leg of pose.legs) {
    root.worldToLocal(leg.upper.getWorldPosition(local.hip));
    root.worldToLocal(leg.lower.getWorldPosition(local.knee));
    const thigh = local.hip.distanceTo(local.knee);
    local.target.set(
      local.hip.x + leg.side * 0.06,
      pose.floorY + ANKLE_ABOVE_SOLE,
      local.hip.z + thigh * 0.92
    );
    local.pole.set(0, 1, 1).transformDirection(root.matrixWorld);
    reach(leg, root.localToWorld(local.target), local.pole);
    knees.push(root.worldToLocal(leg.lower.getWorldPosition(new Vector3())));
  }
  pose.arms.forEach((arm, i) => {
    const leg = pose.legs.find((l) => l.side === arm.side) ?? pose.legs[i];
    if (!leg) return;
    root.worldToLocal(leg.upper.getWorldPosition(local.hip));
    const knee = knees[pose.legs.indexOf(leg)]!;
    // Two thirds of the way down the thigh, on top of it.
    local.target.copy(local.hip).lerp(knee, 0.62);
    local.target.y += 0.11;
    local.target.x += arm.side * 0.03;
    local.pole.set(arm.side, -0.4, -1).transformDirection(root.matrixWorld);
    reach(arm, root.localToWorld(local.target), local.pole);
  });
}

/**
 * Fit a body, already posed in its sitting clip's frame, to a chair whose
 * seat top is `seatHeight` above the ground (root units). Returns the limbs to
 * re-bend each frame and the fitted measure. The re-bent legs move the
 * thighs' underside a little, so it measures, bends and measures again, as
 * the jam does. A rig without legs comes back with no pose and the clip's
 * own measure.
 */
export function seatOnChair(
  root: Object3D,
  meshes: readonly SkinnedMesh[],
  seatHeight: number
): { pose: ChairPose | null; measure: SeatMeasure } {
  let measure = measureSeat(meshes, root);
  const pose = chairPoseFor(root);
  if (!pose) return { pose, measure };
  for (let pass = 0; pass < 2; pass++) {
    pose.floorY = measure.seatY - seatHeight;
    applyChairPose(pose);
    measure = measureSeat(meshes, root);
  }
  return { pose, measure };
}

/** Where the character's root goes; three.js rotation.y, the model facing +z at 0. */
export interface SeatedPlacement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

/**
 * Place a fitted sitter. `facing` is atan2(dz, dx) of the way they face, in
 * the x/z plane; `seatTop` is the chair's seat top above `floorY`, or null to
 * sit on the ground itself. `scale` is the root's uniform scale.
 */
export function seatedPlacement(
  at: { x: number; z: number; facing: number },
  floorY: number,
  seatTop: number | null,
  measure: SeatMeasure,
  scale = 1
): SeatedPlacement {
  const dx = Math.cos(at.facing);
  const dz = Math.sin(at.facing);
  // The hips go a little behind the chair's centre; on the ground, over the spot.
  const back =
    (seatTop === null ? 0 : -SEATED_HIPS_BEHIND_CHAIR) -
    measure.hipsForward * scale;
  return {
    x: at.x + dx * back,
    y: floorY + (seatTop ?? 0) - measure.seatY * scale,
    z: at.z + dz * back,
    rotationY: Math.PI / 2 - at.facing,
  };
}
