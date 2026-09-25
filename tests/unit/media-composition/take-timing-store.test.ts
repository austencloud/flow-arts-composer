import { beforeEach, describe, expect, it } from "vitest";
import {
  catalogTakeKey,
  loadTakeTiming,
  localTakeKey,
  openTakeTiming,
  saveTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";
import {
  resolveTakeTiming,
  takePositionAt,
} from "$lib/shared/media-composition/domain/take-timing";

const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
const FILE = { name: "DCK.mp4", size: 1234, lastModified: 99 };

beforeEach(() => {
  localStorage.clear();
});

describe("take timing store", () => {
  it("round-trips a take's timing", () => {
    const takeKey = localTakeKey(FILE);
    const opened = openTakeTiming({
      sequenceId: "dck",
      takeKey,
      durationSeconds: 30,
      movesPerPass: 8,
      now: 1,
    });
    expect(opened.sections[0]!.taps).toEqual([]);
    const tapped = {
      ...opened,
      sections: [{ ...opened.sections[0]!, taps: [1, 2, 3] }],
    };
    saveTakeTiming(tapped);
    expect(loadTakeTiming("dck", takeKey)).toEqual(tapped);
    expect(loadTakeTiming("other", takeKey)).toBeNull();
  });

  it("ignores a corrupted entry", () => {
    const takeKey = catalogTakeKey("v1");
    localStorage.setItem(`tka:post-studio:take-timing:v1:dck:${takeKey}`, "{");
    expect(loadTakeTiming("dck", takeKey)).toBeNull();
  });

  it("opens a take mapped with the old step-map editor where it was", () => {
    const marks = [0.8, 1.5, 2.2, 2.9, 3.6, 4.3, 5.0, 5.7];
    localStorage.setItem(
      "tka:post-studio-local-step-map:dck:DCK.mp4:1234:99",
      JSON.stringify({
        beatTimestamps: marks,
        endTimestamp: 6.4,
        stepCount: 8,
        source: "manual",
        updatedAt: 5,
      })
    );
    const timing = openTakeTiming({
      sequenceId: "dck",
      takeKey: localTakeKey(FILE),
      durationSeconds: 30,
      movesPerPass: 8,
      now: 1,
    });
    const resolved = resolveTakeTiming(timing, EIGHT);
    expect(takePositionAt(resolved, 0.8)).toBeCloseTo(0, 6);
    expect(takePositionAt(resolved, 6.4)).toBeCloseTo(8, 6);
    // Saved in the new store so the next open skips the migration.
    expect(loadTakeTiming("dck", localTakeKey(FILE))).toEqual(timing);
  });

  it("opens a take aligned by BPM and beat 1 on that grid", () => {
    const key = "dck:catalog:v1";
    localStorage.setItem(
      `tka:post-studio-bpm-alignment:${key}`,
      JSON.stringify({ key, bpm: 87, firstBeatSeconds: 2 })
    );
    const timing = openTakeTiming({
      sequenceId: "dck",
      takeKey: catalogTakeKey("v1"),
      durationSeconds: 30,
      movesPerPass: 8,
      now: 1,
    });
    expect(timing.sections[0]).toMatchObject({
      bpm: 87,
      tempo: "locked",
      taps: [],
      beatOneSeconds: 2,
    });
    const resolved = resolveTakeTiming(timing, EIGHT);
    expect(takePositionAt(resolved, 2)).toBeCloseTo(1, 6);
    expect(takePositionAt(resolved, 2 + (60 / 87) * 4)).toBeCloseTo(5, 6);
    // No taps, so the typed tempo runs on to the end of the take.
    expect(takePositionAt(resolved, 2 + (60 / 87) * 30)).toBeCloseTo(31, 6);
  });
});
