/**
 * TnD Mode Calculator
 *
 * Calculates TnD (Timing and Direction) mode and elemental type from pictograph data.
 * TnD mode is determined by a LOOKUP TABLE based on:
 * - Letter (A-V)
 * - Grid mode (DIAMOND or BOX)
 * - Start position (for conditional cases)
 *
 * Based on legacy tnd calculator (legacy vtg_glyph.py) implementation.
 */

import { TnDMode as TnDMode, ElementalType } from "../enums/pictograph-enums";
import type { Letter } from "../../../../foundation/domain/models/letter";
import { GridMode, GridPlacement } from "../../../grid/domain/enums/grid-enums";

export interface TnDCalculationResult {
  tndMode: TnDMode | null;
  elementalType: ElementalType | null;
}

// Position subsets used by conditional VTG lookups.
// Typed as GridPlacement[] so .includes() accepts the full GridPlacement union.
const BETA_3_7: GridPlacement[] = [GridPlacement.BETA3, GridPlacement.BETA7];
const ALPHA_1_5: GridPlacement[] = [GridPlacement.ALPHA1, GridPlacement.ALPHA5];
const GAMMA_DIAG: GridPlacement[] = [
  GridPlacement.GAMMA10,
  GridPlacement.GAMMA8,
  GridPlacement.GAMMA14,
  GridPlacement.GAMMA4,
];

/**
 * Mapping from VTG mode to elemental type.
 * Based on legacy SVG_PATHS mapping from elemental_glyph.py
 */
export const TND_TO_ELEMENTAL: Record<TnDMode, ElementalType> = {
  [TnDMode.SPLIT_SAME]: ElementalType.WATER,
  [TnDMode.SPLIT_OPP]: ElementalType.FIRE,
  [TnDMode.TOG_SAME]: ElementalType.EARTH,
  [TnDMode.TOG_OPP]: ElementalType.AIR,
  [TnDMode.QUARTER_SAME]: ElementalType.SUN,
  [TnDMode.QUARTER_OPP]: ElementalType.MOON,
};

/**
 * VTG Mode Lookup Tables
 *
 * These are hard-coded mappings from the legacy Python code.
 * VTG mode is NOT derived from motion properties - it's a deterministic
 * lookup based on letter, grid mode, and sometimes start position.
 */

// DIAMOND grid mode lookup
const DIAMOND_MODE_MAP: Record<
  string,
  TnDMode | ((startPos: GridPlacement) => TnDMode)
> = {
  A: TnDMode.SPLIT_SAME,
  B: TnDMode.SPLIT_SAME,
  C: TnDMode.SPLIT_SAME,
  D: (startPos: GridPlacement) =>
    BETA_3_7.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  E: (startPos: GridPlacement) =>
    BETA_3_7.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  F: (startPos: GridPlacement) =>
    BETA_3_7.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  G: TnDMode.TOG_SAME,
  H: TnDMode.TOG_SAME,
  I: TnDMode.TOG_SAME,
  J: (startPos: GridPlacement) =>
    ALPHA_1_5.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  K: (startPos: GridPlacement) =>
    ALPHA_1_5.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  L: (startPos: GridPlacement) =>
    ALPHA_1_5.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  M: TnDMode.QUARTER_OPP,
  N: TnDMode.QUARTER_OPP,
  O: TnDMode.QUARTER_OPP,
  P: TnDMode.QUARTER_OPP,
  Q: TnDMode.QUARTER_OPP,
  R: TnDMode.QUARTER_OPP,
  S: TnDMode.QUARTER_SAME,
  T: TnDMode.QUARTER_SAME,
  U: TnDMode.QUARTER_SAME,
  V: TnDMode.QUARTER_SAME,
};

// BOX grid mode lookup
const BOX_MODE_MAP: Record<
  string,
  TnDMode | ((startPos: GridPlacement) => TnDMode)
> = {
  A: TnDMode.SPLIT_SAME,
  B: TnDMode.SPLIT_SAME,
  C: TnDMode.SPLIT_SAME,
  D: TnDMode.QUARTER_OPP,
  E: TnDMode.QUARTER_OPP,
  F: TnDMode.QUARTER_OPP,
  G: TnDMode.TOG_SAME,
  H: TnDMode.TOG_SAME,
  I: TnDMode.TOG_SAME,
  J: TnDMode.QUARTER_OPP,
  K: TnDMode.QUARTER_OPP,
  L: TnDMode.QUARTER_OPP,
  M: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  N: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  O: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  P: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  Q: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  R: (startPos: GridPlacement) =>
    GAMMA_DIAG.includes(startPos)
      ? TnDMode.SPLIT_OPP
      : TnDMode.TOG_OPP,
  S: TnDMode.QUARTER_SAME,
  T: TnDMode.QUARTER_SAME,
  U: TnDMode.QUARTER_SAME,
  V: TnDMode.QUARTER_SAME,
};

/**
 * Calculate VTG mode from letter, grid mode, and start position.
 *
 * @param letter - Letter enum value
 * @param gridMode - Grid mode (DIAMOND or BOX)
 * @param startPlacement - Start position
 * @returns VTG calculation result
 */
export function calculateTnD(
  letter: Letter,
  gridMode: GridMode,
  startPlacement: GridPlacement
): TnDCalculationResult {
  const defaultResult: TnDCalculationResult = {
    tndMode: null,
    elementalType: null,
  };

  // Letter is an enum, use it directly as a string value
  const letterValue = letter as string;

  if (!letterValue) {
    return defaultResult;
  }

  // Select the appropriate lookup table based on grid mode
  const modeMap =
    gridMode === GridMode.DIAMOND ? DIAMOND_MODE_MAP : BOX_MODE_MAP;

  // Get the VTG mode from the lookup table
  const modeOrFunction = modeMap[letterValue];

  if (!modeOrFunction) {
    return defaultResult;
  }

  // If it's a function, call it with the start position
  const tndMode =
    typeof modeOrFunction === "function"
      ? modeOrFunction(startPlacement)
      : modeOrFunction;

  // Map VTG mode to elemental type
  const elementalType = TND_TO_ELEMENTAL[tndMode];

  return {
    tndMode,
    elementalType,
  };
}
