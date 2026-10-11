import { describe, it, expect } from "vitest";
import { TempoPracticeOrchestrator } from "#lib/shared/sequence-viewer/services/tempo-practice-orchestrator.js";

describe("TempoPracticeOrchestrator", () => {
  it("defaults to a gentle per-loop creep (X=1, Y=1), no goal", () => {
    const o = new TempoPracticeOrchestrator();
    const start = o.start();
    expect(start).toBe(15);
    const p = o.getProgress();
    expect(p.roundsPerLevel).toBe(1);
    expect(p.increment).toBe(1);
    expect(p.targetEnabled).toBe(false);
  });

  it("X=1 creeps up by Y every loop", () => {
    const o = new TempoPracticeOrchestrator();
    const start = o.start({ startBpm: 20, increment: 1, roundsPerLevel: 1 });
    expect(start).toBe(20);
    expect(o.onLoopComplete()).toBe(21);
    expect(o.onLoopComplete()).toBe(22);
    expect(o.onLoopComplete()).toBe(23);
  });

  it("X>1 holds for X loops, then bumps by Y (staircase)", () => {
    const o = new TempoPracticeOrchestrator();
    const start = o.start({ startBpm: 20, increment: 5, roundsPerLevel: 3 });
    expect(start).toBe(20);
    expect(o.onLoopComplete()).toBeNull(); // round 1
    expect(o.onLoopComplete()).toBeNull(); // round 2
    expect(o.onLoopComplete()).toBe(25); // round 3 -> bump by Y
    expect(o.getProgress().currentBpm).toBe(25);
  });

  it("stops when the climb reaches maxBpm", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 179, increment: 1, roundsPerLevel: 1, maxBpm: 180 });
    expect(o.onLoopComplete()).toBe(180);
    expect(o.isActive()).toBe(true);
    expect(o.onLoopComplete()).toBeNull(); // capped -> stop
    expect(o.isActive()).toBe(false);
  });

  it("tracks loopsCompleted / loopsRemaining within a step", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 3 });
    expect(o.getProgress().loopsRemaining).toBe(3);
    o.onLoopComplete();
    expect(o.getProgress().loopsCompleted).toBe(1);
    expect(o.getProgress().loopsRemaining).toBe(2);
    o.onLoopComplete();
    expect(o.getProgress().loopsRemaining).toBe(1);
  });

  it("advanceLevel bumps one Y, resets the round", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 3 });
    o.onLoopComplete(); // round 1
    expect(o.advanceLevel()).toBe(25);
    const p = o.getProgress();
    expect(p.currentBpm).toBe(25);
    expect(p.currentRound).toBe(1); // reset to round 1 of the new level
    expect(p.currentLevel).toBe(1); // derived from BPM
  });

  it("decreaseLevel drops one Y and floors at the start tempo", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 3 });
    expect(o.advanceLevel()).toBe(25);
    expect(o.advanceLevel()).toBe(30);
    expect(o.decreaseLevel()).toBe(25);
    expect(o.getProgress().currentLevel).toBe(1);
    expect(o.decreaseLevel()).toBe(20);
    expect(o.decreaseLevel()).toBeNull(); // at the floor, no change
    expect(o.getProgress().currentBpm).toBe(20);
    expect(o.isActive()).toBe(true); // floor never stops the session
  });

  it("derives the level from BPM so fine-trim can't desync it", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 3 });
    o.advanceLevel(); // 25 -> level 1
    expect(o.getProgress().currentLevel).toBe(1);
    o.adjustBpm(22); // fine-trim down between levels
    expect(o.getProgress().currentBpm).toBe(22);
    expect(o.getProgress().currentLevel).toBe(0); // round((22-20)/5) = 0
  });

  it("hold freezes the auto-climb until released", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 1, roundsPerLevel: 1 });
    expect(o.onLoopComplete()).toBe(21);
    o.setHeld(true);
    expect(o.getProgress().held).toBe(true);
    expect(o.onLoopComplete()).toBeNull(); // frozen
    expect(o.onLoopComplete()).toBeNull();
    expect(o.getProgress().currentBpm).toBe(21);
    o.setHeld(false);
    expect(o.onLoopComplete()).toBe(22); // resumes from where it froze
  });

  it("Faster still works while held", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 1 });
    o.setHeld(true);
    expect(o.advanceLevel()).toBe(25); // manual override ignores hold
    expect(o.getProgress().held).toBe(true); // still held at the new speed
    expect(o.onLoopComplete()).toBeNull(); // auto-climb stays frozen
  });

  it("advanceLevel at the cap stops the session", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 180, increment: 5, roundsPerLevel: 1, maxBpm: 180 });
    expect(o.advanceLevel()).toBeNull();
    expect(o.isActive()).toBe(false);
  });

  it("returns null from loop/advance/decrease when not active", () => {
    const o = new TempoPracticeOrchestrator();
    expect(o.onLoopComplete()).toBeNull();
    expect(o.advanceLevel()).toBeNull();
    expect(o.decreaseLevel()).toBeNull();
  });

  it("with a goal set, creeps up toward it", () => {
    const o = new TempoPracticeOrchestrator();
    const start = o.start({ startBpm: 20, increment: 1, roundsPerLevel: 1, targetEnabled: true, targetBpm: 23 });
    expect(start).toBe(20);
    expect(o.onLoopComplete()).toBe(21);
    expect(o.onLoopComplete()).toBe(22);
    expect(o.getProgress().reachedTarget).toBe(false);
  });

  it("stops at the goal and flags reachedTarget", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 1, roundsPerLevel: 1, targetEnabled: true, targetBpm: 22 });
    expect(o.onLoopComplete()).toBe(21);
    expect(o.onLoopComplete()).toBe(22); // lands on the goal
    const p = o.getProgress();
    expect(p.currentBpm).toBe(22);
    expect(p.reachedTarget).toBe(true);
    expect(o.isActive()).toBe(false); // reaching the goal ends the session
  });

  it("caps the effective goal at maxBpm but keeps the raw goalBpm", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 1, targetEnabled: true, targetBpm: 500, maxBpm: 30 });
    const p = o.getProgress();
    expect(p.targetBpm).toBe(30); // effective ceiling clamped to maxBpm
    expect(p.goalBpm).toBe(500); // raw configured goal preserved for the readout
    expect(o.onLoopComplete()).toBe(25);
    expect(o.onLoopComplete()).toBe(30); // stops at the cap-as-goal
    expect(o.getProgress().reachedTarget).toBe(true);
  });

  it("progress.targetBpm reflects the cap when no goal is set", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, maxBpm: 150, targetEnabled: false });
    expect(o.getProgress().targetBpm).toBe(150);
    expect(o.getProgress().reachedTarget).toBe(false);
  });

  it("patchConfig applies live X/Y changes without restarting", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, increment: 5, roundsPerLevel: 1 });
    o.patchConfig({ increment: 10 });
    expect(o.getProgress().increment).toBe(10);
    expect(o.advanceLevel()).toBe(30); // uses the new step (20 + 10)
  });

  it("patchConfig toggles the goal live, switching the ceiling", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, maxBpm: 100, targetBpm: 60, targetEnabled: false });
    expect(o.getProgress().targetBpm).toBe(100); // cap
    o.patchConfig({ targetEnabled: true });
    expect(o.getProgress().targetBpm).toBe(60); // now the goal
  });

  it("patchConfig clamps targetBpm into range", () => {
    const o = new TempoPracticeOrchestrator();
    o.start({ startBpm: 20, maxBpm: 100, targetEnabled: true });
    o.patchConfig({ targetBpm: 999 });
    expect(o.getProgress().targetBpm).toBe(100); // clamped to maxBpm
    o.patchConfig({ targetBpm: 5 });
    expect(o.getProgress().targetBpm).toBe(21); // clamped to startBpm + 1
  });

  // The 2026-07 tempo rage-click bug: the practice domain offered BPMs the
  // playback engine silently re-clamps to 180 (speed 3.0 x 60), so past 180 the
  // readout froze and Faster never disabled. The orchestrator must never step
  // outside the engine's reachable range.
  describe("engine playback clamp", () => {
    it("caps maxBpm at the engine ceiling (180) on start", () => {
      const o = new TempoPracticeOrchestrator();
      o.start({ startBpm: 20, maxBpm: 300 });
      expect(o.getProgress().maxBpm).toBe(180);
      expect(o.getProgress().targetBpm).toBe(180); // cap-as-ceiling
    });

    it("Faster reaches the engine ceiling and stops there instead of climbing into a dead zone", () => {
      const o = new TempoPracticeOrchestrator();
      o.start({ startBpm: 179, increment: 5, roundsPerLevel: 1, maxBpm: 300 });
      expect(o.advanceLevel()).toBe(180); // clamped step lands ON the ceiling
      expect(o.advanceLevel()).toBeNull(); // at ceiling -> null, session ends
      expect(o.isActive()).toBe(false);
    });

    it("raises startBpm to the engine floor (6)", () => {
      const o = new TempoPracticeOrchestrator();
      const start = o.start({ startBpm: 2, maxBpm: 100 });
      expect(start).toBe(6);
      expect(o.getProgress().startBpm).toBe(6);
    });

    it("patchConfig cannot lift the ceiling past the engine max", () => {
      const o = new TempoPracticeOrchestrator();
      o.start({ startBpm: 20, maxBpm: 100 });
      o.patchConfig({ maxBpm: 500 });
      expect(o.getProgress().maxBpm).toBe(180);
    });

    it("adjustBpm fine-trim clamps to the engine floor", () => {
      const o = new TempoPracticeOrchestrator();
      o.start({ startBpm: 20, maxBpm: 100 });
      o.adjustBpm(1);
      expect(o.getProgress().currentBpm).toBe(6);
    });
  });
});
