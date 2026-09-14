import { describe, expect, it } from "vitest";
import {
  evaluateStaffTurnPreparation,
  sampleAuthoredRootYaw,
  type StaffTurnScoreSource,
} from "$lib/features/lab/tabs/collision-lab/services/staff-turn-preparation-study";
import { propStateToStaffTarget } from "$lib/shared/3d/services/swept-volume/swept-volume-builder";
import {
  StanceSimulator,
  restPoseFromHeight,
} from "$lib/features/lab/tabs/collision-lab/services/stance-simulator";
import { PlaneMode } from "@austencloud/scene-3d";
import { STAGE } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import { FALG } from "$lib/shared/combination/domain/demo-fixtures";

const source: StaffTurnScoreSource = {
  motionStepCount: 1,
  propStatesAtScoreTime: (time) => ({
    // A staff crosses the torso only between the two authored endpoints.
    left: {
      worldPosition: {
        x: 0,
        y: -0.2,
        z: 2 - 8 * time * (1 - time) - STAGE.AVATAR_GRID_OFFSET,
      },
      worldRotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    right: {
      worldPosition: { x: 1.5, y: -0.2, z: 2 - STAGE.AVATAR_GRID_OFFSET },
      worldRotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  }),
};

describe("staff turn preparation study", () => {
  it("finds a between-beat collision and leaves the authored source unchanged", () => {
    const first = source.propStatesAtScoreTime(0);
    const middle = source.propStatesAtScoreTime(0.5);
    const last = source.propStatesAtScoreTime(1);
    const simulator = new StanceSimulator(restPoseFromHeight(1.7));
    const stance = {
      footOffsetX: 0,
      footOffsetZ: 0,
      rootYawRad: 0,
      spinePitchRad: 0,
      torsoTwistRad: 0,
    };
    expect(
      simulator.evaluate(
        stance,
        propStateToStaffTarget(first.left!),
        propStateToStaffTarget(first.right!)
      ).collisions
    ).toHaveLength(0);
    expect(
      simulator.evaluate(
        stance,
        propStateToStaffTarget(last.left!),
        propStateToStaffTarget(last.right!)
      ).collisions
    ).toHaveLength(0);
    expect(
      simulator.evaluate(
        stance,
        propStateToStaffTarget(middle.left!),
        propStateToStaffTarget(middle.right!)
      ).collisions.length
    ).toBeGreaterThan(0);
    const cached = [0, 0.25, 0.5, 0.75].map((time) => {
      const pair = source.propStatesAtScoreTime(time);
      for (const prop of [pair.left!, pair.right!]) {
        Object.freeze(prop.worldPosition);
        Object.freeze(prop.worldRotation);
        Object.freeze(prop);
      }
      return Object.freeze(pair);
    });
    const before = JSON.stringify(cached);
    let reads = 0;
    const study = evaluateStaffTurnPreparation(
      {
        motionStepCount: 1,
        propStatesAtScoreTime(time) {
          reads += 1;
          return cached[Math.round(time * 4)]!;
        },
      },
      [
        { label: "neutral", curve: null },
        { label: "replay", curve: null },
      ],
      0.25
    );
    expect(study.results[0]?.metrics.collisionFrameCount).toBeGreaterThan(0);
    expect(study.results[1]!.metrics).toEqual(study.results[0]!.metrics);
    expect(reads).toBe(cached.length);
    expect(JSON.stringify(cached)).toBe(before);
  });

  it("includes the shorter wrap interval when a turn crosses the loop seam", () => {
    const curve = {
      startStep: 0.9,
      turnDurationSteps: 0.1,
      holdDurationSteps: 0.6,
      returnDurationSteps: 0.1,
      yawRad: 1,
    };
    const { metrics } = evaluateStaffTurnPreparation(
      source,
      [{ label: "wrap", curve }],
      0.3
    ).results[0]!;
    expect(metrics.maxAngularSpeedRadPerStep).toBeCloseTo(10, 5);
    expect(metrics.seamYawDifferenceRad).toBeLessThan(1e-6);
    expect(metrics.seamAngularSpeedDifferenceRadPerStep).toBeLessThan(0.03);
  });

  it("measures a seam-safe authored pulse without nonfinite values", () => {
    const curve = {
      startStep: 0.1,
      turnDurationSteps: 0.2,
      holdDurationSteps: 0.2,
      returnDurationSteps: 0.2,
      yawRad: Math.PI / 4,
    };
    const study = evaluateStaffTurnPreparation(
      source,
      [{ label: "pulse", curve }],
      0.025
    );
    const metrics = study.results[0]!.metrics;
    expect(sampleAuthoredRootYaw(curve, 0, 1)).toBe(0);
    expect(metrics.seamYawDifferenceRad).toBeLessThan(1e-6);
    expect(
      Object.values(metrics).every(
        (value) => typeof value === "boolean" || Number.isFinite(value)
      )
    ).toBe(true);
  });

  it("rejects nonfinite sampling inputs", () => {
    expect(() => evaluateStaffTurnPreparation(source, [], Number.NaN)).toThrow(
      /finite/i
    );
    expect(() =>
      evaluateStaffTurnPreparation({ ...source, motionStepCount: 0.5 }, [])
    ).toThrow(/integer/i);
    expect(() =>
      evaluateStaffTurnPreparation(
        {
          ...source,
          propStatesAtScoreTime: () => ({ left: null, right: null }),
        },
        []
      )
    ).toThrow(/both props/i);
    expect(() =>
      sampleAuthoredRootYaw(
        {
          startStep: 0,
          turnDurationSteps: 1,
          holdDurationSteps: -1,
          returnDurationSteps: 1,
          yawRad: 0,
        },
        0,
        1
      )
    ).toThrow(/curve/i);
  });

  it("samples the real double-staff FALG fixture at intermediate frames", () => {
    const state = createCharacterInstanceState(
      { id: "staff-turn-falg", persistent: false },
      makeStandaloneDeps()
    );
    state.setPlaneMode(PlaneMode.WALL);
    state.loadSequence(FALG);
    const study = evaluateStaffTurnPreparation(
      state,
      [
        { label: "neutral-root baseline", curve: null },
        ...[0, 0.5, 1, 1.5, 2, 2.5].map((startStep) => ({
          label: `start ${startStep.toFixed(2)}`,
          curve: {
            startStep,
            turnDurationSteps: 0.75,
            holdDurationSteps: 0.75,
            returnDurationSteps: 0.75,
            yawRad: Math.PI / 4,
          },
        })),
      ],
      0.025
    );
    expect(study.results).toHaveLength(7);
    expect(
      study.results.every(
        (result) => result.metrics.sampleCount > FALG.steps.length
      )
    ).toBe(true);
    expect(
      study.results.every((result) => result.metrics.strictClear === false)
    ).toBe(true);
    if (process.env.STAFF_TURN_STUDY_REPORT === "1") {
      console.table(
        study.results.map(({ label, metrics }) => ({
          label,
          collisionFrames: metrics.collisionFrameCount,
          collisionEvents: metrics.collisionCount,
          depthIntegralMSteps: metrics.collisionDepthIntegralMSteps.toFixed(3),
          meanDepthM: metrics.meanCollisionDepthM.toFixed(4),
          maxDepthCm: (metrics.maxCollisionDepthM * 100).toFixed(2),
          maxReachGapCm: (metrics.maxReachShortfallM * 100).toFixed(2),
          loss: metrics.summedStanceLoss.toFixed(0),
        }))
      );
    }
  });
});
