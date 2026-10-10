import { describe, it, expect } from "vitest";
import { CandidateGenerator } from "#lib/features/lab/tabs/collision-lab/services/candidate-generator.js";
import { StanceOptimizer } from "#lib/features/lab/tabs/collision-lab/services/stance-optimizer.js";
import {
  StanceSimulator,
  restPoseFromHeight,
} from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { STANCE_BOUNDS } from "#lib/features/lab/tabs/collision-lab/domain/types.js";
import type {
  OptimizerBounds,
  OptimizerInput,
} from "#lib/features/lab/tabs/collision-lab/services/contracts/IStanceOptimizer";
import type {
  PoseDefinition,
  StancePose,
} from "#lib/features/lab/tabs/collision-lab/domain/types.js";
import { Plane } from "@austencloud/scene-3d";
import { Vector3 } from "three";

const BOUNDS: OptimizerBounds = {
  footOffsetX: { min: STANCE_BOUNDS.footOffset.min, max: STANCE_BOUNDS.footOffset.max },
  footOffsetZ: { min: STANCE_BOUNDS.footOffset.min, max: STANCE_BOUNDS.footOffset.max },
  rootYawRad: {
    min: (STANCE_BOUNDS.rootYawDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.rootYawDeg.max * Math.PI) / 180,
  },
  spinePitchRad: {
    min: (STANCE_BOUNDS.spinePitchDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.spinePitchDeg.max * Math.PI) / 180,
  },
  torsoTwistRad: {
    min: (STANCE_BOUNDS.torsoTwistDeg.min * Math.PI) / 180,
    max: (STANCE_BOUNDS.torsoTwistDeg.max * Math.PI) / 180,
  },
};

function makeSetup() {
  const simulator = new StanceSimulator(restPoseFromHeight(1.7));
  const optimizer = new StanceOptimizer(simulator);
  const generator = new CandidateGenerator(optimizer);
  return { simulator, optimizer, generator };
}

function crossPlanePose(): { pose: PoseDefinition; input: OptimizerInput } {
  const pose: PoseDefinition = {
    id: "test-wNi-fNi",
    leftHand: { plane: Plane.WALL, position: "N", orientation: "in" },
    rightHand: { plane: Plane.FLOOR, position: "N", orientation: "in" },
  };
  const input: OptimizerInput = {
    left: {
      gripWorld: new Vector3(-0.1, 0.45, 0.25),
      tipAWorld: new Vector3(-0.1, 0.02, 0.25),
      tipBWorld: new Vector3(-0.1, 0.88, 0.25),
      radius: 0.012,
    },
    right: {
      gripWorld: new Vector3(0.1, 0.0, 0.4),
      tipAWorld: new Vector3(0.1, 0.0, 0.83),
      tipBWorld: new Vector3(0.1, 0.0, -0.03),
      radius: 0.012,
    },
  };
  return { pose, input };
}

describe("CandidateGenerator.generateDiverse", () => {
  it("returns exactly 6 candidates when no prior label exists", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    expect(set.candidates.length).toBe(6);
    expect(set.poseId).toBe(pose.id);
    expect(set.mode).toBe("diverse");
    expect(set.pickedIndex).toBe(null);
    expect(set.manuallyAdjusted).toBe(false);
  });

  it("indices are sequential 0..5", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    for (let i = 0; i < set.candidates.length; i++) {
      expect(set.candidates[i]!.index).toBe(i);
    }
  });

  it("every candidate has a non-empty label", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    for (const candidate of set.candidates) {
      expect(candidate.label.length).toBeGreaterThan(0);
    }
  });

  it("candidates are diverse after dedup (no two collide)", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    for (let i = 0; i < set.candidates.length; i++) {
      for (let j = i + 1; j < set.candidates.length; j++) {
        const a = set.candidates[i]!.stance;
        const b = set.candidates[j]!.stance;
        const dYaw = Math.abs(wrapAngle(a.rootYawRad - b.rootYawRad));
        const dFoot = Math.hypot(
          a.footOffsetX - b.footOffsetX,
          a.footOffsetZ - b.footOffsetZ
        );
        const dPitch = Math.abs(a.spinePitchRad - b.spinePitchRad);
        const distinct =
          dYaw > (15 * Math.PI) / 180 ||
          dFoot > 0.05 ||
          dPitch > (5 * Math.PI) / 180;
        expect(distinct).toBe(true);
      }
    }
  });

  it("at least one candidate faces the work (yaw within 30° of atan2)", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    const centroid = {
      x: (input.left.gripWorld.x + input.right.gripWorld.x) / 2,
      z: (input.left.gripWorld.z + input.right.gripWorld.z) / 2,
    };
    const idealYaw = Math.atan2(-centroid.x, centroid.z);
    const tolerance = (30 * Math.PI) / 180;

    const hasFaceForward = set.candidates.some((c) => {
      return Math.abs(wrapAngle(c.stance.rootYawRad - idealYaw)) < tolerance;
    });
    expect(hasFaceForward).toBe(true);
  });

  it("history records every candidate in display order", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();

    const set = generator.generateDiverse(pose, input, BOUNDS);

    expect(set.history.length).toBe(set.candidates.length);
    for (let i = 0; i < set.candidates.length; i++) {
      expect(set.history[i]).toBe(set.candidates[i]!.stance);
    }
  });

  it("prior label mode puts the prior at candidate 0 with label 'Previously saved'", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();
    const prior: StancePose = {
      footOffsetX: 0.1,
      footOffsetZ: -0.1,
      rootYawRad: 0.5,
      spinePitchRad: 0.05,
    };

    const set = generator.generateDiverse(pose, input, BOUNDS, prior);

    expect(set.candidates.length).toBe(6);
    expect(set.candidates[0]!.stance).toEqual(prior);
    expect(set.candidates[0]!.label).toBe("Previously saved");
  });
});

describe("CandidateGenerator.generateRefinements", () => {
  it("returns exactly 6 candidates in refine mode", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();
    const picked: StancePose = {
      footOffsetX: 0.05,
      footOffsetZ: 0.1,
      rootYawRad: 0.2,
      spinePitchRad: 0.01,
    };

    const set = generator.generateRefinements(pose, input, BOUNDS, picked, []);

    expect(set.candidates.length).toBe(6);
    expect(set.mode).toBe("refine");
  });

  it("all refinement candidates are within a small neighborhood of the picked stance", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();
    const picked: StancePose = {
      footOffsetX: 0.05,
      footOffsetZ: 0.1,
      rootYawRad: 0.2,
      spinePitchRad: 0.01,
    };

    const set = generator.generateRefinements(pose, input, BOUNDS, picked, []);

    for (const c of set.candidates) {
      const dYaw = Math.abs(wrapAngle(c.stance.rootYawRad - picked.rootYawRad));
      const dFoot = Math.hypot(
        c.stance.footOffsetX - picked.footOffsetX,
        c.stance.footOffsetZ - picked.footOffsetZ
      );
      expect(dYaw).toBeLessThan((45 * Math.PI) / 180);
      expect(dFoot).toBeLessThan(0.3);
    }
  });

  it("refinement history extends previous history", () => {
    const { generator } = makeSetup();
    const { pose, input } = crossPlanePose();
    const priorStances: StancePose[] = [
      {
        footOffsetX: 0,
        footOffsetZ: 0,
        rootYawRad: 0,
        spinePitchRad: 0,
      },
      {
        footOffsetX: 0.1,
        footOffsetZ: 0,
        rootYawRad: 0,
        spinePitchRad: 0,
      },
    ];
    const picked: StancePose = {
      footOffsetX: 0.05,
      footOffsetZ: 0.1,
      rootYawRad: 0.2,
      spinePitchRad: 0.01,
    };

    const set = generator.generateRefinements(
      pose,
      input,
      BOUNDS,
      picked,
      priorStances
    );

    expect(set.history.length).toBe(priorStances.length + set.candidates.length);
    expect(set.history[0]).toEqual(priorStances[0]);
    expect(set.history[1]).toEqual(priorStances[1]);
  });
});

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
