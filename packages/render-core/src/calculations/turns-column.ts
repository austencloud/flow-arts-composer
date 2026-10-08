/**
 * Turns column
 *
 * The glyph's turns column: two turn numbers to the right of the letter (and
 * its dash), each colored for the hand it belongs to. Which hand sits on top
 * depends on the letter type, not on left/right. The app's TurnsColumn, its
 * canvas renderers and the MCP renderers all read this one rule.
 */

/*
 * Turn Tuple Parser
 *
 * Parses turns tuple strings emitted by TurnsTupleGenerator into structured data.
 *
 * Supported forms (top/bottom positions match the PADS slot order):
 * - "(top, bottom)"                          - standard 2-part
 * - "(direction, top, bottom)"               - direction-prefixed 3-part
 * - "(rotDir, top, bottom)"                  - single-rotation 3-part (TYPE2/3/4/5/6)
 * - "(top, bottom, oc)"                      - Λ/Λ-/γ single-rotating-hand; oc binds to non-zero slot
 * - "(direction, top, bottom, topOC, bottomOC)" - Λ/Λ-/γ both-rotating-hands
 *
 * Examples:
 * - "(s, 1, 2)"            => { direction: "s", top: 1, bottom: 2 }
 * - "(1.5, fl)"            => { direction: null, top: 1.5, bottom: "fl" }
 * - "(cw, 0, 1)"           => { direction: "cw", top: 0, bottom: 1 }
 * - "(0, 1, op)"           => { direction: null, top: 0, bottom: 1, bottomOpenClose: "op" }
 * - "(1, 0, cl)"           => { direction: null, top: 1, bottom: 0, topOpenClose: "cl" }
 * - "(s, 1, 1, op, cl)"    => { direction: "s", top: 1, bottom: 1, topOpenClose: "op", bottomOpenClose: "cl" }
 *
 * Halved motions (docs/superpowers/specs/2026-07-16-half-notation-canon-design.md):
 * any turn slot may carry a trailing "/" marking the whole motion frozen at
 * t=0.5 (MotionData.segment {t0:0, t1:0.5}). "/" is per-hand, so it rides on
 * the top/bottom slot, never the direction/oc slots.
 * - "(1.5/, 2)"      => { top: 1.5, bottom: 2, topHalved: true, bottomHalved: false }
 * - "(s, 1/, 2/)"    => { direction: "s", top: 1, bottom: 2, topHalved: true, bottomHalved: true }
 * - "(0/, 0)"        => { top: 0, bottom: 0, topHalved: true, bottomHalved: false }
 *   (a halved 0-turn shows the mark alone — see shouldDisplayTurn's note)
 */

export type TurnValue = number | "fl";
export type DirectionValue = "s" | "o" | "cw" | "ccw" | null;
export type OpenCloseValue = "op" | "cl" | null;

export interface ParsedTurnsTuple {
  direction: DirectionValue;
  top: TurnValue;
  bottom: TurnValue;
  topOpenClose: OpenCloseValue;
  bottomOpenClose: OpenCloseValue;
  topHalved: boolean;
  bottomHalved: boolean;
}

const VALID_DIRECTIONS = ["s", "o", "cw", "ccw"] as const;
const VALID_OPEN_CLOSE = ["op", "cl"] as const;
const VALID_TURN_NUMBERS = [
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3,
] as const;

function parseOpenClose(value: string | undefined): OpenCloseValue {
  if (!value) return null;
  return VALID_OPEN_CLOSE.includes(value as (typeof VALID_OPEN_CLOSE)[number])
    ? (value as OpenCloseValue)
    : null;
}

function emptyResult(): ParsedTurnsTuple {
  return {
    direction: null,
    top: 0,
    bottom: 0,
    topOpenClose: null,
    bottomOpenClose: null,
    topHalved: false,
    bottomHalved: false,
  };
}

/**
 * Parse a turns tuple string into structured data
 */
export function parseTurnsTuple(turnsTuple: string): ParsedTurnsTuple {
  if (!turnsTuple.trim()) {
    return emptyResult();
  }

  try {
    const cleaned = turnsTuple.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map((p) => p.trim());

    if (parts.length < 2) {
      return emptyResult();
    }

    const firstIsDirection = VALID_DIRECTIONS.includes(
      parts[0] as (typeof VALID_DIRECTIONS)[number]
    );

    // 5-part: (direction, top, bottom, topOC, bottomOC) - Λ/Λ-/γ both hands rotating
    if (firstIsDirection && parts.length >= 5) {
      const top = parseHalvedTurn(parts[1] || "");
      const bottom = parseHalvedTurn(parts[2] || "");
      return {
        direction: parts[0] as DirectionValue,
        top: top.value,
        bottom: bottom.value,
        topOpenClose: parseOpenClose(parts[3]),
        bottomOpenClose: parseOpenClose(parts[4]),
        topHalved: top.halved,
        bottomHalved: bottom.halved,
      };
    }

    // 3-part direction-prefixed: (direction, top, bottom)
    if (firstIsDirection && parts.length >= 3) {
      const top = parseHalvedTurn(parts[1] || "");
      const bottom = parseHalvedTurn(parts[2] || "");
      return {
        direction: parts[0] as DirectionValue,
        top: top.value,
        bottom: bottom.value,
        topOpenClose: null,
        bottomOpenClose: null,
        topHalved: top.halved,
        bottomHalved: bottom.halved,
      };
    }

    // 3-part no-direction: (top, bottom, oc) - Λ/Λ-/γ single hand rotating.
    // The op/cl binds to whichever slot is non-zero; the zero slot has no rotational state.
    if (!firstIsDirection && parts.length >= 3) {
      const top = parseHalvedTurn(parts[0] || "");
      const bottom = parseHalvedTurn(parts[1] || "");
      const oc = parseOpenClose(parts[2]);
      const topNonZero = top.value !== 0;
      const bottomNonZero = bottom.value !== 0;
      return {
        direction: null,
        top: top.value,
        bottom: bottom.value,
        topOpenClose: topNonZero && !bottomNonZero ? oc : null,
        bottomOpenClose: bottomNonZero && !topNonZero ? oc : null,
        topHalved: top.halved,
        bottomHalved: bottom.halved,
      };
    }

    // 2-part: (top, bottom)
    {
      const top = parseHalvedTurn(parts[0] || "");
      const bottom = parseHalvedTurn(parts[1] || "");
      return {
        direction: null,
        top: top.value,
        bottom: bottom.value,
        topOpenClose: null,
        bottomOpenClose: null,
        topHalved: top.halved,
        bottomHalved: bottom.halved,
      };
    }
  } catch (error) {
    console.error("Failed to parse turns tuple:", turnsTuple, error);
    return emptyResult();
  }
}

/**
 * Strip a trailing "/" (halved-motion marker) off a turn slot before parsing
 * the number/fl underneath. Unknown junk still degrades to { value: 0, halved: false }
 * via parseTurnValue's existing fallback — the "/" alone never fabricates a turn.
 */
function parseHalvedTurn(raw: string): { value: TurnValue; halved: boolean } {
  const trimmed = raw.trim();
  const halved = trimmed.endsWith("/");
  const text = halved ? trimmed.slice(0, -1).trim() : trimmed;
  return { value: parseTurnValue(text), halved };
}

/**
 * Parse a single turn value string into a number or "fl"
 */
function parseTurnValue(value: string): TurnValue {
  if (!value) return 0;
  if (value === "fl") return "fl";

  const num = parseFloat(value);
  if (isNaN(num)) return 0;

  // Validate it's a valid turn number
  if (VALID_TURN_NUMBERS.includes(num as (typeof VALID_TURN_NUMBERS)[number])) {
    return num;
  }

  return 0;
}

/**
 * Check if a turn value should be displayed (non-zero)
 */
export function shouldDisplayTurn(value: TurnValue): boolean {
  if (value === "fl") return true;
  return typeof value === "number" && value !== 0;
}

/**
 * Get the file path for a turn number SVG
 * Note: static/ directory maps to / in SvelteKit
 */
export function getTurnNumberImagePath(value: TurnValue): string {
  if (value === "fl") {
    return "/images/numbers/float.svg";
  }

  if (typeof value === "number" && value !== 0) {
    return `/images/numbers/${value}.svg`;
  }

  return "";
}

/**
 * Get the actual width of a turn number SVG based on its viewBox
 * These values are extracted from the actual SVG files in static/images/numbers/
 *
 * ViewBox dimensions:
 * - 1, 2, 3: viewBox="0 0 30 45" (single digits)
 * - float: viewBox="0 0 42.4 45"
 * - quarter values: viewBox="0 0 120 45" (three-character decimals)
 * - 0.5, 1.5: viewBox="0 0 80 45" (decimal numbers)
 * - 2.5: viewBox="0 0 83.67 45" (widest decimal)
 */
export function getTurnNumberWidth(value: TurnValue): number {
  if (value === "fl") {
    return 42.4;
  }

  if (typeof value === "number") {
    if (value % 0.5 === 0.25) {
      return 120;
    }
    // Decimal numbers (0.5, 1.5, 2.5) are wider
    if (value === 0.5 || value === 1.5) {
      return 80;
    }
    if (value === 2.5) {
      return 83.67;
    }
    // Single digits (1, 2, 3) are narrow
    return 30;
  }

  return 0;
}

/**
 * Path to the standalone halved-motion mark asset (Treatment B, ratified
 * 2026-07-16). Rendered as its own <image>, positioned after the turn
 * number by the consumer — the asset itself carries no offset.
 */
export const HALF_MARK_IMAGE_PATH = "/images/numbers/half.svg";

/**
 * Width of the halved-motion mark's viewBox (static/images/numbers/half.svg,
 * viewBox="0 0 16 45"). A function, not a constant, to match
 * getTurnNumberWidth's shape in case the mark ever needs per-value sizing.
 */
export function getHalfMarkWidth(): number {
  return 16;
}

/**
 * Gap (in glyph units) between a turn number and its halved-motion mark.
 * Matches the geometry proven on the A/B page (src/routes/test/half-notation/
 * +page.svelte's MARK_GAP). Every renderer that draws the mark (the live SVG
 * TurnsColumn, the canvas-2d pipeline, the video-export prerenderer) imports
 * this single constant rather than hardcoding "8" a second or third time.
 */
export const MARK_GAP = 8;

/**
 * Width of a turn slot's full drawable unit: just the number's own width when
 * not halved, or number + gap + mark when halved. This is the box each slot
 * centers within (see getSlotOffsetX) so a halved slot's mark never overlaps
 * a neighboring column or gets clipped by a column sized for the number alone.
 *
 * Single source of truth for TurnsColumn.svelte, canvas-2d-glyph-renderer.ts,
 * and export-glyph-prerenderer.ts - don't re-derive this inline in a consumer.
 */
export function getSlotUnitWidth(ownWidth: number, halved: boolean): number {
  return halved ? ownWidth + MARK_GAP + getHalfMarkWidth() : ownWidth;
}

/**
 * Left offset (within a shared column box of `columnWidth`) at which a slot's
 * unit should render, so the number/mark pair centers the same way an
 * unhalved number always has (reproduces the historical xMid-via-
 * preserveAspectRatio centering for the unhalved case, where unit === ownWidth).
 */
export function getSlotOffsetX(
  columnWidth: number,
  ownWidth: number,
  halved: boolean
): number {
  return (columnWidth - getSlotUnitWidth(ownWidth, halved)) / 2;
}

// Position: the column sits PADDING_X past the letter (or its dash). The top
// number hangs PADDING_Y above the letter; the bottom one ends PADDING_Y below it.
export const PADDING_X = 15;
const PADDING_Y = 5;
const DASH_WIDTH = 70;
const DASH_GAP = 10;

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

/** Top and bottom number positions relative to the letter's top-left corner. */
export function calculateTurnPositions(
  letterDimensions: Dimensions,
  bottomNumberHeight: number = 45,
  hasDash: boolean = false
): TurnPositions {
  const referenceWidth = hasDash
    ? letterDimensions.width + DASH_GAP + DASH_WIDTH
    : letterDimensions.width;
  const baseX = referenceWidth + PADDING_X;
  return {
    top: { x: baseX, y: -PADDING_Y },
    bottom: { x: baseX, y: letterDimensions.height - bottomNumberHeight + PADDING_Y },
  };
}

export type TurnsColumnHand = "left" | "right";

export interface TurnsColumnMotion {
  motionType: string;
  prefloatMotionType?: string | null;
}

function columnLetterType(letter: string): string {
  if (["Φ-", "Ψ-", "Λ-"].includes(letter)) return "TYPE5";
  if (["α", "β", "γ"].includes(letter)) return "TYPE6";
  if (letter.endsWith("-")) return "TYPE3";
  if (["Φ", "Ψ", "Λ"].includes(letter)) return "TYPE4";
  if (["W", "X", "Y", "Z", "Σ", "Δ", "Θ", "Ω"].includes(letter)) return "TYPE2";
  if (["C", "F", "I", "L", "O", "R", "U", "V"].includes(letter)) return "TYPE1_HYBRID";
  return "TYPE1_NON_HYBRID";
}

function lowerType(motion: TurnsColumnMotion): string {
  return typeof motion.motionType === "string" ? motion.motionType.toLowerCase() : "";
}

/** A float reads as the shift it replaced. */
function actualMotionType(motion: TurnsColumnMotion): string {
  const type = lowerType(motion);
  if (type === "float" && typeof motion.prefloatMotionType === "string") {
    return motion.prefloatMotionType.toLowerCase();
  }
  return type;
}

/**
 * Which hand owns the top and the bottom number. Follows the turns tuple's
 * slot order: Type 2 shift over static, hybrid Type 1 pro over anti, Type 3
 * shift over dash, Type 4 dash over static; everything else left over right.
 */
export function turnsColumnHands(
  letter: string | null | undefined,
  left: TurnsColumnMotion | null | undefined,
  right: TurnsColumnMotion | null | undefined
): { top: TurnsColumnHand; bottom: TurnsColumnHand } {
  const plain = { top: "left", bottom: "right" } as const;
  if (!letter || !left || !right) return plain;
  const handOf = (motion: TurnsColumnMotion): TurnsColumnHand =>
    motion === left ? "left" : "right";
  const isShift = (motion: TurnsColumnMotion) =>
    ["pro", "anti", "float"].includes(lowerType(motion));

  switch (columnLetterType(letter)) {
    case "TYPE2": {
      const shift = isShift(left) ? left : right;
      const still = isShift(left) ? right : left;
      return { top: handOf(shift), bottom: handOf(still) };
    }
    case "TYPE1_HYBRID": {
      const leftType = actualMotionType(left);
      const pro = leftType === "pro" ? left : right;
      const anti = leftType === "anti" ? left : right;
      return { top: handOf(pro), bottom: handOf(anti) };
    }
    case "TYPE3": {
      const leftIsDash = lowerType(left) === "dash";
      return {
        top: handOf(leftIsDash ? right : left),
        bottom: handOf(leftIsDash ? left : right),
      };
    }
    case "TYPE4": {
      const leftIsDash = lowerType(left) === "dash";
      return {
        top: handOf(leftIsDash ? left : right),
        bottom: handOf(leftIsDash ? right : left),
      };
    }
    default:
      return plain;
  }
}
