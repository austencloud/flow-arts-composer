/**
 * The Three.js half of the carry poses.
 *
 * `Avatar3D` animates the whole body in Threlte's `mainStage`. This rig runs
 * in a later stage, after locomotion and foot planting, and overwrites only
 * the right arm: upper arm, forearm and hand from a two-bone solve toward the
 * pose in `prop-carry.ts`, and the five right fingers closed into
 * the package's square staff grip. The legs, spine, head and left arm keep
 * whatever locomotion gave them.
 *
 * Like the EUC mounted-pose rig, nothing here patches or reaches into the
 * package. Bones are found by name in the scene and posed from outside.
 *
 * The pose is laid out in the body frame of the pelvis (the line between
 * the thighs gives its left), not of the performer group: a body that turns on the spot or sways inside its group
 * (the village's turn clips, an idle that shifts the hips) keeps the staff
 * beside its own hip.
 *
 * The prop is not parented into the avatar hierarchy, because `Avatar3D`
 * walks that hierarchy to fade materials and the prop's materials are shared
 * with every other prop in the app. It lives in its own group and follows the
 * hand's achieved transform each frame.
 */

import {
  Matrix4,
  Quaternion,
  Vector3,
  type Bone,
  type Object3D,
  type Skeleton,
  type SkinnedMesh,
} from "three";
import { STAFF_GRIP_POSES, GripType } from "@austencloud/scene-3d";
import {
  CARRY_DEFAULT_METRICS,
  advanceCarryStandWeight,
  createCarryPose,
  carryPropOriginOffset,
  solveArmElbow,
  solveCarryPose,
  type CarryBodyMetrics,
  type CarryKind,
} from "./prop-carry";

// ── Skeleton discovery ──────────────────────────────────────────────────────

const ARM_BONE_ALIASES = {
  Hips: ["Hips", "pelvis", "hip"],
  LeftUpLeg: ["LeftUpLeg", "thigh_l", "l_thigh", "thigh.L", "LeftUpperLeg"],
  RightUpLeg: ["RightUpLeg", "thigh_r", "r_thigh", "thigh.R", "RightUpperLeg"],
  RightArm: ["RightArm", "r_arm", "arm.R", "upperarm_r", "RightUpperArm"],
  RightForeArm: [
    "RightForeArm",
    "r_forearm",
    "forearm.R",
    "lowerarm_r",
    "RightLowerArm",
  ],
  RightHand: ["RightHand", "r_hand", "hand.R", "hand_r"],
} as const;

type ArmBoneName = keyof typeof ARM_BONE_ALIASES;

/** The package's finger order; `STAFF_GRIP_POSES` rotations follow it. */
const FINGER_NAMES = [
  "Thumb1",
  "Thumb2",
  "Thumb3",
  "Index1",
  "Index2",
  "Index3",
  "Middle1",
  "Middle2",
  "Middle3",
  "Ring1",
  "Ring2",
  "Ring3",
  "Pinky1",
  "Pinky2",
  "Pinky3",
] as const;

/** Lowercase and drop an export namespace (`mixamorig:`, `mixamorig12:`). */
function normalizeBoneName(name: string): string {
  const lower = name.toLowerCase();
  const colon = lower.lastIndexOf(":");
  const bare = colon >= 0 ? lower.slice(colon + 1) : lower;
  return bare.replace(/^mixamorig\d*_?/, "");
}

/**
 * Exact normalized names first, so `RightHand` never resolves to
 * `RightHandIndex1`; the package's alias spellings after that.
 */
export function findCarryBones(root: Object3D): {
  arm: Map<ArmBoneName, Bone>;
  fingers: Bone[] | null;
} {
  const byName = new Map<string, Bone>();
  root.traverse((node) => {
    if (!(node as Bone).isBone) return;
    const key = normalizeBoneName(node.name);
    if (!byName.has(key)) byName.set(key, node as Bone);
  });

  const arm = new Map<ArmBoneName, Bone>();
  for (const name of Object.keys(ARM_BONE_ALIASES) as ArmBoneName[]) {
    for (const alias of ARM_BONE_ALIASES[name]) {
      const bone = byName.get(normalizeBoneName(alias));
      if (bone) {
        arm.set(name, bone);
        break;
      }
    }
  }

  const fingers: Bone[] = [];
  for (const finger of FINGER_NAMES) {
    const bone =
      byName.get(`righthand${finger.toLowerCase()}`) ??
      byName.get(`r_${finger.toLowerCase()}`) ??
      byName.get(`${finger.toLowerCase()}_r`);
    if (!bone) return { arm, fingers: null };
    fingers.push(bone);
  }
  return { arm, fingers };
}

/**
 * The body group a carry binds to: Avatar3D's `PERFORMER_<id>` group under
 * `root`, or, without an id, the first one that holds a model (the rig's own
 * prop groups are named `PERFORMER_PROP_...`).
 */
export function findCarryPerformer(
  root: Object3D,
  performerId?: string
): Object3D | null {
  if (performerId)
    return root.getObjectByName(`PERFORMER_${performerId}`) ?? null;
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (
      found ||
      !node.name.startsWith("PERFORMER_") ||
      node.name.startsWith("PERFORMER_PROP")
    )
      return;
    if (node.children[0]) found = node;
  });
  return found;
}

// ── Rig ─────────────────────────────────────────────────────────────────────

/** Fist centre from the wrist, as fractions of the wrist-to-knuckle length. */
export const CARRY_FIST_FORWARD_FRACTION = 0.72;
export const CARRY_FIST_PALM_FRACTION = 0.3;

const UP = new Vector3(0, 1, 0);

/** Converts the prop factories' horizontal body back to the prop frame. */
const PROP_BODY_UNROTATE = new Quaternion().setFromAxisAngle(
  new Vector3(0, 0, 1),
  -Math.PI / 2
);

export interface CarryUpdate {
  deltaSeconds: number;
  isMoving: boolean;
  /** Near band: solve the arm this frame. Otherwise replay the last solve. */
  solve: boolean;
  /** Ground height under the character, world metres. */
  groundY: number;
}

export interface CarryDiagnostic {
  attached: boolean;
  standWeight: number;
  /** Target distance over arm length on the last solve; above 1 falls short. */
  reachRatio: number;
  solvedFrames: number;
  replayedFrames: number;
}

/** Quaternion that maps an orthonormal local pair onto a world pair. */
function quaternionFromPairs(
  localPrimary: Vector3,
  localSecondary: Vector3,
  worldPrimary: Vector3,
  worldSecondary: Vector3,
  scratchLocal: Matrix4,
  scratchWorld: Matrix4,
  scratchThird: Vector3,
  out: Quaternion
): Quaternion {
  scratchThird.crossVectors(localPrimary, localSecondary);
  scratchLocal.makeBasis(localPrimary, localSecondary, scratchThird);
  scratchThird.crossVectors(worldPrimary, worldSecondary);
  scratchWorld.makeBasis(worldPrimary, worldSecondary, scratchThird);
  // World = W * L^T, and the transpose of a rotation is its inverse.
  scratchLocal.transpose();
  scratchWorld.multiply(scratchLocal);
  return out.setFromRotationMatrix(scratchWorld);
}

export class CarryRig {
  readonly kind: CarryKind;

  private modelRoot: Object3D | null = null;
  private performerRoot: Object3D | null = null;
  private upper: Bone | null = null;
  private fore: Bone | null = null;
  private hand: Bone | null = null;
  private leftThigh: Bone | null = null;
  private rightThigh: Bone | null = null;
  private fingers: Bone[] = [];
  private readonly fingerGrip: Quaternion[] = [];
  private skeletons: Skeleton[] = [];

  private upperLength = 0;
  private foreLength = 0;
  private fistForward = 0;
  private fistPalm = 0;
  private readonly metrics: CarryBodyMetrics = {
    ...CARRY_DEFAULT_METRICS,
  };

  // Bone-local directions, measured once per model.
  private readonly upperAxis = new Vector3();
  private readonly upperHinge = new Vector3();
  private readonly foreAxis = new Vector3();
  private readonly foreHinge = new Vector3();
  private readonly handForwardLocal = new Vector3();
  private readonly handAcrossLocal = new Vector3();

  // The last solve, replayed outside the near band.
  private hasSolve = false;
  private readonly cachedUpper = new Quaternion();
  private readonly cachedFore = new Quaternion();
  private readonly cachedHand = new Quaternion();
  private readonly propFromHand = new Matrix4();

  private standWeight = 1;
  private reachRatio = 0;
  private solvedFrames = 0;
  private replayedFrames = 0;

  private readonly pose = createCarryPose();
  private readonly bodyQuat = new Quaternion();
  private readonly bodyLeft = new Vector3();
  private readonly thighWorld = new Vector3();
  private readonly bodyOrigin = new Vector3();
  private readonly shoulder = new Vector3();
  private readonly elbow = new Vector3();
  private readonly wrist = new Vector3();
  private readonly target = new Vector3();
  private readonly gripWorld = new Vector3();
  private readonly propOrigin = new Vector3();
  private readonly fw = new Vector3();
  private readonly kw = new Vector3();
  private readonly nw = new Vector3();
  private readonly pole = new Vector3();
  private readonly dirUpper = new Vector3();
  private readonly dirFore = new Vector3();
  private readonly hinge = new Vector3();
  private readonly propUp = new Vector3();
  private readonly propNormal = new Vector3();
  private readonly third = new Vector3();
  private readonly qParent = new Quaternion();
  private readonly qUpper = new Quaternion();
  private readonly qFore = new Quaternion();
  private readonly qHand = new Quaternion();
  private readonly qProp = new Quaternion();
  private readonly qInverse = new Quaternion();
  private readonly mA = new Matrix4();
  private readonly mB = new Matrix4();
  private readonly propWorld = new Matrix4();
  private readonly unitScale = new Vector3(1, 1, 1);

  constructor(kind: CarryKind) {
    this.kind = kind;
  }

  /** True while the rig is bound to this performer's current model. */
  isAttachedTo(performerRoot: Object3D): boolean {
    return (
      this.performerRoot === performerRoot &&
      this.modelRoot !== null &&
      performerRoot.children[0] === this.modelRoot
    );
  }

  /**
   * Bind to the model under `performerRoot` (the `PERFORMER_<id>` group).
   * Returns false when the rig lacks a right arm or right fingers, in which
   * case nothing is posed and the prop stays hidden.
   */
  attach(performerRoot: Object3D, groundY: number): boolean {
    this.detach();
    const model = performerRoot.children[0];
    if (!model) return false;
    const { arm, fingers } = findCarryBones(model);
    const upper = arm.get("RightArm");
    const fore = arm.get("RightForeArm");
    const hand = arm.get("RightHand");
    const hips = arm.get("Hips");
    if (!upper || !fore || !hand || !fingers) return false;
    if (fore.parent !== upper || hand.parent !== fore) return false;

    const skeletons = new Set<Skeleton>();
    let bindSource = null as SkinnedMesh | null;
    model.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      skeletons.add(mesh.skeleton);
      if (!bindSource && mesh.skeleton.bones.includes(upper)) bindSource = mesh;
    });
    if (!bindSource) return false;

    performerRoot.updateMatrixWorld(true);
    const rootInverse = new Matrix4().copy(performerRoot.matrixWorld).invert();
    const bindRelative = (bone: Bone): Matrix4 => {
      const mesh = bindSource!;
      const index = mesh.skeleton.bones.indexOf(bone);
      const boneBind = new Matrix4()
        .copy(mesh.skeleton.boneInverses[index]!)
        .invert();
      return new Matrix4()
        .copy(rootInverse)
        .multiply(mesh.matrixWorld)
        .multiply(mesh.bindMatrixInverse)
        .multiply(boneBind);
    };
    const rotationOf = (matrix: Matrix4): Quaternion => {
      const position = new Vector3();
      const rotation = new Quaternion();
      const scale = new Vector3();
      matrix.decompose(position, rotation, scale);
      return rotation;
    };

    // Elbow hinge from the bind pose: flexion swings the forearm toward the
    // body's front, so the hinge is the bind upper-arm direction crossed with
    // forward. Holds for a T-pose and an A-pose alike.
    const upperBind = rotationOf(bindRelative(upper));
    const foreBind = rotationOf(bindRelative(fore));
    this.upperAxis.copy(fore.position).normalize();
    this.foreAxis.copy(hand.position).normalize();
    const bindUpperDir = this.upperAxis.clone().applyQuaternion(upperBind);
    const hingeRoot = new Vector3()
      .crossVectors(bindUpperDir, new Vector3(0, 0, 1))
      .normalize();
    this.upperHinge.copy(hingeRoot).applyQuaternion(upperBind.clone().invert());
    this.upperHinge
      .addScaledVector(this.upperAxis, -this.upperHinge.dot(this.upperAxis))
      .normalize();
    this.foreHinge.copy(hingeRoot).applyQuaternion(foreBind.clone().invert());
    this.foreHinge
      .addScaledVector(this.foreAxis, -this.foreHinge.dot(this.foreAxis))
      .normalize();

    const middle1 = fingers[6]!;
    const index1 = fingers[3]!;
    const pinky1 = fingers[12]!;
    this.handForwardLocal.copy(middle1.position).normalize();
    this.handAcrossLocal
      .subVectors(pinky1.position, index1.position)
      .addScaledVector(
        this.handForwardLocal,
        -new Vector3()
          .subVectors(pinky1.position, index1.position)
          .dot(this.handForwardLocal)
      )
      .normalize();

    // The closed fist: the package's square staff grip, authored for the left
    // hand and mirrored here exactly as its FingerAnimator mirrors it, on top
    // of each finger's bind rotation.
    const square = STAFF_GRIP_POSES[GripType.SQUARE];
    this.fingerGrip.length = 0;
    fingers.forEach((bone, index) => {
      const parent = bone.parent as Bone;
      const parentBind = rotationOf(bindRelative(parent));
      const rest = parentBind.invert().multiply(rotationOf(bindRelative(bone)));
      const raw = square.rotations[index]!;
      const delta = new Quaternion(raw[0], -raw[1], -raw[2], raw[3]);
      this.fingerGrip.push(rest.multiply(delta).normalize());
    });

    const upperWorld = upper.getWorldPosition(new Vector3());
    const foreWorld = fore.getWorldPosition(new Vector3());
    const handWorld = hand.getWorldPosition(new Vector3());
    const middleWorld = middle1.getWorldPosition(new Vector3());
    this.upperLength = upperWorld.distanceTo(foreWorld);
    this.foreLength = foreWorld.distanceTo(handWorld);
    const handLength = handWorld.distanceTo(middleWorld);
    this.fistForward = handLength * CARRY_FIST_FORWARD_FRACTION;
    this.fistPalm = handLength * CARRY_FIST_PALM_FRACTION;

    // The shoulder's offset is measured from the pelvis, so a body that
    // binds while turned or shifted inside its group still measures true.
    const leftThigh = arm.get("LeftUpLeg") ?? null;
    const rightThigh = arm.get("RightUpLeg") ?? null;
    this.leftThigh = leftThigh;
    this.rightThigh = rightThigh;
    this.metrics.shoulderHeight = upperWorld.y - groundY;
    this.metrics.hipHeight = hips
      ? hips.getWorldPosition(new Vector3()).y - groundY
      : this.metrics.shoulderHeight * 0.69;
    this.bodyFrame(performerRoot, groundY);
    this.metrics.shoulderLateral = Math.abs(
      upperWorld.sub(this.bodyOrigin).dot(this.bodyLeft)
    );

    this.performerRoot = performerRoot;
    this.modelRoot = model;
    this.upper = upper;
    this.fore = fore;
    this.hand = hand;
    this.fingers = fingers;
    this.skeletons = [...skeletons];
    this.hasSolve = false;
    return true;
  }

  detach(): void {
    this.performerRoot = null;
    this.modelRoot = null;
    this.upper = null;
    this.fore = null;
    this.hand = null;
    this.leftThigh = null;
    this.rightThigh = null;
    this.fingers = [];
    this.skeletons = [];
    this.hasSolve = false;
  }

  /** Start in the pose that fits what the person is doing, with no blend. */
  resetStandWeight(isMoving: boolean): void {
    this.standWeight = isMoving ? 0 : 1;
    this.hasSolve = false;
  }

  /**
   * Pose the right arm and fill `propMatrix` with the prop's world transform.
   * Returns false when not attached. Allocation-free.
   */
  update(input: CarryUpdate, propMatrix: Matrix4): boolean {
    const { performerRoot, upper, fore, hand } = this;
    if (!performerRoot || !upper || !fore || !hand) return false;

    const previous = this.standWeight;
    if (this.kind === "staff") {
      this.standWeight = advanceCarryStandWeight(
        previous,
        input.isMoving,
        input.deltaSeconds
      );
    }
    // Outside the near band the arm replays its last solve, except while the
    // walk-to-stand blend is moving, which a replay could not show.
    const blending = this.standWeight !== previous;
    const solve = input.solve || blending || !this.hasSolve;

    if (solve) {
      this.solveArm(performerRoot, upper, fore, hand, input.groundY);
    } else {
      upper.quaternion.copy(this.cachedUpper);
      fore.quaternion.copy(this.cachedFore);
      hand.quaternion.copy(this.cachedHand);
      this.replayedFrames += 1;
    }
    for (let index = 0; index < this.fingers.length; index += 1) {
      this.fingers[index]!.quaternion.copy(this.fingerGrip[index]!);
    }

    // The package already refreshed these skeletons for its own pose; a later
    // writer must refresh again or the skin renders the pre-carry arm (see
    // features/flow-fest-sim/services/flow-fest-avatar-skeleton-refresh.ts).
    performerRoot.updateMatrixWorld(true);
    for (let index = 0; index < this.skeletons.length; index += 1) {
      this.skeletons[index]!.update();
    }

    if (solve) {
      // Remember the prop relative to the hand for replayed frames.
      this.propFromHand
        .copy(hand.matrixWorld)
        .invert()
        .multiply(this.propWorld);
      propMatrix.copy(this.propWorld);
    } else {
      propMatrix.multiplyMatrices(hand.matrixWorld, this.propFromHand);
    }
    return true;
  }

  diagnostic(): CarryDiagnostic {
    return {
      attached: this.performerRoot !== null,
      standWeight: this.standWeight,
      reachRatio: this.reachRatio,
      solvedFrames: this.solvedFrames,
      replayedFrames: this.replayedFrames,
    };
  }

  private bodyFrame(performerRoot: Object3D, groundY: number): void {
    const { leftThigh, rightThigh } = this;
    if (leftThigh && rightThigh) {
      leftThigh.getWorldPosition(this.bodyLeft);
      rightThigh.getWorldPosition(this.thighWorld);
      this.bodyOrigin
        .addVectors(this.bodyLeft, this.thighWorld)
        .multiplyScalar(0.5);
      this.bodyLeft.sub(this.thighWorld);
      this.bodyLeft.y = 0;
    }
    if (!leftThigh || !rightThigh || this.bodyLeft.lengthSq() < 1e-6) {
      performerRoot.getWorldQuaternion(this.bodyQuat);
      performerRoot.getWorldPosition(this.bodyOrigin);
      this.bodyOrigin.y = groundY;
      this.bodyLeft.set(1, 0, 0).applyQuaternion(this.bodyQuat);
      return;
    }
    // The body's left is +X, so its forward (+Z) is the left turned a
    // quarter toward the back of the head: yaw = atan2(-left.z, left.x).
    this.bodyLeft.normalize();
    const yaw = Math.atan2(-this.bodyLeft.z, this.bodyLeft.x);
    this.bodyQuat.setFromAxisAngle(UP, yaw);
    this.bodyOrigin.y = groundY;
  }

  private solveArm(
    performerRoot: Object3D,
    upper: Bone,
    fore: Bone,
    hand: Bone,
    groundY: number
  ): void {
    const pose = solveCarryPose(
      this.kind,
      this.metrics,
      this.standWeight,
      this.pose
    );

    // Body frame to world: the pelvis's yaw, origin on the ground under it.
    // Without a hips bone, the performer group's.
    this.bodyFrame(performerRoot, groundY);
    this.gripWorld
      .copy(pose.grip)
      .applyQuaternion(this.bodyQuat)
      .add(this.bodyOrigin);
    this.fw.copy(pose.handForward).applyQuaternion(this.bodyQuat);
    this.kw.copy(pose.handAcross).applyQuaternion(this.bodyQuat);
    this.nw.crossVectors(this.fw, this.kw);
    this.pole.copy(pose.elbowPole).applyQuaternion(this.bodyQuat);
    this.propUp.copy(pose.propUp).applyQuaternion(this.bodyQuat);
    this.propNormal.copy(pose.propNormal).applyQuaternion(this.bodyQuat);

    // Aim the wrist so the fist's centre, not the wrist joint, lands on the
    // prop's grip.
    this.target
      .copy(this.gripWorld)
      .addScaledVector(this.fw, -this.fistForward)
      .addScaledVector(this.nw, -this.fistPalm);

    upper.updateWorldMatrix(true, false);
    upper.getWorldPosition(this.shoulder);
    this.reachRatio = solveArmElbow(
      this.shoulder,
      this.target,
      this.upperLength,
      this.foreLength,
      this.pole,
      this.elbow,
      this.wrist
    );

    // Both bones bend about one hinge: perpendicular to the plane of the
    // shoulder, elbow and wrist, signed so flexion carries the forearm the
    // way the elbow's pole points away from.
    this.dirUpper.subVectors(this.elbow, this.shoulder).normalize();
    this.dirFore.subVectors(this.wrist, this.elbow).normalize();
    this.hinge.crossVectors(this.dirUpper, this.dirFore);
    if (this.hinge.lengthSq() < 1e-10) {
      this.hinge.crossVectors(this.dirUpper, this.pole);
    }
    this.hinge.normalize();

    quaternionFromPairs(
      this.upperAxis,
      this.upperHinge,
      this.dirUpper,
      this.hinge,
      this.mA,
      this.mB,
      this.third,
      this.qUpper
    );
    quaternionFromPairs(
      this.foreAxis,
      this.foreHinge,
      this.dirFore,
      this.hinge,
      this.mA,
      this.mB,
      this.third,
      this.qFore
    );
    quaternionFromPairs(
      this.handForwardLocal,
      this.handAcrossLocal,
      this.fw,
      this.kw,
      this.mA,
      this.mB,
      this.third,
      this.qHand
    );

    // World rotations down to locals: parent, then each new world in turn.
    const parent = upper.parent;
    if (parent) parent.getWorldQuaternion(this.qParent);
    else this.qParent.identity();
    upper.quaternion
      .copy(this.qInverse.copy(this.qParent).invert())
      .multiply(this.qUpper);
    fore.quaternion
      .copy(this.qInverse.copy(this.qUpper).invert())
      .multiply(this.qFore);
    hand.quaternion
      .copy(this.qInverse.copy(this.qFore).invert())
      .multiply(this.qHand);
    this.cachedUpper.copy(upper.quaternion);
    this.cachedFore.copy(fore.quaternion);
    this.cachedHand.copy(hand.quaternion);

    // The prop goes where the fist actually closed, in the pose's orientation.
    this.gripWorld
      .copy(this.wrist)
      .addScaledVector(this.fw, this.fistForward)
      .addScaledVector(this.nw, this.fistPalm);
    this.propOrigin
      .copy(this.gripWorld)
      .addScaledVector(this.propUp, carryPropOriginOffset(this.kind, pose));

    this.third.crossVectors(this.propUp, this.propNormal);
    this.mA.makeBasis(this.third, this.propUp, this.propNormal);
    this.qProp.setFromRotationMatrix(this.mA);
    this.propWorld.compose(this.propOrigin, this.qProp, this.unitScale);

    this.hasSolve = true;
    this.solvedFrames += 1;
  }
}

/**
 * The quaternion to hand a prop factory's `setState` so its body lines up with
 * the carry prop frame (shaft or grip-to-centre along +Y, hoop plane XY).
 * Both `createStaffObject` and the procedural hoop turn their body by a
 * quarter turn about Z after the state rotation; this undoes it.
 */
export function carryPropBodyRotation(out: Quaternion): Quaternion {
  return out.copy(PROP_BODY_UNROTATE);
}
