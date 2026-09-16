/**
 * Glyph positioning constants for pictograph rendering
 *
 * These values determine where glyphs (TKA letter, VTG, placement, reversal)
 * are placed within the 950x950 viewbox.
 */


export const TKA_GLYPH = {
  X: 50,
  Y: 800,
  SCALE: 1.0,
} as const;


export const STEP_NUMBER = {
  X: 50,
  Y: 50,
  FONT_SIZE: 100,
  START_FONT_SIZE: 80, // "Start" label uses smaller font
} as const;


export const DIRECTION_DOT = {
  PADDING: 10,
  SIZE: 25,
} as const;


export const TURN_NUMBER = {
  HEIGHT: 45,
  PADDING_X: 15,
  PADDING_Y: 5,
  // Width lookup by turn value
  WIDTHS: {
    "0.5": 80,
    "1": 30,
    "1.5": 80,
    "2": 30,
    "2.5": 83.67,
    "3": 30,
    "fl": 42.4,
  } as Record<string, number>,
} as const;


export const DASH_SUFFIX = {
  WIDTH: 70,
  HEIGHT: 20,
  GAP: 10,
  RADIUS: 9.5,
  FILL_DARK: "#ffffff",
  FILL_LIGHT: "#231f20",
} as const;


export const VTG_GLYPH = {
  WIDTH: 201.24,
  HEIGHT: 133.6,
  OFFSET_PERCENTAGE: 0.04,
} as const;


export const ELEMENTAL_GLYPH = {
  WIDTH: 95,
  HEIGHT: 125,
  OFFSET_PERCENTAGE: 0.04,
} as const;


export const PLACEMENT_GLYPH = {
  Y: 50,
  SCALE_FACTOR: 0.75,
  SPACING: 25,
  ARROW_WIDTH: 88.9,
  ARROW_HEIGHT: 34.8,
  // Letter dimensions from actual SVG viewBoxes
  LETTER_DIMENSIONS: {
    alpha: { width: 92.22, height: 100, yOffset: 10.0 },
    beta: { width: 66.05, height: 100, yOffset: 0.0 },
    gamma: { width: 79, height: 100.11, yOffset: 0.0 },
  } as Record<string, { width: number; height: number; yOffset: number }>,
} as const;


/**
 * Reversal indicator positioning
 *
 * Matches ReversalIndicators.svelte EXACTLY:
 * - X_POSITION_PERCENT = 5.5, multiplied by 13 = 71.5
 * - DOT_RADIUS_PERCENT = 1.5, multiplied by 10 = 15
 * - DOT_SPACING_PERCENT = 4.5, multiplied by 13 = 58.5
 * - CENTER_Y_PERCENT = 50, multiplied by 9.5 = 475
 *
 * When both reversals present: RED on top, BLUE on bottom
 */
export const REVERSAL_INDICATOR = {
  /** X position from left edge (5.5% * 13 = 71.5) */
  X_POSITION: 5.5 * 13, // = 71.5

  /** Dot radius (1.5% * 10 = 15) */
  DOT_RADIUS: 1.5 * 10, // = 15

  /** Vertical spacing between dots when both present (4.5% * 13 = 58.5) */
  DOT_SPACING: 4.5 * 13, // = 58.5

  /** Vertical center (50% * 9.5 = 475) */
  CENTER_Y: 50 * 9.5, // = 475
} as const;
