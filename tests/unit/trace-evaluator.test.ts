/**
 * Trace evaluator behaviour.
 *
 * These are the rules the design calls non-negotiable, written down as
 * assertions: order and direction matter, hand identity comes from the round
 * (never from pointer order), a cancel is a pause rather than a failure, and a
 * beat belongs to both hands.
 */

import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type {
  TraceBeat,
  TraceSample,
  TraceSegment,
} from "#lib/features/learn/play/games/trace-paths/domain/trace-types.js";
import {
  arcLengthResample,
  normalizeStagePoint,
  sampleSegmentPath,
} from "#lib/features/learn/play/games/trace-paths/services/trace-path-sampler.js";
import {
  createTraceEvaluator,
  DEFAULT_TRACE_EVALUATOR_CONFIG,
  discreteFrechet,
  normalizeStageDistance,
  segmentIntersectsCircle,
  type TraceRoundGeometry,
} from "#lib/features/learn/play/games/trace-paths/services/trace-evaluator.js";
import {
  DEFAULT_SHARED_GRID_CONFIG,
  sharedGridPreflight,
} from "#lib/features/learn/play/games/trace-paths/services/shared-grid-preflight.js";
import { scoreTraceRound } from "#lib/features/learn/play/games/trace-paths/services/score-trace-round.js";

const N = GridLocation.NORTH;
const E = GridLocation.EAST;
const S = GridLocation.SOUTH;
const W = GridLocation.WEST;

/** A move segment carrying the same route the renderer draws. */
function move(start: GridLocation, end: GridLocation): TraceSegment {
  return {
    kind: "move",
    start,
    end,
    expectedPath: sampleSegmentPath(start, end),
  };
}

function hold(location: GridLocation): TraceSegment {
  return { kind: "hold", location };
}

function beat(index: number, segments: TraceBeat["segments"]): TraceBeat {
  return { index, segments };
}

const ONE_HAND_ROUND: TraceRoundGeometry = {
  beats: [beat(0, { left: move(N, E) })],
};

const TWO_HAND_ROUND: TraceRoundGeometry = {
  beats: [beat(0, { left: move(N, E), right: move(S, W) })],
};

const HOLD_ROUND: TraceRoundGeometry = {
  beats: [beat(0, { left: move(N, E), right: hold(S) })],
};

const DASH_ROUND: TraceRoundGeometry = {
  beats: [beat(0, { left: move(N, S) })],
};

/** A flawless trace of one segment, sampled at a chosen event rate. */
function perfectTrace(
  from: GridLocation,
  to: GridLocation,
  count: number,
  startMs = 0,
  stepMs = 16
): TraceSample[] {
  const points = arcLengthResample(sampleSegmentPath(from, to), count);
  return points.map((p, i) => ({ x: p.x, y: p.y, t: startMs + i * stepMs }));
}

function holdTrace(
  at: GridLocation,
  count: number,
  startMs = 0,
  stepMs = 16
): TraceSample[] {
  const point = sampleSegmentPath(at, at, 1)[0]!;
  return Array.from({ length: count }, (_, i) => ({
    x: point.x,
    y: point.y,
    t: startMs + i * stepMs,
  }));
}

function endpointsOnly(from: GridLocation, to: GridLocation): TraceSample[] {
  const path = sampleSegmentPath(from, to);
  const first = path[0]!;
  const last = path[path.length - 1]!;
  return [
    { x: first.x, y: first.y, t: 0 },
    { x: last.x, y: last.y, t: 120 },
  ];
}

function qualityOf(
  round: TraceRoundGeometry,
  feed: (e: ReturnType<typeof createTraceEvaluator>) => void
) {
  const evaluator = createTraceEvaluator(round);
  feed(evaluator);
  return scoreTraceRound(evaluator.finish());
}

describe("geometry helpers", () => {
  it("swept-line test catches a circle the samples straddle", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    // Neither endpoint is inside the circle, but the line between them is.
    expect(segmentIntersectsCircle(a, b, { x: 0.5, y: 0.02 }, 0.05)).toBe(true);
    expect(segmentIntersectsCircle(a, b, { x: 0.5, y: 0.2 }, 0.05)).toBe(false);
  });

  it("discrete Frechet is order-sensitive", () => {
    const forward = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
    ];
    const backward = [...forward].reverse();
    expect(discreteFrechet(forward, forward)).toBeCloseTo(0, 12);
    expect(discreteFrechet(forward, backward)).toBeCloseTo(1, 12);
  });

  it("normalizes distances by the stage's shorter side", () => {
    expect(normalizeStageDistance(0.25)).toBeCloseTo(0.25, 12);
    expect(normalizeStageDistance(50, { width: 800, height: 400 })).toBeCloseTo(
      0.125,
      12
    );
  });
});
describe("event frequency does not change the score", () => {
  it("30 Hz and 120 Hz traces of the same gesture score equivalently", () => {
    // One second of travel either way; only the event rate differs.
    const slow = qualityOf(ONE_HAND_ROUND, (e) =>
      e.ingest("left", perfectTrace(N, E, 30, 0, 1000 / 30))
    );
    const fast = qualityOf(ONE_HAND_ROUND, (e) =>
      e.ingest("left", perfectTrace(N, E, 120, 0, 1000 / 120))
    );

    expect(slow.coverage).toBe(1);
    expect(fast.coverage).toBe(1);
    expect(Math.abs(slow.quality - fast.quality)).toBeLessThan(0.01);
    expect(Math.abs(slow.accuracy - fast.accuracy)).toBeLessThan(0.01);
    expect(slow.continuity).toBeCloseTo(fast.continuity, 6);
  });
});

describe("stage size does not change a normalized score", () => {
  it("the same gesture on a 400px and a 1200px stage scores identically", () => {
    const normalized = perfectTrace(N, E, 40);

    const replayAt = (side: number, left: number, top: number) => {
      const rect = { left, top, width: side, height: side };
      const samples: TraceSample[] = normalized.map((s) => {
        // Project back out to client pixels, then let the sampler normalize it.
        const clientX = left + s.x * side;
        const clientY = top + s.y * side;
        const p = normalizeStagePoint(clientX, clientY, rect);
        return { x: p.x, y: p.y, t: s.t };
      });
      return qualityOf(ONE_HAND_ROUND, (e) => e.ingest("left", samples));
    };

    const small = replayAt(400, 37, 91);
    const large = replayAt(1200, 0, 0);

    expect(small.coverage).toBe(1);
    expect(small.quality).toBeCloseTo(large.quality, 9);
    expect(small.accuracy).toBeCloseTo(large.accuracy, 9);
  });
});

describe("order and direction", () => {
  it("a reversed trace of the right shape does not pass", () => {
    const evaluator = createTraceEvaluator(ONE_HAND_ROUND);
    const reversed = [...perfectTrace(N, E, 40)].reverse().map((s, i) => ({
      x: s.x,
      y: s.y,
      t: i * 16,
    }));
    evaluator.ingest("left", reversed);
    const metrics = evaluator.finish();

    expect(metrics.coverage).toBeLessThan(1);
    expect(metrics.divergence?.reason).toBe("wrong-order");
    expect(evaluator.state.divergences.map((d) => d.reason)).toContain(
      "wrong-order"
    );
    expect(scoreTraceRound(metrics).points).toBe(0);
  });

  it("cutting straight across an arc skips its checkpoints", () => {
    const evaluator = createTraceEvaluator(ONE_HAND_ROUND);
    // Starts in the right place and finishes in the right place, but takes the
    // chord instead of the curve.
    evaluator.ingest("left", endpointsOnly(N, E));
    const metrics = evaluator.finish();

    expect(metrics.checkpointsTotal).toBe(
      DEFAULT_TRACE_EVALUATOR_CONFIG.checkpointsPerSegment
    );
    expect(metrics.checkpointsHit).toBeLessThan(metrics.checkpointsTotal);
    expect(metrics.coverage).toBeLessThan(1);
    expect(evaluator.state.divergences.map((d) => d.reason)).toContain(
      "skipped-checkpoint"
    );
  });

  it("a fast two-sample jump along a dash still registers every checkpoint", () => {
    // A dash IS the straight line, so the swept line between two far-apart
    // events passes through every checkpoint. A point-in-circle test would
    // have told this player they missed all of them.
    const evaluator = createTraceEvaluator(DASH_ROUND);
    evaluator.ingest("left", endpointsOnly(N, S));
    const metrics = evaluator.finish();

    expect(metrics.checkpointsHit).toBe(metrics.checkpointsTotal);
    expect(metrics.coverage).toBe(1);
    expect(metrics.divergence).toBeNull();
  });
});

describe("continuity", () => {
  it("an explicit lift fails strict continuity", () => {
    const samples = perfectTrace(N, E, 40);
    const evaluator = createTraceEvaluator(ONE_HAND_ROUND);
    evaluator.ingest("left", samples.slice(0, 20));
    evaluator.notifyLift("left");
    evaluator.ingest("left", samples.slice(20));
    const metrics = evaluator.finish();

    expect(metrics.coverage).toBe(1);
    expect(metrics.continuity).toBeLessThan(1);
    expect(evaluator.state.divergences.map((d) => d.reason)).toContain(
      "lifted"
    );
  });

  it("an interruption is a pause, not a failure", () => {
    const samples = perfectTrace(N, E, 40);
    const evaluator = createTraceEvaluator(ONE_HAND_ROUND);
    evaluator.ingest("left", samples.slice(0, 20));
    evaluator.notifyInterruption("left");
    evaluator.ingest("left", samples.slice(20));
    const metrics = evaluator.finish();

    expect(metrics.coverage).toBe(1);
    expect(metrics.continuity).toBe(1);
    expect(metrics.divergence).toBeNull();
  });
});

describe("two-hand beat gating", () => {
  it("waits for the second hand instead of failing the first", () => {
    const evaluator = createTraceEvaluator(TWO_HAND_ROUND);

    evaluator.ingest("left", perfectTrace(N, E, 40));
    expect(evaluator.state.beatIndex).toBe(0);
    expect(evaluator.state.satisfied.left).toBe(true);
    expect(evaluator.state.satisfied.right).toBe(false);

    evaluator.ingest("right", perfectTrace(S, W, 40));
    expect(evaluator.state.completedBeats).toBe(1);

    const metrics = evaluator.finish();
    expect(metrics.coverage).toBe(1);
    expect(metrics.divergence).toBeNull();
  });

  it("scores synchrony from arrival times once both paths are valid", () => {
    const together = createTraceEvaluator(TWO_HAND_ROUND);
    together.ingest("left", perfectTrace(N, E, 40, 0, 16));
    together.ingest("right", perfectTrace(S, W, 40, 0, 16));
    const tight = together.finish();

    const apart = createTraceEvaluator(TWO_HAND_ROUND);
    apart.ingest("left", perfectTrace(N, E, 40, 0, 16));
    apart.ingest("right", perfectTrace(S, W, 40, 900, 16));
    const loose = apart.finish();

    expect(tight.synchrony).toBe(1);
    expect(loose.synchrony).not.toBeNull();
    expect(loose.synchrony!).toBeLessThan(tight.synchrony!);
  });

  it("holds the beat while a holding hand stays put, and blocks it when it drifts", () => {
    const staying = createTraceEvaluator(HOLD_ROUND);
    staying.ingest("right", holdTrace(S, 10));
    staying.ingest("left", perfectTrace(N, E, 40));
    expect(staying.state.completedBeats).toBe(1);
    expect(staying.finish().coverage).toBe(1);

    const drifting = createTraceEvaluator(HOLD_ROUND);
    const southPoint = sampleSegmentPath(S, S, 1)[0]!;
    drifting.ingest("right", [
      { x: southPoint.x, y: southPoint.y, t: 0 },
      // Well outside the hold zone.
      { x: southPoint.x - 0.3, y: southPoint.y - 0.3, t: 100 },
    ]);
    drifting.ingest("left", perfectTrace(N, E, 40));

    expect(drifting.state.completedBeats).toBe(0);
    const metrics = drifting.finish();
    expect(drifting.state.divergences.map((d) => d.reason)).toContain(
      "hold-broken"
    );
    expect(metrics.coverage).toBeLessThan(1);
  });
});

describe("corridor excursions", () => {
  it("records which hand left the route, on which beat, and by how much", () => {
    const samples = perfectTrace(N, E, 40);
    // Shove a handful of mid-route samples well outside the corridor.
    const detoured: TraceSample[] = samples.map((s, i) =>
      i >= 18 && i <= 22 ? { x: s.x, y: s.y - 0.25, t: s.t } : s
    );

    const evaluator = createTraceEvaluator(ONE_HAND_ROUND);
    evaluator.ingest("left", detoured);
    const metrics = evaluator.finish();

    expect(metrics.corridorExcursions).toHaveLength(1);
    expect(metrics.corridorExcursions[0]!.hand).toBe("left");
    expect(metrics.corridorExcursions[0]!.beatIndex).toBe(0);
    expect(metrics.corridorExcursions[0]!.sampleCount).toBeGreaterThan(0);
    expect(metrics.corridorExcursions[0]!.maxDistance).toBeGreaterThan(
      DEFAULT_TRACE_EVALUATOR_CONFIG.corridorRadius
    );
    expect(evaluator.state.divergences.map((d) => d.reason)).toContain(
      "out-of-corridor"
    );
  });
});

describe("shared-grid preflight", () => {
  it("rejects two hands aimed at the same point at the same time", () => {
    const result = sharedGridPreflight({
      beats: [beat(0, { left: move(N, E), right: move(S, E) })],
    });
    expect(result.passes).toBe(false);
    expect(result.worstSeparation).toBeCloseTo(0, 9);
    expect(result.reason).toBeTruthy();
  });

  it("rejects two hands holding the same point", () => {
    const result = sharedGridPreflight({
      beats: [beat(0, { left: hold(N), right: hold(N) })],
    });
    expect(result.passes).toBe(false);
    expect(result.worstSeparation).toBeCloseTo(0, 9);
  });

  it("rejects routes that overlap inside one beat", () => {
    // Same arc, opposite directions: the fingertips have to pass through each
    // other.
    const result = sharedGridPreflight({
      beats: [beat(0, { left: move(N, E), right: move(E, N) })],
    });
    expect(result.passes).toBe(false);
  });

  it("accepts routes that only cross at different beats", () => {
    const result = sharedGridPreflight({
      beats: [
        beat(0, { left: move(N, E), right: move(S, W) }),
        // Blue now travels through the corner red used on the previous beat.
        beat(1, { left: move(E, S), right: move(W, N) }),
      ],
    });
    expect(result.passes).toBe(true);
    expect(result.worstSeparation).toBeGreaterThan(
      2 * DEFAULT_SHARED_GRID_CONFIG.touchContactRadius +
        DEFAULT_SHARED_GRID_CONFIG.separationMargin
    );
    expect(result.reason).toBeUndefined();
  });

  it("ignores beats where only one hand is active", () => {
    const result = sharedGridPreflight(ONE_HAND_ROUND);
    expect(result.passes).toBe(true);
  });
});

// Regressions

describe("regression: the physical touch floor bounds the checkpoint shrink", () => {
  /**
   * `checkpointRadius` is only a ceiling — each segment shrinks it so a fat
   * checkpoint cannot be claimed by a straight shortcut across an arc. That
   * shrink used to run unbounded, which undid the floor `trace-config.ts`
   * declares absolute: on a phone-sized stage an interior checkpoint resolved
   * to roughly a quarter of the millimetres a fingertip can be reported within,
   * so a player well inside the corridor still missed it, coverage fell under
   * the hard gate, and a correct round scored zero.
   */
  const ARC_ROUND: TraceRoundGeometry = {
    beats: [beat(0, { left: move(N, E) })],
  };

  /** The route, nudged a constant distance to the outside of its own curve. */
  function offsetTrace(offset: number): TraceSample[] {
    const centre = { x: 0.5, y: 0.5 };
    return perfectTrace(N, E, 40).map((sample) => {
      const dx = sample.x - centre.x;
      const dy = sample.y - centre.y;
      const length = Math.hypot(dx, dy) || 1;
      return {
        x: sample.x + (dx / length) * offset,
        y: sample.y + (dy / length) * offset,
        t: sample.t,
      };
    });
  }

  // A stage ~90mm across (a phone panel) puts the 6mm floor at 0.0667 of the
  // stage, while the unbounded shrink lands this segment's checkpoints at
  // ~0.0265 — the gap the player fell into.
  const PHONE_FLOOR = 6 / 90;

  it("scores a corridor-legal trace as covered when the floor is known", () => {
    const evaluator = createTraceEvaluator(ARC_ROUND, {
      ...DEFAULT_TRACE_EVALUATOR_CONFIG,
      touchFloorRadius: PHONE_FLOOR,
      startZoneRadius: PHONE_FLOOR,
      endZoneRadius: PHONE_FLOOR,
      corridorRadius: PHONE_FLOOR,
    });
    // Half the corridor off the spine: inside the band the player is told to
    // stay in, and outside the un-floored checkpoint radius.
    evaluator.ingest("left", offsetTrace(PHONE_FLOOR * 0.5));
    const metrics = evaluator.finish();

    expect(metrics.coverage).toBe(1);
    expect(scoreTraceRound(metrics).points).toBeGreaterThan(0);

    // And the same trace with the floor withheld is the bug: the shrink takes
    // the interior checkpoints below what the hardware can report, the player
    // misses them from inside the corridor, and the hard coverage gate zeroes a
    // correct round.
    const unfloored = createTraceEvaluator(ARC_ROUND, {
      ...DEFAULT_TRACE_EVALUATOR_CONFIG,
      touchFloorRadius: 0,
      startZoneRadius: PHONE_FLOOR,
      endZoneRadius: PHONE_FLOOR,
      corridorRadius: PHONE_FLOOR,
    });
    unfloored.ingest("left", offsetTrace(PHONE_FLOOR * 0.5));
    const unflooredMetrics = unfloored.finish();
    expect(unflooredMetrics.coverage).toBeLessThan(1);
    expect(scoreTraceRound(unflooredMetrics).points).toBe(0);
  });

  it("leaves the shrink alone when no physical size is known", () => {
    // touchFloorRadius 0 is the standalone evaluator: discrimination is free to
    // go as tight as the geometry allows, exactly as before.
    const evaluator = createTraceEvaluator(ARC_ROUND);
    evaluator.ingest("left", perfectTrace(N, E, 40));
    expect(evaluator.finish().coverage).toBe(1);
  });
});

describe("regression: a hold does not eat the next beat's samples", () => {
  /**
   * Queues fill one hand at a time, one animation frame at a time, so a holding
   * hand's batch routinely already contains samples from after the moment the
   * beat really ended. Draining all of them against the hold slot reported a
   * hold the player never broke — and since the beat could then no longer
   * advance, the round stalled until they walked back to the hold point.
   */
  const HOLD_THEN_MOVE: TraceRoundGeometry = {
    beats: [
      beat(0, { left: hold(S), right: move(N, E) }),
      beat(1, { left: move(S, W), right: hold(E) }),
    ],
  };

  it("completes both beats when a whole frame arrives in one batch", () => {
    const evaluator = createTraceEvaluator(HOLD_THEN_MOVE);

    // A correct performance: blue holds S for exactly as long as red takes to
    // travel N→E, then leaves once the beat is over. Both halves of blue's
    // gesture land in the SAME ingest, which is the failing shape — the hold
    // used to be judged against blue's beat-1 departure and report a break the
    // player never made.
    evaluator.ingest("left", [
      ...holdTrace(S, 20, 0, 16),
      ...perfectTrace(S, W, 20, 320, 16),
    ]);
    evaluator.ingest("right", [
      ...perfectTrace(N, E, 20, 0, 16),
      ...holdTrace(E, 20, 320, 16),
    ]);

    const state = evaluator.state;
    expect(state.completedBeats).toBe(2);
    expect(
      state.divergences.filter((d) => d.reason === "hold-broken")
    ).toHaveLength(0);
  });

  it("grades the same gesture identically however it is batched", () => {
    // The invariant behind the fix: how the browser chopped the stroke into
    // frames is not something the player did, so it cannot change the grade.
    const left = [
      ...holdTrace(S, 20, 0, 16),
      ...perfectTrace(S, W, 20, 320, 16),
    ];
    const right = [
      ...perfectTrace(N, E, 20, 0, 16),
      ...holdTrace(E, 20, 320, 16),
    ];

    const batched = createTraceEvaluator(HOLD_THEN_MOVE);
    batched.ingest("left", left);
    batched.ingest("right", right);

    const trickled = createTraceEvaluator(HOLD_THEN_MOVE);
    for (const sample of left) trickled.ingest("left", [sample]);
    for (const sample of right) trickled.ingest("right", [sample]);

    expect(batched.state.completedBeats).toBe(trickled.state.completedBeats);
    expect(batched.state.divergences.map((d) => d.reason)).toEqual(
      trickled.state.divergences.map((d) => d.reason)
    );
  });

  it("still reports a hold the player genuinely broke", () => {
    const evaluator = createTraceEvaluator(HOLD_THEN_MOVE);
    // Blue leaves S while red is still travelling — a real break. Red's samples
    // run past blue's departure, so the horizon does not hide it.
    evaluator.ingest("left", [
      ...holdTrace(S, 3, 0, 16),
      ...perfectTrace(S, W, 10, 48, 16),
    ]);
    evaluator.ingest("right", perfectTrace(N, E, 40, 0, 16));

    expect(
      evaluator.state.divergences.some((d) => d.reason === "hold-broken")
    ).toBe(true);
  });
});
