/**
 * Audit: elapsed time -> step position mapping, on the REAL orchestrator.
 *
 * The invariants below are derived from the timeline definition, not copied
 * from the implementation:
 *
 *   timeline = [0, D0)  start hold, D0 = startPositionDuration
 *             then step k (0-based) occupies [D0 + P_k, D0 + P_k + d_k)
 *             where P_k = sum of d_0..d_{k-1} computed HERE, in the test.
 *
 *   position(t) is defined so that step k spans exactly one unit of position
 *   space, [k+1, k+2), regardless of d_k. So:
 *     - position is non-decreasing in t,
 *     - position(D0 + P_k) === k + 1 exactly,
 *     - d position / d t === 1 / d_k inside step k,
 *     - time(position(t)) === t (round trip).
 *
 * Sequences are canonical generator output (tests/fixtures/loop-audit).
 */

import { describe, it, expect } from "vitest";
import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
import {
  canonicalFreeformSequence,
  canonicalSeamlessSequence,
  motionDurations,
  motionDurationTotal,
  withStepDurations,
} from "./support/clock-harness";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function orchestratorFor(sequence: SequenceData): SequenceAnimationOrchestrator {
  const orchestrator = new SequenceAnimationOrchestrator(
    new AnimationStateManager()
  );
  expect(orchestrator.initializeWithDomainData(sequence)).toBe(true);
  return orchestrator;
}

/** Prefix sums computed independently of the production helpers. */
function prefixSums(durations: readonly number[]): number[] {
  const prefixes: number[] = [0];
  for (const duration of durations) {
    prefixes.push(prefixes[prefixes.length - 1]! + duration);
  }
  return prefixes;
}

const UNIFORM = canonicalSeamlessSequence("rotated", 0);
const FRACTIONAL = withStepDurations(canonicalSeamlessSequence("mirrored", 0), [
  1, 2, 1.5, 1.25, 3, 1.1, 2.5, 1.75,
]);

describe("animation clock — elapsed time to step position", () => {
  it("reports a total duration of one start hold plus the summed step durations", () => {
    for (const sequence of [UNIFORM, FRACTIONAL]) {
      const orchestrator = orchestratorFor(sequence);
      const expected =
        orchestrator.getStartPositionDuration() + motionDurationTotal(sequence);
      expect(orchestrator.getTotalDurationWithStartPosition()).toBeCloseTo(
        expected,
        10
      );
    }
  });

  it("lands exactly on beat k+1 at the independently computed start time of step k", () => {
    const orchestrator = orchestratorFor(FRACTIONAL);
    const startHold = orchestrator.getStartPositionDuration();
    const durations = motionDurations(FRACTIONAL);
    const prefixes = prefixSums(durations);

    for (let k = 0; k < durations.length; k++) {
      const time = startHold + prefixes[k]!;
      expect(orchestrator.calculateStateDurationAware(time)).toBeCloseTo(
        k + 1,
        10
      );
    }
  });

  it("advances position at 1/duration per time unit inside every step", () => {
    const orchestrator = orchestratorFor(FRACTIONAL);
    const startHold = orchestrator.getStartPositionDuration();
    const durations = motionDurations(FRACTIONAL);
    const prefixes = prefixSums(durations);

    for (let k = 0; k < durations.length; k++) {
      const d = durations[k]!;
      const t0 = startHold + prefixes[k]! + d * 0.25;
      const t1 = startHold + prefixes[k]! + d * 0.75;
      const p0 = orchestrator.calculateStateDurationAware(t0);
      const p1 = orchestrator.calculateStateDurationAware(t1);
      expect((p1 - p0) / (t1 - t0)).toBeCloseTo(1 / d, 9);
      // ...and the fraction inside the step is progress through THAT step.
      expect(p0 - (k + 1)).toBeCloseTo(0.25, 9);
      expect(p1 - (k + 1)).toBeCloseTo(0.75, 9);
    }
  });

  it("is non-decreasing across the whole timeline at 1ms resolution", () => {
    for (const sequence of [UNIFORM, FRACTIONAL]) {
      const orchestrator = orchestratorFor(sequence);
      const total = orchestrator.getTotalDurationWithStartPosition();
      let previous = -Infinity;
      let worstRegression = 0;
      for (let t = 0; t <= total + 1e-9; t += 0.001) {
        const position = orchestrator.calculateStateDurationAware(t);
        worstRegression = Math.min(worstRegression, position - previous);
        previous = position;
      }
      expect(worstRegression).toBeGreaterThanOrEqual(0);
    }
  });

  it("round-trips time -> position -> time within 1e-9 across the timeline", () => {
    for (const sequence of [UNIFORM, FRACTIONAL]) {
      const orchestrator = orchestratorFor(sequence);
      const total = orchestrator.getTotalDurationWithStartPosition();
      let worst = 0;
      for (let t = 0; t <= total + 1e-9; t += 0.0137) {
        const position = orchestrator.calculateStateDurationAware(t);
        const back = orchestrator.getTimePositionForBeat(position);
        worst = Math.max(worst, Math.abs(back - t));
      }
      expect(worst).toBeLessThan(1e-9);
    }
  });

  it("round-trips position -> time -> position within 1e-9 across the scrub range", () => {
    const orchestrator = orchestratorFor(FRACTIONAL);
    const totalSteps = orchestrator.getTotalBeats();
    let worst = 0;
    for (let p = 0; p <= totalSteps + 1e-9; p += 0.0137) {
      const time = orchestrator.getTimePositionForBeat(p);
      const back = orchestrator.calculateStateDurationAware(time);
      worst = Math.max(worst, Math.abs(back - p));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("holds the last pose for the freeform end hold instead of advancing position", () => {
    // The freeform timeline adds one beat of end hold after the final motion.
    // Time keeps running there; position must stay pinned at totalSteps + 1.
    const freeform = canonicalFreeformSequence("rotated", 0);
    const orchestrator = orchestratorFor(freeform);
    const endOfMotion = orchestrator.getTotalDurationWithStartPosition();
    const totalSteps = orchestrator.getTotalBeats();

    expect(orchestrator.calculateStateDurationAware(endOfMotion)).toBeCloseTo(
      totalSteps + 1,
      10
    );
    for (const extra of [0.25, 0.5, 0.99, 1.0]) {
      expect(
        orchestrator.calculateStateDurationAware(endOfMotion + extra)
      ).toBeCloseTo(totalSteps + 1, 10);
    }
  });

  it("keeps the start hold one beat wide and linear in time", () => {
    const orchestrator = orchestratorFor(FRACTIONAL);
    const startHold = orchestrator.getStartPositionDuration();
    expect(startHold).toBe(1);
    for (const fraction of [0, 0.25, 0.5, 0.9999]) {
      expect(
        orchestrator.calculateStateDurationAware(fraction * startHold)
      ).toBeCloseTo(fraction, 10);
    }
  });

  it("samples the same pose from the seek path and the duration-aware path", () => {
    // calculateState(position) drives seeks, step buttons and the export
    // renderer; calculateStateDurationAware(time) drives continuous playback.
    // At equal positions they must agree, or scrubbing and playing the same
    // instant show different props.
    const orchestrator = orchestratorFor(FRACTIONAL);
    const total = orchestrator.getTotalDurationWithStartPosition();
    let worstAngleDelta = 0;

    for (let t = 0; t <= total; t += 0.0137) {
      const position = orchestrator.calculateStateDurationAware(t);
      const viaTime = orchestrator.getCurrentPropStates();
      orchestrator.calculateState(position);
      const viaPosition = orchestrator.getCurrentPropStates();
      for (const hand of ["left", "right"] as const) {
        worstAngleDelta = Math.max(
          worstAngleDelta,
          Math.abs(
            viaTime[hand].centerPathAngle - viaPosition[hand].centerPathAngle
          ),
          Math.abs(
            viaTime[hand].staffRotationAngle -
              viaPosition[hand].staffRotationAngle
          )
        );
      }
    }

    expect(worstAngleDelta).toBeLessThan(1e-9);
  });
});
