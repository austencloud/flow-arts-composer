/**
 * The approved carry poses (prop-carry.ts) and the arm rig that holds them
 * (prop-carry-rig.ts), on a synthetic Mixamo-style arm.
 */

import { describe, expect, it } from "vitest";
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  type Mesh,
} from "three";
import {
  CARRY_DEFAULT_METRICS,
  CARRY_HOOP_RADIUS_M,
  CARRY_S1_MIN_CLEARANCE_M,
  CARRY_STAFF_LENGTH_M,
  CARRY_STAFF_RADIUS_M,
  advanceCarryStandWeight,
  createCarryPose,
  carryHoopCentre,
  carryStaffEnds,
  solveArmElbow,
  solveHoopCarryPose,
  solveStaffCarryPose,
} from "./prop-carry";
import {
  CARRY_FIST_FORWARD_FRACTION,
  CARRY_FIST_PALM_FRACTION,
  CarryRig,
} from "./prop-carry-rig";
import { createWorkerPropVisual } from "../../worker-renderer/worlds/props/worker-prop-factory";

const metrics = CARRY_DEFAULT_METRICS;
const UP = new Vector3(0, 1, 0);
const degrees = (radians: number) => (radians * 180) / Math.PI;

function staffAt(weight: number) {
  const pose = solveStaffCarryPose(metrics, weight, createCarryPose());
  const lower = new Vector3();
  const upper = new Vector3();
  carryStaffEnds(pose, lower, upper);
  return { pose, lower, upper };
}

describe("staff carry poses", () => {
  it("holds the staff near vertical walking (S1) and standing (S2)", () => {
    for (const weight of [0, 1]) {
      const { pose } = staffAt(weight);
      expect(degrees(pose.propUp.angleTo(UP))).toBeLessThan(6);
    }
  });

  it("S1 keeps the lower end clear of the ground and the top near the head", () => {
    const { pose, lower, upper } = staffAt(0);
    expect(lower.y).toBeGreaterThanOrEqual(CARRY_S1_MIN_CLEARANCE_M);
    expect(upper.y).toBeGreaterThan(1.55);
    expect(upper.y).toBeLessThan(1.85);
    // Gripped at the balance point, at waist height, just outside the hip.
    expect(pose.gripFromLowerEnd).toBeCloseTo(CARRY_STAFF_LENGTH_M / 2, 6);
    expect(pose.grip.y).toBeCloseTo(metrics.hipHeight - 0.01, 6);
    expect(pose.grip.x).toBeLessThan(-metrics.shoulderLateral);
  });

  it("S2 rests the lower end on the ground beside the right foot", () => {
    const { pose, lower } = staffAt(1);
    // The shaft end sits one cap radius up, so the cap touches the ground.
    expect(Math.abs(lower.y - CARRY_STAFF_RADIUS_M)).toBeLessThan(0.001);
    expect(Math.abs(lower.y - CARRY_STAFF_RADIUS_M - 0)).toBeLessThan(0.02);
    expect(lower.x).toBeLessThan(-0.15);
    // The hand stays at waist height.
    expect(pose.grip.y).toBeCloseTo(metrics.hipHeight - 0.01, 6);
  });

  it("blends S1 to S2 continuously", () => {
    let previous = staffAt(0);
    let worstStep = 0;
    for (let step = 1; step <= 1000; step += 1) {
      const next = staffAt(step / 1000);
      worstStep = Math.max(
        worstStep,
        next.pose.grip.distanceTo(previous.pose.grip),
        next.lower.distanceTo(previous.lower),
        next.upper.distanceTo(previous.upper),
        next.pose.handAcross.distanceTo(previous.pose.handAcross)
      );
      previous = next;
    }
    // The lower end travels about 26 cm over the blend; no 1/1000 step may
    // jump more than a few millimetres.
    expect(worstStep).toBeLessThan(0.005);
  });

  it("takes about half a second to start or stop", () => {
    let weight = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      weight = advanceCarryStandWeight(weight, false, 1 / 60);
    }
    expect(weight).toBeCloseTo(1, 6);
    weight = advanceCarryStandWeight(weight, true, 0.25);
    expect(weight).toBeCloseTo(0.5, 6);
  });
});

describe("hoop carry pose (H1)", () => {
  const pose = solveHoopCarryPose(metrics, createCarryPose());
  const centre = carryHoopCentre(pose, new Vector3());
  const radius = CARRY_HOOP_RADIUS_M;

  it("hangs in a vertical plane along the body's right side", () => {
    expect(Math.abs(pose.propNormal.x)).toBeGreaterThan(0.999);
    expect(Math.abs(pose.propUp.x)).toBeLessThan(1e-9);
    // The plane clears the shoulder joint by more than an upper arm's width.
    expect(pose.grip.x).toBeLessThan(-(metrics.shoulderLateral + 0.1));
    expect(centre.x).toBeCloseTo(pose.grip.x, 9);
  });

  it("holds the upper front arc by the shoulder with the hoop behind and below", () => {
    expect(pose.grip.y).toBeGreaterThan(metrics.shoulderHeight - 0.2);
    expect(pose.grip.z).toBeGreaterThan(0);
    // The grip is on the hoop, above and in front of its centre.
    expect(pose.grip.distanceTo(centre)).toBeCloseTo(radius, 9);
    expect(pose.grip.y).toBeGreaterThan(centre.y);
    expect(pose.grip.z).toBeGreaterThan(centre.z);
    // Rear arc behind the hip; lower arc at thigh height.
    expect(centre.z - radius).toBeLessThan(-0.25);
    expect(centre.y - radius).toBeGreaterThan(0.55);
    expect(centre.y - radius).toBeLessThan(0.9);
  });

  it("matches the radius of the app's big hoop mesh", async () => {
    const result = await createWorkerPropVisual({
      propType: "bighoop",
      color: "blue",
      length: 1,
      thickness: 0.0125,
      build: {
        finish: "day",
        fanBuild: "pictograph",
        fanFrameColor: "black",
        fanCover: "bare",
        triangleGrip: "corner",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let ring: TorusGeometry | null = null;
    result.visual.root.traverse((node) => {
      const geometry = (node as Mesh).geometry;
      if (
        geometry instanceof TorusGeometry &&
        geometry.parameters.arc >= Math.PI * 2 - 1e-6
      ) {
        ring = geometry;
      }
    });
    expect(ring).not.toBeNull();
    expect((ring as unknown as TorusGeometry).parameters.radius).toBeCloseTo(
      radius,
      6
    );
  });
});

describe("arm solve", () => {
  const shoulder = new Vector3(-0.17, 1.42, 0);
  const elbow = new Vector3();
  const wrist = new Vector3();

  it("reaches a reachable target with the elbow toward the pole", () => {
    const target = new Vector3(-0.26, 1.0, 0.1);
    const pole = new Vector3(-0.3, -0.6, -1).normalize();
    const ratio = solveArmElbow(
      shoulder,
      target,
      0.29,
      0.27,
      pole,
      elbow,
      wrist
    );
    expect(ratio).toBeLessThan(1);
    expect(wrist.distanceTo(target)).toBeLessThan(1e-9);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(0.29, 9);
    expect(elbow.distanceTo(wrist)).toBeCloseTo(0.27, 9);
    expect(elbow.z).toBeLessThan(0);
  });

  it("pulls an out-of-reach target in along the same line", () => {
    const target = new Vector3(-0.17, 0.4, 0);
    const ratio = solveArmElbow(
      shoulder,
      target,
      0.29,
      0.27,
      new Vector3(0, 0, -1),
      elbow,
      wrist
    );
    expect(ratio).toBeGreaterThan(1);
    expect(wrist.distanceTo(shoulder)).toBeCloseTo(0.56 * 0.999, 9);
    expect(wrist.x).toBeCloseTo(-0.17, 9);
  });

  it("keeps the S1 carrying upper arm close to the torso", () => {
    const pose = staffAt(0).pose;
    const target = pose.grip.clone().addScaledVector(pose.handForward, -0.07);
    solveArmElbow(shoulder, target, 0.29, 0.27, pose.elbowPole, elbow, wrist);
    const upperArm = elbow.clone().sub(shoulder);
    expect(degrees(upperArm.angleTo(new Vector3(0, -1, 0)))).toBeLessThan(30);
  });

  it("points the H1 elbow down, below the hand at the shoulder", () => {
    const pose = solveHoopCarryPose(metrics, createCarryPose());
    const target = pose.grip.clone().addScaledVector(pose.handForward, -0.07);
    solveArmElbow(shoulder, target, 0.29, 0.27, pose.elbowPole, elbow, wrist);
    expect(elbow.y).toBeLessThan(shoulder.y - 0.2);
    const forearm = wrist.clone().sub(elbow);
    expect(degrees(forearm.angleTo(UP))).toBeLessThan(40);
  });
});

// ── Rig on a synthetic Mixamo-style right arm ───────────────────────────────

interface SyntheticCharacter {
  performer: Group;
  bones: Map<string, Bone>;
}

/**
 * A T-pose right arm: facing +Z, so the right arm points along -X with the
 * palm down and the thumb forward. Names carry the Mixamo namespace so the
 * rig's name normalization is exercised.
 */
function createSyntheticCharacter(): SyntheticCharacter {
  const bones = new Map<string, Bone>();
  const bone = (
    name: string,
    parent: Bone | null,
    x: number,
    y: number,
    z: number
  ) => {
    const created = new Bone();
    created.name = `mixamorig:${name}`;
    created.position.set(x, y, z);
    parent?.add(created);
    bones.set(name, created);
    return created;
  };
  const hips = bone("Hips", null, 0, 0.98, 0);
  bone("LeftUpLeg", hips, 0.09, -0.06, 0);
  bone("RightUpLeg", hips, -0.09, -0.06, 0);
  const spine = bone("Spine", hips, 0, 0.3, 0);
  const shoulder = bone("RightShoulder", spine, -0.06, 0.12, 0);
  const arm = bone("RightArm", shoulder, -0.11, 0.02, 0);
  const fore = bone("RightForeArm", arm, -0.29, 0, 0);
  const hand = bone("RightHand", fore, -0.27, 0, 0);
  const fingerRoots: Record<string, [number, number, number]> = {
    Thumb: [-0.03, -0.01, 0.035],
    Index: [-0.09, 0, 0.025],
    Middle: [-0.095, 0, 0],
    Ring: [-0.09, 0, -0.02],
    Pinky: [-0.08, 0, -0.038],
  };
  for (const [finger, [x, y, z]] of Object.entries(fingerRoots)) {
    const first = bone(`RightHand${finger}1`, hand, x, y, z);
    const second = bone(`RightHand${finger}2`, first, -0.035, 0, 0);
    bone(`RightHand${finger}3`, second, -0.025, 0, 0);
  }

  const performer = new Group();
  performer.name = "PERFORMER_synthetic";
  const model = new Group();
  performer.add(model);
  model.add(hips);
  performer.updateMatrixWorld(true);

  const list = [...bones.values()];
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(3), 3)
  );
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(new Uint16Array(4), 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new BufferAttribute(new Float32Array([1, 0, 0, 0]), 4)
  );
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  model.add(mesh);
  performer.updateMatrixWorld(true);
  mesh.bind(new Skeleton(list));
  performer.updateMatrixWorld(true);
  return { performer, bones };
}

describe("carry rig", () => {
  function solvedStaff(isMoving: boolean) {
    const { performer, bones } = createSyntheticCharacter();
    // Facing and position must not matter: turn and move the person.
    performer.position.set(4, 0, -2);
    performer.rotation.y = 0.7;
    performer.updateMatrixWorld(true);
    const rig = new CarryRig("staff");
    expect(rig.attach(performer, 0)).toBe(true);
    rig.resetStandWeight(isMoving);
    const prop = new Matrix4();
    expect(
      rig.update(
        { deltaSeconds: 1 / 60, isMoving, solve: true, groundY: 0 },
        prop
      )
    ).toBe(true);
    return { performer, bones, rig, prop };
  }

  function staffFromMatrix(prop: Matrix4) {
    const origin = new Vector3();
    const rotation = new Quaternion();
    prop.decompose(origin, rotation, new Vector3());
    const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
    const half = CARRY_STAFF_LENGTH_M / 2;
    return {
      origin,
      up,
      lower: origin.clone().addScaledVector(up, -half),
      upper: origin.clone().addScaledVector(up, half),
    };
  }

  function distanceToLine(point: Vector3, origin: Vector3, direction: Vector3) {
    const offset = point.clone().sub(origin);
    return offset.addScaledVector(direction, -offset.dot(direction)).length();
  }

  it("stands the staff on the ground with the fist around the shaft (S2)", () => {
    const { bones, rig, prop } = solvedStaff(false);
    const staff = staffFromMatrix(prop);
    expect(rig.diagnostic().reachRatio).toBeLessThan(1);
    expect(Math.abs(staff.lower.y - CARRY_STAFF_RADIUS_M)).toBeLessThan(0.02);
    expect(degrees(staff.up.angleTo(UP))).toBeLessThan(6);

    // The wrist sits one fist offset from the shaft: the shaft runs through
    // the closed hand, not beside it.
    const hand = bones.get("RightHand")!.getWorldPosition(new Vector3());
    const middle = bones
      .get("RightHandMiddle1")!
      .getWorldPosition(new Vector3());
    const handLength = hand.distanceTo(middle);
    const fistOffset = Math.hypot(
      handLength * CARRY_FIST_FORWARD_FRACTION,
      handLength * CARRY_FIST_PALM_FRACTION
    );
    expect(distanceToLine(hand, staff.origin, staff.up)).toBeLessThan(
      fistOffset + 0.005
    );
    expect(hand.y).toBeGreaterThan(0.9);
    expect(hand.y).toBeLessThan(1.1);
  });

  it("bends the elbow as a hinge, below the shoulder, with the fingers closed (S1)", () => {
    const { bones, performer } = solvedStaff(true);
    const shoulder = bones.get("RightArm")!.getWorldPosition(new Vector3());
    const elbow = bones.get("RightForeArm")!.getWorldPosition(new Vector3());
    const wrist = bones.get("RightHand")!.getWorldPosition(new Vector3());
    expect(elbow.y).toBeLessThan(shoulder.y - 0.2);

    // A hinge elbow keeps the forearm in the plane of the upper arm and the
    // body's forward swing: the elbow's own hinge axis (the forearm bone's
    // local bind hinge) must be perpendicular to both segments.
    const upperDir = elbow.clone().sub(shoulder).normalize();
    const foreDir = wrist.clone().sub(elbow).normalize();
    const forward = new Vector3(0, 0, 1).applyQuaternion(performer.quaternion);
    // Flexion carries the forearm forward of the upper arm.
    expect(foreDir.dot(forward)).toBeGreaterThan(upperDir.dot(forward));
    const foreQuat = bones
      .get("RightForeArm")!
      .getWorldQuaternion(new Quaternion());
    // In the T-pose bind the elbow hinge is world +Y for the right arm.
    const hinge = new Vector3(0, 1, 0).applyQuaternion(foreQuat);
    expect(Math.abs(hinge.dot(upperDir))).toBeLessThan(1e-6);
    expect(Math.abs(hinge.dot(foreDir))).toBeLessThan(1e-6);

    const index1 = bones.get("RightHandIndex1")!;
    expect(
      degrees(2 * Math.acos(Math.min(1, Math.abs(index1.quaternion.w))))
    ).toBeGreaterThan(60);
  });

  it("keeps the staff beside the hip of a body turned and shifted inside its group", () => {
    // The village turns bodies on the spot and its idles shift the hips, so
    // the pelvis need not face or sit where the performer group does.
    const { performer, bones } = createSyntheticCharacter();
    performer.position.set(4, 0, -2);
    performer.rotation.y = 0.7;
    const hips = bones.get("Hips")!;
    hips.rotation.y = 0.9;
    hips.position.x += 0.15;
    hips.position.z += 0.2;
    performer.updateMatrixWorld(true);
    const rig = new CarryRig("staff");
    expect(rig.attach(performer, 0)).toBe(true);
    rig.resetStandWeight(false);
    const prop = new Matrix4();
    rig.update(
      { deltaSeconds: 1 / 60, isMoving: false, solve: true, groundY: 0 },
      prop
    );
    expect(rig.diagnostic().reachRatio).toBeLessThan(1);

    const staff = staffFromMatrix(prop);
    const pelvis = hips.getWorldPosition(new Vector3());
    const yaw = 0.7 + 0.9;
    const left = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const offset = staff.lower.clone().sub(pelvis);
    // Beside the right foot: out to the right, about level with the body.
    expect(-offset.dot(left)).toBeGreaterThan(0.15);
    expect(-offset.dot(left)).toBeLessThan(0.4);
    expect(Math.abs(offset.dot(forward))).toBeLessThan(0.25);
  });

  it("replays the last solve outside the near band and the prop follows the hand", () => {
    const { performer, rig, prop } = solvedStaff(true);
    const before = staffFromMatrix(prop);
    performer.position.x += 1;
    performer.updateMatrixWorld(true);
    const after = new Matrix4();
    rig.update(
      { deltaSeconds: 1 / 60, isMoving: true, solve: false, groundY: 0 },
      after
    );
    const moved = staffFromMatrix(after);
    expect(moved.origin.x - before.origin.x).toBeCloseTo(1, 6);
    expect(moved.origin.y).toBeCloseTo(before.origin.y, 6);
    expect(rig.diagnostic().replayedFrames).toBe(1);
  });
});
