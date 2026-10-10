import { describe, expect, it } from "vitest";
import { buildMotionDatabase } from "#lib/features/stage/locomotion/motion-matching/feature-extractor.js";
import { FEATURE_STRIDE, DEFAULT_WEIGHTS, type PoseSample } from "#lib/features/stage/locomotion/motion-matching/feature-types.js";

// A stationary clip: feet fixed relative to hips, no root translation or turn.
function stationarySampler(_clipId: string, _time: number): PoseSample {
  return {
    leftFoot: [-0.1, 0, 0],
    rightFoot: [0.1, 0, 0],
    leftThigh: [-0.08, 0.8, 0],
    rightThigh: [0.08, 0.8, 0],
    hips: [0, 1, 0],
    facing: 0,
    rootXZ: [0, 0],
  };
}

describe("buildMotionDatabase", () => {
  it("produces frameCount * stride features and a matching frame index", () => {
    const db = buildMotionDatabase(
      [{ clipId: "idle", durationSec: 1.0 }],
      stationarySampler,
      30,
      DEFAULT_WEIGHTS,
    );
    expect(db.features.length).toBe(db.frames.length * FEATURE_STRIDE);
    expect(db.columnWeights.length).toBe(FEATURE_STRIDE);
    expect(db.frames.length).toBeGreaterThan(0);
    expect(db.frames[0]?.quality).toEqual({
      legOrderMargin: 0.2,
      footSeparation: 0.2,
    });
  });

  it("yields ~zero velocities and ~zero trajectory deltas for a stationary clip", () => {
    const db = buildMotionDatabase(
      [{ clipId: "idle", durationSec: 1.5 }],
      stationarySampler,
      30,
      DEFAULT_WEIGHTS,
    );
    for (let c = 6; c < FEATURE_STRIDE; c++) {
      expect(Math.abs(db.features[c])).toBeLessThan(1e-4);
    }
    expect(db.features[0]).toBeCloseTo(-0.1, 4);
    expect(db.features[3]).toBeCloseTo(0.1, 4);
  });
});
