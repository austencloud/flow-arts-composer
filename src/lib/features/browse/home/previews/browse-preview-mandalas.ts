/**
 * Which Shape Matrix tiles the Browse home's Visuals preview draws. A tile
 * is a crossing of the matrix's axis with itself: a blue-hand flower (row)
 * and a red-hand flower (column). The picks step around the axis so turns
 * side by side never repeat a tile. Pure, so tests check the picks.
 */
import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";

/** Row and column steps, as shares of the axis, for successive turns. */
const PICKS: ReadonlyArray<readonly [number, number]> = [
  [0.2, 0.55],
  [0.65, 0.3],
  [0.4, 0.85],
  [0.9, 0.1],
  [0.05, 0.7],
  [0.75, 0.45],
];

export function mandalaPairAt(
  axis: readonly Flower[],
  index: number
): { left: Flower; right: Flower } | null {
  if (axis.length === 0) return null;
  const pick = PICKS[((index % PICKS.length) + PICKS.length) % PICKS.length]!;
  const at = (share: number) =>
    Math.min(axis.length - 1, Math.floor(share * axis.length));
  const left = axis[at(pick[0])];
  const right = axis[at(pick[1])];
  return left && right ? { left, right } : null;
}
