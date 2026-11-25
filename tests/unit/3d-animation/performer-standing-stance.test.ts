import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Bone, Euler, Object3D, Quaternion, Vector3 } from "three";
import {
  applyStandingStance,
  measureStandingStance,
  planStandingStance,
  STANDING_ANKLE_TO_HIP_RATIO,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/services/leg-geometry";

const packageFile = (path: string) =>
  readFileSync(
    resolve(process.cwd(), "node_modules/@austencloud/scene-3d", path),
    "utf8"
  );

/**
 * A minimal two-leg rig: pelvis, an upper leg per side, a foot under each.
 *
 * `boneAxes` rotates every bone's local frame by an arbitrary amount without
 * moving a single joint, which is what a different exporter produces. The
 * stance must land on the same world positions regardless.
 */
function buildRig(options: {
  hipSeparation: number;
  ankleSeparation: number;
  legDrop: number;
  boneAxes?: Euler;
  rootYaw?: number;
  scale?: number;
}) {
  const {
    hipSeparation,
    ankleSeparation,
    legDrop,
    boneAxes = new Euler(0, 0, 0),
    rootYaw = 0,
    scale = 1,
  } = options;

  const root = new Object3D();
  root.rotation.y = rootYaw;
  root.scale.setScalar(scale);

  const pelvis = new Bone();
  pelvis.position.set(0, legDrop, 0);
  root.add(pelvis);

  const axisQuat = new Quaternion().setFromEuler(boneAxes);

  const makeLeg = (side: 1 | -1) => {
    const upLeg = new Bone();
    upLeg.position.set((side * hipSeparation) / 2, 0, 0);
    upLeg.quaternion.copy(axisQuat);
    pelvis.add(upLeg);

    const foot = new Bone();
    // Placed in the parent's rotated frame so the world ankle lands where the
    // caller asked, whatever the bone axes are.
    const worldOffset = new Vector3(
      (side * ankleSeparation) / 2 - (side * hipSeparation) / 2,
      -legDrop,
      0
    );
    foot.position.copy(worldOffset.applyQuaternion(axisQuat.clone().invert()));
    upLeg.add(foot);

    return { upLeg, foot };
  };

  const left = makeLeg(1);
  const right = makeLeg(-1);
  root.updateMatrixWorld(true);
  return { root, pelvis, left, right };
}

const ankleSeparationOf = (rig: ReturnType<typeof buildRig>) => {
  rig.root.updateMatrixWorld(true);
  const l = rig.left.foot.getWorldPosition(new Vector3());
  const r = rig.right.foot.getWorldPosition(new Vector3());
  return Math.hypot(l.x - r.x, l.z - r.z);
};

const ankleHeightOf = (rig: ReturnType<typeof buildRig>) => {
  rig.root.updateMatrixWorld(true);
  const l = rig.left.foot.getWorldPosition(new Vector3());
  const r = rig.right.foot.getWorldPosition(new Vector3());
  return (l.y + r.y) / 2;
};

const stance = (rig: ReturnType<typeof buildRig>) => {
  const sample = measureStandingStance(
    rig.left.upLeg,
    rig.right.upLeg,
    rig.left.foot,
    rig.right.foot
  );
  if (!sample) throw new Error("degenerate rig");
  return { sample, plan: planStandingStance(sample) };
};

describe("standing stance planning", () => {
  it("targets the rig's own hip-socket separation, not a constant", () => {
    const narrow = buildRig({
      hipSeparation: 0.18,
      ankleSeparation: 0.32,
      legDrop: 0.9,
    });
    const wide = buildRig({
      hipSeparation: 0.26,
      ankleSeparation: 0.32,
      legDrop: 0.9,
    });

    expect(stance(narrow).plan.targetAnkleSeparation).toBeCloseTo(0.18, 6);
    expect(stance(wide).plan.targetAnkleSeparation).toBeCloseTo(0.26, 6);
    expect(STANDING_ANKLE_TO_HIP_RATIO).toBe(1);
  });

  it("leaves a rig already standing on its hip sockets alone", () => {
    // The intake rig's authored bind pose: ankles directly under the sockets.
    const rig = buildRig({
      hipSeparation: 0.2394,
      ankleSeparation: 0.2394,
      legDrop: 0.86,
    });
    const { plan } = stance(rig);

    expect(plan.left.abductionRad).toBeCloseTo(0, 6);
    expect(plan.right.abductionRad).toBeCloseTo(0, 6);
    expect(plan.ankleRise).toBeCloseTo(0, 6);
  });

  it("narrows an A-pose splay instead of widening it further", () => {
    // A Mixamo-derived catalog rig: ankles far outside the hip sockets.
    const rig = buildRig({
      hipSeparation: 0.1871,
      ankleSeparation: 0.3212,
      legDrop: 0.86,
    });
    const { plan } = stance(rig);

    expect(plan.currentAnkleSeparation).toBeCloseTo(0.3212, 4);
    // Left leg swings back toward the midline, so toward negative lateral.
    expect(plan.left.abductionRad).toBeLessThan(0);
    expect(plan.right.abductionRad).toBeGreaterThan(0);
    // Straightening a splayed leg drops the ankle rather than lifting it.
    expect(plan.ankleRise).toBeLessThan(0);
  });
});

describe("standing stance application", () => {
  const cases: { name: string; boneAxes: Euler }[] = [
    { name: "aligned bone axes", boneAxes: new Euler(0, 0, 0) },
    { name: "Z-flipped bone axes", boneAxes: new Euler(0, 0, Math.PI) },
    { name: "arbitrary bone axes", boneAxes: new Euler(0.7, -1.3, 2.1) },
  ];

  for (const { name, boneAxes } of cases) {
    it(`lands the ankles on the hip sockets with ${name}`, () => {
      const rig = buildRig({
        hipSeparation: 0.21,
        ankleSeparation: 0.55,
        legDrop: 0.88,
        boneAxes,
      });
      const { sample, plan } = stance(rig);

      applyStandingStance(
        [
          { upLeg: rig.left.upLeg, foot: rig.left.foot, plan: plan.left },
          { upLeg: rig.right.upLeg, foot: rig.right.foot, plan: plan.right },
        ],
        sample.abductionAxis
      );

      expect(ankleSeparationOf(rig)).toBeCloseTo(0.21, 4);
    });
  }

  it("reports the ankle height change it caused", () => {
    const rig = buildRig({
      hipSeparation: 0.21,
      ankleSeparation: 0.55,
      legDrop: 0.88,
    });
    const before = ankleHeightOf(rig);
    const { sample, plan } = stance(rig);

    applyStandingStance(
      [
        { upLeg: rig.left.upLeg, foot: rig.left.foot, plan: plan.left },
        { upLeg: rig.right.upLeg, foot: rig.right.foot, plan: plan.right },
      ],
      sample.abductionAxis
    );

    expect(ankleHeightOf(rig) - before).toBeCloseTo(plan.ankleRise, 6);
  });

  it("keeps the soles at the orientation the rig authored", () => {
    const rig = buildRig({
      hipSeparation: 0.21,
      ankleSeparation: 0.55,
      legDrop: 0.88,
      boneAxes: new Euler(0.4, 0.2, -0.9),
    });
    const before = rig.left.foot.getWorldQuaternion(new Quaternion());
    const { sample, plan } = stance(rig);

    applyStandingStance(
      [
        { upLeg: rig.left.upLeg, foot: rig.left.foot, plan: plan.left },
        { upLeg: rig.right.upLeg, foot: rig.right.foot, plan: plan.right },
      ],
      sample.abductionAxis
    );

    rig.root.updateMatrixWorld(true);
    const after = rig.left.foot.getWorldQuaternion(new Quaternion());
    expect(before.angleTo(after)).toBeCloseTo(0, 6);
  });

  it("is unaffected by the performer's world yaw", () => {
    const yawed = buildRig({
      hipSeparation: 0.21,
      ankleSeparation: 0.55,
      legDrop: 0.88,
      rootYaw: 1.9,
    });
    const { sample, plan } = stance(yawed);

    applyStandingStance(
      [
        { upLeg: yawed.left.upLeg, foot: yawed.left.foot, plan: plan.left },
        { upLeg: yawed.right.upLeg, foot: yawed.right.foot, plan: plan.right },
      ],
      sample.abductionAxis
    );

    expect(ankleSeparationOf(yawed)).toBeCloseTo(0.21, 4);
  });

  it("scales its reported lift with the rig", () => {
    const base = buildRig({
      hipSeparation: 0.21,
      ankleSeparation: 0.55,
      legDrop: 0.88,
    });
    const scaled = buildRig({
      hipSeparation: 0.21,
      ankleSeparation: 0.55,
      legDrop: 0.88,
      scale: 2,
    });

    expect(stance(scaled).plan.ankleRise).toBeCloseTo(
      stance(base).plan.ankleRise * 2,
      6
    );
  });

  it("cannot reach further sideways than the leg is long", () => {
    const rig = buildRig({
      hipSeparation: 4,
      ankleSeparation: 0.2,
      legDrop: 0.9,
    });
    const { sample, plan } = stance(rig);

    applyStandingStance(
      [
        { upLeg: rig.left.upLeg, foot: rig.left.foot, plan: plan.left },
        { upLeg: rig.right.upLeg, foot: rig.right.foot, plan: plan.right },
      ],
      sample.abductionAxis
    );

    expect(Number.isFinite(plan.left.abductionRad)).toBe(true);
    expect(Number.isFinite(plan.ankleRise)).toBe(true);
    expect(Number.isFinite(ankleSeparationOf(rig))).toBe(true);
  });
});

describe("Avatar3D standing base wiring", () => {
  const avatar3d = packageFile("src/lib/components/Avatar3D.svelte");

  it("no longer rotates the legs by a fixed local-axis constant", () => {
    expect(avatar3d).not.toContain("stanceAngle");
  });

  it("routes the standing base through the shared leg-geometry owner", () => {
    expect(avatar3d).toContain('from "../services/leg-geometry"');
    expect(avatar3d).toContain("measureStandingStance(");
    expect(avatar3d).toContain("planStandingStance(");
    expect(avatar3d).toContain("applyStandingStance(");
  });

  it("leaves the leg pose to the animator when locomotion is enabled", () => {
    expect(avatar3d).toContain("if (enableLocomotion || gait || !skeletonService) return;");
  });

  it("folds the stance lift into the grounding offset", () => {
    expect(avatar3d).toContain(
      "const groundedFeetOffset = $derived(feetOffset + stanceAnkleRise);"
    );
    expect(avatar3d).not.toContain("position.y - feetOffset");
    expect(avatar3d).not.toContain("defaultGroundY - feetOffset");
  });
});
