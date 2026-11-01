/**
 * Scoped nudges for a card's live cells: given a cell's step index (-1 the
 * start), how far to move each hand's prop. A tunnel sheet sets it so the
 * front pair's staffs slide off the partner staffs drawn over them. Unset
 * everywhere else, so cells draw their props where the pictograph puts them.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("cell-prop-nudges");

export type CellPropNudges = (
  cellIndex: number
) => Partial<Record<"left" | "right", { x: number; y: number }>> | undefined;

export function setCellPropNudges(nudges: CellPropNudges): void {
  setContext(KEY, nudges);
}

export function getCellPropNudges(): CellPropNudges | undefined {
  return getContext<CellPropNudges | undefined>(KEY);
}
