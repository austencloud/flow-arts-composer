import { Bone, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AvatarAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator";
import { measureCylindricalGripChannel } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/geometry/CylindricalGripGeometry";
import type {
  BoneChain,
  SkeletonState,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/services/contracts/IAvatarSkeletonBuilder";
import type { FingerBoneName } from "../../../node_modules/@austencloud/scene-3d/src/lib/domain/models/GripPose";

type SocketTargetProbe = {
  leftGripAxisLocal: Vector3 | null;
  rightGripAxisLocal: Vector3 | null;
  leftPalmLocal: Vector3 | null;
  rightPalmLocal: Vector3 | null;
  leftPalmNormalLocal: Vector3 | null;
  rightPalmNormalLocal: Vector3 | null;
  rightGripLongitudinalLocal: Vector3 | null;
  leftPalmWorldLength: number;
  rightPalmWorldLength: number;
  _bodyFrame: { lateral: Vector3 };
  targetPose: {
    leftHand: { targetPosition: Vector3 } | null;
    rightHand: { targetPosition: Vector3 } | null;
  };
  calibrateGrips: (state: SkeletonState) => void;
  stanceYawSmoothedRad: number;
  leftHandDir: Vector3;
  rightHandDir: Vector3;
  leftHandDirValid: boolean;
  rightHandDirValid: boolean;
  computeSocketTarget: (
    side: "left" | "right",
    chain: BoneChain,
    gripPoint: Vector3,
    staffQuat?: Quaternion
  ) => Vector3;
  applyWristOrientation: (
    side: "left" | "right",
    chain: BoneChain,
    hand: {
      targetPosition: Vector3;
      wristRotation: Quaternion;
      weight: number;
    },
    ikWeight: number
  ) => void;
};

function createArmChain(): BoneChain {
  const root = new Bone();
  const middle = new Bone();
  const effector = new Bone();
  middle.position.set(0, 0, 0.2);
  effector.position.set(0, 0, 0.2);
  root.add(middle);
  middle.add(effector);
  root.updateMatrixWorld(true);
  return {
    root,
    middle,
    effector,
    totalLength: 0.4,
    upperLength: 0.2,
    lowerLength: 0.2,
    rootRestDir: new Vector3(0, 0, 1),
    middleRestDir: new Vector3(0, 0, 1),
  };
}

const QUATERNIUS_FINGER_ROOTS = {
  Index1: [0.007159, 0.117403, 0.040643],
  Middle1: [0.004683, 0.115439, 0.015113],
  Pinky1: [0.006038, 0.098541, -0.034617],
  Thumb1: [0.027481, 0.033814, 0.041063],
} as const;

function createMeasuredPowerGripArm(side: "left" | "right"): {
  chain: BoneChain;
  fingers: Map<FingerBoneName, Bone>;
} {
  const root = new Bone();
  const middle = new Bone();
  const effector = new Bone();
  middle.position.set(0, 0.2, 0);
  effector.position.set(0, 0.243594, 0);
  effector.quaternion.set(-0.015602, 0, 0, 0.999878);
  root.add(middle);
  middle.add(effector);

  const fingers = new Map<FingerBoneName, Bone>();
  for (const [name, position] of Object.entries(QUATERNIUS_FINGER_ROOTS)) {
    const finger = new Bone();
    const mirror = side === "right" ? -1 : 1;
    finger.position.set(position[0] * mirror, position[1], position[2]);
    effector.add(finger);
    fingers.set(name as FingerBoneName, finger);
  }
  root.updateMatrixWorld(true);

  return {
    chain: {
      root,
      middle,
      effector,
      totalLength: 0.443594,
      upperLength: 0.2,
      lowerLength: 0.243594,
      rootRestDir: new Vector3(0, 1, 0),
      middleRestDir: new Vector3(0, 1, 0),
    },
    fingers,
  };
}

describe("avatar wrist-side clearance", () => {
  it("centers the shaft in the channel enclosed by the posed finger bones", () => {
    // Hand-local joint positions measured from the intake character after its
    // production square-grip pose has settled. The old flat-palm socket sits
    // roughly 3.6 cm away from the center enclosed by this curl.
    const proximal = new Vector3(
      0.004682549275458081,
      0.11543878167867638,
      0.015113381668925285
    );
    const middle = new Vector3(
      0.04166010773337514,
      0.12182967460591965,
      0.014960976489048011
    );
    const distal = new Vector3(
      0.047819779833990994,
      0.09235807884145475,
      0.015664886632557974
    );
    const longitudinal = new Vector3(
      0.04018733413271062,
      0.9907374419973749,
      0.12970851629636446
    );
    const palmNormal = new Vector3(
      0.9991921105031336,
      -0.03988927935863452,
      -0.0048960903323762225
    );
    const transverse = new Vector3(
      0.000323239230053185,
      0.12980048696652563,
      -0.9915400794217313
    );
    const fallback = proximal.clone().multiplyScalar(0.65);
    const channel = new Vector3();

    const confidence = measureCylindricalGripChannel(
      proximal,
      middle,
      distal,
      longitudinal,
      palmNormal,
      transverse,
      fallback,
      channel
    );

    expect(confidence).toBe(1);
    expect(channel.x).toBeCloseTo(0.0258038, 5);
    expect(channel.y).toBeCloseTo(0.1031784, 5);
    expect(channel.z).toBeCloseTo(0.0143679, 5);
    expect(channel.distanceTo(fallback)).toBeGreaterThan(0.035);
  });

  it("keeps the neutral-palm fallback when an open finger has no channel", () => {
    const fallback = new Vector3(0, 0.075, 0);
    const channel = new Vector3();

    const confidence = measureCylindricalGripChannel(
      new Vector3(0, 0.115, 0),
      new Vector3(0, 0.15, 0),
      new Vector3(0, 0.18, 0),
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 1),
      fallback,
      channel
    );

    expect(confidence).toBe(0);
    expect(channel).toEqual(fallback);
  });

  it("places each wrist outside its own grip instead of between adjacent staffs", () => {
    const animator = new AvatarAnimator(
      {} as never,
      {} as never
    ) as unknown as SocketTargetProbe;
    const anatomicalRight = new Vector3(0, 0, 1);
    const palmLength = 0.04;
    const chain = createArmChain();
    chain.root.scale.setScalar(0.25);
    chain.root.updateMatrixWorld(true);

    animator.leftPalmLocal = new Vector3(palmLength, 0, 0);
    animator.rightPalmLocal = new Vector3(palmLength, 0, 0);
    animator.leftPalmWorldLength = 0.01;
    animator.rightPalmWorldLength = 0.01;
    animator._bodyFrame.lateral.copy(anatomicalRight);

    const leftGrip = anatomicalRight.clone().multiplyScalar(-0.03);
    const rightGrip = anatomicalRight.clone().multiplyScalar(0.03);
    const leftWrist = animator.computeSocketTarget("left", chain, leftGrip);
    const rightWrist = animator.computeSocketTarget("right", chain, rightGrip);

    const lateral = (point: Vector3) => point.dot(anatomicalRight);
    expect(lateral(leftWrist)).toBeCloseTo(-0.04);
    expect(lateral(rightWrist)).toBeCloseTo(0.04);
    expect(leftWrist.distanceTo(rightWrist)).toBeGreaterThan(
      leftGrip.distanceTo(rightGrip)
    );
  });

  it("splits coincident paired grips around their authored midpoint", () => {
    const leftChain = createArmChain();
    const rightChain = createArmChain();
    // A GLB briefly reports coincident shoulder origins while its matrices
    // bind. The last valid anatomical frame must survive that interval.
    const skeleton = {
      getLeftArmChain: () => leftChain,
      getRightArmChain: () => rightChain,
    };
    const animator = new AvatarAnimator(
      {} as never,
      skeleton as never
    ) as unknown as SocketTargetProbe & {
      setPropsAndBlend: AvatarAnimator["setPropsAndBlend"];
    };
    const coincidentProp = {
      worldPosition: new Vector3(0, 0.03, 0.3),
      staffRotationAngle: 0,
      plane: "wall",
    } as never;

    animator.setPropsAndBlend(coincidentProp, coincidentProp);

    expect(animator.targetPose.leftHand?.targetPosition.x).toBeCloseTo(-0.035);
    expect(animator.targetPose.rightHand?.targetPosition.x).toBeCloseTo(0.035);
  });

  it("resolves the free staff roll so the palm faces inward", () => {
    const animator = new AvatarAnimator(
      {} as never,
      {} as never
    ) as unknown as SocketTargetProbe;
    const chain = createArmChain();
    const palmLocal = new Vector3(0.04, 0, 0);

    animator.rightGripAxisLocal = new Vector3(0, -1, 0);
    animator.rightPalmLocal = palmLocal.clone();
    animator.rightPalmNormalLocal = palmLocal.clone();
    // The wrist solve skips a hand with no calibrated lengthwise axis.
    // Calibration places the palm point on that axis.
    animator.rightGripLongitudinalLocal = palmLocal.clone().normalize();
    animator._bodyFrame.lateral.set(1, 0, 0);

    for (let frame = 0; frame < 40; frame++) {
      animator.applyWristOrientation(
        "right",
        chain,
        {
          targetPosition: new Vector3(),
          wristRotation: new Quaternion(),
          weight: 1,
        },
        1
      );
      chain.root.updateMatrixWorld(true);
    }

    const wrist = chain.effector.getWorldPosition(new Vector3());
    const palmDirection = chain.effector
      .localToWorld(palmLocal.clone())
      .sub(wrist)
      .normalize();
    expect(palmDirection.dot(animator._bodyFrame.lateral)).toBeLessThan(-0.9);
  });

  it("keeps the world-space wrist goal steady while the forearm frame moves", () => {
    const animator = new AvatarAnimator(
      {} as never,
      {} as never
    ) as unknown as SocketTargetProbe;
    const chain = createArmChain();
    const palmLocal = new Vector3(0.04, 0, 0);
    const worldPalmDirections: Vector3[] = [];

    animator.rightGripAxisLocal = new Vector3(0, -1, 0);
    animator.rightPalmLocal = palmLocal.clone();
    animator.rightPalmNormalLocal = palmLocal.clone();
    // The wrist solve skips a hand with no calibrated lengthwise axis.
    // Calibration places the palm point on that axis.
    animator.rightGripLongitudinalLocal = palmLocal.clone().normalize();
    animator._bodyFrame.lateral.set(1, 0, 0);

    for (let frame = 0; frame < 80; frame++) {
      chain.middle.quaternion.setFromAxisAngle(
        new Vector3(0, 0, 1),
        frame % 2 === 0 ? -0.04 : 0.04
      );
      chain.root.updateMatrixWorld(true);
      animator.applyWristOrientation(
        "right",
        chain,
        {
          targetPosition: new Vector3(),
          wristRotation: new Quaternion(),
          weight: 1,
        },
        1
      );
      chain.root.updateMatrixWorld(true);
      const wrist = chain.effector.getWorldPosition(new Vector3());
      worldPalmDirections.push(
        chain.effector.localToWorld(palmLocal.clone()).sub(wrist).normalize()
      );
    }

    const settled = worldPalmDirections.slice(-20);
    const maximumWorldJitter = Math.max(
      ...settled
        .slice(1)
        .map((direction, index) => direction.angleTo(settled[index]!))
    );
    expect(maximumWorldJitter).toBeLessThan(0.01);
  });

  it("calibrates a cylindrical handle across the palm from index to pinky", () => {
    const left = createMeasuredPowerGripArm("left");
    const right = createMeasuredPowerGripArm("right");
    const skeleton = {
      getLeftArmChain: () => left.chain,
      getRightArmChain: () => right.chain,
    };
    const animator = new AvatarAnimator(
      {} as never,
      skeleton as never
    ) as unknown as SocketTargetProbe;
    animator._bodyFrame.lateral.set(1, 0, 0);

    animator.calibrateGrips({
      isLoaded: true,
      root: left.chain.root,
      meshes: [],
      bones: new Map(),
      leftArmChain: left.chain,
      rightArmChain: right.chain,
      leftLegChain: null,
      rightLegChain: null,
      fingerChains: {
        left: left.fingers,
        right: right.fingers,
      },
    });

    const longitudinal = new Vector3(...QUATERNIUS_FINGER_ROOTS.Middle1)
      .normalize()
      .negate();
    const transverse = new Vector3(...QUATERNIUS_FINGER_ROOTS.Pinky1).sub(
      new Vector3(...QUATERNIUS_FINGER_ROOTS.Index1)
    );
    transverse.addScaledVector(longitudinal, -transverse.dot(longitudinal));
    transverse.normalize();

    expect(animator.leftGripAxisLocal?.dot(transverse)).toBeGreaterThan(0.999);
    expect(
      Math.abs(animator.leftGripAxisLocal?.dot(longitudinal) ?? 1)
    ).toBeLessThan(0.01);
  });

  /**
   * The hug is a WRIST ROTATION, not a second placement pass. These lock the
   * two halves of that: the socket may only move the wrist around the grip on
   * a palm-length sphere, and the direction it picks has to be one the roll
   * about the staff can actually reach.
   */
  describe("side-on hug", () => {
    const SIDE_ON_YAW_RAD = (87 * Math.PI) / 180;
    /** Mirrors HUG_WRIST_DEVIATION inside the animator. */
    const MAX_DEVIATION_RAD = (25 * Math.PI) / 180;

    function createHugAnimator(): {
      animator: SocketTargetProbe;
      chain: BoneChain;
      grip: Vector3;
      palmLength: number;
      staffQuat: Quaternion;
    } {
      const animator = new AvatarAnimator(
        {} as never,
        {} as never
      ) as unknown as SocketTargetProbe;
      const palmLength = 0.09;
      const chain = createArmChain();
      // Elbow behind and outboard of the grip, the way a side-on reach sits.
      chain.root.position.set(0.22, 0, -0.2);
      chain.root.updateMatrixWorld(true);
      animator.leftPalmLocal = new Vector3(palmLength, 0, 0);
      animator.rightPalmLocal = new Vector3(palmLength, 0, 0);
      animator.leftPalmWorldLength = palmLength;
      animator.rightPalmWorldLength = palmLength;
      // Chest turned side-on: its lateral axis is the audience depth axis.
      animator._bodyFrame.lateral.set(0, 0, 1);
      return {
        animator,
        chain,
        grip: new Vector3(0, 1.2, -0.118),
        palmLength,
        staffQuat: new Quaternion(),
      };
    }

    it("keeps the square stance on the historical medial socket", () => {
      const { animator, chain, grip, palmLength, staffQuat } =
        createHugAnimator();
      animator.stanceYawSmoothedRad = 0;

      const wrist = animator
        .computeSocketTarget("left", chain, grip, staffQuat)
        .clone();

      expect(wrist.z).toBeCloseTo(grip.z - palmLength, 6);
      expect(wrist.x).toBeCloseTo(grip.x, 6);
      expect(wrist.y).toBeCloseTo(grip.y, 6);
    });

    it("rotates the wrist around the grip instead of translating the grip", () => {
      const { animator, chain, grip, palmLength, staffQuat } =
        createHugAnimator();
      animator.stanceYawSmoothedRad = SIDE_ON_YAW_RAD;

      const hugWrist = animator
        .computeSocketTarget("left", chain, grip, staffQuat)
        .clone();

      // Same palm-length sphere around the SAME authored grip: the hug adds
      // no depth-lane translation of its own.
      expect(hugWrist.distanceTo(grip)).toBeCloseTo(palmLength, 6);

      animator.stanceYawSmoothedRad = 0;
      const squareWrist = animator
        .computeSocketTarget("left", chain, grip, staffQuat)
        .clone();
      expect(hugWrist.distanceTo(squareWrist)).toBeGreaterThan(0.01);
    });

    it("aims the hand somewhere the roll about the staff can reach", () => {
      const { animator, chain, grip, staffQuat } = createHugAnimator();
      animator.stanceYawSmoothedRad = SIDE_ON_YAW_RAD;

      animator.computeSocketTarget("left", chain, grip, staffQuat);

      // The knuckle axis is welded to the shaft, so a goal with any component
      // along the shaft is unreachable and leaves the palm short of the grip.
      const staffAxis = new Vector3(0, -1, 0).applyQuaternion(staffQuat);
      expect(Math.abs(animator.leftHandDir.dot(staffAxis))).toBeLessThan(1e-6);
      expect(animator.leftHandDirValid).toBe(true);
    });

    it("keeps the inward rotation inside the wrist deviation budget", () => {
      const { animator, chain, grip, staffQuat } = createHugAnimator();
      animator.stanceYawSmoothedRad = SIDE_ON_YAW_RAD;

      animator.computeSocketTarget("left", chain, grip, staffQuat);

      const medialInPlane = animator._bodyFrame.lateral
        .clone()
        .projectOnPlane(new Vector3(0, -1, 0).applyQuaternion(staffQuat))
        .normalize();
      const deviation = animator.leftHandDir.angleTo(medialInPlane);
      expect(deviation).toBeGreaterThan(0);
      expect(deviation).toBeLessThanOrEqual(MAX_DEVIATION_RAD + 1e-6);
    });

    it("falls back to the medial socket when the hand carries no staff", () => {
      const { animator, chain, grip, palmLength } = createHugAnimator();
      animator.stanceYawSmoothedRad = SIDE_ON_YAW_RAD;

      const wrist = animator
        .computeSocketTarget("left", chain, grip, undefined)
        .clone();

      expect(wrist.z).toBeCloseTo(grip.z - palmLength, 6);
    });
  });
});
