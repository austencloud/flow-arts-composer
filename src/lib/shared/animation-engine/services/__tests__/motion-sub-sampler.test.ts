import { describe, expect, it } from "vitest";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  MotionSubSampler,
  motionSubStepCount,
  pickEvenIndices,
  planMotionSubSteps,
  propPosesMatch,
  type MotionSampleSource,
} from "../motion-sub-sampler";

const TOTAL_BEATS = 4;

/** A source whose pose is a function of the step, so tests can check where a
 *  sample landed. */
function circleSource(totalBeats = TOTAL_BEATS): MotionSampleSource {
  return {
    totalBeats,
    sampleAt(step, outLeft, outRight) {
      outLeft.centerPathAngle = step;
      outLeft.staffRotationAngle = step * 2;
      outLeft.x = undefined;
      outLeft.y = undefined;
      outRight.centerPathAngle = -step;
      outRight.staffRotationAngle = -step * 2;
      outRight.x = undefined;
      outRight.y = undefined;
      return true;
    },
  };
}

function poseAt(step: number): { left: PropState; right: PropState } {
  return {
    left: { centerPathAngle: step, staffRotationAngle: step * 2 },
    right: { centerPathAngle: -step, staffRotationAngle: -step * 2 },
  };
}

describe("motionSubStepCount", () => {
  it("follows the 60 Hz cadence table", () => {
    expect(motionSubStepCount(1 / 60)).toBe(1);
    expect(motionSubStepCount(0.025)).toBe(2);
    expect(motionSubStepCount(0.1)).toBe(6);
    expect(motionSubStepCount(2)).toBe(64);
    expect(motionSubStepCount(0)).toBe(1);
    expect(motionSubStepCount(Number.NaN)).toBe(1);
  });
});

describe("planMotionSubSteps", () => {
  const out: number[] = [];

  it("spaces forward motion evenly, excluding both ends", () => {
    const n = planMotionSubSteps(1, 2, 5, TOTAL_BEATS, false, false, out);
    expect(n).toBe(4);
    expect(out.slice(0, n)).toEqual([1.2, 1.4, 1.6, 1.8]);
  });

  it("returns zero when n is 1, paused or static", () => {
    expect(planMotionSubSteps(1, 2, 1, TOTAL_BEATS, false, false, out)).toBe(0);
    expect(planMotionSubSteps(2, 2, 5, TOTAL_BEATS, false, false, out)).toBe(0);
  });

  it("returns zero for a backward scrub that is not a loop", () => {
    expect(planMotionSubSteps(2, 1.8, 5, TOTAL_BEATS, false, false, out)).toBe(
      0
    );
  });

  it("wraps a seamless loop through the end and back to one", () => {
    // 4.8 -> 5 (end) -> 1 -> 1.2 is a path of length 0.4; four samples at 0.08.
    const n = planMotionSubSteps(4.8, 1.2, 5, TOTAL_BEATS, true, true, out);
    expect(n).toBe(4);
    const steps = out.slice(0, n);
    expect(steps[0]).toBeCloseTo(4.88, 6);
    expect(steps[1]).toBeCloseTo(4.96, 6);
    expect(steps[2]).toBeCloseTo(1.04, 6);
    expect(steps[3]).toBeCloseTo(1.12, 6);
    for (const s of steps) expect(s).toBeLessThan(TOTAL_BEATS + 1);
  });

  it("clamps pre-wrap steps below the end pose", () => {
    // 4.99 -> 5 -> 1 -> 1.03: the first sample lands past 4.999 and is clamped.
    const n = planMotionSubSteps(4.99, 1.03, 3, TOTAL_BEATS, true, true, out);
    expect(n).toBe(2);
    for (const s of out.slice(0, n)) expect(s).toBeLessThan(TOTAL_BEATS + 1);
  });

  it("samples only after the wrap for a non-seamless loop", () => {
    const n = planMotionSubSteps(4.8, 1, 5, TOTAL_BEATS, false, true, out);
    expect(n).toBe(4);
    expect(out.slice(0, n)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
});

describe("propPosesMatch", () => {
  it("accepts equal poses and an angle offset by a full turn", () => {
    const a: PropState = { centerPathAngle: 1, staffRotationAngle: 0.5 };
    const b: PropState = {
      centerPathAngle: 1,
      staffRotationAngle: 0.5 + Math.PI * 2,
    };
    expect(propPosesMatch(a, b)).toBe(true);
  });

  it("compares Cartesian centers when one side carries x and y", () => {
    const polar: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };
    const cartesian: PropState = {
      centerPathAngle: 0,
      staffRotationAngle: 0,
      x: 1,
      y: 0,
    };
    expect(propPosesMatch(polar, cartesian)).toBe(true);
    expect(propPosesMatch(polar, { ...cartesian, x: 1.5 })).toBe(false);
  });

  it("rejects a shifted pose", () => {
    expect(
      propPosesMatch(
        { centerPathAngle: 1, staffRotationAngle: 0 },
        { centerPathAngle: 1.01, staffRotationAngle: 0 }
      )
    ).toBe(false);
  });
});

describe("pickEvenIndices", () => {
  const out: number[] = [];

  it("keeps everything when under the cap", () => {
    expect(pickEvenIndices(3, 15, out)).toBe(3);
    expect(out.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it("picks evenly, ending on the newest, when over the cap", () => {
    const n = pickEvenIndices(63, 15, out);
    expect(n).toBe(15);
    const picked = out.slice(0, n);
    expect(picked[0]).toBe(3);
    expect(picked[n - 1]).toBe(62);
    for (let i = 1; i < n; i++) {
      expect(picked[i]).toBeGreaterThan(picked[i - 1]!);
    }
  });

  it("returns zero for an empty list", () => {
    expect(pickEvenIndices(0, 15, out)).toBe(0);
  });
});

describe("MotionSubSampler", () => {
  it("inserts samples between the previous and current step", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.1,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 1000,
      currentTimeMs: 1100,
    });
    expect(samples.length).toBe(5);
    expect(samples[0]!.left.centerPathAngle).toBeCloseTo(1 + 1 / 6, 6);
    expect(samples[4]!.left.centerPathAngle).toBeCloseTo(1 + 5 / 6, 6);
    expect(samples[0]!.timeMs).toBeCloseTo(1000 + 100 / 6, 6);
    expect(samples[4]!.right.centerPathAngle).toBeCloseTo(-(1 + 5 / 6), 6);
    expect(sampler.stats.samplesInserted).toBe(5);
  });

  it("returns no samples when the live pose disagrees with the source", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.1,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: { centerPathAngle: 2.5, staffRotationAngle: 4 },
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 0,
      currentTimeMs: 100,
    });
    expect(samples.length).toBe(0);
    expect(sampler.stats.guardRejections).toBe(1);
  });

  it("nulls a mismatching layer while the base pair keeps sampling", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.05,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 2,
      layersAt: (step) => [
        { leftProp: poseAt(step + 1).left, rightProp: poseAt(step + 1).right },
        { leftProp: poseAt(step + 2).left, rightProp: poseAt(step + 2).right },
      ],
      liveLayers: [
        { leftProp: poseAt(3).left, rightProp: poseAt(3).right },
        { leftProp: poseAt(9).left, rightProp: null },
      ],
      previousTimeMs: 0,
      currentTimeMs: 50,
    });
    expect(samples.length).toBe(2);
    expect(samples[0]!.layers.length).toBe(2);
    expect(samples[0]!.layers[0]!.left?.centerPathAngle).toBeCloseTo(
      1 + 1 / 3 + 1,
      6
    );
    expect(samples[0]!.layers[1]!.left).toBeNull();
    expect(samples[0]!.layers[1]!.right).toBeNull();
    expect(sampler.stats.layerGuardRejections).toBe(1);
  });

  it("returns no samples while paused or at a healthy frame rate", () => {
    const sampler = new MotionSubSampler();
    const base = {
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 0,
      currentTimeMs: 16,
    };
    expect(sampler.plan({ ...base, dtSeconds: 1 / 60 }).length).toBe(0);
    expect(
      sampler.plan({ ...base, dtSeconds: 0.1, currentStep: 1 }).length
    ).toBe(0);
  });
});
