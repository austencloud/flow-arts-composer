import { describe, expect, it, vi } from "vitest";
import {
  resolveGhostAngleQuantization,
  resolveGhostHistoryCapacity,
  resolveGhostLifetimeSeconds,
  resolveGhostPositionQuantization,
} from "#lib/shared/effects/domain/ghost-parameters.js";
import {
  GhostPoseHistory,
  selectGhostAgeStratifiedSamples,
  shouldResetGhostHistoryAtStepBoundary,
  type GhostPoseSample,
} from "#lib/shared/effects/renderers/ghost-pose-history.js";

describe("GhostPoseHistory", () => {
  it("refreshes a revisited pose instead of duplicating it", () => {
    const history = new GhostPoseHistory<{ pose: number }>();
    const createSecond = vi.fn(() => ({ pose: 2 }));
    history.setEpoch("sequence-a");
    history.capture("same-pose", () => ({ pose: 1 }));
    history.advance(0.5);
    history.capture("same-pose", createSecond);

    expect(history.size).toBe(1);
    expect(createSecond).not.toHaveBeenCalled();
    expect(history.samples()[0]).toMatchObject({
      key: "same-pose",
      snapshot: { pose: 1 },
      ageSeconds: 0,
    });
  });

  it("clears exposure when the epoch changes", () => {
    const history = new GhostPoseHistory<number>();
    history.setEpoch("sequence-a");
    history.capture("a", () => 1);
    history.setEpoch("sequence-b");

    expect(history.size).toBe(0);
    expect(history.now).toBe(0);
  });

  it("prunes expired poses and evicts the oldest pose at capacity", () => {
    const history = new GhostPoseHistory<number>();
    history.setEpoch("sequence-a");
    history.capture("oldest", () => 1);
    history.advance(0.1);
    history.capture("middle", () => 2);
    history.advance(0.1);
    history.capture("newest", () => 3);
    history.prune(2, 2);

    expect(history.samples().map((sample) => sample.key)).toEqual([
      "middle",
      "newest",
    ]);

    history.advance(2);
    history.prune(2, 2);
    expect(history.size).toBe(0);
  });

  it("spreads visible samples across the retained age window", () => {
    const samples: GhostPoseSample<number>[] = Array.from(
      { length: 10 },
      (_, index) => ({
        key: `pose-${index}`,
        snapshot: index,
        seenAt: index * 0.1,
        ageSeconds: 1 - index * 0.1,
      })
    );

    expect(
      selectGhostAgeStratifiedSamples(samples, 4).map((sample) => sample.key)
    ).toEqual(["pose-0", "pose-3", "pose-6", "pose-9"]);
  });

  it("keeps history across a seamless LOOP seam", () => {
    expect(
      shouldResetGhostHistoryAtStepBoundary({
        previousStep: 15.9,
        currentStep: 0.1,
        totalSteps: 16,
        seamlesslyLoopable: true,
      })
    ).toBe(false);
  });

  it("clears history for backward scrubs and non-looping resets", () => {
    expect(
      shouldResetGhostHistoryAtStepBoundary({
        previousStep: 9.4,
        currentStep: 4.2,
        totalSteps: 16,
        seamlesslyLoopable: true,
      })
    ).toBe(true);
    expect(
      shouldResetGhostHistoryAtStepBoundary({
        previousStep: 15.9,
        currentStep: 0.1,
        totalSteps: 16,
        seamlesslyLoopable: false,
      })
    ).toBe(true);
  });
});

describe("Ghost shared parameter mapping", () => {
  it("maps Persistence to the same bounded lifetime for 2D and 3D", () => {
    expect(resolveGhostLifetimeSeconds(1)).toBeCloseTo(0.38);
    expect(resolveGhostLifetimeSeconds(10)).toBeCloseTo(2);
    expect(resolveGhostLifetimeSeconds(99)).toBeCloseTo(2);
  });

  it("makes higher Density produce finer position and rotation buckets", () => {
    expect(resolveGhostPositionQuantization(0.9, 1, 0.001)).toBeLessThan(
      resolveGhostPositionQuantization(0.1, 1, 0.001)
    );
    expect(resolveGhostAngleQuantization(0.9)).toBeLessThan(
      resolveGhostAngleQuantization(0.1)
    );
  });

  it("retains more hidden samples at high Density without changing draw slots", () => {
    const lowDensityCapacity = resolveGhostHistoryCapacity(0, 10);
    const highDensityCapacity = resolveGhostHistoryCapacity(1, 10);
    const lowDensitySpan =
      lowDensityCapacity * resolveGhostAngleQuantization(0);
    const highDensitySpan =
      highDensityCapacity * resolveGhostAngleQuantization(1);

    expect(highDensityCapacity).toBeGreaterThan(lowDensityCapacity);
    expect(highDensityCapacity).toBeGreaterThanOrEqual(240);
    expect(
      Math.abs(lowDensitySpan - highDensitySpan) / lowDensitySpan
    ).toBeLessThan(0.03);
  });
});
