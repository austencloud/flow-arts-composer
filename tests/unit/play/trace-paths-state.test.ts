import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";
import {
  handPathToTraceRound,
  pairHandPathsToTraceRound,
} from "#lib/features/learn/play/games/trace-paths/services/hand-path-to-trace.js";
import {
  createTracePathsState,
  segmentStartPoint,
} from "#lib/features/learn/play/games/trace-paths/state/trace-paths-state.svelte.js";
import type { TraceSample } from "#lib/features/learn/play/games/trace-paths/domain/trace-types.js";

function oneHandRound() {
  return handPathToTraceRound(
    createHandPath([GridLocation.NORTH, GridLocation.EAST]),
    HandSide.LEFT
  );
}

function twoHandRound() {
  return pairHandPathsToTraceRound(
    createHandPath([GridLocation.NORTH, GridLocation.EAST]),
    createHandPath([GridLocation.SOUTH, GridLocation.WEST])
  );
}

/** Walk the canonical route as if a finger followed it exactly. */
function samplesAlong(
  points: readonly { x: number; y: number }[],
  t0 = 0
): TraceSample[] {
  return points.map((p, i) => ({ x: p.x, y: p.y, t: t0 + i * 10 }));
}

describe("trace paths state", () => {
  it("loads a round into preview and reports the start location", () => {
    const state = createTracePathsState();
    state.loadRound(oneHandRound());
    expect(state.phase.name).toBe("preview");
    expect(state.totalBeats).toBe(1);
    expect(state.statusText).toContain("north");
  });

  it("surfaces a conversion refusal as an error phase, not a crash", () => {
    const state = createTracePathsState();
    state.loadRound(
      handPathToTraceRound(createHandPath([GridLocation.NORTH]), HandSide.LEFT)
    );
    expect(state.phase.name).toBe("error");
    expect(state.statusText.length).toBeGreaterThan(0);
  });

  it("assigns the hand from the stage it was touched on, not pointer order", () => {
    const state = createTracePathsState();
    state.loadRound(twoHandRound());
    state.beginArming();

    const rightStart = segmentStartPoint(
      state.currentSegments[HandSide.RIGHT]!
    );
    const leftStart = segmentStartPoint(state.currentSegments[HandSide.LEFT]!);

    // The FIRST pointer lands on red's grid. Pointer order would make it blue.
    expect(state.pointerDown(101, rightStart, HandSide.RIGHT)).toBe(
      HandSide.RIGHT
    );
    expect(state.pointerDown(102, leftStart, HandSide.LEFT)).toBe(
      HandSide.LEFT
    );
  });

  it("ignores a third pointer with a cue and never reassigns an armed hand", () => {
    const state = createTracePathsState();
    state.loadRound(twoHandRound());
    state.beginArming();

    const leftStart = segmentStartPoint(state.currentSegments[HandSide.LEFT]!);
    const rightStart = segmentStartPoint(
      state.currentSegments[HandSide.RIGHT]!
    );
    state.pointerDown(1, leftStart, HandSide.LEFT);
    state.pointerDown(2, rightStart, HandSide.RIGHT);

    // A third finger on blue's grid: blue is taken, so it gets nothing.
    expect(state.pointerDown(3, leftStart, HandSide.LEFT)).toBeNull();
    expect(state.cue).not.toBeNull();
  });

  it("completes a clean two-hand round and scores it", () => {
    const scored: unknown[] = [];
    const state = createTracePathsState({
      onRoundScored: (o) => scored.push(o),
    });
    state.loadRound(twoHandRound());
    state.beginArming();

    const leftSeg = state.currentSegments[HandSide.LEFT]!;
    const rightSeg = state.currentSegments[HandSide.RIGHT]!;
    if (leftSeg.kind !== "move" || rightSeg.kind !== "move")
      throw new Error("expected moves");

    state.pointerDown(1, leftSeg.expectedPath[0]!, HandSide.LEFT);
    state.pointerDown(2, rightSeg.expectedPath[0]!, HandSide.RIGHT);
    state.pointerMove(1, samplesAlong(leftSeg.expectedPath));
    state.pointerMove(2, samplesAlong(rightSeg.expectedPath));

    expect(state.phase.name).toBe("feedback");
    if (state.phase.name !== "feedback") throw new Error("unreachable");
    expect(state.phase.metrics.coverage).toBe(1);
    expect(state.phase.metrics.divergence).toBeNull();
    expect(state.phase.score.points).toBeGreaterThan(0);
    expect(scored).toHaveLength(1);
  });

  it("treats a pointer interruption as a pause that keeps completed beats", () => {
    const state = createTracePathsState();
    state.loadRound(twoHandRound());
    state.beginArming();

    const leftSeg = state.currentSegments[HandSide.LEFT]!;
    if (leftSeg.kind !== "move") throw new Error("expected a move");
    state.pointerDown(1, leftSeg.expectedPath[0]!, HandSide.LEFT);
    state.pointerMove(1, samplesAlong(leftSeg.expectedPath.slice(0, 6)));

    state.pointerInterrupted(1);
    expect(state.phase.name).toBe("paused");
    if (state.phase.name !== "paused") throw new Error("unreachable");
    expect(state.phase.reason).toBe("pointer-lost");

    state.resume();
    expect(state.phase.name).toBe("arming");
    // The round did not restart or fail.
    expect(state.totalBeats).toBe(1);
  });

  it("scopes pointer ids to the round so a recycled id can't claim a hand", () => {
    const state = createTracePathsState();
    state.loadRound(twoHandRound());
    state.beginArming();
    const leftSeg = state.currentSegments[HandSide.LEFT]!;
    if (leftSeg.kind !== "move") throw new Error("expected a move");
    state.pointerDown(7, leftSeg.expectedPath[0]!, HandSide.LEFT);

    // New round; pointer 7 is stale. Moving it must be a no-op, not a stray
    // sample fed into the fresh evaluator.
    state.loadRound(twoHandRound());
    state.beginArming();
    state.pointerMove(7, samplesAlong(leftSeg.expectedPath));
    expect(state.phase.name).toBe("arming");
  });

  it("completes via Tap Route in order only, and claims no trace score", () => {
    const outcomes: { assisted: boolean; score: { points: number } }[] = [];
    const state = createTracePathsState({
      onRoundScored: (o) => outcomes.push(o as never),
    });
    state.loadRound(twoHandRound());
    state.setSetting("tapRouteMode", true);
    state.beginArming();

    expect(state.tapWaypoints).toHaveLength(2);
    // Out of order is refused.
    expect(state.tapWaypoint(1)).toBe(false);
    expect(state.tapWaypoint(0)).toBe(true);
    expect(state.tapWaypoint(1)).toBe(true);

    expect(state.phase.name).toBe("feedback");
    expect(outcomes[0]!.assisted).toBe(true);
    expect(outcomes[0]!.score.points).toBe(0);
  });

  it("steps through the route for keyboard and screen-reader users", () => {
    const state = createTracePathsState();
    state.loadRound(twoHandRound());
    expect(state.previewText).toContain("Beat 1");
    expect(state.previewText).toContain("Left");
    state.stepPreview(-1);
    expect(state.previewBeat).toBe(0);
    state.completeStepThrough();
    expect(state.phase.name).toBe("feedback");
  });
});
