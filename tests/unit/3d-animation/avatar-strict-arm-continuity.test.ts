import { Bone, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AvatarAnimator, ElbowPoleComputer, IKSolver, type BoneChain } from "@austencloud/scene-3d";

type StrictArmProbe = {
  rightGripAxisLocal: Vector3;
  rightGripLongitudinalLocal: Vector3;
  rightPalmLocal: Vector3;
  _faceCenterWorld: Vector3;
  _neckWorld: Vector3;
  _torsoCentersWorld: Vector3[];
  solveStrictArm: (side: "right", chain: BoneChain, hand: {
    targetPosition: Vector3; wristRotation: Quaternion;
  }) => void;
  armBodyClearanceMargin: (chain: BoneChain, context: object) => number;
  resetContactHistory: () => void;
  strictArmRoute: { right: { elbow: Vector3; shoulder: Vector3; target: Vector3 } | null };
};

function makeArm(): BoneChain {
  const parent = new Bone();
  const root = new Bone();
  const middle = new Bone();
  const effector = new Bone();
  root.position.set(-0.1844, 1.4887, -0.2104);
  middle.position.y = 0.29;
  effector.position.y = 0.29;
  parent.add(root);
  root.add(middle);
  middle.add(effector);
  parent.updateMatrixWorld(true);
  return {
    root, middle, effector,
    totalLength: 0.58, upperLength: 0.29, lowerLength: 0.29,
    rootRestDir: new Vector3(0, 1, 0),
    middleRestDir: new Vector3(0, 1, 0),
  };
}

describe("strict staff arm continuity", () => {
  it("uses a nearby body-clear elbow for adjacent captured grip targets", () => {
    const chain = makeArm();
    const animator = new AvatarAnimator(new IKSolver(), {} as never, new ElbowPoleComputer()) as unknown as StrictArmProbe;
    animator.rightGripAxisLocal = new Vector3(1, 0, 0);
    animator.rightGripLongitudinalLocal = new Vector3(0, 1, 0);
    animator.rightPalmLocal = new Vector3(0, 0.0917, 0.0289);
    animator._faceCenterWorld.set(-0.0247, 1.65, -0.17);
    animator._neckWorld.set(-0.0247, 1.55, -0.16);
    animator._torsoCentersWorld = [new Vector3(0, 1.48, -0.5)];
    const context = {
      faceCenter: animator._faceCenterWorld,
      neckCenter: animator._neckWorld,
      torsoCenters: animator._torsoCentersWorld,
      shoulderPosition: chain.root.getWorldPosition(new Vector3()),
      upperArmLength: chain.upperLength,
      forearmLength: chain.lowerLength,
    };
    const elbows: Vector3[] = [];
    const frames = [
      { x: 0.18030251, y: 1.52136974, angle: -1.3491 },
      { x: 0.17892428, y: 1.51671397, angle: -1.322662 },
      { x: 0.17768746, y: 1.51209043, angle: -1.29659 },
    ];
    for (const [index, frame] of frames.entries()) {
      // The captured frame 100 elbow is the feasible route entering frame 101.
      if (index === 2) (animator.strictArmRoute ??= { right: null }).right = { elbow: new Vector3(-0.0591, 1.6556, -0.0046), shoulder: chain.root.getWorldPosition(new Vector3()), target: new Vector3(frames[1]!.x, frames[1]!.y, 0.21) };
      animator.solveStrictArm("right", chain, {
        targetPosition: new Vector3(frame.x, frame.y, 0.21),
        wristRotation: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), frame.angle),
      });
      elbows.push(chain.middle.getWorldPosition(new Vector3()));
      expect(animator.armBodyClearanceMargin(chain, context)).toBeGreaterThanOrEqual(0);
    }
    expect(elbows[2]!.distanceTo(new Vector3(-0.0591, 1.6556, -0.0046))).toBeLessThan(0.08);

    const previousElbow = elbows[2]!.clone();
    const actualClearance = animator.armBodyClearanceMargin.bind(animator);
    animator.armBodyClearanceMargin = (arm) =>
      arm.middle.getWorldPosition(new Vector3()).distanceTo(previousElbow) < 0.08
        ? -0.001 : 0.001;
    animator.solveStrictArm("right", chain, {
      targetPosition: new Vector3(frames[2]!.x, frames[2]!.y, 0.21),
      wristRotation: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), frames[2]!.angle),
    });
    expect(animator.armBodyClearanceMargin(chain, context)).toBeGreaterThanOrEqual(0);
    expect(animator.strictArmRoute.right).not.toBeNull();
    animator.armBodyClearanceMargin = actualClearance;

    animator.resetContactHistory();
    animator.solveStrictArm("right", chain, {
      targetPosition: new Vector3(frames[2]!.x, frames[2]!.y, 0.21),
      wristRotation: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), frames[2]!.angle),
    });
    expect(animator.armBodyClearanceMargin(chain, context)).toBeGreaterThanOrEqual(0);
  });
});








