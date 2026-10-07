/**
 * Box shapes for Create method previews. The front door's container tiers
 * size each box (spec: Placement), and a scene reads its box and composes
 * for one of three shapes. Thresholds are tuned on the bench
 * (/test/create-method-previews).
 */
import { waveBandAt } from "$lib/shared/create/utils/grid-calculations";

export type MethodPreviewShape = "strip" | "roomy" | "square";

/** A box narrower than this (width over height) composes as a square. */
export const SQUARE_MAX_ASPECT = 1.6;

/** A strip at least this tall has room for the roomier composition. */
export const ROOMY_MIN_HEIGHT = 72;

export function classifyPreviewShape(
  width: number,
  height: number
): MethodPreviewShape {
  if (!(width > 0) || !(height > 0)) return "strip";
  if (width / height < SQUARE_MAX_ASPECT) return "square";
  return height >= ROOMY_MIN_HEIGHT ? "roomy" : "strip";
}

/**
 * Fit a row of square cells into a strip: cells as tall as the strip, as
 * many as fit up to `max`. When fewer than `min` fit at full height, the
 * cells shrink so `min` still fit.
 */
export function rowOfCells(
  width: number,
  height: number,
  gap: number,
  min: number,
  max: number
): { count: number; size: number } {
  if (!(width > 0) || !(height > 0)) return { count: 0, size: 0 };
  let size = Math.floor(height);
  let count = Math.min(max, Math.floor((width + gap) / (size + gap)));
  if (count < min) {
    count = min;
    size = Math.floor((width - gap * (min - 1)) / min);
  }
  return { count, size: Math.max(0, size) };
}

/** The largest square cell that fits `columns` by `rows` cells and their gaps. */
export function gridCellSize(
  width: number,
  height: number,
  columns: number,
  rows: number,
  gap: number
): number {
  if (!(width > 0) || !(height > 0) || columns < 1 || rows < 1) return 0;
  const byWidth = (width - gap * (columns - 1)) / columns;
  const byHeight = (height - gap * (rows - 1)) / rows;
  return Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
}

/**
 * The wave band of a slot laid out row by row in `columns` columns. Slot 0
 * is the lead slot: the step grid's start position, the Generate preview's
 * dice. The front starts there, as it does in the step grid.
 */
export function slotWaveBand(slot: number, columns: number): number {
  const width = Math.max(1, Math.floor(columns));
  return waveBandAt(Math.floor(slot / width), slot % width);
}
