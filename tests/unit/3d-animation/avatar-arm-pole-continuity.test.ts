import { Bone, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  AvatarAnimator,
  ElbowPoleComputer,
  IKSolver,
  type BoneChain,
} from "@austencloud/scene-3d";

function makeArm(): BoneChain {
  const parent = new Bone();
  const root = new Bone();
  const middle = new Bone();
  const effector = new Bone();
  middle.position.set(0, 0.3, 0);
  effector.position.set(0, 0.27, 0);
  parent.add(root);
  root.add(middle);
  middle.add(effector);
  parent.updateMatrixWorld(true);
  return {
    root,
    middle,
    effector,
    totalLength: 0.57,
    upperLength: 0.3,
    lowerLength: 0.27,
    rootRestDir: new Vector3(0, 1, 0),
    middleRestDir: new Vector3(0, 1, 0),
  };
}

type ArmRoutingProbe = {
  solveArmWithBodyClearance: (
    side: "left" | "right",
    chain: BoneChain,
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
  resetContactHistory: () => void;
  armBodyClearanceMargin: (chain: BoneChain, context: object) => number;
};

describe("avatar arm pole continuity", () => {
  it("keeps adjacent safe elbows together and forgets the route after a seek", () => {
    const chain = makeArm();
    const animator = new AvatarAnimator(
      new IKSolver(),
      {} as never,
      new ElbowPoleComputer()
    ) as unknown as ArmRoutingProbe;
    const context = {
      faceCenter: new Vector3(2, 2, 2),
      neckCenter: new Vector3(2, 2, 2),
      shoulderPosition: new Vector3(),
      upperArmLength: chain.upperLength,
      forearmLength: chain.lowerLength,
    };
    const firstTarget = {
      position: new Vector3(0, 0.5, 0),
      poleHint: new Vector3(1, 0, 0),
    };
    animator.solveArmWithBodyClearance(
      "right",
      chain,
      firstTarget,
      context,
      1 / 30
    );
    const firstElbow = chain.middle.getWorldPosition(new Vector3());

    // A tiny hand move can make a discrete pole resolver choose the opposite
    // safe branch. The solver should retain its measured clear branch.
    const nextTarget = {
      position: new Vector3(0, 0.501, 0),
      poleHint: new Vector3(-1, 0, 0),
    };
    animator.solveArmWithBodyClearance(
      "right",
      chain,
      nextTarget,
      context,
      1 / 30
    );
    const nextElbow = chain.middle.getWorldPosition(new Vector3());
    expect(nextElbow.distanceTo(firstElbow)).toBeLessThan(0.08);
    expect(
      animator.armBodyClearanceMargin(chain, context)
    ).toBeGreaterThanOrEqual(0);

    animator.resetContactHistory();
    nextTarget.poleHint.set(-1, 0, 0);
    animator.solveArmWithBodyClearance(
      "right",
      chain,
      nextTarget,
      context,
      1 / 30
    );
    const seekElbow = chain.middle.getWorldPosition(new Vector3());
    expect(seekElbow.distanceTo(nextElbow)).toBeGreaterThan(0.15);
    expect(
      animator.armBodyClearanceMargin(chain, context)
    ).toBeGreaterThanOrEqual(0);
  });

  it("leaves the previous branch when that elbow enters the body envelope", () => {
    const chain = makeArm();
    const animator = new AvatarAnimator(
      new IKSolver(),
      {} as never,
      new ElbowPoleComputer()
    ) as unknown as ArmRoutingProbe;
    const context = {
      faceCenter: new Vector3(2, 2, 2),
      neckCenter: new Vector3(2, 2, 2),
      shoulderPosition: new Vector3(),
      upperArmLength: chain.upperLength,
      forearmLength: chain.lowerLength,
    };
    const target = {
      position: new Vector3(0, 0.5, 0),
      poleHint: new Vector3(1, 0, 0),
    };
    animator.solveArmWithBodyClearance("right", chain, target, context, 1 / 30);
    const previousElbow = chain.middle.getWorldPosition(new Vector3());

    context.neckCenter.copy(previousElbow);
    target.position.y += 0.001;
    target.poleHint.set(-1, 0, 0);
    animator.solveArmWithBodyClearance("right", chain, target, context, 1 / 30);

    expect(
      animator.armBodyClearanceMargin(chain, context)
    ).toBeGreaterThanOrEqual(0);
    expect(
      chain.middle.getWorldPosition(new Vector3()).distanceTo(previousElbow)
    ).toBeGreaterThan(0.05);
  });
});
