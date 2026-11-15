/**
 * Half speed for the guide's figure cards: one switch for the whole page, so
 * every card with Replay and ½× plays at the speed the reader chose, the
 * play in progress included (the player applies a tempo change live).
 */
export const guideHalfSpeed = $state({ on: false });

/** The tempo a figure card plays at, given its own. */
export const figureCardBpm = (bpm: number): number =>
  guideHalfSpeed.on ? bpm / 2 : bpm;
