/**
 * How wide the step editor draws its step while the step's duration changes.
 *
 * The editor's card is as wide as the step's duration, the way the step's
 * cell widens in the grid. The card's box eases to a new width, but the
 * drawing inside fits its own width at once, so drawing the new width while
 * the box still has the old one shrinks the step mid-move. The drawing
 * therefore keeps the narrower of the two widths while the box moves: a
 * longer step's drawing widens once the box has grown, a shorter one's
 * narrows before the box shrinks.
 */

export interface StepWidthPlan {
  /** The card's width, in counts. */
  card: number;
  /** The drawing's width now, in counts. */
  drawn: number;
  /** The drawing's width once the card has settled. */
  settledDrawn: number;
  /** True while the card eases; false sizes it at once. */
  moving: boolean;
}

/**
 * @param previous the duration the card showed last, or null when it showed
 *   no step (the editor just opened, or the start was selected).
 * @param target the step's duration now.
 * @param drawn the drawing's current width, which lags `previous` while a
 *   longer step is still growing.
 * @param motionMs the move's duration; 0 under reduced motion.
 */
export function planStepWidth(
  previous: number | null,
  target: number,
  drawn: number,
  motionMs: number
): StepWidthPlan {
  if (previous === null || previous === target || motionMs === 0) {
    return { card: target, drawn: target, settledDrawn: target, moving: false };
  }
  return {
    card: target,
    drawn: Math.min(drawn, target),
    settledDrawn: target,
    moving: true,
  };
}
