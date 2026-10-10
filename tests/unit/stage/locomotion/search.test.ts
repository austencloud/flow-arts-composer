import { describe, expect, it } from "vitest";
import { searchNearest } from "#lib/features/stage/locomotion/motion-matching/search.js";
import { FEATURE_STRIDE, type MotionDatabase } from "#lib/features/stage/locomotion/motion-matching/feature-types.js";

function dbOf(rows: number[][]): MotionDatabase {
  const features = new Float32Array(rows.length * FEATURE_STRIDE);
  rows.forEach((r, i) => features.set(r, i * FEATURE_STRIDE));
  return {
    features,
    frames: rows.map((_, i) => ({ clipId: "c", time: i })),
    columnWeights: new Float32Array(FEATURE_STRIDE).fill(1),
  };
}

describe("searchNearest", () => {
  it("returns the index of the exact-matching row", () => {
    const a = new Array(FEATURE_STRIDE).fill(0);
    const b = new Array(FEATURE_STRIDE).fill(0); b[0] = 5;
    const c = new Array(FEATURE_STRIDE).fill(0); c[0] = 10;
    const db = dbOf([a, b, c]);
    const query = new Float32Array(FEATURE_STRIDE); query[0] = 5.2;
    expect(searchNearest(db, query)).toBe(1);
  });

  it("respects column weights (a heavily-weighted column dominates)", () => {
    const a = new Array(FEATURE_STRIDE).fill(0); a[21] = 0;
    const b = new Array(FEATURE_STRIDE).fill(0); b[21] = 1;
    const db = dbOf([a, b]);
    db.columnWeights[21] = 100;
    const query = new Float32Array(FEATURE_STRIDE); query[21] = 0.9;
    expect(searchNearest(db, query)).toBe(1);
  });

  it("rejects a closer candidate whose legs cross", () => {
    const crossed = new Array(FEATURE_STRIDE).fill(0);
    const clear = new Array(FEATURE_STRIDE).fill(0);
    clear[0] = 0.2;
    const db = dbOf([crossed, clear]);
    db.frames[0]!.quality = { legOrderMargin: -0.04, footSeparation: 0.04 };
    db.frames[1]!.quality = { legOrderMargin: 0.12, footSeparation: 0.12 };

    expect(searchNearest(db, new Float32Array(FEATURE_STRIDE))).toBe(0);
    expect(
      searchNearest(db, new Float32Array(FEATURE_STRIDE), {
        minimumLegOrderMargin: 0,
      })
    ).toBe(1);
  });

  it("limits candidates to the maneuver family selected by intent", () => {
    const pivot = new Array(FEATURE_STRIDE).fill(0);
    const shuffle = new Array(FEATURE_STRIDE).fill(0);
    shuffle[0] = 0.1;
    const db = dbOf([pivot, shuffle]);
    db.frames[0]!.clipId = "turn-right";
    db.frames[1]!.clipId = "shuffle-right";

    expect(
      searchNearest(db, new Float32Array(FEATURE_STRIDE), {
        allowedClipIds: ["shuffle-right"],
      })
    ).toBe(1);
  });
});
