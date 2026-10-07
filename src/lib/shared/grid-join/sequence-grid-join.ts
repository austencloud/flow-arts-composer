/**
 * Reading and replacing the join a sequence carries (`SequenceData.conjoined`).
 */
import type { GridJoin } from "@tka/tka-types";
import { gridJoinCellResolver, isGridJoin } from "@tka/render-core";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { gridJoinsEqual } from "./grid-join-controller";

/** The sequence's join, or null for one grid (or a malformed stored value). */
export function sequenceGridJoin(
  sequence: { readonly conjoined?: unknown } | null | undefined
): GridJoin | null {
  const join = sequence?.conjoined;
  return isGridJoin(join) ? join : null;
}

/**
 * The sequence carrying `join` (null removes it). Returns the same object when
 * it already carries that join, so derived state keeps its identity.
 */
export function withSequenceGridJoin<T extends SequenceData>(
  sequence: T,
  join: GridJoin | null
): T {
  if (gridJoinsEqual(join, sequenceGridJoin(sequence))) return sequence;
  const { conjoined: _removed, ...rest } = sequence;
  return (join ? { ...rest, conjoined: join } : rest) as T;
}

/**
 * A cell (a step, the start placement) drawn with the join its sequence
 * carries. Display-only: the result is for a picture and is never stored on
 * the step. Same object back when the sequence is on one grid and the cell
 * carries no join of its own; null/undefined cells give null.
 */
export function withSequenceJoinApplied<T extends object>(
  sequence: { readonly conjoined?: unknown } | null | undefined,
  cell: T | null | undefined
): T | null {
  if (!cell) return null;
  return gridJoinCellResolver({ conjoined: sequenceGridJoin(sequence) })(cell);
}

/** The same stamp for a whole list of cells, in order. */
export function withSequenceJoinAppliedToAll<T extends object>(
  sequence: { readonly conjoined?: unknown } | null | undefined,
  cells: readonly T[]
): T[] {
  const stamp = gridJoinCellResolver({ conjoined: sequenceGridJoin(sequence) });
  return cells.map((cell) => stamp(cell));
}
