import { describe, expect, it } from "vitest";
import { takeRole } from "@austencloud/video-editor/core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createTakeTiming,
  resolveTakeTiming,
  takeSampleAt,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import {
  createEmptyPostProject,
  createTkaAlignment,
  tkaFrameAlignment,
} from "#lib/shared/post-studio-plugin/index.js";

const SPB = 60 / 87;

/** Two moves, the second one two beats long. */
const sequence = (extra: object = {}) =>
  ({
    steps: [{ duration: 1 }, { duration: 2 }],
    ...extra,
  }) as unknown as SequenceData;

/** A take tapped on both landings, so its clock reads a move. */
function mappedTiming(): TakeTiming {
  const base = createTakeTiming({
    sequenceId: "seq",
    takeKey: "take-a",
    durationSeconds: 20,
    now: 1,
  });
  return {
    ...base,
    sections: [
      {
        ...base.sections[0]!,
        taps: [1 + SPB, 1 + SPB * 3],
        tempo: "locked",
      },
    ],
  };
}

const project = createEmptyPostProject({ sequenceId: "seq", now: 1 });

describe("tka alignment", () => {
  it("builds the moves, the period and one clock per timed take", () => {
    const timing = mappedTiming();
    const alignment = createTkaAlignment(
      () => sequence({ period: 2 }),
      () => ({ a: timing })
    ).create(project)!;
    expect(alignment.moveBeats).toEqual([1, 2]);
    expect(alignment.sequencePeriod).toBe(2);
    expect(Object.keys(alignment.clocks ?? {})).toEqual([takeRole("a")]);
    const seconds = 1 + SPB * 2;
    const sample = alignment.clocks![takeRole("a")]!.sampleAt(seconds);
    expect(sample).not.toBeNull();
    expect(sample).toEqual(
      takeSampleAt(resolveTakeTiming(timing, [1, 2]), seconds)
    );
  });

  it("falls back to the orientation cycle count, then to one pass, and has no clocks without timings", () => {
    const legacy = createTkaAlignment(() =>
      sequence({ orientationCycleCount: 4 })
    ).create(project)!;
    expect(legacy.sequencePeriod).toBe(4);
    expect(legacy.clocks).toEqual({});
    expect(
      createTkaAlignment(() => sequence()).create(project)!.sequencePeriod
    ).toBe(1);
  });

  it("returns the six sequence fields in the layer's order", () => {
    const alignment = createTkaAlignment(
      () => sequence(),
      () => ({ a: mappedTiming() })
    ).create(project)!;
    const sample = alignment.clocks![takeRole("a")]!.sampleAt(1 + SPB * 2)!;
    const fields = alignment.frameFields(sample, alignment.moveBeats, false);
    expect(Object.keys(fields)).toEqual([
      "sequenceFrame",
      "sequencePosition",
      "sequencePassIndex",
      "carouselPosition",
      "animationTimeSeconds",
      "displayedBeatNumber",
    ]);
  });

  it("converts today's alignment object field by field", () => {
    const clocks = { a: { sampleAt: () => null } };
    const explainHandoff = () => {};
    const timeMap = { anchors: [] } as never;
    const converted = tkaFrameAlignment({
      steps: sequence().steps,
      startPlacementDuration: 1,
      sequencePeriod: 3,
      clocks,
      timeMap,
      mediaTimeOffsetSeconds: 0.5,
      explainHandoff,
    });
    expect(converted.moveBeats).toEqual([1, 2]);
    expect(converted.sequencePeriod).toBe(3);
    expect(converted.clocks).toBe(clocks);
    expect(converted.timeMap).toBe(timeMap);
    expect(converted.mediaTimeOffsetSeconds).toBe(0.5);
    expect(converted.explainHandoff).toBe(explainHandoff);
  });
});
