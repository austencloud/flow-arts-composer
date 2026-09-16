/**
 * Trace Paths — boundary types.
 *
 * A "trace round" is the thing the player is asked to draw: an ordered,
 * directed route per hand, laid out on a beat timeline. Order and direction
 * are the whole point of the game, so every shape here is a LIST, never a set
 * — a recognizer that accepts the right shape traversed in the wrong order is
 * wrong, and these types are built so that mistake can't be expressed.
 *
 * Everything spatial in this module lives in normalized stage space (0..1),
 * never in device pixels. The stage is a square (the pictograph's 950x950
 * coordinate space divided through by 950), so a tolerance expressed here
 * means the same fraction of the stage on a phone and on a 4K monitor.
 */

import type {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandPathData } from "$lib/shared/foundation/domain/models/hand-path-data";

/**
 * Which hand a trace belongs to.
 *
 * Deliberately an alias of the canonical `HandSide` rather than a fresh
 * string union: these values are used to index `step.motions[hand]`
 * and `startPlacement.motions[hand]`, so tying them to the domain enum means a
 * rename over there breaks compilation here instead of silently missing a key.
 *
 * Hand identity is never communicated by color alone at the UI layer — the
 * shell always pairs the color with a shape or a label. This type is just the
 * data key.
 */
export type TraceHand = HandSide;

/** Iteration order for the two hands. Left first, everywhere, always. */
export const TRACE_HANDS: readonly TraceHand[] = [
  HandSide.LEFT,
  HandSide.RIGHT,
];

/**
 * A point in normalized stage space: 0..1 on both axes, y pointing DOWN to
 * match canvas/SVG convention (so 0,0 is the top-left of the stage).
 *
 * There is an unrelated `NormalizedPoint` in the prop-tracking lab
 * (`features/train/prop-tracking-lab/domain/models.ts`). We deliberately do
 * not import it: that one is normalized against a *video frame* of unknown
 * aspect ratio, this one against the square pictograph stage, and reaching
 * across two sibling features for a two-field record would couple Play to
 * Train for no gain.
 */
export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

/** A player-contributed pointer position: normalized stage space + a timestamp in ms. */
export interface TraceSample {
  readonly x: number;
  readonly y: number;
  /** Milliseconds, on whatever monotonic clock the capture layer used. */
  readonly t: number;
}

/**
 * One hand's work for one beat.
 *
 * A hand that does not travel this beat gets a `hold`, NOT a zero-length
 * `move`. That distinction is load-bearing: a hold is scored as "stay put",
 * and collapsing it into a move with identical endpoints would ask the player
 * to draw a path of length zero and make every corridor/progress metric
 * degenerate.
 */
export type TraceSegment =
  | {
      readonly kind: "move";
      readonly start: GridLocation;
      readonly end: GridLocation;
      /**
       * The route the hand actually takes, densely sampled in normalized
       * stage space and ordered start → end. This is the corridor's spine and
       * the source of the checkpoints.
       */
      readonly expectedPath: NormalizedPoint[];
    }
  | {
      readonly kind: "hold";
      readonly location: GridLocation;
    };

/** One hand's whole route through the round, in order. */
export interface HandTrace {
  readonly hand: TraceHand;
  readonly start: GridLocation;
  /** Beat-ordered. `segments[i]` is what this hand does on beat `i`. */
  readonly segments: TraceSegment[];
}

/**
 * One beat of the round. Both hands share the timeline, which is what makes
 * the synchrony metric meaningful — beat `i` is the same instant for both.
 */
export interface TraceBeat {
  readonly index: number;
  readonly segments: Partial<Record<TraceHand, TraceSegment>>;
}

/**
 * The converted, playable round.
 *
 * `hands` is partial because a single-hand round is legal (a bare hand path
 * has exactly one hand). `beats` is the same information sliced the other way
 * — per-beat instead of per-hand — because the evaluator walks time and the
 * renderer walks routes.
 */
export interface TraceRound {
  readonly id: string;
  readonly gridMode: GridMode;
  readonly hands: Partial<Record<TraceHand, HandTrace>>;
  readonly beats: TraceBeat[];
}

/** Where a round's content came from. Both branches convert to the same TraceRound. */
export type TraceSource =
  | { readonly kind: "sequence"; readonly sequence: SequenceData }
  | { readonly kind: "hand-path"; readonly handPath: HandPathData };

// Conversion result

/**
 * Why a conversion refused. Content in the wild is not always traceable — a
 * sequence can jump a hand between beats, or carry a blank hand mid-round —
 * and the game shows an earned error with a retry rather than pretending.
 * Conversion never silently repairs the data.
 */
export type TraceConversionErrorCode =
  /** No steps / no locations to trace. */
  | "empty-round"
  /** Beat `beatIndex` does not begin where beat `beatIndex - 1` left this hand. */
  | "discontinuous-beat"
  /** This hand is absent or an invisible placeholder on beat `beatIndex`. */
  | "missing-hand-motion"
  /** Two hand paths handed to the pairing converter have different lengths. */
  | "unequal-hand-path-lengths";

export interface TraceConversionError {
  readonly code: TraceConversionErrorCode;
  /** Plain, non-blaming sentence. Safe to show; the UI may still substitute its own copy. */
  readonly message: string;
  /** Which hand the problem belongs to, when the problem is hand-specific. */
  readonly hand?: TraceHand;
  /** Zero-based beat index the problem was found at, when it is beat-specific. */
  readonly beatIndex?: number;
}

export type TraceConversionResult =
  | { readonly ok: true; readonly round: TraceRound }
  | { readonly ok: false; readonly error: TraceConversionError };

// Evaluation output (produced by the evaluator, consumed by the results view)

/** The first place a hand left the route, if it did. Null-when-clean. */
export interface TraceDivergence {
  readonly hand: TraceHand;
  readonly beatIndex: number;
  readonly reason:
    | "skipped-checkpoint"
    | "out-of-corridor"
    | "wrong-order"
    | "lifted"
    | "hold-broken";
  readonly at: NormalizedPoint;
}

/** A stretch where a hand strayed outside the corridor and came back. */
export interface CorridorExcursion {
  readonly hand: TraceHand;
  readonly beatIndex: number;
  /** Furthest normalized distance from the route's spine during this excursion. */
  readonly maxDistance: number;
  readonly sampleCount: number;
}

export interface TraceMetrics {
  /** Fraction of the expected route the player actually covered, 0..1. */
  readonly coverage: number;
  /** How close to the spine they stayed, 0..1. */
  readonly accuracy: number;
  /** How unbroken the draw was, 0..1. */
  readonly continuity: number;
  /** Two-hand timing agreement, 0..1. Null on a single-hand round — not zero. */
  readonly synchrony: number | null;
  /** Discrete Fréchet distance between drawn and expected, normalized to stage width. */
  readonly frechetNormalized: number;
  readonly corridorExcursions: CorridorExcursion[];
  readonly checkpointsHit: number;
  readonly checkpointsTotal: number;
  readonly elapsedMs: number;
  /** First divergence, or null if the whole round stayed on route. */
  readonly divergence: TraceDivergence | null;
}
