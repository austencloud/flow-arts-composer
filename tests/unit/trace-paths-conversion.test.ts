/**
 * Trace Paths — content → trace conversion.
 *
 * These lock the properties the game is unplayable without: order and
 * direction survive the conversion, a broken chain is reported rather than
 * repaired, and a hand that stays put gets a hold instead of a zero-length
 * move. Fixtures go through the real domain factories so a shape change over
 * there breaks this file instead of quietly diverging from it.
 */

import { describe, it, expect } from "vitest";

import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createHandPath } from "$lib/shared/foundation/services/hand-path-factory";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import { sequenceToTraceRound } from "$lib/features/learn/play/games/trace-paths/services/sequence-to-trace";
import {
  handPathToTraceRound,
  pairHandPathsToTraceRound,
} from "$lib/features/learn/play/games/trace-paths/services/hand-path-to-trace";
import type {
  TraceHand,
  TraceRound,
  TraceSegment,
} from "$lib/features/learn/play/games/trace-paths/domain/trace-types";

// Fixtures

/** One hand's motion for one beat. Equal endpoints build a genuine STATIC. */
function handMotion(
  color: HandSide,
  start: GridLocation,
  end: GridLocation
): MotionData {
  const still = start === end;
  return createMotionData({
    hand: color,
    startLocation: start,
    endLocation: end,
    motionType: still ? MotionType.STATIC : MotionType.PRO,
    rotationDirection: still
      ? RotationDirection.NO_ROTATION
      : RotationDirection.CLOCKWISE,
    gridMode: GridMode.DIAMOND,
  });
}

/**
 * Build a two-hand sequence from per-hand location walks. `blue`/`red` are
 * full location lists (start + one entry per beat), so `["n","e","s"]` is two
 * beats: n→e then e→s.
 */
function twoHandSequence(
  left: readonly GridLocation[],
  right: readonly GridLocation[],
  options: { withStartPlacement?: boolean } = {}
) {
  const beatCount = left.length - 1;
  const steps: StepData[] = [];

  for (let i = 0; i < beatCount; i++) {
    steps.push(
      createStepData({
        stepNumber: i + 1,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            left[i] as GridLocation,
            left[i + 1] as GridLocation
          ),
          [HandSide.RIGHT]: handMotion(
            HandSide.RIGHT,
            right[i] as GridLocation,
            right[i + 1] as GridLocation
          ),
        },
      })
    );
  }

  return createSequenceData({
    id: "fixture-sequence",
    word: "TEST",
    gridMode: GridMode.DIAMOND,
    steps,
    ...(options.withStartPlacement
      ? {
          startPlacement: createStartPlacementData({
            motions: {
              [HandSide.LEFT]: handMotion(
                HandSide.LEFT,
                left[0] as GridLocation,
                left[0] as GridLocation
              ),
              [HandSide.RIGHT]: handMotion(
                HandSide.RIGHT,
                right[0] as GridLocation,
                right[0] as GridLocation
              ),
            },
          }),
        }
      : {}),
  });
}

/** Unwrap a result that is expected to have converted, failing loudly if it didn't. */
function expectOk(
  result: ReturnType<typeof sequenceToTraceRound>
): TraceRound {
  if (!result.ok) {
    throw new Error(
      `expected conversion to succeed, got ${result.error.code}: ${result.error.message}`
    );
  }
  return result.round;
}

/** The end location of a segment, whichever kind it is. */
function segmentEnd(segment: TraceSegment): GridLocation {
  return segment.kind === "move" ? segment.end : segment.location;
}

function walkOf(round: TraceRound, hand: TraceHand): GridLocation[] {
  const trace = round.hands[hand];
  if (!trace) throw new Error(`round has no ${hand} hand`);
  return [trace.start, ...trace.segments.map(segmentEnd)];
}

// ---------------------------------------------------------------------------

describe("sequenceToTraceRound", () => {
  it("preserves every hand's ordered start and end locations", () => {
    const leftWalk = [
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
    ] as const;
    const rightWalk = [
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH,
      GridLocation.EAST,
    ] as const;

    const round = expectOk(
      sequenceToTraceRound(
        twoHandSequence(leftWalk, rightWalk, { withStartPlacement: true })
      )
    );

    expect(walkOf(round, HandSide.LEFT)).toEqual([...leftWalk]);
    expect(walkOf(round, HandSide.RIGHT)).toEqual([...rightWalk]);

    // One beat per step, indexed in order, both hands present on each.
    expect(round.beats).toHaveLength(3);
    expect(round.beats.map((b) => b.index)).toEqual([0, 1, 2]);
    for (const beat of round.beats) {
      expect(beat.segments[HandSide.LEFT]).toBeDefined();
      expect(beat.segments[HandSide.RIGHT]).toBeDefined();
    }
  });

  it("keeps direction, not just the set of locations", () => {
    const forward = expectOk(
      sequenceToTraceRound(
        twoHandSequence(
          [GridLocation.NORTH, GridLocation.EAST],
          [GridLocation.SOUTH, GridLocation.WEST]
        )
      )
    );
    const reversed = expectOk(
      sequenceToTraceRound(
        twoHandSequence(
          [GridLocation.EAST, GridLocation.NORTH],
          [GridLocation.WEST, GridLocation.SOUTH]
        )
      )
    );

    const forwardBlue = forward.hands[HandSide.LEFT]?.segments[0];
    const reversedBlue = reversed.hands[HandSide.LEFT]?.segments[0];
    expect(forwardBlue?.kind).toBe("move");
    expect(reversedBlue?.kind).toBe("move");

    if (forwardBlue?.kind !== "move" || reversedBlue?.kind !== "move") {
      throw new Error("expected move segments");
    }
    expect(forwardBlue.start).toBe(GridLocation.NORTH);
    expect(forwardBlue.end).toBe(GridLocation.EAST);
    expect(reversedBlue.start).toBe(GridLocation.EAST);
    expect(reversedBlue.end).toBe(GridLocation.NORTH);

    // The sampled routes run opposite ways, so the first point of one is the
    // last point of the other.
    const f = forwardBlue.expectedPath;
    const r = reversedBlue.expectedPath;
    expect(f[0]?.x).toBeCloseTo(r[r.length - 1]?.x as number, 6);
    expect(f[0]?.y).toBeCloseTo(r[r.length - 1]?.y as number, 6);
  });

  it("reports a domain error naming the hand and beat when a beat does not chain", () => {
    // Red teleports: beat 2 starts at north although beat 1 left it at west.
    const steps: StepData[] = [
      createStepData({
        stepNumber: 1,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            GridLocation.NORTH,
            GridLocation.EAST
          ),
          [HandSide.RIGHT]: handMotion(
            HandSide.RIGHT,
            GridLocation.SOUTH,
            GridLocation.WEST
          ),
        },
      }),
      createStepData({
        stepNumber: 2,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            GridLocation.EAST,
            GridLocation.SOUTH
          ),
          [HandSide.RIGHT]: handMotion(
            HandSide.RIGHT,
            GridLocation.NORTH,
            GridLocation.EAST
          ),
        },
      }),
    ];

    const result = sequenceToTraceRound(
      createSequenceData({ id: "broken", word: "TEST", steps })
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a discontinuity error");
    expect(result.error.code).toBe("discontinuous-beat");
    expect(result.error.hand).toBe(HandSide.RIGHT);
    expect(result.error.beatIndex).toBe(1);
  });

  it("does not silently repair a discontinuity", () => {
    const result = sequenceToTraceRound(
      createSequenceData({
        id: "broken-start",
        word: "TEST",
        steps: [
          createStepData({
            stepNumber: 1,
            motions: {
              [HandSide.LEFT]: handMotion(
                HandSide.LEFT,
                GridLocation.NORTH,
                GridLocation.EAST
              ),
              [HandSide.RIGHT]: handMotion(
                HandSide.RIGHT,
                GridLocation.SOUTH,
                GridLocation.WEST
              ),
            },
          }),
        ],
        // The start position disagrees with beat 1: blue is parked at west but
        // beat 1 wants it to leave from north.
        startPlacement: createStartPlacementData({
          motions: {
            [HandSide.LEFT]: handMotion(
              HandSide.LEFT,
              GridLocation.WEST,
              GridLocation.WEST
            ),
            [HandSide.RIGHT]: handMotion(
              HandSide.RIGHT,
              GridLocation.SOUTH,
              GridLocation.SOUTH
            ),
          },
        }),
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a discontinuity error");
    expect(result.error.code).toBe("discontinuous-beat");
    expect(result.error.hand).toBe(HandSide.LEFT);
    expect(result.error.beatIndex).toBe(0);
  });

  it("turns a held (static) motion into a hold, never a zero-length move", () => {
    const round = expectOk(
      sequenceToTraceRound(
        twoHandSequence(
          // Blue stays put on beat 1, then travels on beat 2.
          [GridLocation.NORTH, GridLocation.NORTH, GridLocation.EAST],
          [GridLocation.SOUTH, GridLocation.WEST, GridLocation.NORTH]
        )
      )
    );

    const blueSegments = round.hands[HandSide.LEFT]?.segments ?? [];
    expect(blueSegments[0]).toEqual({
      kind: "hold",
      location: GridLocation.NORTH,
    });
    expect(blueSegments[1]?.kind).toBe("move");

    // No move segment anywhere may have identical endpoints.
    for (const trace of Object.values(round.hands)) {
      for (const segment of trace.segments) {
        if (segment.kind === "move") {
          expect(segment.start).not.toBe(segment.end);
        }
      }
    }
  });

  it("reports a domain error when a participating hand goes missing mid-round", () => {
    const steps: StepData[] = [
      createStepData({
        stepNumber: 1,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            GridLocation.NORTH,
            GridLocation.EAST
          ),
          [HandSide.RIGHT]: handMotion(
            HandSide.RIGHT,
            GridLocation.SOUTH,
            GridLocation.WEST
          ),
        },
      }),
      // Red omitted: createStepData fills it with an invisible placeholder.
      createStepData({
        stepNumber: 2,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            GridLocation.EAST,
            GridLocation.SOUTH
          ),
        },
      }),
    ];

    const result = sequenceToTraceRound(
      createSequenceData({ id: "dropped-hand", word: "TEST", steps })
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a missing-hand error");
    expect(result.error.code).toBe("missing-hand-motion");
    expect(result.error.hand).toBe(HandSide.RIGHT);
    expect(result.error.beatIndex).toBe(1);
  });

  it("converts a single-hand sequence with only that hand populated", () => {
    const steps: StepData[] = [
      createStepData({
        stepNumber: 1,
        motions: {
          [HandSide.LEFT]: handMotion(
            HandSide.LEFT,
            GridLocation.NORTH,
            GridLocation.EAST
          ),
        },
      }),
    ];

    const round = expectOk(
      sequenceToTraceRound(
        createSequenceData({ id: "solo", word: "TEST", steps })
      )
    );

    expect(Object.keys(round.hands)).toEqual([HandSide.LEFT]);
    expect(round.beats[0]?.segments[HandSide.RIGHT]).toBeUndefined();
  });

  it("refuses an empty sequence", () => {
    const result = sequenceToTraceRound(
      createSequenceData({ id: "empty", word: "", steps: [] })
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an empty-round error");
    expect(result.error.code).toBe("empty-round");
  });

  it("carries the sequence's grid mode onto the round", () => {
    const sequence = createSequenceData({
      id: "boxed",
      word: "TEST",
      gridMode: GridMode.BOX,
      steps: [
        createStepData({
          stepNumber: 1,
          motions: {
            [HandSide.LEFT]: handMotion(
              HandSide.LEFT,
              GridLocation.NORTHEAST,
              GridLocation.SOUTHEAST
            ),
          },
        }),
      ],
    });

    expect(expectOk(sequenceToTraceRound(sequence)).gridMode).toBe(GridMode.BOX);
  });
});

describe("handPathToTraceRound", () => {
  it("populates only the one hand", () => {
    const path = createHandPath([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);

    const result = handPathToTraceRound(path);
    const round = expectOk(result);

    expect(Object.keys(round.hands)).toEqual([HandSide.LEFT]);
    expect(round.hands[HandSide.RIGHT]).toBeUndefined();
    expect(walkOf(round, HandSide.LEFT)).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    expect(round.beats).toHaveLength(2);
    for (const beat of round.beats) {
      expect(beat.segments[HandSide.RIGHT]).toBeUndefined();
    }
  });

  it("can be assigned to the red hand instead", () => {
    const path = createHandPath([GridLocation.WEST, GridLocation.NORTH]);
    const round = expectOk(handPathToTraceRound(path, HandSide.RIGHT));

    expect(Object.keys(round.hands)).toEqual([HandSide.RIGHT]);
    expect(walkOf(round, HandSide.RIGHT)).toEqual([
      GridLocation.WEST,
      GridLocation.NORTH,
    ]);
  });

  it("refuses a path with nothing to trace", () => {
    const result = handPathToTraceRound(createHandPath([GridLocation.NORTH]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an empty-round error");
    expect(result.error.code).toBe("empty-round");
  });
});

describe("pairHandPathsToTraceRound", () => {
  it("puts two equal-length paths on one beat timeline", () => {
    const left = createHandPath([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    const right = createHandPath([
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH,
    ]);

    const round = expectOk(pairHandPathsToTraceRound(left, right));

    expect(round.beats).toHaveLength(2);
    expect(walkOf(round, HandSide.LEFT)).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    expect(walkOf(round, HandSide.RIGHT)).toEqual([
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH,
    ]);
    for (const beat of round.beats) {
      expect(beat.segments[HandSide.LEFT]).toBeDefined();
      expect(beat.segments[HandSide.RIGHT]).toBeDefined();
    }
  });

  it("errors when the two paths cover different numbers of beats", () => {
    const left = createHandPath([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    const right = createHandPath([GridLocation.SOUTH, GridLocation.WEST]);

    const result = pairHandPathsToTraceRound(left, right);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an unequal-length error");
    expect(result.error.code).toBe("unequal-hand-path-lengths");
  });
});

describe("normalized geometry", () => {
  it("keeps every expected-path point inside the 0..1 stage", () => {
    const round = expectOk(
      sequenceToTraceRound(
        twoHandSequence(
          // Covers an arc (adjacent points) and a dash (opposite points).
          [
            GridLocation.NORTH,
            GridLocation.EAST,
            GridLocation.WEST,
            GridLocation.WEST,
          ],
          [
            GridLocation.SOUTH,
            GridLocation.WEST,
            GridLocation.EAST,
            GridLocation.NORTH,
          ]
        )
      )
    );

    let checked = 0;
    for (const trace of Object.values(round.hands)) {
      for (const segment of trace.segments) {
        if (segment.kind !== "move") continue;
        expect(segment.expectedPath.length).toBeGreaterThan(1);
        for (const point of segment.expectedPath) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(1);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("starts and ends each sampled route at its own endpoints", () => {
    const round = expectOk(
      sequenceToTraceRound(
        twoHandSequence(
          [GridLocation.NORTH, GridLocation.EAST],
          [GridLocation.SOUTH, GridLocation.WEST]
        )
      )
    );

    const left = round.hands[HandSide.LEFT]?.segments[0];
    const right = round.hands[HandSide.RIGHT]?.segments[0];
    if (left?.kind !== "move" || right?.kind !== "move") {
      throw new Error("expected move segments");
    }

    // Blue leaves north and arrives east; red leaves south and arrives west.
    // In the 950-space grid north is above centre (y < 0.5) and east is right
    // of it (x > 0.5), which is what the normalized endpoints must show.
    const leftFirst = left.expectedPath[0];
    const leftLast = left.expectedPath[left.expectedPath.length - 1];
    expect(leftFirst?.y).toBeLessThan(0.5);
    expect(leftLast?.x).toBeGreaterThan(0.5);

    const rightFirst = right.expectedPath[0];
    const rightLast = right.expectedPath[right.expectedPath.length - 1];
    expect(rightFirst?.y).toBeGreaterThan(0.5);
    expect(rightLast?.x).toBeLessThan(0.5);
  });
});
