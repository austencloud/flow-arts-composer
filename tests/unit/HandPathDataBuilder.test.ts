import { describe, it, expect } from "vitest";
import { parseHandPathId, buildFromTrace, buildFromHandPathId } from "#lib/features/choreo-card/services/hand-path-data-builder.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  HandSide,
  HandPath,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// Standard 9-location trace (8 beats) used across multiple tests.
// Blue: n→e→e→s→s→w→w→n→n  (clockwise around the diamond, back to start)
// Red:  s→w→w→n→n→e→e→s→s  (same motion starting from south)
const STANDARD_ID =
  "n→e→e→s→s→w→w→n→n|s→w→w→n→n→e→e→s→s";

describe("HandPathDataBuilder.parseHandPathId", () => {
  it("parses 9 blue locations from the standard trace", () => {
    const trace = parseHandPathId(STANDARD_ID);
    expect(trace.left).toHaveLength(9);
  });

  it("parses 9 red locations from the standard trace", () => {
    const trace = parseHandPathId(STANDARD_ID);
    expect(trace.right).toHaveLength(9);
  });

  it("maps blue locations to correct GridLocation enum values", () => {
    const trace = parseHandPathId(STANDARD_ID);
    expect(trace.left).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.WEST,
      GridLocation.NORTH,
      GridLocation.NORTH,
    ]);
  });

  it("maps red locations to correct GridLocation enum values", () => {
    const trace = parseHandPathId(STANDARD_ID);
    expect(trace.right).toEqual([
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.WEST,
      GridLocation.NORTH,
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.SOUTH,
    ]);
  });

  it("handles intercardinal locations (ne, se, sw, nw)", () => {
    const intercardinalId =
      "ne→se→sw→nw→ne|nw→sw→se→ne→nw";
    const trace = parseHandPathId(intercardinalId);
    expect(trace.left).toEqual([
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridLocation.SOUTHWEST,
      GridLocation.NORTHWEST,
      GridLocation.NORTHEAST,
    ]);
    expect(trace.right).toEqual([
      GridLocation.NORTHWEST,
      GridLocation.SOUTHWEST,
      GridLocation.SOUTHEAST,
      GridLocation.NORTHEAST,
      GridLocation.NORTHWEST,
    ]);
  });

  it("throws on a missing pipe separator", () => {
    expect(() => parseHandPathId("n→e→s")).toThrow();
  });
});

describe("HandPathDataBuilder.buildFromTrace", () => {
  // Re-use the same parsed trace for all beat-level assertions.
  const trace = parseHandPathId(STANDARD_ID);

  it("produces 8 beats from a 9-location trace", () => {
    const beats = buildFromTrace(trace);
    expect(beats).toHaveLength(8);
  });

  it("sets null letter on all beats", () => {
    const beats = buildFromTrace(trace);
    for (const beat of beats) {
      expect(beat.letter).toBeNull();
    }
  });

  it("sets DIAMOND grid mode on all beats", () => {
    const beats = buildFromTrace(trace);
    for (const beat of beats) {
      expect(beat.gridMode).toBe(GridMode.DIAMOND);
    }
  });

  it("sets HAND prop type on all blue motions", () => {
    const beats = buildFromTrace(trace);
    for (const beat of beats) {
      expect(beat.motions[HandSide.LEFT]?.propType).toBe(PropType.HAND);
    }
  });

  it("sets HAND prop type on all red motions", () => {
    const beats = buildFromTrace(trace);
    for (const beat of beats) {
      expect(beat.motions[HandSide.RIGHT]?.propType).toBe(PropType.HAND);
    }
  });

  it("sets FLOAT motion type when hand moves (n→e)", () => {
    // Beat 1: blue goes n→e (moves), red goes s→w (moves)
    const beats = buildFromTrace(trace);
    const beat1 = beats[0]!;
    expect(beat1.motions[HandSide.LEFT]?.motionType).toBe(MotionType.FLOAT);
  });

  it("sets 'fl' turns when hand moves", () => {
    const beats = buildFromTrace(trace);
    const beat1 = beats[0]!;
    expect(beat1.motions[HandSide.LEFT]?.turns).toBe("fl");
  });

  it("records correct start and end locations for a float beat", () => {
    // Beat 1: blue n→e
    const beats = buildFromTrace(trace);
    const blue1 = beats[0]!.motions[HandSide.LEFT]!;
    expect(blue1.startLocation).toBe(GridLocation.NORTH);
    expect(blue1.endLocation).toBe(GridLocation.EAST);
  });

  it("sets STATIC motion type when hand stays at the same location (e→e)", () => {
    // Beat 2: blue e→e (static), red w→w (static)
    const beats = buildFromTrace(trace);
    const beat2 = beats[1]!;
    expect(beat2.motions[HandSide.LEFT]?.motionType).toBe(MotionType.STATIC);
  });

  it("sets 0 turns when hand stays", () => {
    const beats = buildFromTrace(trace);
    const beat2 = beats[1]!;
    expect(beat2.motions[HandSide.LEFT]?.turns).toBe(0);
  });

  it("sets STATIC handPath when hand doesn't move", () => {
    // Beat 2: blue e→e
    const beats = buildFromTrace(trace);
    const beat2 = beats[1]!;
    expect(beat2.motions[HandSide.LEFT]?.handPath).toBe(HandPath.STATIC);
  });

  it("derives CW handPath for N→E", () => {
    // Beat 1: blue n→e
    const beats = buildFromTrace(trace);
    expect(beats[0]!.motions[HandSide.LEFT]?.handPath).toBe(
      HandPath.CLOCKWISE
    );
  });

  it("derives CW handPath for S→W", () => {
    // Beat 1: red s→w
    const beats = buildFromTrace(trace);
    expect(beats[0]!.motions[HandSide.RIGHT]?.handPath).toBe(
      HandPath.CLOCKWISE
    );
  });

  it("derives CCW handPath for E→N", () => {
    // Build a trace where blue goes e→n (counter-clockwise step)
    const ccwTrace = {
      left: [GridLocation.EAST, GridLocation.NORTH],
      right: [GridLocation.WEST, GridLocation.WEST],
    };
    const beats = buildFromTrace(ccwTrace);
    expect(beats[0]!.motions[HandSide.LEFT]?.handPath).toBe(
      HandPath.COUNTER_CLOCKWISE
    );
  });

  it("derives DASH handPath for opposite locations (N→S)", () => {
    const dashTrace = {
      left: [GridLocation.NORTH, GridLocation.SOUTH],
      right: [GridLocation.WEST, GridLocation.WEST],
    };
    const beats = buildFromTrace(dashTrace);
    expect(beats[0]!.motions[HandSide.LEFT]?.handPath).toBe(HandPath.DASH);
  });

  it("sets DASH motionType for opposite locations (N→S)", () => {
    const dashTrace = {
      left: [GridLocation.NORTH, GridLocation.SOUTH],
      right: [GridLocation.EAST, GridLocation.EAST],
    };
    const beats = buildFromTrace(dashTrace);
    expect(beats[0]!.motions[HandSide.LEFT]?.motionType).toBe(MotionType.DASH);
    expect(beats[0]!.motions[HandSide.LEFT]?.turns).toBe(0);
  });

  it("derives HASH_IN for perimeter → center", () => {
    const hashTrace = {
      left: [GridLocation.NORTH, GridLocation.CENTER],
      right: [GridLocation.SOUTH, GridLocation.SOUTH],
    };
    const beats = buildFromTrace(hashTrace);
    expect(beats[0]!.motions[HandSide.LEFT]?.handPath).toBe(HandPath.HASH_IN);
    expect(beats[0]!.motions[HandSide.LEFT]?.motionType).toBe(MotionType.DASH);
  });

  it("derives HASH_OUT for center → perimeter", () => {
    const hashTrace = {
      left: [GridLocation.CENTER, GridLocation.EAST],
      right: [GridLocation.SOUTH, GridLocation.SOUTH],
    };
    const beats = buildFromTrace(hashTrace);
    expect(beats[0]!.motions[HandSide.LEFT]?.handPath).toBe(HandPath.HASH_OUT);
    expect(beats[0]!.motions[HandSide.LEFT]?.motionType).toBe(MotionType.DASH);
  });

  it("generates deterministic beat IDs for the same trace", () => {
    const beats1 = buildFromTrace(trace);
    const beats2 = buildFromTrace(trace);
    for (let i = 0; i < beats1.length; i++) {
      expect(beats1[i]!.id).toBe(beats2[i]!.id);
    }
  });

  it("generates different beat IDs for different traces", () => {
    const altTrace = {
      left: [
        GridLocation.EAST,
        GridLocation.SOUTH,
        GridLocation.WEST,
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
        GridLocation.WEST,
        GridLocation.NORTH,
        GridLocation.EAST,
      ],
      right: trace.right,
    };
    const beats1 = buildFromTrace(trace);
    const beats2 = buildFromTrace(altTrace);
    expect(beats1[0]!.id).not.toBe(beats2[0]!.id);
  });

  it("embeds beat index in the ID (step-1, step-2...)", () => {
    const beats = buildFromTrace(trace);
    for (let i = 0; i < beats.length; i++) {
      expect(beats[i]!.id).toContain(`step-${i + 1}`);
    }
  });
});

describe("HandPathDataBuilder.buildFromHandPathId", () => {
  it("produces the same result as parseHandPathId + buildFromTrace", () => {
    const viaId = buildFromHandPathId(STANDARD_ID);
    const viaTrace = buildFromTrace(
      parseHandPathId(STANDARD_ID)
    );
    expect(viaId).toHaveLength(viaTrace.length);
    for (let i = 0; i < viaId.length; i++) {
      expect(viaId[i]!.id).toBe(viaTrace[i]!.id);
    }
  });
});
