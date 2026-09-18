// tests/generation/prop-relationship-retry.test.ts
/**
 * build()'s retry around a prop relationship, exercised with a mocked
 * buildOnce so each case controls exactly what the search "found" without
 * running the real pipeline: one call when the first attempt already holds,
 * two calls on a miss, a graceful fallback when the second attempt throws,
 * and the first attempt winning an exact tie.
 */
import { describe, expect, it, vi } from "vitest";
import { SequenceBuilder } from "../../src/generation/index.js";
import type { BuildResult } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PropRelationshipMotion } from "../../src/generation/prop-relationship.js";

function motion(
  overrides: Partial<PropRelationshipMotion> = {}
): PropRelationshipMotion {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    ...overrides,
  };
}

// Start placement; reportPropRelationship skips index 0.
const start = { motions: { left: motion(), right: motion() } };
// Both hands in, cw, same bearing throughout: Together Same holds.
const holdStep = { motions: { left: motion(), right: motion() } };
// Left flipped to out: Split Same, a miss against a Together Same request.
const missStep = {
  motions: {
    left: motion({ startOrientation: "out", endOrientation: "out" }),
    right: motion(),
  },
};

function fakeResult(
  sequence: unknown[],
  marker: number,
  satisfied = true
): BuildResult {
  return {
    sequence: sequence as BuildResult["sequence"],
    startPlacement: sequence[0] as BuildResult["startPlacement"],
    bridgeStepIndices: [],
    constraintReport: { score: 1, satisfied, details: [] },
    metrics: { statesExplored: marker, beamPrunings: 0 },
    turnAllocation: { left: [], right: [] },
  };
}

function buildOptions() {
  return {
    word: "A",
    gridMode: "diamond",
    level: 2,
    constraintOptions: {
      propRelationship: { direction: "same" as const, timing: "tog" as const },
    },
  };
}

describe("build() retry around a prop relationship", () => {
  it("calls buildOnce once when the first attempt already holds", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      .mockReturnValueOnce(fakeResult([start, holdStep], 1));

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.metrics.statesExplored).toBe(1);
  });

  it("calls buildOnce twice on a miss and keeps the better attempt", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      .mockReturnValueOnce(fakeResult([start, missStep], 1))
      .mockReturnValueOnce(fakeResult([start, holdStep], 2));

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.metrics.statesExplored).toBe(2);
    expect(result.constraintReport.satisfied).toBe(true);
  });

  it("returns the first result when the second attempt throws", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      .mockReturnValueOnce(fakeResult([start, missStep], 1))
      .mockImplementationOnce(() => {
        throw new Error("dead end");
      });

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.metrics.statesExplored).toBe(1);
  });

  it("keeps the first result on an exact tie", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      .mockReturnValueOnce(fakeResult([start, missStep], 1))
      .mockReturnValueOnce(fakeResult([start, missStep], 2));

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.metrics.statesExplored).toBe(1);
  });

  it("returns the first attempt when only its raw report is satisfied, even with a lower prop score", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      // Prop score 0.5 (1 hold, 1 miss), raw report satisfied.
      .mockReturnValueOnce(fakeResult([start, holdStep, missStep], 1, true))
      // Prop score 1.0 (both hold), raw report unsatisfied: another hard
      // constraint failed on this attempt.
      .mockReturnValueOnce(fakeResult([start, holdStep, holdStep], 2, false));

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.metrics.statesExplored).toBe(1);
  });

  it("returns the second attempt when only its raw report is satisfied, even with a lower prop score", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      // Prop score 0.5 (1 hold, 1 miss), raw report unsatisfied: another
      // hard constraint failed on this attempt.
      .mockReturnValueOnce(fakeResult([start, holdStep, missStep], 1, false))
      // Prop score 0.25 (1 hold, 3 misses), raw report satisfied.
      .mockReturnValueOnce(
        fakeResult([start, holdStep, missStep, missStep, missStep], 2, true)
      );

    const result = builder.build(buildOptions());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.metrics.statesExplored).toBe(2);
  });

  it("skips the retry when a timing and both start orientations are pinned", () => {
    const builder = new SequenceBuilder({} as IVariationProvider);
    const spy = vi
      .spyOn(builder as never, "buildOnce")
      .mockReturnValueOnce(fakeResult([start, missStep], 1));

    const result = builder.build({
      ...buildOptions(),
      leftStartOrientation: "in",
      rightStartOrientation: "in",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.metrics.statesExplored).toBe(1);
  });
});
