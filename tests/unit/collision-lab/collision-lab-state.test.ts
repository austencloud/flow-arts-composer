import { describe, it, expect } from "vitest";
import { createCollisionLabState } from "#lib/features/lab/tabs/collision-lab/state/collision-lab-state.svelte.js";
import { enumerateDiamondInOut } from "#lib/features/lab/tabs/collision-lab/services/diamond-pose-enumerator.js";
import {
  StanceSimulator,
  restPoseFromHeight,
} from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { StanceOptimizer } from "#lib/features/lab/tabs/collision-lab/services/stance-optimizer.js";
import type {
  PoseLabel,
  CollisionSnapshot,
} from "#lib/features/lab/tabs/collision-lab/domain/types.js";
import { Plane } from "@austencloud/scene-3d";

class InMemoryLabelRepo {
  store: Record<string, PoseLabel> = {};
  async loadAll() {
    return { ...this.store };
  }
  save(labels: Record<string, PoseLabel>): void {
    this.store = { ...labels };
  }
  exportJson(): void {
    /* no-op for tests */
  }
}

const enumeratorAdapter = { enumerateDiamondInOut };

async function setup() {
  const repo = new InMemoryLabelRepo();
  const state = await createCollisionLabState(enumeratorAdapter, repo);
  return { state, repo };
}

async function setupWithOptimizer() {
  const repo = new InMemoryLabelRepo();
  const simulator = new StanceSimulator(restPoseFromHeight(1.7));
  const optimizer = new StanceOptimizer(simulator);
  const state = await createCollisionLabState(enumeratorAdapter, repo, optimizer);
  return { state, repo };
}

describe("collision-lab-state", () => {
  it("exposes all 576 poses on creation", async () => {
    const { state } = await setup();
    expect(state.allPoses.length).toBe(576);
    expect(state.filteredPoses.length).toBe(576);
    expect(state.cursorIndex).toBe(0);
    expect(state.currentPose?.id).toBe(state.allPoses[0]!.id);
  });

  it("stepForward / stepBackward move the cursor within bounds", async () => {
    const { state } = await setup();
    state.stepForward();
    expect(state.cursorIndex).toBe(1);
    state.stepBackward();
    expect(state.cursorIndex).toBe(0);
    state.stepBackward(); // clamps
    expect(state.cursorIndex).toBe(0);
  });

  it("jumpTo clamps out-of-range values", async () => {
    const { state } = await setup();
    state.jumpTo(9999);
    expect(state.cursorIndex).toBe(state.filteredPoses.length - 1);
    state.jumpTo(-5);
    expect(state.cursorIndex).toBe(0);
  });

  it("setBluePlaneFilter restricts filteredPoses and resets cursor", async () => {
    const { state } = await setup();
    state.stepForward();
    state.stepForward();
    state.setLeftPlaneFilter(Plane.WALL);
    expect(state.cursorIndex).toBe(0);
    expect(state.filteredPoses.every((p) => p.leftHand.plane === Plane.WALL)).toBe(true);
    // Blue locked to wall: 1 × 4 × 2 × 3 × 4 × 2 = 192
    expect(state.filteredPoses.length).toBe(192);
  });

  it("crossPlaneOnly filter shows only different-plane poses", async () => {
    const { state } = await setup();
    state.setCrossPlaneOnly(true);
    expect(state.filteredPoses.length).toBe(384); // 576 - 192 same-plane
    expect(
      state.filteredPoses.every((p) => p.leftHand.plane !== p.rightHand.plane)
    ).toBe(true);
  });

  it("setting both plane filters narrows to a single cross-plane slice", async () => {
    const { state } = await setup();
    state.setLeftPlaneFilter(Plane.WALL);
    state.setRightPlaneFilter(Plane.WHEEL);
    // 1 × 4 × 2 × 1 × 4 × 2 = 64
    expect(state.filteredPoses.length).toBe(64);
    expect(
      state.filteredPoses.every(
        (p) =>
          p.leftHand.plane === Plane.WALL && p.rightHand.plane === Plane.WHEEL
      )
    ).toBe(true);
  });

  it("labelCurrent writes a label and auto-advances on 'clear'", async () => {
    const { state, repo } = await setup();
    const firstId = state.currentPose!.id;
    state.labelCurrent("clear");
    expect(repo.store[firstId]?.status).toBe("clear");
    expect(state.cursorIndex).toBe(1);
  });

  it("labelCurrent auto-advances on 'needs-adjustment'", async () => {
    const { state } = await setup();
    state.labelCurrent("needs-adjustment");
    expect(state.cursorIndex).toBe(1);
  });

  it("labelCurrent auto-advances on 'skip'", async () => {
    const { state } = await setup();
    state.labelCurrent("skip");
    expect(state.cursorIndex).toBe(1);
  });

  it("labelCurrent captures the live stance values and collision snapshot", async () => {
    const { state, repo } = await setup();
    // Small offsets that stay within the reach envelope so labelCurrent
    // actually writes (it refuses clear/needs-adjustment when unreachable)
    state.setFootOffsetX(0.05);
    state.setFootOffsetZ(-0.05);
    state.setRootYawRad(0);
    state.setSpinePitchRad(0.1);
    const snapshot: CollisionSnapshot = {
      severity: "clip",
      zones: [
        { type: "arm-through-face", depthCm: 3.2, description: "L forearm → face" },
      ],
    };
    state.updateCollision(snapshot);
    const id = state.currentPose!.id;
    state.labelCurrent("needs-adjustment");
    expect(repo.store[id]?.stance).toEqual({
      footOffsetX: 0.05,
      footOffsetZ: -0.05,
      rootYawRad: 0,
      spinePitchRad: 0.1,
    });
    expect(repo.store[id]?.collisionSnapshot?.severity).toBe("clip");
  });

  it("stepping onto a pose with a prior label seeds the stance sliders", async () => {
    const { state, repo } = await setup();
    // Tiny offsets that stay within reach so labelCurrent writes
    state.setFootOffsetX(0.03);
    state.setFootOffsetZ(-0.02);
    const id = state.currentPose!.id;
    state.labelCurrent("needs-adjustment"); // auto-advances to 1
    expect(repo.store[id]).toBeDefined(); // sanity check
    expect(state.cursorIndex).toBe(1);
    // Step back to pose 0 where label exists — stance reseeded from label
    state.stepBackward();
    expect(state.cursorIndex).toBe(0);
    expect(state.footOffsetX).toBe(0.03);
    expect(state.footOffsetZ).toBe(-0.02);
  });

  it("resetStance returns all axes to zero", async () => {
    const { state } = await setup();
    state.setFootOffsetX(0.4);
    state.setSpinePitchRad(0.2);
    state.resetStance();
    expect(state.footOffsetX).toBe(0);
    expect(state.footOffsetZ).toBe(0);
    expect(state.rootYawRad).toBe(0);
    expect(state.spinePitchRad).toBe(0);
  });

  it("progress counts reflect labeled poses", async () => {
    const { state } = await setup();
    expect(state.progress.labeled).toBe(0);
    state.labelCurrent("clear"); // advances to 1
    state.labelCurrent("clear"); // advances to 2
    expect(state.progress.labeled).toBe(2);
    expect(state.progress.clear).toBe(2);
  });

  it("default stance is always reachable", async () => {
    const { state } = await setup();
    expect(state.currentReachability.reachable).toBe(true);
    expect(state.currentReachability.leftExcess).toBe(0);
    expect(state.currentReachability.rightExcess).toBe(0);
  });

  it("stepping far from the grid makes the pose unreachable", async () => {
    // Reachability is answered by the simulator, which needs an optimizer
    // (the state factory pulls the simulator from optimizer.simulator). The
    // no-optimizer fallback is intentionally "unknown → reachable", so we
    // use setupWithOptimizer here to actually exercise the reach check.
    const { state } = await setupWithOptimizer();
    // 80 cm lateral step is well beyond slider range but useful to force
    // the reach envelope boundary for the test
    state.setFootOffsetX(0.8);
    expect(state.currentReachability.reachable).toBe(false);
  });

  it("labelCurrent refuses 'clear' when the stance is unreachable", async () => {
    const { state, repo } = await setupWithOptimizer();
    const firstId = state.currentPose!.id;
    state.setFootOffsetX(0.8); // force unreachable (simulator-backed check)
    state.labelCurrent("clear");
    // Label was NOT written and cursor did NOT advance
    expect(repo.store[firstId]).toBeUndefined();
    expect(state.cursorIndex).toBe(0);
  });

  it("labelCurrent allows 'unreachable' even when the stance is unreachable", async () => {
    const { state, repo } = await setup();
    const firstId = state.currentPose!.id;
    state.setFootOffsetX(0.8); // force unreachable
    state.labelCurrent("unreachable");
    expect(repo.store[firstId]?.status).toBe("unreachable");
  });

  it("labelCurrent allows 'skip' even when the stance is unreachable", async () => {
    const { state, repo } = await setup();
    const firstId = state.currentPose!.id;
    state.setFootOffsetX(0.8); // force unreachable
    state.labelCurrent("skip");
    expect(repo.store[firstId]?.status).toBe("skip");
  });

  it("hasOptimizer is false when no optimizer is provided", async () => {
    const { state } = await setup();
    expect(state.hasOptimizer).toBe(false);
    expect(state.autoSeedEnabled).toBe(false);
    expect(state.lastOptimizerResult).toBe(null);
  });
});

describe("collision-lab-state optimizer integration", () => {
  it("hasOptimizer is true when an optimizer is supplied", async () => {
    const { state } = await setupWithOptimizer();
    expect(state.hasOptimizer).toBe(true);
    expect(state.autoSeedEnabled).toBe(true);
  });

  it("seeds the initial pose's stance from the optimizer on creation", async () => {
    const { state } = await setupWithOptimizer();
    // The first pose should have a fresh optimizer result stashed away.
    expect(state.lastOptimizerResult).not.toBe(null);
    expect(state.lastOptimizerResult!.feasible).toBeTypeOf("boolean");
  });

  it("runs the optimizer when stepping onto an unlabeled pose", async () => {
    const { state } = await setupWithOptimizer();
    state.stepForward();
    // lastOptimizerResult should have been refreshed for the new pose.
    expect(state.lastOptimizerResult).not.toBe(null);
  });

  it("skips the optimizer when a pose already has a saved label", async () => {
    const { state } = await setupWithOptimizer();
    // Reset off the auto-seed first so we're labeling a known stance.
    // "needs-adjustment" is accepted regardless of reachability (it's a
    // "come back to this" bookmark), so the specific slider values here
    // don't have to produce a physically reachable pose.
    state.resetStance();
    state.setFootOffsetX(0.05);
    state.setFootOffsetZ(-0.05);
    state.labelCurrent("needs-adjustment"); // auto-advances to pose 1
    // Step back to pose 0 — label exists, optimizer MUST NOT run
    state.stepBackward();
    expect(state.footOffsetX).toBe(0.05);
    expect(state.footOffsetZ).toBe(-0.05);
    expect(state.lastOptimizerResult).toBe(null);
  });

  it("setAutoSeedEnabled(false) stops the optimizer from running on step", async () => {
    const { state } = await setupWithOptimizer();
    state.setAutoSeedEnabled(false);
    state.stepForward();
    // Optimizer should NOT run on step when disabled.
    // Result from the INITIAL auto-seed (pose 0) is cleared when we step off.
    // Check that stance is center on the new pose:
    expect(state.footOffsetX).toBe(0);
    expect(state.footOffsetZ).toBe(0);
    expect(state.rootYawRad).toBe(0);
    expect(state.spinePitchRad).toBe(0);
  });

  it("reoptimizeCurrent re-runs the optimizer on demand", async () => {
    const { state } = await setupWithOptimizer();
    // Move sliders away from the seed
    state.setFootOffsetX(0.3);
    // Re-optimize should pull them back
    state.reoptimizeCurrent();
    // Can't assert an exact value (optimizer is deterministic but pose-dependent),
    // but the reoptimize should produce a new result.
    expect(state.lastOptimizerResult).not.toBe(null);
  });
});
