/**
 * Tests for deriveReversals — THE canonical reversal detector.
 *
 * Fixtures are grounded in the MCP reversal definition (verified 2026-07-05):
 * three reversal types — hand reversal (hand retraces, prop continues),
 * prop reversal (hand continues, prop reverses), full reversal (both
 * retrace). The pro/anti data convention is proven by canonical letters A/B:
 * same left hand path w→n (a clockwise arc); A (pro) stores rotationDirection
 * "cw", B (anti) stores "ccw". So:
 *   - pro  = rotationDirection equals the hand-arc direction
 *   - anti = rotationDirection opposes the hand-arc direction
 *
 * The detector reports TWO channels per hand:
 *   - `propReversal` — prop rotation direction flipped (prop + full
 *     reversals). THE dot display channel (Austen 2026-07-05: dots are for
 *     prop-direction reversals only).
 *   - `handReversal` — hand arc flipped (hand + full reversals). Non-display
 *     signal channel.
 *
 * Canonical chain semantics under test (adopted from production):
 *   - blank steps and noRotation/arc-less motions are TRANSPARENT — they never
 *     flag, never anchor, and do not break a signal's chain;
 *   - `loop: true` wraps: early steps look back through the sequence tail;
 *   - each signal (prop rotation, hand arc) anchors independently.
 */

import { describe, it, expect } from "vitest";
import {
  createStep,
  createStartStep,
  createMotion,
  GridPlacement,
  GridLocation,
  MotionType,
  RotationDirection,
  Orientation,
  Plane,
  HandSide,
  Letter,
  type Motion,
} from "@tka/tka-types";
import { deriveReversals } from "../../src/analysis/deriveReversals.js";

type Dir = "cw" | "ccw" | "noRotation";

// Per-hand channel expectation shorthands.
const NONE = { propReversal: false, handReversal: false };
const PROP = { propReversal: true, handReversal: false };
const HAND = { propReversal: false, handReversal: true };
const FULL = { propReversal: true, handReversal: true };

function mkMotion(
  hand: "left" | "right",
  motionType: MotionType,
  start: GridLocation,
  end: GridLocation,
  rotationDirection: Dir
): Motion {
  return createMotion({
    motionType,
    startLocation: start,
    endLocation: end,
    rotationDirection:
      rotationDirection === "cw"
        ? RotationDirection.cw
        : rotationDirection === "ccw"
          ? RotationDirection.ccw
          : RotationDirection.noRotation,
    startOrientation: Orientation.in,
    endOrientation: Orientation.in,
    turns: 0,
    plane: Plane.wall,
    hand: hand === "left" ? HandSide.LEFT : HandSide.RIGHT,
  });
}

/** A parked hand: static at one location, no rotation, no arc. Inert. */
function parked(hand: "left" | "right", at: GridLocation = GridLocation.s): Motion {
  return mkMotion(hand, MotionType.static, at, at, "noRotation");
}

let stepId = 0;
function mkStep(
  stepNumber: number,
  left: Motion,
  right: Motion,
  opts: { isBlank?: boolean } = {}
) {
  return createStep({
    id: `s${++stepId}`,
    letter: Letter.A,
    startPlacement: GridPlacement.alpha1,
    endPlacement: GridPlacement.alpha3,
    motions: { left, right },
    stepNumber,
    duration: 1,
    ...(opts.isBlank ? { isBlank: true } : {}),
  });
}

// Canonical letter-A-shaped first step: left hand w→n clockwise arc, prop cw (pro).
const proWN = (hand: "left" | "right") =>
  mkMotion(hand, MotionType.pro, GridLocation.w, GridLocation.n, "cw");

describe("deriveReversals — basics", () => {
  it("returns an empty array for empty input", () => {
    expect(deriveReversals([])).toEqual([]);
  });

  it("marks the start-placement step (stepNumber 0) as no reversal", () => {
    const start = createStartStep(GridPlacement.alpha1);
    expect(deriveReversals([start])).toEqual([{ left: NONE, right: NONE }]);
  });

  it("marks the first real step as no reversal (nothing to reverse against)", () => {
    const start = createStartStep(GridPlacement.alpha1);
    const s1 = mkStep(1, proWN("left"), parked("right"));
    expect(deriveReversals([start, s1])).toEqual([
      { left: NONE, right: NONE },
      { left: NONE, right: NONE },
    ]);
  });

  it("does not flag natural continuation (hand continues arc, prop continues spin)", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    // n→e continues the clockwise arc; prop stays cw → pro maintained.
    const s2 = mkStep(
      2,
      mkMotion("left", MotionType.pro, GridLocation.n, GridLocation.e, "cw"),
      parked("right")
    );
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: NONE, right: NONE });
  });
});

describe("deriveReversals — the three MCP reversal types, per channel", () => {
  it("PROP reversal (hand continues, prop reverses) → propReversal only — this is a DOT", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    // Hand continues clockwise n→e; prop flips to ccw → anti.
    const s2 = mkStep(
      2,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.e, "ccw"),
      parked("right")
    );
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: PROP, right: NONE });
  });

  it("HAND reversal (hand retraces, prop continues) → handReversal only — NOT a dot", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    // Hand retraces n→w (ccw arc); prop CONTINUES cw → anti. rotationDirection
    // is unchanged cw→cw, so the dot channel must stay FALSE.
    const s2 = mkStep(
      2,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.w, "cw"),
      parked("right")
    );
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: HAND, right: NONE });
  });

  it("FULL reversal (both retrace, pro stays pro) → both channels — this is a DOT", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    // Hand retraces n→w (ccw) AND prop reverses to ccw → still pro.
    const s2 = mkStep(
      2,
      mkMotion("left", MotionType.pro, GridLocation.n, GridLocation.w, "ccw"),
      parked("right")
    );
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: FULL, right: NONE });
  });

  it("keeps hands independent (right continuing, left hand-reversing)", () => {
    const s1 = mkStep(1, proWN("left"), proWN("right"));
    const s2 = mkStep(
      2,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.w, "cw"), // hand reversal
      mkMotion("right", MotionType.pro, GridLocation.n, GridLocation.e, "cw") // continuation
    );
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: HAND, right: NONE });
  });
});

describe("deriveReversals — transparent chains (production semantics)", () => {
  it("does not flag a static (noRotation, arc-less) step", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    const s2 = mkStep(2, parked("left", GridLocation.n), parked("right"));
    expect(deriveReversals([s1, s2])[1]).toEqual({ left: NONE, right: NONE });
  });

  it("looks past a static step to the last active direction (chain not broken)", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    const s2 = mkStep(2, parked("left", GridLocation.n), parked("right"));
    // Hand reversal against s1, across the static s2 — signal channel only.
    const s3 = mkStep(
      3,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.w, "cw"),
      parked("right")
    );
    expect(deriveReversals([s1, s2, s3])[2]).toEqual({ left: HAND, right: NONE });
  });

  it("looks past a BLANK step to the last active direction (canonical: blanks are transparent)", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    const blank = mkStep(2, parked("left", GridLocation.n), parked("right"), {
      isBlank: true,
    });
    // Prop reversal against s1 across the blank.
    const s3 = mkStep(
      3,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.e, "ccw"),
      parked("right")
    );
    const result = deriveReversals([s1, blank, s3]);
    expect(result[1]).toEqual({ left: NONE, right: NONE }); // blank never flags
    expect(result[2]).toEqual({ left: PROP, right: NONE }); // chain survived the blank
  });

  it("never flags nor anchors on a blank step even if it carries motion data", () => {
    const s1 = mkStep(1, proWN("left"), parked("right"));
    // A blank carrying (bogus) active motions must stay inert.
    const blank = mkStep(
      2,
      mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.w, "ccw"),
      parked("right"),
      { isBlank: true }
    );
    // s3 continues s1's arc + spin → no reversal (the blank's ccw is invisible).
    const s3 = mkStep(
      3,
      mkMotion("left", MotionType.pro, GridLocation.n, GridLocation.e, "cw"),
      parked("right")
    );
    const result = deriveReversals([s1, blank, s3]);
    expect(result[1]).toEqual({ left: NONE, right: NONE });
    expect(result[2]).toEqual({ left: NONE, right: NONE });
  });
});

describe("deriveReversals — loop wrap", () => {
  // Two-step loop: s1 arcs w→n cw; s2 retraces n→w with prop continuing cw
  // (hand reversal). With wrap, s1 is ALSO a hand reversal against s2's tail
  // arc (ccw → cw). Prop channel stays quiet throughout (all cw).
  const s1 = mkStep(1, proWN("left"), parked("right"));
  const s2 = mkStep(
    2,
    mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.w, "cw"),
    parked("right")
  );

  it("without loop: only the interior step carries the hand signal", () => {
    expect(deriveReversals([s1, s2])).toEqual([
      { left: NONE, right: NONE },
      { left: HAND, right: NONE },
    ]);
  });

  it("with loop: the first step wraps and carries the hand signal too", () => {
    expect(deriveReversals([s1, s2], { loop: true })).toEqual([
      { left: HAND, right: NONE },
      { left: HAND, right: NONE },
    ]);
  });

  it("with loop: a uniform same-direction loop stays reversal-free", () => {
    const a = mkStep(1, mkMotion("left", MotionType.pro, GridLocation.w, GridLocation.n, "cw"), parked("right"));
    const b = mkStep(2, mkMotion("left", MotionType.pro, GridLocation.n, GridLocation.e, "cw"), parked("right"));
    const c = mkStep(3, mkMotion("left", MotionType.pro, GridLocation.e, GridLocation.s, "cw"), parked("right"));
    const d = mkStep(4, mkMotion("left", MotionType.pro, GridLocation.s, GridLocation.w, "cw"), parked("right"));
    expect(deriveReversals([a, b, c, d], { loop: true })).toEqual([
      { left: NONE, right: NONE },
      { left: NONE, right: NONE },
      { left: NONE, right: NONE },
      { left: NONE, right: NONE },
    ]);
  });

  it("with loop: alternating prop spin flags the DOT channel on every step (findings-doc AB chain)", () => {
    // Same hand arc every step (all cw around the grid), prop alternating
    // cw/ccw — a genuine prop-reversal chain; every step dots, including the
    // first via wrap. Hand channel stays quiet (arcs never flip).
    const a = mkStep(1, mkMotion("left", MotionType.pro, GridLocation.w, GridLocation.n, "cw"), parked("right"));
    const b = mkStep(2, mkMotion("left", MotionType.anti, GridLocation.n, GridLocation.e, "ccw"), parked("right"));
    const c = mkStep(3, mkMotion("left", MotionType.pro, GridLocation.e, GridLocation.s, "cw"), parked("right"));
    const d = mkStep(4, mkMotion("left", MotionType.anti, GridLocation.s, GridLocation.w, "ccw"), parked("right"));
    expect(deriveReversals([a, b, c, d], { loop: true })).toEqual([
      { left: PROP, right: NONE },
      { left: PROP, right: NONE },
      { left: PROP, right: NONE },
      { left: PROP, right: NONE },
    ]);
  });
});

describe("deriveReversals — rotation-only data (no usable locations)", () => {
  // Steps whose motions carry rotation but whose locations are static-shaped
  // exercise the pure prop-rotation (dot) path — the legacy behavior must hold.
  function spinOnly(stepNumber: number, leftDir: Dir, rightDir: Dir) {
    return mkStep(
      stepNumber,
      mkMotion("left", MotionType.pro, GridLocation.n, GridLocation.n, leftDir),
      mkMotion("right", MotionType.pro, GridLocation.n, GridLocation.n, rightDir)
    );
  }

  it("flags prop flips on the dot channel exactly as the legacy detector did", () => {
    const result = deriveReversals([
      spinOnly(1, "cw", "ccw"),
      spinOnly(2, "ccw", "ccw"),
      spinOnly(3, "ccw", "cw"),
      spinOnly(4, "noRotation", "cw"),
      spinOnly(5, "cw", "cw"),
    ]);
    expect(result).toEqual([
      { left: NONE, right: NONE },
      { left: PROP, right: NONE }, // left cw→ccw
      { left: NONE, right: PROP }, // right ccw→cw
      { left: NONE, right: NONE }, // noRotation current never flags
      { left: PROP, right: NONE }, // left ccw→cw across the noRotation step
    ]);
  });
});
