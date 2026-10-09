/**
 * Turn Position Calculator
 *
 * Top/bottom turn number positions come from @tka/render-core (shared with
 * the MCP renderers); this file adds the column's right extent.
 */

import {
  calculateTurnPositions,
  TURNS_COLUMN_PADDING_X as PADDING_X,
  type TurnsColumnDimensions as Dimensions,
  type TurnPosition as Position,
  type TurnPositions,
} from "@tka/render-core";
import {
  getSlotUnitWidth,
  getTurnNumberWidth,
  shouldDisplayTurn,
  type TurnValue,
} from "./turn-tuple-parser";

export { calculateTurnPositions, PADDING_X };
export type { Dimensions, Position, TurnPositions };

/** The two turn slots a beat's skew-brace layout needs to know about. */
export interface TurnSlots {
  readonly top: TurnValue;
  readonly bottom: TurnValue;
  readonly topHalved: boolean;
  readonly bottomHalved: boolean;
}

/**
 * Width, in glyph units, that TurnsColumn occupies to the right of the
 * letter+dash reference edge - PADDING_X plus the wider of the two turn
 * slots' own drawable units (a halved slot's unit includes its mark and the
 * gap before it, via getSlotUnitWidth). Zero when neither slot will render,
 * matching TurnsColumn.svelte's own showTop/showBottom gate.
 *
 * Mirrors TurnsColumn.svelte's columnWidth $derived exactly (both slots'
 * units are measured unconditionally, then maxed) so a skew brace's closing
 * edge clears exactly what the turns column actually paints - no more, no
 * less. Single source of truth for that clearance; don't re-derive it in a
 * consumer.
 *
 * Deliberate divergence: reserves what the column reserves, not what it
 * paints - TurnsColumn's isColorHidden viewer-visibility term (a motion
 * toggled off in the viewer) is not considered, so worst case is extra
 * whitespace in the already-dimmed state, never an overlap.
 */
export function getTurnsColumnRightExtent(slots: TurnSlots): number {
  const willDisplay =
    shouldDisplayTurn(slots.top) ||
    slots.topHalved ||
    shouldDisplayTurn(slots.bottom) ||
    slots.bottomHalved;
  if (!willDisplay) return 0;

  const topUnit = getSlotUnitWidth(getTurnNumberWidth(slots.top), slots.topHalved);
  const bottomUnit = getSlotUnitWidth(
    getTurnNumberWidth(slots.bottom),
    slots.bottomHalved
  );

  return PADDING_X + Math.max(topUnit, bottomUnit);
}
