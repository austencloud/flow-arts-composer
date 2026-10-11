import { TURN_VALUES } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";
import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
import {
  gridIsRedundant,
  type Flower,
  type FlowerOri,
} from "./flower-signature";

export interface AxisFilter {
  style: "all" | "pro" | "anti";
  turns: ReadonlySet<TurnValue>;
  ori: "all" | FlowerOri;
  grid: "all" | "diamond" | "box";
}

export interface MatrixFilters {
  left: AxisFilter;
  right: AxisFilter;
  collapse: boolean;
}

export function defaultAxisFilter(): AxisFilter {
  // grid defaults to "diamond" so the matrix opens at its 28-flower size; the
  // 45° box variants (4× the cells) are opt-in via the Grid control.
  return {
    style: "all",
    turns: new Set<TurnValue>(TURN_VALUES),
    ori: "all",
    grid: "diamond",
  };
}

export function defaultMatrixFilters(): MatrixFilters {
  return {
    left: defaultAxisFilter(),
    right: defaultAxisFilter(),
    collapse: true,
  };
}

/**
 * Select which flowers of an axis to display.
 * `collapse` drops geometric duplicates: the even-petal `out` twin (identical
 * to `in`) and the box twin of a 45°-symmetric flower (identical to diamond).
 */
export function applyFilter(
  axis: Flower[],
  f: AxisFilter,
  collapse: boolean
): Flower[] {
  return axis.filter(
    (fl) =>
      (f.style === "all" || fl.style === f.style) &&
      f.turns.has(fl.turns) &&
      (f.ori === "all" || fl.ori === f.ori) &&
      (f.grid === "all" || fl.grid === f.grid) &&
      (!collapse || fl.petals % 2 === 1 || fl.ori === "in") &&
      (!collapse || !gridIsRedundant(fl))
  );
}
