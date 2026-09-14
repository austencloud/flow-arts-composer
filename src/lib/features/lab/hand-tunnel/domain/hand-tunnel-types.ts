/**
 * Hand Tunnel Lab domain types.
 *
 * A tunnel is several performers stacked in one wall plane, each running a
 * timing-and-direction hand path. Every TnD is a closed four-beat loop, so
 * performers share one four-beat playhead and differ only in which loop they
 * run and how it is placed on the grid.
 *
 * A performer's placement is a list of segments so a later builder can switch
 * a performer's TnD at a beta node mid-sequence. Today every performer has
 * exactly one segment starting at beat 0.
 */

import type { HandPathReferenceCardId } from "$lib/features/choreo-card/domain/hand-path-reference-card-manifest";

export type Tnd = HandPathReferenceCardId;

/** Quarter turns clockwise applied to every waypoint. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/** Which beat of the four-beat loop the performer is on at global beat 0. */
export type PhaseOffset = 0 | 1 | 2 | 3;

export interface Segment {
  /** Global beat this segment starts on. Always 0 in the single-segment lab. */
  fromBeat: number;
  tnd: Tnd;
  rotation: QuarterTurns;
  /** Reflect across the vertical axis: east and west swap, and so do the hands. */
  mirror: boolean;
  /** Reflect across the horizontal axis: north and south swap, hands stay put. */
  flip: boolean;
  phase: PhaseOffset;
}

export interface Performer {
  id: string;
  label: string;
  segments: Segment[];
}

export const MAX_PERFORMERS = 8;

/** Beats in every TnD loop. */
export const LOOP_BEATS = 4;

export const TND_ORDER: readonly Tnd[] = ["ts", "to", "ss", "so", "qs", "qo"];

export const TND_FAMILY_ID: Readonly<Record<Tnd, string>> = {
  ss: "split-same",
  ts: "tog-same",
  so: "split-opp",
  to: "tog-opp",
  qs: "quarter-same",
  qo: "quarter-opp",
};
