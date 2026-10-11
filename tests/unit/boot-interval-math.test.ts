import { describe, expect, it } from "vitest";

import {
  clipIntervals,
  maxInFlight,
  mergeIntervals,
  subtractIntervals,
  summarizeIntervals,
  unionMs,
} from "#lib/shared/3d/scene-boot/boot-interval-math.js";

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 15, end: 25 },
        { start: 25, end: 30 },
      ])
    ).toEqual([{ start: 10, end: 30 }]);
  });

  it("keeps disjoint intervals apart and sorts them", () => {
    expect(
      mergeIntervals([
        { start: 40, end: 50 },
        { start: 10, end: 20 },
      ])
    ).toEqual([
      { start: 10, end: 20 },
      { start: 40, end: 50 },
    ]);
  });

  it("drops zero-length and non-finite intervals", () => {
    expect(
      mergeIntervals([
        { start: 10, end: 10 },
        { start: 20, end: 15 },
        { start: Number.NaN, end: 5 },
      ])
    ).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [
      { start: 10, end: 20 },
      { start: 15, end: 30 },
    ];
    mergeIntervals(input);
    expect(input[0]).toEqual({ start: 10, end: 20 });
  });
});

describe("unionMs", () => {
  it("counts concurrent work once", () => {
    // The whole point: 3 x 100 ms of overlapping decode is 100 ms of boot.
    expect(
      unionMs([
        { start: 0, end: 100 },
        { start: 10, end: 100 },
        { start: 20, end: 100 },
      ])
    ).toBe(100);
  });

  it("adds disjoint work", () => {
    expect(
      unionMs([
        { start: 0, end: 100 },
        { start: 200, end: 250 },
      ])
    ).toBe(150);
  });
});

describe("maxInFlight", () => {
  it("counts peak overlap", () => {
    expect(
      maxInFlight([
        { start: 0, end: 100 },
        { start: 10, end: 50 },
        { start: 20, end: 30 },
      ])
    ).toBe(3);
  });

  it("does not count a handoff as overlap", () => {
    expect(
      maxInFlight([
        { start: 0, end: 100 },
        { start: 100, end: 200 },
      ])
    ).toBe(1);
  });
});

describe("clipIntervals", () => {
  it("trims to the window and drops anything outside", () => {
    expect(
      clipIntervals(
        [
          { start: 0, end: 50 },
          { start: 40, end: 120 },
          { start: 200, end: 300 },
        ],
        30,
        100
      )
    ).toEqual([
      { start: 30, end: 50 },
      { start: 40, end: 100 },
    ]);
  });
});

describe("subtractIntervals", () => {
  it("removes an explained middle", () => {
    expect(
      subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }])
    ).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });

  it("removes several explained slices", () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 100 }],
        [
          { start: 10, end: 20 },
          { start: 50, end: 90 },
        ]
      )
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
      { start: 90, end: 100 },
    ]);
  });

  it("returns nothing when fully explained", () => {
    expect(
      subtractIntervals([{ start: 10, end: 20 }], [{ start: 0, end: 100 }])
    ).toEqual([]);
  });

  it("leaves untouched blocks alone", () => {
    expect(
      subtractIntervals([{ start: 0, end: 10 }], [{ start: 50, end: 60 }])
    ).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("summarizeIntervals", () => {
  it("reports wall time, cpu time and the concurrency between them", () => {
    const stats = summarizeIntervals([
      { start: 0, end: 100 },
      { start: 0, end: 100 },
      { start: 0, end: 100 },
    ]);
    expect(stats.count).toBe(3);
    expect(stats.wallMs).toBe(100);
    expect(stats.totalMs).toBe(300);
    expect(stats.concurrency).toBe(3);
    expect(stats.maxInFlight).toBe(3);
  });

  it("reports concurrency 1 for strictly sequential work", () => {
    const stats = summarizeIntervals([
      { start: 0, end: 100 },
      { start: 100, end: 200 },
    ]);
    expect(stats.wallMs).toBe(200);
    expect(stats.totalMs).toBe(200);
    expect(stats.concurrency).toBe(1);
    expect(stats.maxInFlight).toBe(1);
  });

  it("is empty-safe", () => {
    expect(summarizeIntervals([])).toEqual({
      count: 0,
      wallMs: 0,
      totalMs: 0,
      concurrency: 0,
      maxInFlight: 0,
    });
  });
});
