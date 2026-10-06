/**
 * Grid Join Transforms
 *
 * A joined sequence draws one grid per hand, with the red grid sitting
 * `toward` of the blue one. When a transform moves the whole picture, the join
 * has to move with it, or the grids come out the wrong way round:
 * - mirror turns `toward` east ↔ west, flip turns it north ↔ south, and rotate
 *   turns it by the same 45° steps as every hand location;
 * - a hand swap keeps every path where it was and trades the colors, so the
 *   blue grid is now where the red one was and `toward` points the other way;
 * - rewind only plays time backwards, so the join stays as it is.
 *
 * A transform aimed at one hand moves that hand's path inside its own grid and
 * leaves the grids where they are, so it keeps the join too.
 */

import type { GridJoin, GridJoinDirection } from "@tka/tka-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  VERTICAL_MIRROR_LOCATION_MAP,
  HORIZONTAL_MIRROR_LOCATION_MAP,
} from "$lib/shared/create/domain/strict-loop-placement-maps";
import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import type { TargetHand } from "$lib/shared/create/state/panel-coordination-state.svelte";

type JoinTurn = (toward: GridJoinDirection) => GridJoinDirection;

function turnJoin(join: GridJoin, turn: JoinTurn): GridJoin {
  return { ...join, toward: turn(join.toward) };
}

export function mirrorGridJoin(join: GridJoin): GridJoin {
  return turnJoin(
    join,
    (toward) => VERTICAL_MIRROR_LOCATION_MAP[toward] as GridJoinDirection
  );
}

export function flipGridJoin(join: GridJoin): GridJoin {
  return turnJoin(
    join,
    (toward) => HORIZONTAL_MIRROR_LOCATION_MAP[toward] as GridJoinDirection
  );
}

/** Positive = clockwise, in 45° steps, the same as `rotateLocation`. */
export function rotateGridJoin(join: GridJoin, rotationAmount: number): GridJoin {
  return turnJoin(
    join,
    (toward) => rotateLocation(toward, rotationAmount) as GridJoinDirection
  );
}

/** The blue grid takes the red grid's place, so the join points back. */
export function swapGridJoin(join: GridJoin): GridJoin {
  return rotateGridJoin(join, 4);
}

/**
 * The sequence-level `conjoined` update for a transform's result: empty when
 * the sequence has no join or the transform leaves the grids in place.
 */
export function turnedJoinUpdate(
  sequence: SequenceData,
  targetHand: TargetHand,
  turn: (join: GridJoin) => GridJoin
): Pick<SequenceData, "conjoined"> | Record<string, never> {
  if (!sequence.conjoined || targetHand !== "both") return {};
  return { conjoined: turn(sequence.conjoined) };
}
