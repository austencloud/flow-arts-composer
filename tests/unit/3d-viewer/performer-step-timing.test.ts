import { describe, expect, it } from "vitest";

import {
  resolvePerformerPlaybackStep,
  resolvePerformerStepSource,
  synchronizePerformerPlayback,
} from "#lib/shared/3d/domain/performer-step-timing.js";

describe("performer step timing", () => {
  it("wraps a delayed performer through the sequence seam", () => {
    expect(resolvePerformerPlaybackStep(0.25, -1, 8)).toBeCloseTo(7.25);
    expect(resolvePerformerPlaybackStep(3.5, -2, 8)).toBeCloseTo(1.5);
  });

  it("keeps positive offsets on the same loop", () => {
    expect(resolvePerformerPlaybackStep(7.5, 1, 8)).toBeCloseTo(0.5);
  });
});

describe("resolvePerformerStepSource", () => {
  it("uses the shared clock when the host supplies nothing", () => {
    expect(resolvePerformerStepSource(null, 3.5, -2, 8)).toBeCloseTo(1.5);
    expect(resolvePerformerStepSource(undefined, 7.5, 1, 8)).toBeCloseTo(0.5);
  });

  it("uses the host's step when one is supplied", () => {
    expect(resolvePerformerStepSource(5.25, 3.5, -2, 8)).toBeCloseTo(5.25);
  });

  it("wraps the host's step into the performer's own sequence length", () => {
    expect(resolvePerformerStepSource(9.5, 0, 0, 8)).toBeCloseTo(1.5);
    expect(resolvePerformerStepSource(-0.5, 0, 0, 8)).toBeCloseTo(7.5);
  });

  it("leaves an undriven performer on the shared clock", () => {
    const hostSteps: readonly (number | null | undefined)[] = [4, undefined];
    expect(resolvePerformerStepSource(hostSteps[0], 1, 0, 8)).toBeCloseTo(4);
    expect(resolvePerformerStepSource(hostSteps[1], 1, 0, 8)).toBeCloseTo(1);
  });

  it("ignores a non-finite host step", () => {
    expect(resolvePerformerStepSource(Number.NaN, 2, 0, 8)).toBeCloseTo(2);
  });

  it("clamps at zero when the performer has no sequence", () => {
    expect(resolvePerformerStepSource(-3, 0, 0, 0)).toBe(0);
  });
});

describe("synchronizePerformerPlayback", () => {
  it("applies the same wrapped beat and fractional progress to either renderer", () => {
    const calls: Array<["step" | "progress", number]> = [];
    const performer = {
      totalSteps: 8,
      goToStep: (step: number) => calls.push(["step", step]),
      setProgress: (progress: number) => calls.push(["progress", progress]),
    };

    expect(synchronizePerformerPlayback(performer, undefined, 7.75, 1)).toBe(
      0.75
    );
    expect(calls).toEqual([
      ["step", 0],
      ["progress", 0.75],
    ]);
  });
});
