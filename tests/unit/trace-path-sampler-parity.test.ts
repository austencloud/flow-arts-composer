/**
 * Parity locks for the trace game's geometry.
 *
 * The whole point of `trace-path-sampler` is that the line a player is graded
 * against is the SAME line the renderer draws. That guarantee is only worth
 * anything if something enforces it, so this file pins both halves:
 *
 *  1. Sampler vs renderer — every ordered pair of grid locations must produce
 *     the renderer's own curve, only rescaled.
 *  2. Hit-target coordinates vs the grid coordinate SSOT — the assemble lab
 *     carries its own hardcoded copy of the hand points. If that copy ever
 *     drifts from `gridCoordinates`, the trace game would arm on one point
 *     while the player taps another.
 */

import { describe, expect, it } from "vitest";
import { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  getPathPoints,
} from "#lib/features/hand-paths/hand-path-builder/services/hand-path-animator.js";
import {
  DEFAULT_PATH_SEGMENTS,
  pathTypeForSegment,
  sampleSegmentPath,
  STAGE_UNITS,
  arcLengthResample,
  polylineLength,
  normalizeStagePoint,
} from "#lib/features/learn/play/games/trace-paths/services/trace-path-sampler.js";
import { getHitTargets } from "#lib/shared/assemble-lab/services/grid-hit-target-calculator.js";
import { createGridPointData } from "#lib/shared/pictograph/grid/utils/grid-coordinate-utils.js";

const DIAMOND_LOCATIONS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

const BOX_LOCATIONS = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

const EPSILON = 1e-12;

describe("sampleSegmentPath matches the hand-path renderer", () => {
  for (const [modeName, locations] of [
    ["diamond", DIAMOND_LOCATIONS],
    ["box", BOX_LOCATIONS],
  ] as const) {
    it(`reproduces every ordered ${modeName} pair, scaled to 0..1`, () => {
      let pairs = 0;
      for (const from of locations) {
        for (const to of locations) {
          if (from === to) continue;
          pairs++;

          const expectedType = pathTypeForSegment(from, to);
          const renderer = getPathPoints(
            from,
            to,
            DEFAULT_PATH_SEGMENTS,
            expectedType
          );
          const sampled = sampleSegmentPath(from, to);

          expect(sampled.length).toBe(renderer.length);
          for (let i = 0; i < renderer.length; i++) {
            expect(
              Math.abs(sampled[i]!.x - renderer[i]!.x / STAGE_UNITS)
            ).toBeLessThan(EPSILON);
            expect(
              Math.abs(sampled[i]!.y - renderer[i]!.y / STAGE_UNITS)
            ).toBeLessThan(EPSILON);
          }
        }
      }
      // 4 locations, ordered pairs, self-pairs excluded.
      expect(pairs).toBe(12);
    });
  }

  it("pins the path type from geometry, never from a display preference", () => {
    // Opposite points are a dash straight through the middle.
    expect(pathTypeForSegment(GridLocation.NORTH, GridLocation.SOUTH)).toBe(
      "linear"
    );
    expect(pathTypeForSegment(GridLocation.EAST, GridLocation.WEST)).toBe(
      "linear"
    );
    expect(
      pathTypeForSegment(GridLocation.NORTHEAST, GridLocation.SOUTHWEST)
    ).toBe("linear");
    // Everything else rides the grid circle.
    expect(pathTypeForSegment(GridLocation.NORTH, GridLocation.EAST)).toBe(
      "arc"
    );
    expect(
      pathTypeForSegment(GridLocation.NORTHWEST, GridLocation.NORTHEAST)
    ).toBe("arc");
  });

  it("keeps both endpoints and stays inside the stage", () => {
    const path = sampleSegmentPath(GridLocation.NORTH, GridLocation.EAST);
    expect(path.length).toBe(DEFAULT_PATH_SEGMENTS + 1);
    for (const p of path) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
  });

  it("collapses a same-point segment to a single location", () => {
    const path = sampleSegmentPath(GridLocation.NORTH, GridLocation.NORTH);
    expect(polylineLength(path)).toBeLessThan(EPSILON);
  });
});

describe("arcLengthResample", () => {
  it("returns evenly spaced points along the route", () => {
    const path = sampleSegmentPath(GridLocation.NORTH, GridLocation.EAST);
    const resampled = arcLengthResample(path, 9);
    expect(resampled.length).toBe(9);

    const gaps: number[] = [];
    for (let i = 1; i < resampled.length; i++) {
      gaps.push(
        Math.hypot(
          resampled[i]!.x - resampled[i - 1]!.x,
          resampled[i]!.y - resampled[i - 1]!.y
        )
      );
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const gap of gaps) {
      expect(Math.abs(gap - mean)).toBeLessThan(mean * 0.02);
    }
  });

  it("keeps the endpoints", () => {
    const path = sampleSegmentPath(GridLocation.SOUTH, GridLocation.WEST);
    const resampled = arcLengthResample(path, 5);
    expect(resampled[0]!.x).toBeCloseTo(path[0]!.x, 10);
    expect(resampled[4]!.x).toBeCloseTo(path[path.length - 1]!.x, 10);
    expect(resampled[4]!.y).toBeCloseTo(path[path.length - 1]!.y, 10);
  });

  it("survives a zero-length trace instead of dividing by zero", () => {
    const still = [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    const resampled = arcLengthResample(still, 4);
    expect(resampled).toHaveLength(4);
    for (const p of resampled) {
      expect(p).toEqual({ x: 0.5, y: 0.5 });
    }
  });
});

describe("normalizeStagePoint", () => {
  it("undoes letterboxing so a wide stage does not stretch the route", () => {
    // 400x200 element: the 950-square scene is drawn 200px tall, centred.
    const rect = { left: 0, top: 0, width: 400, height: 200 };
    const centre = normalizeStagePoint(200, 100, rect);
    expect(centre.x).toBeCloseTo(0.5, 10);
    expect(centre.y).toBeCloseTo(0.5, 10);

    const topLeft = normalizeStagePoint(100, 0, rect);
    expect(topLeft.x).toBeCloseTo(0, 10);
    expect(topLeft.y).toBeCloseTo(0, 10);
  });
});

describe("grid hit targets match the grid coordinate SSOT", () => {
  const cases = [
    {
      mode: GridMode.DIAMOND,
      keys: {
        [GridLocation.NORTH]: "n_diamond_hand_point",
        [GridLocation.EAST]: "e_diamond_hand_point",
        [GridLocation.SOUTH]: "s_diamond_hand_point",
        [GridLocation.WEST]: "w_diamond_hand_point",
      } as Record<string, string>,
    },
    {
      mode: GridMode.BOX,
      keys: {
        [GridLocation.NORTHEAST]: "ne_box_hand_point",
        [GridLocation.SOUTHEAST]: "se_box_hand_point",
        [GridLocation.SOUTHWEST]: "sw_box_hand_point",
        [GridLocation.NORTHWEST]: "nw_box_hand_point",
      } as Record<string, string>,
    },
  ];

  for (const { mode, keys } of cases) {
    it(`${mode}: hardcoded hit-target coordinates equal gridCoordinates hand_points`, () => {
      const targets = getHitTargets(mode);
      const canonical = createGridPointData(mode).allHandPointsNormal;

      expect(targets.length).toBe(Object.keys(keys).length);

      for (const target of targets) {
        const key = keys[target.location];
        expect(
          key,
          `no canonical hand point mapped for location "${target.location}"`
        ).toBeDefined();

        const point = canonical[key!]?.coordinates;
        expect(
          point,
          `gridCoordinates is missing "${key}" — the hit-target table references a point that no longer exists`
        ).toBeTruthy();

        expect(
          target.x,
          `HIT TARGET DRIFT: ${mode} ${target.location}.x is ${target.x} in grid-hit-target-calculator.ts but ${point!.x} in gridCoordinates.ts. These are two copies of the same number and they no longer agree. Do NOT edit either file to make this pass — the duplication itself is the finding.`
        ).toBeCloseTo(point!.x, 6);

        expect(
          target.y,
          `HIT TARGET DRIFT: ${mode} ${target.location}.y is ${target.y} in grid-hit-target-calculator.ts but ${point!.y} in gridCoordinates.ts. These are two copies of the same number and they no longer agree. Do NOT edit either file to make this pass — the duplication itself is the finding.`
        ).toBeCloseTo(point!.y, 6);
      }
    });
  }
});
