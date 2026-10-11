import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** Beats until every layer in one cell has completed a motion cycle. */
export function calculateArrangementCellBeats(
  cell: ArrangementCell,
  skipStartPlacement: boolean
): number {
  if (cell.layers.length === 0) return 0;
  const stepCounts = cell.layers.map((layer) => {
    const stepCount = layer.sequence.steps?.length || 1;
    return skipStartPlacement ? stepCount : stepCount + 1;
  });
  const firstCount = stepCounts[0];
  if (firstCount === undefined) return 1;
  return stepCounts.reduce((acc, count) => lcm(acc, count), firstCount);
}

/** One full grid cycle, including polyrhythms across its visible cells. */
export function calculateArrangementTotalBeats(
  cells: ArrangementCell[],
  skipStartPlacement: boolean,
  rows: number,
  cols: number
): number {
  const visibleWithLayers = cells.filter(
    (cell) => cell.row < rows && cell.col < cols && cell.layers.length > 0
  );
  if (visibleWithLayers.length === 0) return 0;
  const stepCounts = visibleWithLayers.map((cell) =>
    calculateArrangementCellBeats(cell, skipStartPlacement)
  );
  const firstCount = stepCounts[0];
  if (firstCount === undefined) return 0;
  return stepCounts.reduce((acc, count) => lcm(acc, count), firstCount);
}
