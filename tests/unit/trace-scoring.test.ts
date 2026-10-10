/**
 * Trace round scoring.
 *
 * The two rules worth guarding here are the ones that are easy to "simplify"
 * into something wrong later: completion is a gate rather than a weight, and a
 * one-hand round must not be quietly capped because it has no second hand to be
 * in sync with. Speed's zero contribution is pinned too, so nobody adds a
 * timing bonus without a test turning red.
 */

import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type {
  TraceBeat,
  TraceMetrics,
  TraceSample,
  TraceSegment,
} from "#lib/features/learn/play/games/trace-paths/domain/trace-types.js";
import {
  DEFAULT_TRACE_SCORING_CONFIG,
  scoreTraceRound,
} from "#lib/features/learn/play/games/trace-paths/services/score-trace-round.js";
import {
  createTraceEvaluator,
  type TraceRoundGeometry,
} from "#lib/features/learn/play/games/trace-paths/services/trace-evaluator.js";
import {
  arcLengthResample,
  sampleSegmentPath,
} from "#lib/features/learn/play/games/trace-paths/services/trace-path-sampler.js";

const N = GridLocation.NORTH;
const E = GridLocation.EAST;
const S = GridLocation.SOUTH;
const W = GridLocation.WEST;

function move(start: GridLocation, end: GridLocation): TraceSegment {
  return {
    kind: "move",
    start,
    end,
    expectedPath: sampleSegmentPath(start, end),
  };
}

function beat(index: number, segments: TraceBeat["segments"]): TraceBeat {
  return { index, segments };
}

function metricsOf(overrides: Partial<TraceMetrics> = {}): TraceMetrics {
  return {
    coverage: 1,
    accuracy: 1,
    continuity: 1,
    synchrony: 1,
    frechetNormalized: 0,
    corridorExcursions: [],
    checkpointsHit: 4,
    checkpointsTotal: 4,
    elapsedMs: 1200,
    divergence: null,
    ...overrides,
  };
}

function perfectTrace(
  from: GridLocation,
  to: GridLocation,
  count = 48,
  startMs = 0,
  stepMs = 16
): TraceSample[] {
  return arcLengthResample(sampleSegmentPath(from, to), count).map((p, i) => ({
    x: p.x,
    y: p.y,
    t: startMs + i * stepMs,
  }));
}

describe("one-hand scoring carries no hidden synchrony penalty", () => {
  it("a flawless one-hand round scores exactly what a flawless two-hand round scores", () => {
    const solo = scoreTraceRound(metricsOf({ synchrony: null }));
    const duo = scoreTraceRound(metricsOf({ synchrony: 1 }));

    expect(solo.quality).toBe(1);
    expect(duo.quality).toBe(1);
    expect(solo.points).toBe(duo.points);
    expect(solo.points).toBe(DEFAULT_TRACE_SCORING_CONFIG.basePoints);
    expect(solo.synchrony).toBeNull();
  });

  it("renormalizes rather than dropping the synchrony weight on the floor", () => {
    // Without renormalization this would top out at 0.85 forever.
    const solo = scoreTraceRound(
      metricsOf({ synchrony: null, accuracy: 0.5, continuity: 0.5 })
    );
    expect(solo.quality).toBeCloseTo(0.5, 12);
  });

  it("matches end to end: a real solo trace and a real synchronized duo trace", () => {
    const soloRound: TraceRoundGeometry = {
      beats: [beat(0, { left: move(N, E) })],
    };
    const duoRound: TraceRoundGeometry = {
      beats: [beat(0, { left: move(N, E), right: move(S, W) })],
    };

    const solo = createTraceEvaluator(soloRound);
    solo.ingest("left", perfectTrace(N, E));

    const duo = createTraceEvaluator(duoRound);
    duo.ingest("left", perfectTrace(N, E));
    duo.ingest("right", perfectTrace(S, W));

    const soloScore = scoreTraceRound(solo.finish());
    const duoScore = scoreTraceRound(duo.finish());

    expect(soloScore.synchrony).toBeNull();
    expect(duoScore.synchrony).toBe(1);
    expect(Math.abs(soloScore.quality - duoScore.quality)).toBeLessThan(0.01);
    expect(Math.abs(soloScore.points - duoScore.points)).toBeLessThanOrEqual(1);
  });
});
describe("completion is a gate, not a weight", () => {
  it("a beautiful line that skipped a checkpoint scores nothing", () => {
    const gated = scoreTraceRound(
      metricsOf({ coverage: 0.75, checkpointsHit: 3 })
    );
    expect(gated.points).toBe(0);
    // Quality is still reported in full — the player deserves to see that
    // their line was clean, and to see exactly which gate they missed.
    expect(gated.quality).toBe(1);
    expect(gated.coverage).toBe(0.75);
  });

  it("holds end to end: cutting the chord across an arc scores zero", () => {
    const round: TraceRoundGeometry = {
      beats: [beat(0, { left: move(N, E) })],
    };
    const path = sampleSegmentPath(N, E);
    const first = path[0]!;
    const last = path[path.length - 1]!;

    const evaluator = createTraceEvaluator(round);
    evaluator.ingest("left", [
      { x: first.x, y: first.y, t: 0 },
      { x: last.x, y: last.y, t: 150 },
    ]);
    const score = scoreTraceRound(evaluator.finish());

    expect(score.coverage).toBeLessThan(1);
    expect(score.points).toBe(0);
  });

  it("awards points the moment coverage is complete", () => {
    expect(scoreTraceRound(metricsOf({ coverage: 1 })).points).toBe(100);
  });
});

describe("speed pays nothing", () => {
  it("the same trace scores identically whether it took 0.8s or 9s", () => {
    const quick = scoreTraceRound(metricsOf({ elapsedMs: 800 }));
    const slow = scoreTraceRound(metricsOf({ elapsedMs: 9000 }));
    expect(quick.points).toBe(slow.points);
    expect(quick.quality).toBe(slow.quality);
  });
});

describe("components are reported separately", () => {
  it("returns every axis alongside the combined quality", () => {
    const score = scoreTraceRound(
      metricsOf({ accuracy: 0.8, continuity: 0.6, synchrony: 0.4 })
    );
    expect(score.accuracy).toBe(0.8);
    expect(score.continuity).toBe(0.6);
    expect(score.synchrony).toBe(0.4);
    expect(score.coverage).toBe(1);
    // 0.60*0.8 + 0.25*0.6 + 0.15*0.4
    expect(score.quality).toBeCloseTo(0.69, 12);
    expect(score.points).toBe(69);
  });

  it("uses the documented weights", () => {
    expect(DEFAULT_TRACE_SCORING_CONFIG.weights).toEqual({
      accuracy: 0.6,
      continuity: 0.25,
      synchrony: 0.15,
    });
    expect(
      DEFAULT_TRACE_SCORING_CONFIG.weights.accuracy +
        DEFAULT_TRACE_SCORING_CONFIG.weights.continuity +
        DEFAULT_TRACE_SCORING_CONFIG.weights.synchrony
    ).toBeCloseTo(1, 12);
  });
});
