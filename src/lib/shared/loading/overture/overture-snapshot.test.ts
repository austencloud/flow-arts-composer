import { beforeEach, describe, expect, it } from "vitest";
import type {
  MandalaPaths,
  MandalaPoint,
} from "#lib/shared/mandala/domain/mandala-types.js";
import {
  OVERTURE_POINTS_PER_BEAT,
  OVERTURE_SNAPSHOT_KEY,
  compactPaths,
  readOvertureSnapshot,
  repeatingUnit,
  writeOvertureSnapshot,
} from "./overture-snapshot";
import { overturePoolSequence } from "./overture-pool-source";

/** A beat as a dense arc, 65 points like the calculator's. */
function arcBeat(from: number, to: number, r = 61.37): MandalaPoint[] {
  return Array.from({ length: 65 }, (_, i) => {
    const a = from + ((to - from) * i) / 64;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

function paths(beats: MandalaPoint[][]): MandalaPaths {
  return { left: [{ d: "", tipIndex: 0, beats }], right: [], purple: [] };
}

describe("compactPaths", () => {
  const beats = [
    arcBeat(0, Math.PI / 2),
    arcBeat(Math.PI / 2, Math.PI),
    arcBeat(Math.PI, 2 * Math.PI),
  ];
  const compact = compactPaths(paths(beats), 3)!;
  const line = compact.left[0]!;

  it("caps each beat at 24 points, sharing the joins", () => {
    expect(line).toHaveLength(3 * (OVERTURE_POINTS_PER_BEAT - 1) + 1);
  });

  it("keeps the endpoints and rounds to one decimal", () => {
    expect(line[0]).toEqual([61.4, 0]);
    expect(line[line.length - 1]![0]).toBeCloseTo(61.4, 5);
    for (const [x, y] of line) {
      expect(Math.round(x * 10) / 10).toBe(x);
      expect(Math.round(y * 10) / 10).toBe(y);
    }
  });

  it("stays on the source curve through a JSON round trip", () => {
    const back = JSON.parse(JSON.stringify(line)) as [number, number][];
    for (const [x, y] of back) {
      expect(Math.abs(Math.hypot(x, y) - 61.37)).toBeLessThan(0.1);
    }
    // Beat junctions land where the source beats meet.
    const join = back[OVERTURE_POINTS_PER_BEAT - 1]!;
    expect(Math.abs(join[0])).toBeLessThan(0.05);
    expect(join[1]).toBeCloseTo(61.4, 5);
  });

  it("refuses paths without per-beat points or with the wrong beat count", () => {
    expect(
      compactPaths(
        { left: [{ d: "M0 0", tipIndex: 0 }], right: [], purple: [] },
        1
      )
    ).toBeNull();
    expect(compactPaths(paths(beats), 4)).toBeNull();
  });
});

describe("repeatingUnit", () => {
  it("is the simplified word's length only when the letters really repeat", () => {
    expect(repeatingUnit("KECKECKECKEC", "KECKECKECKEC".split(""))).toBe(3);
    expect(repeatingUnit("ABC", ["A", "B", "C"])).toBe(3);
  });
});

describe("readOvertureSnapshot", () => {
  const good = {
    v: 1,
    word: "AB",
    letters: ["A", "B"],
    unit: 2,
    beats: 2,
    left: [
      [
        [0, 0],
        [1, 1],
      ],
    ],
    right: [],
    at: 5,
  };

  it("accepts a version-1 scene", () => {
    expect(readOvertureSnapshot(JSON.stringify(good))).toMatchObject({
      word: "AB",
      at: 5,
    });
  });

  it("rejects other versions, garbage and broken shapes", () => {
    expect(readOvertureSnapshot(JSON.stringify({ ...good, v: 2 }))).toBeNull();
    expect(readOvertureSnapshot("{not json")).toBeNull();
    expect(
      readOvertureSnapshot(JSON.stringify({ ...good, letters: ["A"] }))
    ).toBeNull();
    expect(
      readOvertureSnapshot(JSON.stringify({ ...good, unit: 3 }))
    ).toBeNull();
    expect(
      readOvertureSnapshot(JSON.stringify({ ...good, left: [[[0, "x"]]] }))
    ).toBeNull();
    expect(readOvertureSnapshot(null)).toBeNull();
  });
});

describe("writeOvertureSnapshot", () => {
  beforeEach(() => localStorage.clear());

  it("traces Create's newest saved sequence with at least four beats", () => {
    const cap = overturePoolSequence("cap:1-AA")!;
    const demo = overturePoolSequence("demo")!;
    localStorage.setItem(
      "tka-construct-sequence-state-v1",
      JSON.stringify({ timestamp: 1, currentSequence: demo })
    );
    localStorage.setItem(
      "tka-generate-sequence-state-v1",
      JSON.stringify({ timestamp: 2, currentSequence: cap })
    );
    expect(writeOvertureSnapshot()).toBe(true);
    const stored = readOvertureSnapshot(
      localStorage.getItem(OVERTURE_SNAPSHOT_KEY)
    )!;
    expect(stored.word).toBe(cap.word);
    expect(stored.beats).toBe(12);
    expect(stored.unit).toBe(3);
  });

  it("leaves the existing snapshot alone when there is nothing to trace", () => {
    localStorage.setItem(OVERTURE_SNAPSHOT_KEY, "kept");
    expect(writeOvertureSnapshot({ word: "", steps: [] })).toBe(false);
    expect(localStorage.getItem(OVERTURE_SNAPSHOT_KEY)).toBe("kept");
  });
});
