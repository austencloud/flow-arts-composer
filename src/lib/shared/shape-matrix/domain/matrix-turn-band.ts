import type {
  TurnLevel,
  TurnValue,
} from "$lib/shared/create/services/level-turn-values";
import {
  clampTurnToLevel,
  turnValuesForLevel,
} from "$lib/shared/create/services/level-turn-values";
import type { AxisFilter, MatrixFilters } from "./filter-flower-axis";
import { ratioLabel } from "./flower-signature";

export type MatrixLabelMode = "turns" | "ratios";

export function matrixTurnsForLevel(level: TurnLevel): readonly TurnValue[] {
  const standardTurns = turnValuesForLevel(level);
  if (level !== 4) return standardTurns;
  return ["fl", -0.25, ...standardTurns.filter((turn) => turn !== "fl")];
}

export function clampMatrixTurnToLevel(
  value: TurnValue,
  level: TurnLevel
): TurnValue {
  return matrixTurnsForLevel(level).includes(value)
    ? value
    : clampTurnToLevel(value, level);
}

export function matrixTurnVisibleLabel(
  turn: TurnValue,
  labelMode: MatrixLabelMode
): string {
  if (labelMode === "ratios") return ratioLabel(turn);
  return turn === "fl" ? "Float" : String(turn);
}

export function matrixTurnSpokenLabel(
  turn: TurnValue,
  labelMode: MatrixLabelMode
): string {
  if (labelMode === "ratios") return `${ratioLabel(turn)} ratio`;
  if (turn === "fl") return "Float";
  return `${turn} turn${turn === 1 ? "" : "s"}`;
}

function axisFilterForTurn(turn: TurnValue): AxisFilter {
  return {
    style: "all",
    turns: new Set([turn]),
    ori: "all",
    grid: "diamond",
  };
}

/** Independent axis bands keep every page finite: four rows by four columns. */
export function matrixFiltersForTurns(
  leftTurn: TurnValue,
  rightTurn: TurnValue
): MatrixFilters {
  return {
    left: axisFilterForTurn(leftTurn),
    right: axisFilterForTurn(rightTurn),
    collapse: false,
  };
}

/** Backwards-compatible same-band helper for lab consumers. */
export function matrixFiltersForTurn(turn: TurnValue): MatrixFilters {
  return matrixFiltersForTurns(turn, turn);
}

/**
 * The level and turn band the Shape Matrix opens on, for both hands. The
 * Create front door's Shape preview shows the same corner of the matrix.
 */
export const SHAPE_MATRIX_DEFAULT_LEVEL: TurnLevel = 2;
export const SHAPE_MATRIX_DEFAULT_TURN: TurnValue = 2;
