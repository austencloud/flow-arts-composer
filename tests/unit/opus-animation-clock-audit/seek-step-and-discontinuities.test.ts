/**
 * Audit: seek endpoints, backward ("reverse") stepping, and the
 * discontinuities that show up when the playhead is moved by something other
 * than the running clock.
 *
 * Real controller, real loop, real orchestrator; sequences are canonical
 * generator output. Assertions state what the code does TODAY — the ones
 * marked MEASURED DEFECT are the ones the report asks to be changed.
 */

import { describe, it, expect, afterEach } from "vitest";
import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
import { displayedBeatNumber } from "$lib/shared/animation-engine/services/step-calculator";
import { createPlaceholderMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  canonicalFreeformSequence,
  canonicalSeamlessSequence,
  createFrameClock,
  createPanelStateDouble,
  withStepDurations,
  type FrameClock,
  type PanelStateDouble,
} from "./support/clock-harness";

const FRAME_MS = 1000 / 60;

interface Rig {
  controller: AnimationPlaybackController;
  orchestrator: SequenceAnimationOrchestrator;
  state: PanelStateDouble;
  clock: FrameClock;
  dispose(): void;
}

function buildRig(sequence: SequenceData, speed = 1): Rig {
  const clock = createFrameClock();
  const loop = new AnimationLoop();
  const orchestrator = new SequenceAnimationOrchestrator(
    new AnimationStateManager()
  );
  const controller = new AnimationPlaybackController(orchestrator, loop, {
    syncSharedWorkspaceState: false,
  });
  const state = createPanelStateDouble({ shouldLoop: false, speed });
  expect(controller.initialize(sequence, state)).toBe(true);
  return {
    controller,
    orchestrator,
    state,
    clock,
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
});

function takeSteps(sequence: SequenceData, motionCount: number): SequenceData {
  const steps = sequence.steps as unknown as StepData[];
  const start = steps.filter((step) => step.stepNumber === 0);
  const motions = steps
    .filter((step) => step.stepNumber !== 0)
    .slice(0, motionCount);
  return {
    ...sequence,
    isCircular: false,
    steps: [...start, ...motions],
  } as unknown as SequenceData;
}

function angles(state: PanelStateDouble): number[] {
  return [
    state.leftPropState.centerPathAngle,
    state.leftPropState.staffRotationAngle,
    state.rightPropState.centerPathAngle,
    state.rightPropState.staffRotationAngle,
  ];
}

function sameAngles(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) < 1e-9);
}

/**
 * Drive the transport animation to completion and return the wall time it took.
 * The controller writes the target EXACTLY on its final frame, so exact
 * equality is the settle condition — stopping at "close enough" would measure
 * the interpolation, not the landing.
 */
function runUntilSettled(rig: Rig, target: number, maxFrames = 2000): number {
  const started = rig.clock.now();
  for (let i = 0; i < maxFrames; i++) {
    if (rig.state.currentStep === target) break;
    rig.clock.runFrames(1, FRAME_MS);
  }
  return rig.clock.now() - started;
}

describe("animation clock — seek endpoints", () => {
  it("keeps the final beat's interior reachable by scrubbing a one-beat sequence", () => {
    const sequence = takeSteps(canonicalSeamlessSequence("rotated", 0), 1);
    const rig = (activeRig = buildRig(sequence));
    expect(rig.state.totalSteps).toBe(1);

    rig.controller.seekToStep(1);
    const atStart = angles(rig.state);
    rig.controller.seekToStep(1.5);
    const atMiddle = angles(rig.state);
    rig.controller.seekToStep(2);
    const atEnd = angles(rig.state);

    expect(sameAngles(atStart, atMiddle)).toBe(false);
    expect(sameAngles(atMiddle, atEnd)).toBe(false);
  });

  it("clamps seekToStep to the end-hold beat and jumpToStep one beat lower", () => {
    const sequence = canonicalFreeformSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));
    const total = rig.state.totalSteps;

    rig.controller.seekToStep(total + 50);
    expect(rig.state.currentStep).toBe(total + 1);

    // MEASURED ASYMMETRY: jumpToStep clamps to totalSteps, seekToStep to
    // totalSteps + 1. The two entry points disagree about where the timeline
    // ends, so the same "go to the end" intent lands a whole beat apart.
    rig.controller.jumpToStep(total + 50);
    expect(rig.state.currentStep).toBe(total);

    rig.controller.seekToStep(-5);
    expect(rig.state.currentStep).toBe(0);
    rig.controller.jumpToStep(-5);
    expect(rig.state.currentStep).toBe(0);
  });

  it("syncs the playback clock to the seek target, so play resumes from there", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0); // unit durations
    const rig = (activeRig = buildRig(sequence));

    // Fractional targets, so seekToStep honours them verbatim rather than
    // carrying the previous fraction over (covered by the next test).
    for (const target of [0.5, 2.25, 4.125, 6.75]) {
      rig.controller.seekToStep(target);
      expect(rig.state.currentStep).toBeCloseTo(target, 10);

      rig.controller.togglePlayback();
      rig.clock.runFrames(1, FRAME_MS); // seeds the loop clock, no advance
      rig.clock.runFrames(6, FRAME_MS); // 6 frames = 0.1s = 0.1 beats
      const advanced = rig.state.currentStep - target;
      expect(advanced).toBeCloseTo((6 * FRAME_MS) / 1000, 9);
      rig.controller.togglePlayback();
    }
  });

  it("holds the fraction when seeking to an integer beat and honours an explicit fraction", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    rig.controller.seekToStep(2.4); // explicit fractional scrub
    expect(rig.state.currentStep).toBeCloseTo(2.4, 10);

    rig.controller.seekToStep(5); // integer target keeps the 0.4 offset
    expect(rig.state.currentStep).toBeCloseTo(5.4, 10);

    rig.controller.seekToStep(3.1); // explicit fraction replaces it
    expect(rig.state.currentStep).toBeCloseTo(3.1, 10);
  });
});

describe("animation clock — backward stepping", () => {
  it("returns to the exact origin after N steps forward and N back", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    for (let target = 1; target <= 4; target++) {
      rig.controller.stepFullBeatForward();
      runUntilSettled(rig, target);
      expect(rig.state.currentStep).toBe(target);
    }
    for (let target = 3; target >= 0; target--) {
      rig.controller.stepFullBeatBackward();
      runUntilSettled(rig, target);
      expect(rig.state.currentStep).toBe(target);
    }
    expect(rig.state.currentStep).toBe(0);
  });

  it("returns to the exact origin after half-beat steps forward and back", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    const forward = [0.5, 1, 1.5, 2, 2.5, 3];
    for (const target of forward) {
      rig.controller.stepHalfBeatForward();
      runUntilSettled(rig, target);
      expect(rig.state.currentStep).toBe(target);
    }
    const backward = [2.5, 2, 1.5, 1, 0.5, 0];
    for (const target of backward) {
      rig.controller.stepHalfBeatBackward();
      runUntilSettled(rig, target);
      expect(rig.state.currentStep).toBe(target);
    }
  });

  it("refuses to step past either end of the timeline", () => {
    const sequence = takeSteps(canonicalSeamlessSequence("rotated", 0), 2);
    const rig = (activeRig = buildRig(sequence));

    rig.controller.seekToStep(0);
    rig.controller.stepFullBeatBackward();
    rig.clock.runFrames(80, FRAME_MS);
    expect(rig.state.currentStep).toBe(0);

    const end = rig.state.totalSteps + 1; // 3
    rig.controller.seekToStep(end);
    rig.controller.stepFullBeatForward();
    rig.clock.runFrames(80, FRAME_MS);
    expect(rig.state.currentStep).toBe(end);
  });

  it("MEASURED DEFECT: a paused position just under a beat line skips the next beat", () => {
    // Three different tolerances live around one beat line: the transport's
    // tie-break epsilon (0.001), animateToStep's "already at target" epsilon
    // (0.01), and displayedBeatNumber's dwell epsilon (0.01). Inside the
    // 0.001-wide band below an integer the display still reads beat k-1 in
    // progress, but "next beat" resolves to k+1 and beat k is never shown.
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    const paused = 3 - 0.0005; // 0.5ms before the beat line at 60 BPM
    expect(displayedBeatNumber(paused, false)).toBe(2);

    rig.controller.seekToStep(paused);
    rig.controller.stepFullBeatForward();
    runUntilSettled(rig, 4);
    expect(rig.state.currentStep).toBe(4); // beat 3's motion was skipped
  });

  it("MEASURED DEFECT: next-beat is a dead button in the 0.01 band below a beat line", () => {
    // Between the two epsilons — currentStep in [k - 0.01, k - 0.001] — the
    // transport resolves the target to k and animateToStep then swallows it as
    // "already at target". The pose jumps to beat k's opening pose but
    // currentStep never moves, so the step readout is stuck and pressing the
    // button again changes nothing.
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    const paused = 3 - 0.002;
    rig.controller.seekToStep(paused);
    const poseBefore = angles(rig.state);

    rig.controller.stepFullBeatForward();
    rig.clock.runFrames(90, FRAME_MS); // well past a full 1000ms step
    expect(rig.state.currentStep).toBeCloseTo(paused, 10); // never advanced
    expect(sameAngles(angles(rig.state), poseBefore)).toBe(false); // pose did move

    // Pressing again is still a no-op: the playhead is stuck until some other
    // control moves it.
    rig.controller.stepFullBeatForward();
    rig.clock.runFrames(90, FRAME_MS);
    expect(rig.state.currentStep).toBeCloseTo(paused, 10);

    // Outside both bands the transport advances normally.
    rig.controller.seekToStep(3 - 0.05);
    rig.controller.stepFullBeatForward();
    runUntilSettled(rig, 3);
    expect(rig.state.currentStep).toBe(3);
  });
});

describe("animation clock — transport vs. clock duration handling", () => {
  it("MEASURED DEFECT: stepping a stretched beat takes the same wall time as a 1-beat one", () => {
    // Continuous playback honours per-step durations; the step transport does
    // not — its animation length is speed x stepSize only. The same sequence
    // therefore has a different rhythm in step mode than in continuous mode.
    const sequence = withStepDurations(
      canonicalSeamlessSequence("rotated", 0),
      [1, 4, 1, 1, 1, 1, 1, 1]
    );
    const rig = (activeRig = buildRig(sequence));

    // Position [1,2) is the 1-beat step; position [2,3) is the 4-beat step.
    rig.controller.stepFullBeatForward(); // 0 -> 1 (start hold)
    runUntilSettled(rig, 1);
    rig.controller.stepFullBeatForward(); // 1 -> 2, across the 1-beat step
    const plainMs = runUntilSettled(rig, 2);
    rig.controller.stepFullBeatForward(); // 2 -> 3, across the 4-beat step
    const stretchedMs = runUntilSettled(rig, 3);

    expect(plainMs).toBeCloseTo(stretchedMs, 6);
    expect(stretchedMs).toBeLessThan(1100);

    // The clock's own view of the same two traversals differs by 4x.
    const t1 = rig.orchestrator.getTimePositionForBeat(1);
    const t2 = rig.orchestrator.getTimePositionForBeat(2);
    const t3 = rig.orchestrator.getTimePositionForBeat(3);
    expect(t2 - t1).toBe(1);
    expect(t3 - t2).toBe(4);
  });
});

describe("animation clock — discontinuities", () => {
  it("MEASURED DEFECT: editing the sequence while paused snaps the pose to the start", () => {
    // updateSequenceData re-initialises the orchestrator (which resets the prop
    // states to the opening pose) and only re-derives the pose on the
    // "was playing" branch. Paused, currentStep keeps pointing at the old beat
    // while the props jump back to beat zero.
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    rig.controller.jumpToStep(0);
    const startPose = angles(rig.state);

    rig.controller.seekToStep(4.5);
    const midPose = angles(rig.state);
    expect(sameAngles(startPose, midPose)).toBe(false);

    // Same sequence, one field touched — the shape the viewer re-hydration path
    // hands to updateSequenceData when content changes under a stable id.
    rig.controller.updateSequenceData({
      ...sequence,
      name: `${sequence.name}-edited`,
    } as SequenceData);

    expect(rig.state.currentStep).toBeCloseTo(4.5, 10); // UI still says 4.5...
    expect(sameAngles(angles(rig.state), startPose)).toBe(true); // ...pose is at 0
  });

  it("keeps pose and playhead together when the sequence is edited during playback", () => {
    // Contrast with the paused case above: the "was playing" branch re-derives
    // the pose from the clock, so the same edit leaves the props where the
    // playhead actually is.
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    rig.controller.jumpToStep(0);
    const startPose = angles(rig.state);

    rig.controller.seekToStep(4.5);
    rig.controller.togglePlayback();
    rig.clock.runFrames(3, FRAME_MS);
    const playingPose = angles(rig.state);
    const playingStep = rig.state.currentStep;
    expect(sameAngles(playingPose, startPose)).toBe(false);

    rig.controller.updateSequenceData({
      ...sequence,
      name: `${sequence.name}-edited`,
    } as SequenceData);

    expect(rig.state.currentStep).toBeCloseTo(playingStep, 10);
    expect(sameAngles(angles(rig.state), playingPose)).toBe(true);
    expect(sameAngles(angles(rig.state), startPose)).toBe(false);
  });

  it("MEASURED DEFECT: seeking back to the start leaves the old pose when beat 1 is blank", () => {
    // calculateState/calculateStateDurationAware read the start pose off
    // steps[0]; the export sampler and the initialiser read it off the first
    // step WITH visible motion. When beat 1 is an invisible placeholder (a
    // blank beat in an in-progress sequence) the live path updates nothing, so
    // the props keep whatever pose the previous seek left behind.
    const base = canonicalSeamlessSequence("rotated", 0);
    const steps = base.steps as unknown as StepData[];
    const blanked = steps.map((step) =>
      step.stepNumber === 1
        ? {
            ...step,
            motions: {
              left: createPlaceholderMotion(HandSide.LEFT),
              right: createPlaceholderMotion(HandSide.RIGHT),
            },
          }
        : step
    );
    const sequence = {
      ...base,
      steps: blanked,
    } as unknown as SequenceData;
    const rig = (activeRig = buildRig(sequence));

    rig.controller.seekToStep(4.5);
    const midPose = angles(rig.state);

    rig.controller.seekToStep(0);
    expect(sameAngles(angles(rig.state), midPose)).toBe(true); // no reset

    // The pure sampler used by the export renderer does resolve a start pose
    // here, so the two paths disagree about what "the start" looks like.
    const sampled: { left: PropState; right: PropState } =
      rig.controller.samplePropStateAt(0);
    const sampledAngles = [
      sampled.left.centerPathAngle,
      sampled.left.staffRotationAngle,
      sampled.right.centerPathAngle,
      sampled.right.staffRotationAngle,
    ];
    expect(sameAngles(sampledAngles, midPose)).toBe(false);
  });

  it("resets cleanly to the opening pose on stop()", () => {
    const sequence = canonicalSeamlessSequence("rotated", 0);
    const rig = (activeRig = buildRig(sequence));

    rig.controller.jumpToStep(0);
    const startPose = angles(rig.state);

    rig.controller.seekToStep(5.25);
    rig.controller.togglePlayback();
    rig.clock.runFrames(10, FRAME_MS);
    rig.controller.stop();

    expect(rig.state.currentStep).toBe(0);
    expect(rig.state.isPlaying).toBe(false);
    expect(sameAngles(angles(rig.state), startPose)).toBe(true);
  });
});
