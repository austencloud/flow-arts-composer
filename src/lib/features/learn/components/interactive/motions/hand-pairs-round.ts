/**
 * One round of the Hand Motions lesson's two-hand stage: both hands start on
 * a point, each is dropped somewhere, and the two moves name a combination.
 * A hand moved twice in a round is re-targeted from where the round began, so
 * dropping it back there makes it static.
 */
import {
  classifyHandMove,
  type HandMove,
} from "#lib/shared/guide-topics/hand-motions-topic.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface HandPair {
  blue: HandMove;
  red: HandMove;
}

export interface PairRound {
  start: Record<HandSide, GridLocation>;
  moves: Partial<Record<HandSide, { to: GridLocation; move: HandMove }>>;
}

export function startRound(left: GridLocation, right: GridLocation): PairRound {
  return {
    start: { [HandSide.LEFT]: left, [HandSide.RIGHT]: right },
    moves: {},
  };
}

/** The round with `hand` dropped on `to`; unchanged when that is no hand move. */
export function placeHand(
  round: PairRound,
  hand: HandSide,
  to: GridLocation
): PairRound {
  const move = classifyHandMove(round.start[hand], to);
  if (!move) return round;
  return { ...round, moves: { ...round.moves, [hand]: { to, move } } };
}

/** Both hands' moves once both have been dropped. */
export function roundPair(round: PairRound): HandPair | null {
  const blue = round.moves[HandSide.LEFT];
  const red = round.moves[HandSide.RIGHT];
  return blue && red ? { blue: blue.move, red: red.move } : null;
}

/** The same two moves, made by the other hands. */
export function isMirrorPair(first: HandPair, next: HandPair): boolean {
  return (
    first.blue !== first.red &&
    first.blue === next.red &&
    first.red === next.blue
  );
}
