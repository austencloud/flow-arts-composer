import { describe, expect, it } from "vitest";
import { Bone, Vector3 } from "three";
import {
  AvatarAnimator,
  ElbowPoleComputer,
  IKSolver,
  Plane,
  SpineTwister,
  type BoneChain,
  type BodyFrame,
} from "@austencloud/scene-3d";

const bodyCenter = new Vector3(0, 1, 0);
const conventionalFrame: BodyFrame = {
  lateral: new Vector3(1, 0, 0),
  forward: new Vector3(0, 0, 1),
};
const mirroredFrame: BodyFrame = {
  lateral: new Vector3(-1, 0, 0),
  forward: new Vector3(0, 0, 1),
};

function expectNormalized(vector: Vector3): void {
  expect(vector.length()).toBeCloseTo(1, 6);
}

function makeArm(
  shoulder: Vector3,
  outward: Vector3,
  upperLength = 0.3,
  lowerLength = 0.27
): BoneChain {
  const parent = new Bone();
  const root = new Bone();
  const middle = new Bone();
  const effector = new Bone();

  root.position.copy(shoulder);
  middle.position.copy(outward).setLength(upperLength);
  effector.position.copy(outward).setLength(lowerLength);
  parent.add(root);
  root.add(middle);
  middle.add(effector);
  parent.updateMatrixWorld(true);

  return {
    root,
    middle,
    effector,
    totalLength: upperLength + lowerLength,
    upperLength,
    lowerLength,
    rootRestDir: middle.position.clone().normalize(),
    middleRestDir: effector.position.clone().normalize(),
  };
}

function pointToSegmentDistance(
  point: Vector3,
  a: Vector3,
  b: Vector3
): number {
  const segment = b.clone().sub(a);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 1e-8) return point.distanceTo(a);
  const t = Math.max(
    0,
    Math.min(1, point.clone().sub(a).dot(segment) / lengthSq)
  );
  return point.distanceTo(a.clone().addScaledVector(segment, t));
}

function segmentDistance(
  a0: Vector3,
  a1: Vector3,
  b0: Vector3,
  b1: Vector3
): number {
  return Math.min(
    pointToSegmentDistance(a0, b0, b1),
    pointToSegmentDistance(a1, b0, b1),
    pointToSegmentDistance(b0, a0, a1),
    pointToSegmentDistance(b1, a0, a1)
  );
}

function makeFaceCollisionRig(): {
  state: {
    bones: Map<string, Bone>;
  };
  skeleton: {
    getLeftArmChain: () => null;
    getRightArmChain: () => BoneChain;
  };
  root: Bone;
} {
  const root = new Bone();
  const neck = new Bone();
  const head = new Bone();
  const leftShoulder = new Bone();
  const rightShoulder = new Bone();

  neck.position.set(0, 1.6, 0);
  head.position.set(0, 0.1, 0);
  leftShoulder.position.set(0.18, 1.5, 0);
  rightShoulder.position.set(-0.18, 1.5, 0);
  root.add(neck, leftShoulder, rightShoulder);
  neck.add(head);

  const rightArm = makeArm(
    new Vector3(-0.18, 1.5, 0),
    new Vector3(0.18, 0.3, -0.08)
  );
  root.add(rightArm.root.parent as Bone);
  root.updateMatrixWorld(true);

  return {
    root,
    state: {
      bones: new Map([
        ["Neck", neck],
        ["Head", head],
        ["LeftShoulder", leftShoulder],
        ["RightShoulder", rightShoulder],
      ]),
    },
    skeleton: {
      getLeftArmChain: () => null,
      getRightArmChain: () => rightArm,
    },
  };
}

describe("ElbowPoleComputer", () => {
  const computer = new ElbowPoleComputer();

  it("uses anatomical shoulder axes instead of assuming model X handedness", () => {
    const conventionalLeft = computer.computePoleVector(
      new Vector3(-0.48, 1.12, 0.08),
      Plane.WALL,
      "left",
      bodyCenter,
      {
        bodyFrame: conventionalFrame,
        shoulderPosition: new Vector3(-0.18, 1.5, 0),
      }
    );
    const mirroredLeft = computer.computePoleVector(
      new Vector3(0.48, 1.12, 0.08),
      Plane.WALL,
      "left",
      bodyCenter,
      {
        bodyFrame: mirroredFrame,
        shoulderPosition: new Vector3(0.18, 1.5, 0),
      }
    );

    expectNormalized(conventionalLeft);
    expectNormalized(mirroredLeft);
    expect(conventionalLeft.dot(conventionalFrame.lateral)).toBeLessThan(0);
    expect(mirroredLeft.dot(mirroredFrame.lateral)).toBeLessThan(0);
    expect(conventionalLeft.dot(conventionalFrame.forward)).toBeCloseTo(
      mirroredLeft.dot(mirroredFrame.forward),
      6
    );
  });

  it("solves neutral elbows sideways instead of toward the viewer", () => {
    const leftShoulder = new Vector3(0.18, 1.5, 0);
    const rightShoulder = new Vector3(-0.18, 1.5, 0);
    const leftTarget = new Vector3(0.52, 1.08, 0.08);
    const rightTarget = new Vector3(-0.52, 1.08, 0.08);
    const leftOutward = new Vector3(1, 0, 0);
    const rightOutward = new Vector3(-1, 0, 0);
    const leftChain = makeArm(leftShoulder, leftOutward);
    const rightChain = makeArm(rightShoulder, rightOutward);
    const solver = new IKSolver();

    solver.solveAndApply(leftChain, {
      position: leftTarget,
      poleHint: computer.computePoleVector(
        leftTarget,
        Plane.WALL,
        "left",
        bodyCenter,
        { bodyFrame: mirroredFrame, shoulderPosition: leftShoulder }
      ),
    });
    solver.solveAndApply(rightChain, {
      position: rightTarget,
      poleHint: computer.computePoleVector(
        rightTarget,
        Plane.WALL,
        "right",
        bodyCenter,
        { bodyFrame: mirroredFrame, shoulderPosition: rightShoulder }
      ),
    });

    const leftElbowOffset = new Vector3();
    const rightElbowOffset = new Vector3();
    leftChain.middle.getWorldPosition(leftElbowOffset);
    rightChain.middle.getWorldPosition(rightElbowOffset);
    leftElbowOffset.sub(leftShoulder);
    rightElbowOffset.sub(rightShoulder);

    expect(leftElbowOffset.dot(leftOutward)).toBeGreaterThan(0.22);
    expect(rightElbowOffset.dot(rightOutward)).toBeGreaterThan(0.22);
    expect(Math.abs(leftElbowOffset.dot(mirroredFrame.forward))).toBeLessThan(
      0.06
    );
    expect(Math.abs(rightElbowOffset.dot(mirroredFrame.forward))).toBeLessThan(
      0.06
    );
  });

  it("assigns stable complementary layers to an equal-height crossed pair", () => {
    const routing = computer.computePairRouting(
      new Vector3(0.34, 1.3, 0.2),
      new Vector3(-0.34, 1.3, 0.2),
      bodyCenter,
      conventionalFrame
    );
    const mirrored = computer.computePairRouting(
      new Vector3(-0.34, 1.3, 0.2),
      new Vector3(0.34, 1.3, 0.2),
      bodyCenter,
      mirroredFrame
    );

    expect(routing).toEqual({ left: "over", right: "under", crossing: 1 });
    expect(mirrored).toEqual(routing);
  });

  it("lets a meaningfully higher right hand take the over route", () => {
    expect(
      computer.computePairRouting(
        new Vector3(0.34, 1.2, 0.2),
        new Vector3(-0.34, 1.35, 0.2),
        bodyCenter,
        conventionalFrame
      )
    ).toMatchObject({ left: "under", right: "over" });
  });

  it("keeps every plane pole normalized", () => {
    for (const plane of [Plane.WALL, Plane.WHEEL, Plane.FLOOR]) {
      expectNormalized(
        computer.computePoleVector(
          new Vector3(-0.25, 1.25, 0.3),
          plane,
          "left",
          bodyCenter,
          { bodyFrame: conventionalFrame }
        )
      );
    }
  });

  it("solves crossed arms into distinct over/under forearm corridors", () => {
    const leftShoulder = new Vector3(0.18, 1.5, 0);
    const rightShoulder = new Vector3(-0.18, 1.5, 0);
    const leftTarget = new Vector3(-0.26, 1.34, 0.24);
    const rightTarget = new Vector3(0.26, 1.34, 0.24);
    const leftChain = makeArm(leftShoulder, new Vector3(1, 0, 0));
    const rightChain = makeArm(rightShoulder, new Vector3(-1, 0, 0));
    const routing = computer.computePairRouting(
      leftTarget,
      rightTarget,
      bodyCenter,
      mirroredFrame
    );
    const leftPole = computer.computePoleVector(
      leftTarget,
      Plane.WALL,
      "left",
      bodyCenter,
      {
        bodyFrame: mirroredFrame,
        shoulderPosition: leftShoulder,
        routing: routing.left,
      }
    );
    const rightPole = computer.computePoleVector(
      rightTarget,
      Plane.WALL,
      "right",
      bodyCenter,
      {
        bodyFrame: mirroredFrame,
        shoulderPosition: rightShoulder,
        routing: routing.right,
      }
    );
    const solver = new IKSolver();
    solver.solveAndApply(leftChain, {
      position: leftTarget,
      poleHint: leftPole,
    });
    solver.solveAndApply(rightChain, {
      position: rightTarget,
      poleHint: rightPole,
    });

    const leftElbow = new Vector3();
    const rightElbow = new Vector3();
    const leftHand = new Vector3();
    const rightHand = new Vector3();
    leftChain.middle.getWorldPosition(leftElbow);
    rightChain.middle.getWorldPosition(rightElbow);
    leftChain.effector.getWorldPosition(leftHand);
    rightChain.effector.getWorldPosition(rightHand);

    expect(leftHand.distanceTo(leftTarget)).toBeLessThan(0.002);
    expect(rightHand.distanceTo(rightTarget)).toBeLessThan(0.002);
    expect(leftElbow.y - rightElbow.y).toBeGreaterThan(0.08);
    expect(
      segmentDistance(leftElbow, leftHand, rightElbow, rightHand)
    ).toBeGreaterThan(0.06);
  });

  it("reroutes a forearm around the face without moving the hand target", () => {
    const shoulder = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0.4, 0);
    const face = new Vector3(Math.sqrt(0.05), 0.2, 0);
    const chain = makeArm(shoulder, new Vector3(0, 1, 0), 0.3, 0.3);
    const preferredPole = new Vector3(1, 0, 0);
    const resolvedPole = computer.resolveForearmFaceClearance(
      preferredPole,
      target,
      "left",
      {
        faceCenter: face,
        shoulderPosition: shoulder,
        upperArmLength: chain.upperLength,
        forearmLength: chain.lowerLength,
        minimumClearance: 0.15,
      }
    );
    const solver = new IKSolver();

    solver.solveAndApply(chain, {
      position: target,
      poleHint: resolvedPole,
    });

    const elbow = new Vector3();
    const hand = new Vector3();
    chain.middle.getWorldPosition(elbow);
    chain.effector.getWorldPosition(hand);

    expectNormalized(resolvedPole);
    expect(hand.distanceTo(target)).toBeLessThan(0.002);
    expect(pointToSegmentDistance(face, elbow, hand)).toBeGreaterThanOrEqual(
      0.154
    );
  });

  it("reroutes the upper arm around the neck without moving the hand target", () => {
    const shoulder = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0.4, 0);
    const neck = new Vector3(0.14, 0.125, 0);
    const chain = makeArm(shoulder, new Vector3(0, 1, 0), 0.3, 0.3);
    const resolvedPole = computer.resolveForearmFaceClearance(
      new Vector3(1, 0, 0),
      target,
      "left",
      {
        faceCenter: new Vector3(2, 2, 2),
        neckCenter: neck,
        shoulderPosition: shoulder,
        upperArmLength: chain.upperLength,
        forearmLength: chain.lowerLength,
      }
    );
    const solver = new IKSolver();

    solver.solveAndApply(chain, {
      position: target,
      poleHint: resolvedPole,
    });

    const elbow = new Vector3();
    const hand = new Vector3();
    const upperArmBodyStart = new Vector3();
    chain.middle.getWorldPosition(elbow);
    chain.effector.getWorldPosition(hand);
    upperArmBodyStart.lerpVectors(shoulder, elbow, 0.35);

    expectNormalized(resolvedPole);
    expect(hand.distanceTo(target)).toBeLessThan(0.002);
    expect(
      pointToSegmentDistance(neck, upperArmBodyStart, elbow)
    ).toBeGreaterThanOrEqual(0.134);
  });

  it("returns a finite best-effort pole when the fixed hand target occupies the face", () => {
    const shoulder = new Vector3(0, 0, 0);
    const targetAndFace = new Vector3(0, 0.4, 0);
    const resolvedPole = computer.resolveForearmFaceClearance(
      new Vector3(1, 0, 0),
      targetAndFace,
      "right",
      {
        faceCenter: targetAndFace,
        shoulderPosition: shoulder,
        upperArmLength: 0.3,
        forearmLength: 0.3,
      }
    );

    expectNormalized(resolvedPole);
    expect(resolvedPole.toArray().every(Number.isFinite)).toBe(true);
  });
});

describe("SpineTwister crossed-arm posture", () => {
  it("keeps crossed-arm posture upright on conventional and mirrored rigs", () => {
    const twister = new SpineTwister();
    const conventional = twister.computeSpineTwist(
      new Vector3(0.34, 1.3, 0.2),
      new Vector3(-0.34, 1.3, 0.2),
      bodyCenter,
      undefined,
      conventionalFrame
    );
    const mirrored = twister.computeSpineTwist(
      new Vector3(-0.34, 1.3, 0.2),
      new Vector3(0.34, 1.3, 0.2),
      bodyCenter,
      undefined,
      mirroredFrame
    );

    expect(conventional.spine1.x).toBeCloseTo(0, 6);
    expect(mirrored.spine1.x).toBeCloseTo(conventional.spine1.x, 6);
    expect(mirrored.spine2.x).toBeCloseTo(conventional.spine2.x, 6);
  });
});

describe("AvatarAnimator body routing", () => {
  it("retracts only as far as needed to clear an otherwise locked arm", () => {
    const chain = makeArm(
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0),
      0.3,
      0.27
    );
    const animator = new AvatarAnimator(
      new IKSolver(),
      {} as never,
      new ElbowPoleComputer()
    ) as unknown as {
      solveArmWithBodyClearance: (
        side: "left" | "right",
        arm: BoneChain,
        target: { position: Vector3; poleHint: Vector3 },
        context: {
          faceCenter: Vector3;
          neckCenter: Vector3;
          shoulderPosition: Vector3;
          upperArmLength: number;
          forearmLength: number;
        },
        deltaTime: number
      ) => void;
    };
    const target = {
      position: new Vector3(0, 0.56, 0),
      poleHint: new Vector3(1, 0, 0),
    };
    const neck = new Vector3(0.06, 0.15, 0);

    animator.solveArmWithBodyClearance(
      "left",
      chain,
      target,
      {
        faceCenter: new Vector3(2, 2, 2),
        neckCenter: neck,
        shoulderPosition: new Vector3(0, 0, 0),
        upperArmLength: chain.upperLength,
        forearmLength: chain.lowerLength,
      },
      1 / 60
    );

    const elbow = chain.middle.getWorldPosition(new Vector3());
    const hand = chain.effector.getWorldPosition(new Vector3());
    const upperArmBodyStart = new Vector3().lerpVectors(
      new Vector3(0, 0, 0),
      elbow,
      0.35
    );

    expect(target.position.y).toBeLessThan(0.56);
    expect(hand.distanceTo(target.position)).toBeLessThan(0.002);
    expect(
      pointToSegmentDistance(neck, upperArmBodyStart, elbow)
    ).toBeGreaterThanOrEqual(0.13);
  });

  it("subtracts the spine twist already present from the stance target", () => {
    const animator = new AvatarAnimator(
      {} as never,
      {} as never
    ) as unknown as {
      resolveStanceYawCorrection: (
        requestedYawRad: number,
        referenceForward: Vector3,
        achievedForward: Vector3
      ) => number;
    };
    const reference = new Vector3(0, 0, 1);
    const achieved = reference
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), (-36 * Math.PI) / 180);

    const correction = animator.resolveStanceYawCorrection(
      (-60 * Math.PI) / 180,
      reference,
      achieved
    );

    expect(correction).toBeCloseTo((-24 * Math.PI) / 180, 6);
  });

  it("refreshes arm-routing axes from the achieved shoulder yaw", () => {
    const sceneRoot = new Bone();
    const torso = new Bone();
    const leftArm = makeArm(
      new Vector3(0.2, 1.45, 0),
      new Vector3(1, 0, 0)
    );
    const rightArm = makeArm(
      new Vector3(-0.2, 1.45, 0),
      new Vector3(-1, 0, 0)
    );
    sceneRoot.add(torso);
    torso.add(leftArm.root.parent as Bone, rightArm.root.parent as Bone);
    sceneRoot.updateMatrixWorld(true);

    const animator = new AvatarAnimator(
      {} as never,
      {} as never
    ) as unknown as {
      refreshBodyFrame: (
        state: { root: Bone },
        leftChain: BoneChain,
        rightChain: BoneChain
      ) => void;
      _bodyFrame: BodyFrame;
    };

    animator.refreshBodyFrame({ root: sceneRoot }, leftArm, rightArm);
    expect(animator._bodyFrame.forward.dot(new Vector3(0, 0, 1))).toBeCloseTo(
      1,
      6
    );

    torso.rotation.y = Math.PI / 3;
    sceneRoot.updateMatrixWorld(true);
    animator.refreshBodyFrame({ root: sceneRoot }, leftArm, rightArm);

    const achievedForward = new Vector3(0, 0, 1).applyAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 3
    );
    expect(animator._bodyFrame.forward.dot(achievedForward)).toBeCloseTo(1, 6);
  });

  it("does not move the head after the elbow solver has routed a forearm", () => {
    const rig = makeFaceCollisionRig();
    const animator = new AvatarAnimator(
      {} as never,
      rig.skeleton as never
    ) as unknown as {
      applyHeadDodge: (
        state: { bones: Map<string, Bone> },
        deltaTime: number,
        maxIKWeight: number
      ) => void;
      headDodgeAngleSmoothed: number;
    };
    const head = rig.state.bones.get("Head")!;
    const before = head.getWorldPosition(new Vector3());

    animator.applyHeadDodge(rig.state, 1, 1);
    rig.root.updateMatrixWorld(true);

    const after = head.getWorldPosition(new Vector3());
    expect(after.distanceTo(before)).toBeLessThan(1e-8);
    expect(animator.headDodgeAngleSmoothed).toBe(0);
  });
});
