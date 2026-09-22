/**
 * Turn Position Calculator
 *
 * Calculates X/Y positions for top and bottom turn numbers
 * based on letter dimensions.
 *
 * Logic ported from legacy turns_column.py position_turns() method.
 */

import {
  getSlotUnitWidth,
  getTurnNumberWidth,
  shouldDisplayTurn,
  type TurnValue,
} from "./turn-tuple-parser";

export interface Dimensions {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface TurnPositions {
  top: Position;
  bottom: Position;
}

// Constants from legacy implementation
export const PADDING_X = 15; // Distance to the right of reference element
const PADDING_Y = 5; // Vertical padding from letter edges

// Dash dimensions (must match Dash.svelte)
const DASH_WIDTH = 70;
const DASH_GAP = 10; // Gap between letter and dash

/**
 * Calculate positions for top and bottom turn numbers
 * based on letter dimensions and bottom number height.
 *
 * Legacy positioning logic from turns_column.py:
 * - X: Uses dash's right edge if dash visible, otherwise letter's right edge + 15px
 * - Top Y: letter.top - PADDING_Y
 * - Bottom Y: letter.bottom - bottomNumberHeight + PADDING_Y
 *
 * @param letterDimensions - Width and height of the letter SVG
 * @param bottomNumberHeight - Height of the bottom number SVG (default 45)
 * @param hasDash - Whether this letter has a dash (Type3/Type5 letters)
 * @returns Positions for top and bottom turn numbers
 */
export function calculateTurnPositions(
  letterDimensions: Dimensions,
  bottomNumberHeight: number = 45, // Default from SVG viewBox
  hasDash: boolean = false
): TurnPositions {
  // Base X position: right edge of reference element + padding
  // For dash letters, reference is the dash's right edge
  // For non-dash letters, reference is the letter's right edge
  const referenceWidth = hasDash
    ? letterDimensions.width + DASH_GAP + DASH_WIDTH
    : letterDimensions.width;
  const baseX = referenceWidth + PADDING_X;

  // Top Y position: top of letter - padding
  // Note: Y positioning always uses letter dimensions, even for dash letters
  const topY = -PADDING_Y;

  // Bottom Y position: bottom of letter - number height + padding
  // This aligns the bottom of the number with the bottom of the letter
  const bottomY = letterDimensions.height - bottomNumberHeight + PADDING_Y;

  return {
    top: { x: baseX, y: topY },
    bottom: { x: baseX, y: bottomY },
  };
}

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
