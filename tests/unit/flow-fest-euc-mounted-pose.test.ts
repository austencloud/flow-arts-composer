import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { KneeHingeAxisCalibrator } from "@austencloud/scene-3d";
import {
  FLOW_FEST_EUC_CONTACT_THRESHOLDS,
  FLOW_FEST_EUC_MAXIMUM_PELVIS_LATERAL_METERS,
  FLOW_FEST_EUC_PEDAL_GEOMETRY,
  FLOW_FEST_EUC_PEDAL_SEPARATION_METERS,
  FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS,
  FLOW_FEST_EUC_STANCE_POSES,
  FlowFestEucIdleStabilityTracker,
  advanceFlowFestEucStanceSignals,
  flowFestEucKneeFlexRadians,
  flowFestEucLegReachMeters,
  flowFestEucPedalAnchorLocal,
  flowFestEucStanceBlend,
  flowFestEucStanceOffsets,
  flowFestEucStanceSignals,
  flowFestEucStandHeightMeters,
  flowFestEucSuspensionOffsetMeters,
  gradeFlowFestEucSoleContact,
  type FlowFestEucSoleContact,
} from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
import {
  FlowFestEucMountedPoseRig,
  calibrateSoleFrame,
  findMountedPoseBones,
  measureTwoBoneChain,
  readAnchorFrame,
  type MountedPoseAnchors,
} from "#lib/features/flow-fest-sim/services/flow-fest-euc-mounted-pose-rig.js";
import {
  FLOW_FEST_EUC_CONFIG,
  deriveFlowFestEucTerrainAttitude,
} from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";

const DEGREES = Math.PI / 180;

// ── A synthetic rider ───────────────────────────────────────────────────────
//
// Proportions read off the shipping `ch01` GLB: 0.4285 m thigh, 0.3938 m shin,
// hip joints 0.0982 m either side of the pelvis, ankle 0.1177 m above the sole
// and set back from its centre. The rig faces +Z and its left is +X, which is
// the handedness the whole pose depends on.

const UPPER_LEG_METERS = 0.4285;
const LOWER_LEG_METERS = 0.3938;
const HIP_HALF_WIDTH_METERS = 0.0982;
const HIP_DROP_METERS = 0.06;
const ANKLE_HEIGHT_METERS = 0.1177;
const SOLE_FORWARD_METERS = 0.07;
const HIPS_REST_HEIGHT_METERS = 1;

interface SyntheticRider {
  root: Object3D;
  bones: Bone[];
  mesh: SkinnedMesh;
}

function makeBone(name: string, position: Vector3, parent: Object3D): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.copy(position);
  parent.add(bone);
  return bone;
}

/**
 * Build a skinned humanoid with just the bones the pose writes.
 *
 * The names carry the `mixamorig12:` prefix the shipping rig uses, so the test
 * exercises the same substring matching pass the real avatar needs rather than
 * an exact-name path that would hide a naming regression.
 */
function createSyntheticRider(): SyntheticRider {
  const root = new Group();
  root.name = "PERFORMER_flow-fest-player";

  const hips = makeBone(
    "mixamorig12:Hips",
    new Vector3(0, HIPS_REST_HEIGHT_METERS, 0),
    root
  );
  const spine = makeBone("mixamorig12:Spine", new Vector3(0, 0.1, 0), hips);
  makeBone("mixamorig12:Spine1", new Vector3(0, 0.12, 0), spine);

  const bones: Bone[] = [hips, spine, spine.children[0] as Bone];
  const shoeVertices: { position: Vector3; bone: Bone }[] = [];

  for (const side of ["Left", "Right"] as const) {
    const sign = side === "Left" ? 1 : -1;
    const upLeg = makeBone(
      `mixamorig12:${side}UpLeg`,
      new Vector3(sign * HIP_HALF_WIDTH_METERS, -HIP_DROP_METERS, 0),
      hips
    );
    const leg = makeBone(
      `mixamorig12:${side}Leg`,
      new Vector3(0, -UPPER_LEG_METERS, 0),
      upLeg
    );
    const foot = makeBone(
      `mixamorig12:${side}Foot`,
      new Vector3(0, -LOWER_LEG_METERS, 0),
      leg
    );
    const toe = makeBone(
      `mixamorig12:${side}ToeBase`,
      new Vector3(0, -0.06, 0.14),
      foot
    );
    bones.push(upLeg, leg, foot, toe);

    // A flat sole patch plus a shoe upper, in bind-pose world coordinates.
    const soleY =
      HIPS_REST_HEIGHT_METERS -
      HIP_DROP_METERS -
      UPPER_LEG_METERS -
      LOWER_LEG_METERS -
      ANKLE_HEIGHT_METERS;
    for (let column = 0; column < 5; column += 1) {
      for (let row = 0; row < 9; row += 1) {
        const x = sign * HIP_HALF_WIDTH_METERS + (column / 4 - 0.5) * 0.09;
        const z = (row / 8) * 0.26 - 0.06 + SOLE_FORWARD_METERS - 0.07;
        shoeVertices.push({ position: new Vector3(x, soleY, z), bone: foot });
        shoeVertices.push({
          position: new Vector3(x, soleY + 0.07, z),
          bone: foot,
        });
      }
    }
  }

  const skeleton = new Skeleton(bones);
  root.updateMatrixWorld(true);

  const positions = new Float32Array(shoeVertices.length * 3);
  const skinIndices = new Uint16Array(shoeVertices.length * 4);
  const skinWeights = new Float32Array(shoeVertices.length * 4);
  shoeVertices.forEach((vertex, index) => {
    positions[index * 3] = vertex.position.x;
    positions[index * 3 + 1] = vertex.position.y;
    positions[index * 3 + 2] = vertex.position.z;
    skinIndices[index * 4] = bones.indexOf(vertex.bone);
    skinWeights[index * 4] = 1;
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(skinWeights, 4));

  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);
  root.updateMatrixWorld(true);

  return { root, bones, mesh };
}

interface SyntheticVehicle {
  anchors: MountedPoseAnchors;
  riderFrame: Object3D;
  setAttitude(
    pitchRadians: number,
    rollRadians: number,
    headingRadians: number
  ): void;
  setRider(pitchRadians: number, leanRadians: number, suspension: number): void;
}

/**
 * The vehicle hierarchy exactly as `FlowFestElectricUnicycle.svelte` builds it:
 * terrain attitude and heading on the root, suspension and visual lean on the
 * rider frame, pedal anchors as children of that frame.
 */
function createSyntheticVehicle(): SyntheticVehicle {
  const vehicleRoot = new Group();
  vehicleRoot.name = "FFS_ElectricUnicycle";
  const riderFrame = new Group();
  riderFrame.name = "FFS_EUC_RiderLean";
  vehicleRoot.add(riderFrame);

  const left = new Group();
  left.name = "FFS_EUC_PedalAnchor_Left";
  const leftLocal = flowFestEucPedalAnchorLocal("left");
  left.position.set(leftLocal.x, leftLocal.y, leftLocal.z);

  const right = new Group();
  right.name = "FFS_EUC_PedalAnchor_Right";
  const rightLocal = flowFestEucPedalAnchorLocal("right");
  right.position.set(rightLocal.x, rightLocal.y, rightLocal.z);

  riderFrame.add(left, right);
  vehicleRoot.updateMatrixWorld(true);

  return {
    anchors: { vehicleRoot, riderFrame, left, right },
    riderFrame,
    setAttitude(pitchRadians, rollRadians, headingRadians) {
      vehicleRoot.rotation.set(pitchRadians, headingRadians, rollRadians);
      vehicleRoot.updateMatrixWorld(true);
    },
    setRider(pitchRadians, leanRadians, suspension) {
      riderFrame.position.set(0, suspension, 0);
      riderFrame.rotation.set(pitchRadians, 0, leanRadians);
      riderFrame.parent?.updateMatrixWorld(true);
    },
  };
}

function slopeAttitude(degrees: number, bearingDegrees = 30) {
  const slope = Math.tan(degrees * DEGREES);
  const bearing = bearingDegrees * DEGREES;
  return deriveFlowFestEucTerrainAttitude({
    centerMeters: 0,
    forwardMeters: (slope * Math.cos(bearing)) / 2,
    rearMeters: -(slope * Math.cos(bearing)) / 2,
    leftMeters: (slope * Math.sin(bearing) * 0.6) / 2,
    rightMeters: -(slope * Math.sin(bearing) * 0.6) / 2,
    longitudinalSpanMeters: 1,
    lateralSpanMeters: 0.6,
  });
}

interface PoseHarness {
  rig: FlowFestEucMountedPoseRig;
  rider: SyntheticRider;
  vehicle: SyntheticVehicle;
  /** Run `frames` updates at `deltaSeconds` each, returning elapsed time. */
  run(frames: number, deltaSeconds: number, drive?: Drive): number;
}

interface Drive {
  longitudinalAccelerationMetersPerSecondSquared: number;
  leanRadians: number;
}

const NEUTRAL_DRIVE: Drive = {
  longitudinalAccelerationMetersPerSecondSquared: 0,
  leanRadians: 0,
};

function createPoseHarness(): PoseHarness {
  const rider = createSyntheticRider();
  const vehicle = createSyntheticVehicle();
  const rig = new FlowFestEucMountedPoseRig();
  vehicle.riderFrame.add(rider.root);
  vehicle.anchors.vehicleRoot.updateMatrixWorld(true);
  rig.setAnchors(vehicle.anchors);
  rig.attach(rider.root);

  let elapsedSeconds = 0;
  return {
    rig,
    rider,
    vehicle,
    run(frames, deltaSeconds, drive = NEUTRAL_DRIVE) {
      for (let frame = 0; frame < frames; frame += 1) {
        elapsedSeconds += deltaSeconds;
        rig.update({
          deltaSeconds,
          drive,
          locomotionSuspended: true,
          elapsedSeconds,
          idle: drive === NEUTRAL_DRIVE,
        });
      }
      return elapsedSeconds;
    },
  };
}

// ── Pedal geometry and anchors ──────────────────────────────────────────────

describe("pedal anchor geometry", () => {
  it("puts the left anchor on the rider's left, which is +X", () => {
    // The shipping rig faces +Z with LeftUpLeg at a positive X offset, so a
    // left anchor at -X would cross the rider's legs.
    expect(flowFestEucPedalAnchorLocal("left").x).toBeGreaterThan(0);
    expect(flowFestEucPedalAnchorLocal("right").x).toBeLessThan(0);
  });

  it("separates the anchors by the pedal spacing the vehicle draws", () => {
    const left = flowFestEucPedalAnchorLocal("left");
    const right = flowFestEucPedalAnchorLocal("right");
    expect(left.x - right.x).toBeCloseTo(
      FLOW_FEST_EUC_PEDAL_SEPARATION_METERS,
      6
    );
    expect(left.x - right.x).toBeCloseTo(
      FLOW_FEST_EUC_PEDAL_GEOMETRY.lateralOffsetMeters * 2,
      6
    );
  });

  it("stands the contact surface on top of the grip strip", () => {
    expect(FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS).toBeGreaterThan(
      FLOW_FEST_EUC_PEDAL_GEOMETRY.gripStripCenterHeightMeters
    );
    expect(flowFestEucPedalAnchorLocal("left").y).toBeCloseTo(
      FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS,
      6
    );
  });

  it("carries wheel pitch and roll into the anchor frame exactly once", () => {
    const vehicle = createSyntheticVehicle();
    const attitude = slopeAttitude(20);
    vehicle.setAttitude(attitude.pitchRadians, attitude.rollRadians, 0);

    const frame = readAnchorFrame(vehicle.anchors.left);
    const expectedUp = new Vector3(0, 1, 0).applyEuler(
      new Euler(attitude.pitchRadians, 0, attitude.rollRadians, "XYZ")
    );
    expect(frame.up.angleTo(expectedUp)).toBeLessThan(1e-6);

    // Tilting the ground must tilt the anchor by the same amount, not twice.
    const tiltDegrees = frame.up.angleTo(new Vector3(0, 1, 0)) / DEGREES;
    expect(tiltDegrees).toBeGreaterThan(15);
    expect(tiltDegrees).toBeLessThan(25);
  });

  it("keeps the anchor basis right-handed so a foot is never mirrored", () => {
    const vehicle = createSyntheticVehicle();
    vehicle.setAttitude(0.2, -0.13, 0.7);
    const frame = readAnchorFrame(vehicle.anchors.right);
    const cross = new Vector3().crossVectors(frame.up, frame.forward);
    expect(cross.dot(frame.left)).toBeCloseTo(1, 5);
  });

  it("adds heading, lean, and suspension to the anchors together", () => {
    const vehicle = createSyntheticVehicle();
    vehicle.setAttitude(0, 0, Math.PI / 2);
    vehicle.setRider(0, 0, -0.04);
    const frame = readAnchorFrame(vehicle.anchors.left);
    // Heading a quarter turn puts the rider's left on world -Z.
    expect(frame.forward.x).toBeCloseTo(1, 5);
    expect(frame.position.z).toBeCloseTo(
      -FLOW_FEST_EUC_PEDAL_GEOMETRY.lateralOffsetMeters,
      5
    );
    expect(frame.position.y).toBeCloseTo(
      FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS - 0.04,
      5
    );
  });

  it("derives suspension travel from roughness and wheel angle", () => {
    expect(flowFestEucSuspensionOffsetMeters(0, 0)).toBe(0);
    expect(flowFestEucSuspensionOffsetMeters(0.05, 0)).toBeLessThan(0);
    expect(
      Math.abs(flowFestEucSuspensionOffsetMeters(0.05, 1.7))
    ).toBeLessThanOrEqual(0.05);
  });
});

// ── Skeleton and sole calibration ───────────────────────────────────────────

describe("rig discovery", () => {
  it("finds prefixed Mixamo bones by substring", () => {
    const rider = createSyntheticRider();
    const bones = findMountedPoseBones(rider.root);
    expect(bones.get("Hips")?.name).toBe("mixamorig12:Hips");
    expect(bones.get("LeftFoot")?.name).toBe("mixamorig12:LeftFoot");
    expect(bones.get("RightToeBase")?.name).toBe("mixamorig12:RightToeBase");
  });

  it("measures the leg chain from the bind pose", () => {
    const rider = createSyntheticRider();
    const bones = findMountedPoseBones(rider.root);
    const chain = measureTwoBoneChain(
      bones.get("LeftUpLeg")!,
      bones.get("LeftLeg")!,
      bones.get("LeftFoot")!
    );
    expect(chain.upperLength).toBeCloseTo(UPPER_LEG_METERS, 5);
    expect(chain.lowerLength).toBeCloseTo(LOWER_LEG_METERS, 5);
    expect(chain.totalLength).toBeCloseTo(
      UPPER_LEG_METERS + LOWER_LEG_METERS,
      5
    );
  });

  it("calibrates the sole patch from the skin, not from the ankle", () => {
    const rider = createSyntheticRider();
    const bones = findMountedPoseBones(rider.root);
    const sole = calibrateSoleFrame(
      [rider.mesh],
      bones.get("LeftFoot")!,
      bones.get("LeftToeBase")!
    );
    expect(sole).not.toBeNull();
    // The ankle sits well above the contact patch: a pose that ignored this
    // would bury the shoe by more than a decimetre.
    expect(sole!.origin.y).toBeCloseTo(-ANKLE_HEIGHT_METERS, 3);
    expect(sole!.forward.z).toBeGreaterThan(0.99);
    expect(sole!.up.y).toBeGreaterThan(0.99);
    expect(sole!.lowestAlongUp).toBeLessThanOrEqual(0);
    expect(sole!.sampleCount).toBeGreaterThanOrEqual(6);
  });

  it("rejects a rig with no skin bound to a foot", () => {
    const rider = createSyntheticRider();
    const bones = findMountedPoseBones(rider.root);
    rider.mesh.geometry.deleteAttribute("skinWeight");
    const sole = calibrateSoleFrame([rider.mesh], bones.get("LeftFoot")!, null);
    expect(sole).toBeNull();
  });
});

// ── Stance blending ─────────────────────────────────────────────────────────

describe("stance blend", () => {
  it("stays neutral with no input", () => {
    const blend = flowFestEucStanceBlend(
      flowFestEucStanceSignals({
        longitudinalAccelerationMetersPerSecondSquared: 0,
        leanRadians: 0,
      })
    );
    expect(blend.neutral).toBeCloseTo(1, 6);
  });

  it("reads acceleration and braking on opposite sides", () => {
    const accelerating = flowFestEucStanceSignals({
      longitudinalAccelerationMetersPerSecondSquared:
        FLOW_FEST_EUC_CONFIG.performanceAccelerationMetersPerSecondSquared,
      leanRadians: 0,
    });
    const braking = flowFestEucStanceSignals({
      longitudinalAccelerationMetersPerSecondSquared:
        -FLOW_FEST_EUC_CONFIG.regenerativeBrakingMetersPerSecondSquared,
      leanRadians: 0,
    });
    expect(accelerating.accelerate).toBeCloseTo(1, 5);
    expect(accelerating.brake).toBe(0);
    expect(braking.brake).toBeCloseTo(1, 5);
    expect(braking.accelerate).toBe(0);
  });

  it("maps a left carve to a negative lean", () => {
    // `targetLean = -steer * ...`, so steering left produces negative lean.
    const carving = flowFestEucStanceSignals({
      longitudinalAccelerationMetersPerSecondSquared: 0,
      leanRadians: -FLOW_FEST_EUC_CONFIG.maximumVisualLeanRadians,
    });
    expect(carving.carveLeft).toBeCloseTo(1, 5);
    expect(carving.carveRight).toBe(0);
  });

  it("keeps the blend convex", () => {
    const blend = flowFestEucStanceBlend({
      accelerate: 0.8,
      brake: 0,
      carveLeft: 0.7,
      carveRight: 0,
    });
    const total =
      blend.neutral +
      blend.accelerate +
      blend.brake +
      blend.carveLeft +
      blend.carveRight;
    expect(total).toBeCloseTo(1, 6);
  });

  it("shifts the stance forward under power and back under braking", () => {
    const accelerate = flowFestEucStanceOffsets(
      flowFestEucStanceBlend({
        accelerate: 1,
        brake: 0,
        carveLeft: 0,
        carveRight: 0,
      })
    );
    const brake = flowFestEucStanceOffsets(
      flowFestEucStanceBlend({
        accelerate: 0,
        brake: 1,
        carveLeft: 0,
        carveRight: 0,
      })
    );
    expect(accelerate.pelvisForwardMeters).toBeGreaterThan(
      brake.pelvisForwardMeters
    );
    expect(brake.kneeFlexRadians).toBeGreaterThan(
      FLOW_FEST_EUC_STANCE_POSES.neutral.kneeFlexRadians
    );
  });

  it("converges to the same stance at 30 and 60 FPS", () => {
    // The criterion says the contacts must not change when the simulation
    // frame rate does. The only frame-rate-sensitive term in the pose is this
    // exponential blend, so it is proved here exactly.
    const target = flowFestEucStanceSignals({
      longitudinalAccelerationMetersPerSecondSquared: 9,
      leanRadians: -0.12,
    });
    let slow = { accelerate: 0, brake: 0, carveLeft: 0, carveRight: 0 };
    let fast = { ...slow };
    for (let frame = 0; frame < 60; frame += 1) {
      slow = advanceFlowFestEucStanceSignals(slow, target, 1 / 30);
      fast = advanceFlowFestEucStanceSignals(fast, target, 1 / 60);
      fast = advanceFlowFestEucStanceSignals(fast, target, 1 / 60);
    }
    expect(fast.accelerate).toBeCloseTo(slow.accelerate, 4);
    expect(fast.carveLeft).toBeCloseTo(slow.carveLeft, 4);
  });
});

// ── Leg geometry helpers ────────────────────────────────────────────────────

describe("leg geometry", () => {
  it("round-trips reach and knee flex", () => {
    for (const degrees of [4, 14, 26, 45, 64]) {
      const reach = flowFestEucLegReachMeters(
        UPPER_LEG_METERS,
        LOWER_LEG_METERS,
        degrees * DEGREES
      );
      expect(
        flowFestEucKneeFlexRadians(UPPER_LEG_METERS, LOWER_LEG_METERS, reach) /
          DEGREES
      ).toBeCloseTo(degrees, 4);
    }
  });

  it("shortens the leg as the knee bends", () => {
    const straighter = flowFestEucLegReachMeters(
      UPPER_LEG_METERS,
      LOWER_LEG_METERS,
      8 * DEGREES
    );
    const deeper = flowFestEucLegReachMeters(
      UPPER_LEG_METERS,
      LOWER_LEG_METERS,
      40 * DEGREES
    );
    expect(deeper).toBeLessThan(straighter);
    expect(straighter).toBeLessThan(UPPER_LEG_METERS + LOWER_LEG_METERS);
  });

  it("refuses a stand height the leg cannot span", () => {
    expect(flowFestEucStandHeightMeters(0.5, 0.9, 0)).toBeNull();
    expect(flowFestEucStandHeightMeters(0.8, 0.15, 0.1)).toBeCloseTo(
      0.1 + Math.sqrt(0.64 - 0.0225),
      6
    );
  });
});

// ── Contact grading ─────────────────────────────────────────────────────────

function contact(
  overrides: Partial<FlowFestEucSoleContact> = {}
): FlowFestEucSoleContact {
  return {
    errorMeters: 0.004,
    penetrationMeters: 0,
    forwardErrorDegrees: 1.2,
    lateralErrorMeters: 0.001,
    forwardErrorMeters: 0.003,
    kneeFlexDegrees: 16,
    kneeForward: true,
    ...overrides,
  };
}

describe("contact grading", () => {
  it("passes a contact inside every threshold", () => {
    expect(gradeFlowFestEucSoleContact(contact()).pass).toBe(true);
  });

  it("fails a sole that misses the pedal", () => {
    const verdict = gradeFlowFestEucSoleContact(
      contact({ errorMeters: 0.025 })
    );
    expect(verdict.soleWithinTolerance).toBe(false);
    expect(verdict.pass).toBe(false);
  });

  it("fails a shoe sunk into the pedal", () => {
    const verdict = gradeFlowFestEucSoleContact(
      contact({ penetrationMeters: 0.014 })
    );
    expect(verdict.penetrationWithinTolerance).toBe(false);
  });

  it("fails a foot turned off the pedal basis", () => {
    expect(
      gradeFlowFestEucSoleContact(contact({ forwardErrorDegrees: 9 }))
        .footForwardWithinTolerance
    ).toBe(false);
  });

  it("fails a hyperextended or backward knee", () => {
    expect(
      gradeFlowFestEucSoleContact(contact({ kneeFlexDegrees: 1 }))
        .kneeWithinRange
    ).toBe(false);
    expect(
      gradeFlowFestEucSoleContact(contact({ kneeForward: false })).pass
    ).toBe(false);
  });

  it("tolerates a small negative penetration reading", () => {
    // A sole hovering a fraction of a millimetre is not a penetration.
    expect(
      gradeFlowFestEucSoleContact(contact({ penetrationMeters: -0.002 }))
        .penetrationWithinTolerance
    ).toBe(true);
  });
});

describe("idle stability tracker", () => {
  it("grades spread rather than absolute error", () => {
    const tracker = new FlowFestEucIdleStabilityTracker(10, 0.01);
    for (let step = 0; step <= 100; step += 1) {
      tracker.record({
        timeSeconds: step * 0.1,
        leftErrorMeters: 0.006,
        rightErrorMeters: 0.006,
      });
    }
    const report = tracker.report();
    expect(report.leftSpreadMeters).toBeCloseTo(0, 6);
    expect(report.pass).toBe(true);
  });

  it("fails a contact that oscillates inside the placement tolerance", () => {
    const tracker = new FlowFestEucIdleStabilityTracker(10, 0.01);
    for (let step = 0; step <= 100; step += 1) {
      tracker.record({
        timeSeconds: step * 0.1,
        leftErrorMeters: step % 2 === 0 ? 0 : 0.015,
        rightErrorMeters: 0.001,
      });
    }
    expect(tracker.report().pass).toBe(false);
  });

  it("will not pass before a full window has been observed", () => {
    const tracker = new FlowFestEucIdleStabilityTracker(10, 0.01);
    for (let step = 0; step < 20; step += 1) {
      tracker.record({
        timeSeconds: step * 0.1,
        leftErrorMeters: 0.002,
        rightErrorMeters: 0.002,
      });
    }
    expect(tracker.report().pass).toBe(false);
  });
});

// ── The solved pose ─────────────────────────────────────────────────────────

describe("mounted pose rig", () => {
  let harness: PoseHarness;

  beforeEach(() => {
    harness = createPoseHarness();
  });

  it("attaches to a rig it can pose", () => {
    const diagnostic = harness.rig.diagnostic();
    expect(diagnostic.status).toBe("ready");
    expect(diagnostic.unsupportedReason).toBeNull();
  });

  it("names what it is missing rather than posing a rig it cannot", () => {
    const rig = new FlowFestEucMountedPoseRig();
    const vehicle = createSyntheticVehicle();
    rig.setAnchors(vehicle.anchors);
    const bare = new Group();
    bare.name = "PERFORMER_flow-fest-player";
    expect(rig.attach(bare)).toBe(false);
    const diagnostic = rig.diagnostic();
    expect(diagnostic.status).toBe("unsupported-rig");
    expect(diagnostic.unsupportedReason).toContain("Hips");
    expect(diagnostic.pass).toBe(false);
  });

  // The rig binds inside the frame task, and three.js asks for the next frame
  // only after that task returns: a throw here used to stop the whole scene.
  it("stands down when calibration throws rather than stopping the frame", () => {
    const rig = new FlowFestEucMountedPoseRig();
    const rider = createSyntheticRider();
    const vehicle = createSyntheticVehicle();
    vehicle.riderFrame.add(rider.root);
    vehicle.anchors.vehicleRoot.updateMatrixWorld(true);
    rig.setAnchors(vehicle.anchors);
    const compute = vi
      .spyOn(KneeHingeAxisCalibrator.prototype, "compute")
      .mockImplementation(() => {
        throw new Error("hinge calibration drifted");
      });
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(rig.attach(rider.root)).toBe(false);
      expect(report).toHaveBeenCalledTimes(1);
    } finally {
      compute.mockRestore();
      report.mockRestore();
    }
    const diagnostic = rig.diagnostic();
    expect(diagnostic.status).toBe("unsupported-rig");
    expect(diagnostic.unsupportedReason).toContain("hinge calibration drifted");
    // The rider checks this before re-binding, so a failed rig is not retried
    // every frame.
    expect(rig.isAttachedTo(rider.root)).toBe(true);
  });

  for (const slopeDegrees of [0, 20, 35]) {
    it(`places both soles on their pedals at ${slopeDegrees} degrees`, () => {
      const attitude = slopeAttitude(slopeDegrees);
      harness.vehicle.setAttitude(
        attitude.pitchRadians,
        attitude.rollRadians,
        0.6
      );
      harness.run(30, 1 / 60);

      const diagnostic = harness.rig.diagnostic();
      for (const side of ["left", "right"] as const) {
        const contactPoint = diagnostic[side];
        expect(contactPoint.errorMeters).toBeLessThanOrEqual(
          FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumSoleErrorMeters
        );
        expect(contactPoint.penetrationMeters).toBeLessThanOrEqual(
          FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumPenetrationMeters
        );
        expect(contactPoint.forwardErrorDegrees).toBeLessThanOrEqual(
          FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumFootForwardDegrees
        );
        expect(contactPoint.kneeForward).toBe(true);
        expect(contactPoint.kneeFlexDegrees).toBeGreaterThanOrEqual(
          FLOW_FEST_EUC_CONTACT_THRESHOLDS.minimumKneeFlexDegrees
        );
        expect(contactPoint.kneeFlexDegrees).toBeLessThanOrEqual(
          FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumKneeFlexDegrees
        );
      }
      expect(
        Math.abs(diagnostic.pelvisLateralOffsetMeters)
      ).toBeLessThanOrEqual(
        FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumPelvisLateralOffsetMeters
      );
      expect(diagnostic.pass).toBe(true);
    });
  }

  it("applies the terrain attitude once, not twice", () => {
    const attitude = slopeAttitude(35);
    harness.vehicle.setAttitude(attitude.pitchRadians, attitude.rollRadians, 0);
    harness.run(30, 1 / 60);

    const bones = findMountedPoseBones(harness.rider.root);
    const hips = bones.get("Hips")!;
    const up = new Vector3(0, 1, 0).applyQuaternion(
      hips.getWorldQuaternion(new Quaternion())
    );
    const groundUp = readAnchorFrame(harness.vehicle.anchors.left).up;
    // A doubled attitude would put the pelvis at roughly twice the slope from
    // vertical; a correctly single application leaves it near the ground
    // normal, off only by the stance's own pitch.
    expect(up.angleTo(groundUp) / DEGREES).toBeLessThan(12);
    expect(up.angleTo(new Vector3(0, 1, 0)) / DEGREES).toBeGreaterThan(20);
  });

  it("holds the contacts steady across a ten-second idle", () => {
    // Past ten seconds, not exactly ten: the first sample lands a frame after
    // zero, so a run of exactly the window length can never cover it.
    harness.run(640, 1 / 60);
    const report = harness.rig.diagnostic().idleStability;
    expect(report.windowSeconds).toBeGreaterThanOrEqual(
      FLOW_FEST_EUC_CONTACT_THRESHOLDS.idleWindowSeconds
    );
    expect(report.leftSpreadMeters).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumIdleDeviationMeters
    );
    expect(report.rightSpreadMeters).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumIdleDeviationMeters
    );
    expect(report.pass).toBe(true);
  });

  it("lands the same contacts at 30 and at 60 FPS", () => {
    const slow = createPoseHarness();
    const fast = createPoseHarness();
    const attitude = slopeAttitude(20);
    slow.vehicle.setAttitude(attitude.pitchRadians, attitude.rollRadians, 0);
    fast.vehicle.setAttitude(attitude.pitchRadians, attitude.rollRadians, 0);
    slow.run(120, 1 / 30);
    fast.run(240, 1 / 60);

    const a = slow.rig.diagnostic();
    const b = fast.rig.diagnostic();
    expect(b.left.errorMeters).toBeCloseTo(a.left.errorMeters, 4);
    expect(b.right.errorMeters).toBeCloseTo(a.right.errorMeters, 4);
    expect(b.pelvisLateralOffsetMeters).toBeCloseTo(
      a.pelvisLateralOffsetMeters,
      4
    );
  });

  it("leans the stance without sliding the pelvis off the wheel", () => {
    harness.run(90, 1 / 60, {
      longitudinalAccelerationMetersPerSecondSquared: 0,
      leanRadians: -FLOW_FEST_EUC_CONFIG.maximumVisualLeanRadians,
    });
    const diagnostic = harness.rig.diagnostic();
    expect(diagnostic.blend.carveLeft).toBeGreaterThan(0.5);
    expect(Math.abs(diagnostic.pelvisLateralOffsetMeters)).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumPelvisLateralOffsetMeters
    );
    expect(Math.abs(diagnostic.pelvisLateralOffsetMeters)).toBeLessThanOrEqual(
      FLOW_FEST_EUC_MAXIMUM_PELVIS_LATERAL_METERS
    );
    expect(diagnostic.pass).toBe(true);
  });

  it("keeps the knees forward under acceleration and braking", () => {
    for (const acceleration of [10.5, -16]) {
      const local = createPoseHarness();
      local.run(90, 1 / 60, {
        longitudinalAccelerationMetersPerSecondSquared: acceleration,
        leanRadians: 0,
      });
      const diagnostic = local.rig.diagnostic();
      expect(diagnostic.left.kneeForward).toBe(true);
      expect(diagnostic.right.kneeForward).toBe(true);
      expect(diagnostic.left.kneeFlexDegrees).toBeGreaterThan(
        FLOW_FEST_EUC_CONTACT_THRESHOLDS.minimumKneeFlexDegrees
      );
      expect(diagnostic.pass).toBe(true);
    }
  });

  it("suspends locomotion while mounted and reports it", () => {
    harness.run(2, 1 / 60);
    expect(harness.rig.diagnostic().locomotionSuspended).toBe(true);
  });

  it("restores the rig on dismount", () => {
    const bones = findMountedPoseBones(harness.rider.root);
    const hips = bones.get("Hips")!;
    const rest = hips.position.clone();
    harness.run(30, 1 / 60);
    expect(hips.position.distanceTo(rest)).toBeGreaterThan(0.01);

    harness.rig.detach();
    expect(hips.position.distanceTo(rest)).toBeLessThan(1e-9);
    const diagnostic = harness.rig.diagnostic();
    expect(diagnostic.status).toBe("detached");
    expect(diagnostic.pass).toBe(false);
  });

  it("re-attaches cleanly after a mount, dismount, mount cycle", () => {
    harness.run(30, 1 / 60);
    const first = harness.rig.diagnostic().left.errorMeters;
    harness.rig.detach();
    harness.rig.setAnchors(harness.vehicle.anchors);
    expect(harness.rig.attach(harness.rider.root)).toBe(true);
    harness.run(30, 1 / 60);
    const second = harness.rig.diagnostic().left.errorMeters;
    expect(second).toBeCloseTo(first, 5);
  });

  it("reports the measured contact endpoints for visual proof", () => {
    harness.run(30, 1 / 60);
    const diagnostic = harness.rig.diagnostic();
    const sole = new Vector3(
      diagnostic.leftPoints.soleWorld.x,
      diagnostic.leftPoints.soleWorld.y,
      diagnostic.leftPoints.soleWorld.z
    );
    const anchor = new Vector3(
      diagnostic.leftPoints.anchorWorld.x,
      diagnostic.leftPoints.anchorWorld.y,
      diagnostic.leftPoints.anchorWorld.z
    );
    expect(sole.distanceTo(anchor)).toBeCloseTo(diagnostic.left.errorMeters, 6);
  });

  it("survives a stance the leg cannot span without poisoning the rig", () => {
    // Push the anchors past the leg's reach, then bring them back: a transient
    // impossible stance must warn for that frame and recover, not latch.
    harness.vehicle.anchors.left.position.x = 2;
    harness.vehicle.anchors.right.position.x = -2;
    harness.vehicle.anchors.vehicleRoot.updateMatrixWorld(true);
    harness.run(2, 1 / 60);
    expect(harness.rig.diagnostic().unsupportedReason).toContain("cannot span");
    expect(harness.rig.diagnostic().pass).toBe(false);

    const left = flowFestEucPedalAnchorLocal("left");
    const right = flowFestEucPedalAnchorLocal("right");
    harness.vehicle.anchors.left.position.x = left.x;
    harness.vehicle.anchors.right.position.x = right.x;
    harness.vehicle.anchors.vehicleRoot.updateMatrixWorld(true);
    harness.run(30, 1 / 60);
    const recovered = harness.rig.diagnostic();
    expect(recovered.unsupportedReason).toBeNull();
    expect(recovered.pass).toBe(true);
  });
});
