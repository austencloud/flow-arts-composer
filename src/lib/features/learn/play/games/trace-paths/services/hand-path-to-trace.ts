/**
 * HandPathData → TraceRound.
 *
 * A hand path is already exactly what this game wants: an ordered list of grid
 * locations, one hand, no motion/orientation baggage. So this is the simpler of
 * the two converters, and it also owns `buildTraceSegment` — the location-pair
 * → segment primitive that `sequence-to-trace` reuses, since a sequence
 * ultimately reduces to the same per-hand location walk.
 */

import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { HandPathData } from "#lib/shared/foundation/domain/models/hand-path-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { sampleSegmentPath } from "./trace-path-sampler";
import { TRACE_PATH_SAMPLE_COUNT } from "../domain/trace-config";
import type {
  HandTrace,
  TraceBeat,
  TraceConversionError,
  TraceConversionResult,
  TraceHand,
  TraceRound,
  TraceSegment,
} from "../domain/trace-types";

/**
 * Build one beat's segment for a hand travelling `from` → `to`.
 *
 * Equal endpoints mean the HAND does not travel, which is a hold — even when
 * the underlying motion is spinning the prop in place. This game traces where
 * the hand goes, so a spin-in-place and a static are the same ask: stay put.
 * Emitting a zero-length move instead would give the corridor no spine and the
 * progress metric nothing to be monotonic along.
 */
export function buildTraceSegment(
  from: GridLocation,
  to: GridLocation
): TraceSegment {
  if (from === to) {
    return { kind: "hold", location: from };
  }
  return {
    kind: "move",
    start: from,
    end: to,
    expectedPath: sampleSegmentPath(from, to, TRACE_PATH_SAMPLE_COUNT),
  };
}

function emptyRoundError(what: string): TraceConversionError {
  return {
    code: "empty-round",
    message: `${what} has nothing to trace — it needs at least two locations.`,
  };
}

/** Walk a location list into beat-ordered segments. `locations.length - 1` beats. */
function locationsToSegments(
  locations: readonly GridLocation[]
): TraceSegment[] {
  const segments: TraceSegment[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    segments.push(
      buildTraceSegment(locations[i] as GridLocation, locations[i + 1] as GridLocation)
    );
  }
  return segments;
}

/**
 * Convert a single verified hand path into a one-hand round.
 *
 * The resulting round has exactly one key in `hands` — the game's UI reads that
 * to know it should arm one hand and leave synchrony out of the scoring
 * entirely (null, not zero).
 */
export function handPathToTraceRound(
  handPath: HandPathData,
  hand: TraceHand = HandSide.LEFT
): TraceConversionResult {
  const locations = handPath.locations;
  if (locations.length < 2) {
    return { ok: false, error: emptyRoundError("This hand path") };
  }

  const segments = locationsToSegments(locations);
  const trace: HandTrace = {
    hand,
    start: locations[0] as GridLocation,
    segments,
  };

  const beats: TraceBeat[] = segments.map((segment, index) => ({
    index,
    segments: { [hand]: segment },
  }));

  const round: TraceRound = {
    id: `trace:hand-path:${handPath.id}`,
    gridMode: handPath.impliedGridMode,
    hands: { [hand]: trace },
    beats,
  };

  return { ok: true, round };
}

/**
 * Pair two verified hand paths onto ONE beat timeline.
 *
 * Both hands must have the same number of beats. Padding the shorter one would
 * invent a hold nobody choreographed and then score the player against it, so
 * unequal lengths are a refusal, not a repair.
 */
export function pairHandPathsToTraceRound(
  leftPath: HandPathData,
  rightPath: HandPathData
): TraceConversionResult {
  if (leftPath.locations.length < 2 || rightPath.locations.length < 2) {
    return { ok: false, error: emptyRoundError("This pair of hand paths") };
  }

  if (leftPath.locations.length !== rightPath.locations.length) {
    return {
      ok: false,
      error: {
        code: "unequal-hand-path-lengths",
        message:
          `These two hand paths cover different numbers of beats ` +
          `(blue ${leftPath.locations.length - 1}, red ${rightPath.locations.length - 1}), ` +
          `so they can't share one timeline.`,
      },
    };
  }

  const leftSegments = locationsToSegments(leftPath.locations);
  const rightSegments = locationsToSegments(rightPath.locations);

  const beats: TraceBeat[] = leftSegments.map((blueSegment, index) => ({
    index,
    segments: {
      [HandSide.LEFT]: blueSegment,
      [HandSide.RIGHT]: rightSegments[index] as TraceSegment,
    },
  }));

  const round: TraceRound = {
    id: `trace:hand-path-pair:${leftPath.id}+${rightPath.id}`,
    // Both paths are verified against the same grid; blue is the tiebreak when
    // a path's implied mode differs (e.g. an all-cardinal red beside a
    // cardinal+intercardinal blue that implies skewed).
    gridMode: leftPath.impliedGridMode,
    hands: {
      [HandSide.LEFT]: {
        hand: HandSide.LEFT,
        start: leftPath.locations[0] as GridLocation,
        segments: leftSegments,
      },
      [HandSide.RIGHT]: {
        hand: HandSide.RIGHT,
        start: rightPath.locations[0] as GridLocation,
        segments: rightSegments,
      },
    },
    beats,
  };

  return { ok: true, round };
}
