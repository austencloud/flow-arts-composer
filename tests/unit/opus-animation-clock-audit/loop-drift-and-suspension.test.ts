/**
 * Audit: loop-boundary drift, speed scaling, and hidden-tab resume, driving the
 * REAL AnimationPlaybackController + REAL AnimationLoop + REAL orchestrator
 * over a deterministic requestAnimationFrame clock.
 *
 * Independent invariant for looping playback:
 *
 *   A seamlessly loopable sequence restarts at the end of its start hold, so
 *   one lap is worth exactly `sum(stepDurations)` of sequence time, i.e.
 *   `sum(stepDurations) * 1000 / speed` milliseconds of wall clock. A freeform
 *   sequence restarts at zero and carries a one-beat end hold, so one lap is
 *   worth `(1 + sum + 1) * 1000 / speed` milliseconds.
 *
 *   Whatever the frame cadence, the average lap must equal that figure: a
 *   correct clock spreads each frame's time across the boundary instead of
 *   dropping the part that landed past it.
 *
 * The measurements below show laps that are never shorter than nominal and
 * usually longer — the clock can only run late, and the lateness accumulates.
 */

import { describe, it, expect, afterEach } from "vitest";
import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
import {
  createRenderActivityGate,
  __resetRenderGatingSharedState,
} from "$lib/shared/render-gating/render-activity-gate";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  canonicalFreeformSequence,
  canonicalSeamlessSequence,
  createFrameClock,
  createPanelStateDouble,
  motionDurationTotal,
  withStepDurations,
  type FrameClock,
  type PanelStateDouble,
} from "./support/clock-harness";

const FRAME_MS = 1000 / 60;

// Durations a user can actually dial in (1.00-10.00 in 0.01 steps — see
// duration-handler.ts). Deliberately NOT commensurate with a 60Hz frame, which
// is the ordinary case once any beat is stretched.
const REAL_DURATIONS = [1.13, 2.07, 1.5, 1.31, 2.23, 1.07, 1.91, 1.29];

interface Rig {
  controller: AnimationPlaybackController;
  state: PanelStateDouble;
  clock: FrameClock;
  loop: AnimationLoop;
  lapTimes: number[];
  dispose(): void;
}

function buildRig(
  sequence: SequenceData,
  options: { shouldLoop?: boolean; speed?: number } = {}
): Rig {
  const clock = createFrameClock();
  const loop = new AnimationLoop();
  const controller = new AnimationPlaybackController(
    new SequenceAnimationOrchestrator(new AnimationStateManager()),
    loop,
    { syncSharedWorkspaceState: false }
  );
  const state = createPanelStateDouble({
    shouldLoop: options.shouldLoop ?? true,
    speed: options.speed ?? 1,
  });
  expect(controller.initialize(sequence, state)).toBe(true);

  const lapTimes: number[] = [];
  controller.onLoopComplete(() => lapTimes.push(clock.now()));

  return {
    controller,
    state,
    clock,
    loop,
    lapTimes,
    dispose() {
      controller.dispose(state);
      loop.dispose();
      clock.restore();
    },
  };
}

let activeRig: Rig | null = null;

afterEach(() => {
  activeRig?.dispose();
  activeRig = null;
  __resetRenderGatingSharedState();
});

function describeLaps(lapTimes: readonly number[]): {
  laps: number[];
  mean: number;
  min: number;
  max: number;
} {
  const laps: number[] = [];
  for (let i = 1; i < lapTimes.length; i++) {
    laps.push(lapTimes[i]! - lapTimes[i - 1]!);
  }
  return {
    laps,
    mean: laps.reduce((a, b) => a + b, 0) / laps.length,
    min: Math.min(...laps),
    max: Math.max(...laps),
  };
}

describe("animation clock — loop-boundary drift", () => {
  it("runs a seamless lap LONG by the frame remainder it drops at the boundary", () => {
    const sequence = withStepDurations(
      canonicalSeamlessSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    expect(rig.controller.isSeamlesslyLoopable).toBe(true);

    const nominalLapMs = motionDurationTotal(sequence) * 1000;
    rig.controller.togglePlayback();

    const targetLaps = 21;
    let guard = 0;
    while (rig.lapTimes.length < targetLaps && guard++ < 200_000) {
      rig.clock.runFrames(1, FRAME_MS);
    }
    expect(rig.lapTimes.length).toBe(targetLaps);

    const { laps, mean, min, max } = describeLaps(rig.lapTimes);
    const totalDrift = mean * laps.length - nominalLapMs * laps.length;

    // MEASURED, current behavior. The clock can only run late: the slice of the
    // boundary frame that landed past the end of the sequence is discarded
    // instead of being carried into the new lap.
    expect(min).toBeGreaterThan(nominalLapMs);
    expect(mean).toBeGreaterThan(nominalLapMs);
    // A uniform 60Hz cadence makes the loss identical every lap, so the error
    // is a straight line, not noise that cancels.
    expect(max - min).toBeLessThan(1e-6);
    expect(mean - nominalLapMs).toBeGreaterThan(FRAME_MS / 4);
    expect(mean - nominalLapMs).toBeLessThan(FRAME_MS);
    expect(totalDrift).toBeGreaterThan(100); // ms of lateness after 20 laps

    // eslint-disable-next-line no-console
    console.log(
      `[clock-audit] seamless: nominal ${nominalLapMs.toFixed(2)}ms/lap, ` +
        `measured ${mean.toFixed(2)}ms/lap, ` +
        `drift ${(mean - nominalLapMs).toFixed(2)}ms/lap, ` +
        `${totalDrift.toFixed(1)}ms after ${laps.length} laps`
    );
  });

  it("runs a freeform lap long the same way, start hold and end hold included", () => {
    const sequence = withStepDurations(
      canonicalFreeformSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    expect(rig.controller.isSeamlesslyLoopable).toBe(false);

    // Freeform: one beat of start hold + the steps + one beat of end hold.
    const nominalLapMs = (1 + motionDurationTotal(sequence) + 1) * 1000;
    rig.controller.togglePlayback();

    let guard = 0;
    while (rig.lapTimes.length < 11 && guard++ < 200_000) {
      rig.clock.runFrames(1, FRAME_MS);
    }

    const { mean, min } = describeLaps(rig.lapTimes);
    expect(min).toBeGreaterThan(nominalLapMs);
    expect(mean - nominalLapMs).toBeLessThan(FRAME_MS);

    // eslint-disable-next-line no-console
    console.log(
      `[clock-audit] freeform: nominal ${nominalLapMs.toFixed(2)}ms/lap, ` +
        `measured ${mean.toFixed(2)}ms/lap, ` +
        `drift ${(mean - nominalLapMs).toFixed(2)}ms/lap`
    );
  });

  it("keeps dropping the remainder under a jittered frame cadence", () => {
    // Real rAF deltas are not a constant 16.667ms. Jitter changes how much is
    // dropped per lap but never turns the loss into a gain, so the error still
    // only ever accumulates in one direction.
    const sequence = withStepDurations(
      canonicalSeamlessSequence("mirrored", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    const nominalLapMs = motionDurationTotal(sequence) * 1000;
    rig.controller.togglePlayback();

    const jitter = [16.7, 16.6, 17.2, 16.4, 33.1, 16.6, 15.9, 16.8];
    let guard = 0;
    while (rig.lapTimes.length < 16 && guard++ < 400_000) {
      rig.clock.runFrames(1, jitter[guard % jitter.length]!);
    }

    const { laps, mean, min } = describeLaps(rig.lapTimes);
    expect(min).toBeGreaterThan(nominalLapMs);
    expect(mean).toBeGreaterThan(nominalLapMs);
    expect(laps.every((lap) => lap > nominalLapMs)).toBe(true);

    // eslint-disable-next-line no-console
    console.log(
      `[clock-audit] jittered: drift ${(mean - nominalLapMs).toFixed(2)}ms/lap over ${laps.length} laps`
    );
  });

  it("scales the lap by the speed multiplier, and the per-lap loss scales with it", () => {
    const sequence = withStepDurations(
      canonicalSeamlessSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence, { speed: 3 }));
    const nominalLapMs = (motionDurationTotal(sequence) * 1000) / 3;
    rig.controller.togglePlayback();

    let guard = 0;
    while (rig.lapTimes.length < 11 && guard++ < 200_000) {
      rig.clock.runFrames(1, FRAME_MS);
    }

    const { mean, min } = describeLaps(rig.lapTimes);
    expect(min).toBeGreaterThan(nominalLapMs);
    // The dropped slice is a slice of SEQUENCE time, so at 3x it costs at most
    // one frame of wall clock but three frames' worth of sequence time.
    expect(mean - nominalLapMs).toBeLessThan(FRAME_MS);

    // eslint-disable-next-line no-console
    console.log(
      `[clock-audit] speed 3x: nominal ${nominalLapMs.toFixed(2)}ms/lap, ` +
        `drift ${(mean - nominalLapMs).toFixed(2)}ms/lap ` +
        `(= ${(((mean - nominalLapMs) * 3) / 1000).toFixed(4)} beats of sequence time)`
    );
  });
});

describe("animation clock — start hold, seamless vs freeform", () => {
  it("plays the seamless start hold on the first lap only", () => {
    const sequence = withStepDurations(
      canonicalSeamlessSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    rig.controller.togglePlayback();

    const beforeFirstLap: number[] = [];
    while (rig.lapTimes.length === 0) {
      rig.clock.runFrames(1, FRAME_MS);
      beforeFirstLap.push(rig.state.currentStep);
    }
    // Lap 1 opens on the held start pose (position below beat 1).
    expect(beforeFirstLap.filter((step) => step < 1).length).toBeGreaterThan(10);

    const afterFirstLap: number[] = [];
    while (rig.lapTimes.length < 3) {
      rig.clock.runFrames(1, FRAME_MS);
      afterFirstLap.push(rig.state.currentStep);
    }
    // Later laps restart at beat 1 — the hold is never shown again.
    expect(afterFirstLap.some((step) => step < 1)).toBe(false);
    expect(Math.min(...afterFirstLap)).toBeCloseTo(1, 2);
  });

  it("replays the freeform start hold every lap and adds a one-beat end hold", () => {
    const sequence = withStepDurations(
      canonicalFreeformSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    const totalSteps = rig.state.totalSteps;
    rig.controller.togglePlayback();

    while (rig.lapTimes.length === 0) rig.clock.runFrames(1, FRAME_MS);

    const secondLap: number[] = [];
    while (rig.lapTimes.length < 2) {
      rig.clock.runFrames(1, FRAME_MS);
      secondLap.push(rig.state.currentStep);
    }

    // Start hold: positions below beat 1 appear again on lap 2.
    const holdFrames = secondLap.filter((step) => step < 1);
    expect(holdFrames.length).toBeGreaterThan(10);
    // End hold: the playhead parks on the end beat for a whole beat of time.
    const endFrames = secondLap.filter(
      (step) => Math.abs(step - (totalSteps + 1)) < 1e-9
    );
    expect(endFrames.length).toBeGreaterThan(10);
    // At 60fps a one-beat hold is ~60 frames at either end.
    expect(holdFrames.length).toBeGreaterThan(45);
    expect(endFrames.length).toBeGreaterThan(45);
  });
});

describe("animation clock — speed changes", () => {
  it("advances sequence time in proportion to the speed multiplier", () => {
    // Unit durations everywhere, so position advances at a constant rate and
    // the ratio below isolates the speed multiplier from the duration map.
    const sequence = withStepDurations(canonicalSeamlessSequence("rotated", 0), [
      1,
    ]);
    const rig = (activeRig = buildRig(sequence, { shouldLoop: false }));
    rig.controller.togglePlayback();

    // One frame to seed the loop clock, then measure over a fixed window.
    rig.clock.runFrames(1, FRAME_MS);
    const before = rig.state.currentStep;
    rig.clock.runFrames(30, FRAME_MS);
    const atSpeed1 = rig.state.currentStep - before;

    rig.controller.setSpeed(2);
    const mid = rig.state.currentStep;
    rig.clock.runFrames(30, FRAME_MS);
    const atSpeed2 = rig.state.currentStep - mid;

    expect(atSpeed2 / atSpeed1).toBeCloseTo(2, 6);
  });

  it("clamps an out-of-range speed to the shared playback bounds", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence, { shouldLoop: false }));
    rig.controller.togglePlayback();
    rig.controller.setSpeed(99);
    expect(rig.state.speed).toBe(3);
    expect(rig.loop.getSpeed()).toBe(3);
    rig.controller.setSpeed(0);
    expect(rig.state.speed).toBe(0.1);
    expect(rig.loop.getSpeed()).toBe(0.1);
  });

  it("applies a speed set while paused when playback resumes", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence, { shouldLoop: false }));
    rig.controller.setSpeed(2);
    expect(rig.loop.getSpeed()).toBe(1); // not pushed to a stopped loop...
    rig.controller.togglePlayback();
    expect(rig.loop.getSpeed()).toBe(2); // ...but start() carries it.
  });
});

describe("animation clock — hidden tab / suspended frames", () => {
  function hideDocument(hidden: boolean): void {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  afterEach(() => hideDocument(false));

  it("UNGATED: a single frame after a suspended tab consumes the whole gap", () => {
    // No host but AnimationPlayer.svelte installs an activity gate on the
    // playback controller, and AnimationLoop applies no maximum timestep, so
    // the first frame after the tab returns carries the entire hidden span.
    const sequence = withStepDurations(
      canonicalFreeformSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence, { shouldLoop: false }));
    rig.controller.togglePlayback();
    rig.clock.runFrames(12, FRAME_MS); // ~0.18s of playback

    const beforeSuspend = rig.state.currentStep;
    expect(beforeSuspend).toBeGreaterThan(0);
    expect(beforeSuspend).toBeLessThan(1); // still inside the start hold

    rig.clock.suspend(30_000); // tab hidden for 30 seconds
    rig.clock.runFrames(1, FRAME_MS);

    // One frame moved the playhead from inside the start hold to the very end.
    expect(rig.state.currentStep).toBeCloseTo(rig.state.totalSteps + 1, 6);
    expect(rig.state.isPlaying).toBe(false);
  });

  it("UNGATED: a suspended span longer than several laps counts as ONE lap", () => {
    const sequence = withStepDurations(
      canonicalSeamlessSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence));
    const lapMs = motionDurationTotal(sequence) * 1000; // 12_510ms
    rig.controller.togglePlayback();
    rig.clock.runFrames(2, FRAME_MS);
    expect(rig.lapTimes.length).toBe(0);

    rig.clock.suspend(lapMs * 3 + 4_000); // three and a bit laps
    rig.clock.runFrames(1, FRAME_MS);

    // Three laps of music went by; one loop-complete notification arrived.
    // Anything counting laps (tempo practice training) loses the other two.
    expect(rig.lapTimes.length).toBe(1);
  });

  it("GATED: the same suspension leaves the playhead where it was", () => {
    const sequence = withStepDurations(
      canonicalFreeformSequence("rotated", 0),
      REAL_DURATIONS
    );
    const rig = (activeRig = buildRig(sequence, { shouldLoop: false }));
    const gate = createRenderActivityGate({
      ignoreViewport: true,
      name: "clock-audit",
    });
    rig.controller.setActivityGate(gate);

    rig.controller.togglePlayback();
    rig.clock.runFrames(12, FRAME_MS);
    const beforeSuspend = rig.state.currentStep;

    hideDocument(true);
    rig.clock.suspend(30_000);
    hideDocument(false);
    rig.clock.runFrames(2, FRAME_MS);

    // The gate re-seeds the loop clock, so the 30s gap never becomes a timestep.
    expect(rig.state.currentStep - beforeSuspend).toBeLessThan(0.05);
    expect(rig.state.isPlaying).toBe(true);
    gate.dispose();
  });
});
