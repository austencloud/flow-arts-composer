import { describe, expect, it } from "vitest";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  SequenceTimeMapSchema,
  createBpmTimeMap,
  createTempoGridTimeMap,
  mediaTimeToSequencePosition,
  migrateLegacyStepMap,
  sequencePositionToMediaTime,
} from "$lib/shared/media-composition/domain/sequence-time-map";

const sequenceRef = {
  sequenceId: "sequence-a",
  contentHash: "sha256:sequence-a-v1",
};

function legacyStepMap(overrides: Partial<StepMap> = {}): StepMap {
  return {
    beatTimestamps: [1, 1.5, 2, 2.5],
    stepCount: 4,
    source: "manual",
    updatedAt: new Date("2026-08-13T12:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Real marks from the OmLam-XJ phone clip: a 16-step LOOP run four times
 * through, tapped by hand at every arrival. 64 marks, 16 steps.
 */
const OM_LAM_XJ_MARKS = [
  0.0, 0.86, 1.55, 2.07, 2.69, 3.4, 3.94, 4.59, 5.18, 5.76, 6.45, 7.11, 7.7,
  8.36, 8.94, 9.49, 10.17, 10.8, 11.36, 12.0, 12.61, 13.23, 14.02, 14.54, 15.17,
  15.88, 16.46, 17.09, 17.71, 18.33, 18.89, 19.49, 20.26, 20.86, 21.52, 22.15,
  22.83, 23.42, 24.05, 24.66, 25.32, 26.0, 26.61, 27.19, 27.89, 28.48, 29.07,
  29.65, 30.37, 31.04, 31.69, 32.37, 32.93, 33.64, 34.25, 34.89, 35.57, 36.21,
  36.87, 37.54, 38.21, 39.03, 39.67, 40.24,
];
const OM_LAM_XJ_END = 40.81;

describe("SequenceTimeMap", () => {
  it("aligns every repeated move landing to weighted BPM beats without stretching", () => {
    const timeMap = createBpmTimeMap({
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 6.25,
      motionDurations: [1, 2],
      bpm: 60,
      firstBeatSeconds: 1,
      updatedAt: 1,
    });

    expect(timeMap.positionConvention).toBe("arrival");
    expect(timeMap.anchors).toEqual([
      { mediaTimeSeconds: 0, sequencePosition: 0 },
      { mediaTimeSeconds: 1, sequencePosition: 1 },
      { mediaTimeSeconds: 3, sequencePosition: 2 },
      { mediaTimeSeconds: 4, sequencePosition: 3 },
      { mediaTimeSeconds: 6, sequencePosition: 4 },
      { mediaTimeSeconds: 6.25, sequencePosition: 4.25 },
    ]);
    expect(mediaTimeToSequencePosition(timeMap, 5)).toBe(3.5);
  });

  it("keeps the first beat at zero or near the start without duplicate times", () => {
    const atZero = createBpmTimeMap({
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 1,
      motionDurations: [1],
      bpm: 60,
      firstBeatSeconds: 0,
    });
    expect(atZero.anchors).toEqual([
      { mediaTimeSeconds: 0, sequencePosition: 1 },
      { mediaTimeSeconds: 1, sequencePosition: 2 },
    ]);

    const nearStart = createBpmTimeMap({
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 2,
      motionDurations: [1],
      bpm: 60,
      firstBeatSeconds: 0.25,
    });
    expect(nearStart.anchors[0]).toEqual({
      mediaTimeSeconds: 0,
      sequencePosition: 0.75,
    });
    expect(mediaTimeToSequencePosition(nearStart, 0.25)).toBe(1);
    expect(SequenceTimeMapSchema.safeParse(nearStart).success).toBe(true);
  });

  it("places an 87 BPM landing one beat after Beat 1", () => {
    const timeMap = createBpmTimeMap({
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 3,
      motionDurations: [1, 1],
      bpm: 87,
      firstBeatSeconds: 0.5,
    });
    expect(sequencePositionToMediaTime(timeMap, 2)).toBeCloseTo(
      0.5 + 60 / 87,
      10
    );
    expect(sequencePositionToMediaTime(timeMap, 3)).toBeCloseTo(
      0.5 + 120 / 87,
      10
    );
  });

  it("rejects invalid BPM alignment inputs", () => {
    const valid = {
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 2,
      motionDurations: [1],
      bpm: 87,
      firstBeatSeconds: 0.5,
    };
    expect(() => createBpmTimeMap({ ...valid, bpm: 0 })).toThrow("BPM");
    expect(() => createBpmTimeMap({ ...valid, bpm: Infinity })).toThrow("BPM");
    expect(() => createBpmTimeMap({ ...valid, firstBeatSeconds: 3 })).toThrow(
      "Beat 1"
    );
    expect(() => createBpmTimeMap({ ...valid, motionDurations: [0] })).toThrow(
      "Motion durations"
    );
  });

  it("creates a duration-aware editable tempo grid", () => {
    const timeMap = createTempoGridTimeMap({
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 8,
      startPlacementDuration: 1,
      motionDurations: [1, 2, 4],
      updatedAt: 1,
    });

    expect(timeMap.source).toBe("tempo-grid");
    expect(timeMap.confidence).toBe(0.25);
    expect(timeMap.anchors).toEqual([
      { mediaTimeSeconds: 0, sequencePosition: 0 },
      { mediaTimeSeconds: 1, sequencePosition: 1 },
      { mediaTimeSeconds: 2, sequencePosition: 2 },
      { mediaTimeSeconds: 4, sequencePosition: 3 },
      { mediaTimeSeconds: 8, sequencePosition: 4 },
    ]);
  });

  it("rejects anchors that reverse either axis", () => {
    const result = SequenceTimeMapSchema.safeParse({
      schemaVersion: 1,
      id: "map-a",
      sequenceRef,
      mediaSourceId: "video-a",
      anchors: [
        { mediaTimeSeconds: 0, sequencePosition: 0 },
        { mediaTimeSeconds: 1, sequencePosition: 2 },
        { mediaTimeSeconds: 2, sequencePosition: 1 },
      ],
      source: "manual",
      boundaryPolicy: "clamp",
      updatedAt: 1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects mutable sequence references with no revision identity", () => {
    const result = SequenceTimeMapSchema.safeParse({
      schemaVersion: 1,
      id: "map-a",
      sequenceRef: { sequenceId: "sequence-a" },
      mediaSourceId: "video-a",
      anchors: [
        { mediaTimeSeconds: 0, sequencePosition: 1 },
        { mediaTimeSeconds: 1, sequencePosition: 2 },
      ],
      source: "manual",
      boundaryPolicy: "clamp",
      updatedAt: 1,
    });

    expect(result.success).toBe(false);
  });

  it("maps both directions with fractional positions and clamps boundaries", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap(),
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 4,
    });

    // The first mark is the opening pose, so it anchors position zero. Nothing
    // is invented before it: the map simply clamps back to the pose.
    expect(timeMap.anchors).toEqual([
      { mediaTimeSeconds: 1, sequencePosition: 0 },
      { mediaTimeSeconds: 1.5, sequencePosition: 1 },
      { mediaTimeSeconds: 2, sequencePosition: 2 },
      { mediaTimeSeconds: 2.5, sequencePosition: 3 },
      { mediaTimeSeconds: 3, sequencePosition: 4 },
    ]);

    expect(mediaTimeToSequencePosition(timeMap, -10)).toBe(0);
    expect(mediaTimeToSequencePosition(timeMap, 0.5)).toBe(0);
    expect(mediaTimeToSequencePosition(timeMap, 1.25)).toBe(0.5);
    expect(mediaTimeToSequencePosition(timeMap, 2.25)).toBe(2.5);
    expect(mediaTimeToSequencePosition(timeMap, 99)).toBe(4);

    expect(sequencePositionToMediaTime(timeMap, -1)).toBe(1);
    expect(sequencePositionToMediaTime(timeMap, 1.5)).toBe(1.75);
    expect(sequencePositionToMediaTime(timeMap, 3.5)).toBe(2.75);
    expect(sequencePositionToMediaTime(timeMap, 99)).toBe(3);
  });

  it("uses the median beat interval for the inferred final-beat endpoint", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap({
        beatTimestamps: [0, 0.5, 1.5, 2],
      }),
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 12,
    });

    expect(timeMap.anchors.at(-1)).toEqual({
      mediaTimeSeconds: 2.5,
      sequencePosition: 4,
    });
    expect(mediaTimeToSequencePosition(timeMap, 10)).toBe(4);
  });

  it("preserves the old detection source without preserving its old name", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap({ source: "auto-detected" }),
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 4,
    });

    expect(timeMap.source).toBe("audio-detected");
  });

  it("refuses to guess across a part-finished pass", () => {
    expect(() =>
      migrateLegacyStepMap({
        stepMap: legacyStepMap({ beatTimestamps: [0, 0.5] }),
        sequenceRef,
        mediaSourceId: "video-a",
        mediaDurationSeconds: 4,
      })
    ).toThrow("whole number of passes");
  });

  it("prefers the marked end over an inferred one", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap({
        beatTimestamps: [0, 0.5, 1.5, 2],
        endTimestamp: 2.9,
      }),
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 12,
    });

    expect(timeMap.anchors.at(-1)).toEqual({
      mediaTimeSeconds: 2.9,
      sequencePosition: 4,
    });
  });

  it("keeps counting upward across a four-pass take", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap({
        beatTimestamps: OM_LAM_XJ_MARKS,
        endTimestamp: OM_LAM_XJ_END,
        stepCount: 16,
      }),
      sequenceRef,
      mediaSourceId: "collaborative-video:omlam-xj",
      mediaDurationSeconds: 43.667,
    });

    expect(timeMap.anchors).toHaveLength(OM_LAM_XJ_MARKS.length + 1);
    // Mark zero is the opening pose, so the 64 marks plus the closing arrival
    // describe 64 landings - four passes of sixteen.
    expect(timeMap.anchors[0]).toEqual({
      mediaTimeSeconds: 0,
      sequencePosition: 0,
    });
    expect(timeMap.anchors.at(-1)).toEqual({
      mediaTimeSeconds: OM_LAM_XJ_END,
      sequencePosition: 64,
    });
    // Pass 1 closes at 16 and pass 2 opens at 17, not back at 1: positions have
    // to increase for the schema to accept them and for the interpolator to
    // search them.
    expect(mediaTimeToSequencePosition(timeMap, OM_LAM_XJ_MARKS[16]!)).toBe(16);
    expect(mediaTimeToSequencePosition(timeMap, OM_LAM_XJ_MARKS[17]!)).toBe(17);
    expect(mediaTimeToSequencePosition(timeMap, OM_LAM_XJ_MARKS[48]!)).toBe(48);
    expect(sequencePositionToMediaTime(timeMap, 32)).toBeCloseTo(
      OM_LAM_XJ_MARKS[32]!,
      5
    );
  });

  it("rejects non-finite lookup values", () => {
    const timeMap = migrateLegacyStepMap({
      stepMap: legacyStepMap(),
      sequenceRef,
      mediaSourceId: "video-a",
      mediaDurationSeconds: 4,
    });

    expect(() => mediaTimeToSequencePosition(timeMap, Number.NaN)).toThrow(
      "finite"
    );
    expect(() => sequencePositionToMediaTime(timeMap, Infinity)).toThrow(
      "finite"
    );
  });
});
