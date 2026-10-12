import type { GridJoin } from "@tka/tka-types";
import { isGridJoin } from "@tka/render-core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  sequenceGridJoin,
  withSequenceGridJoin,
} from "#lib/shared/grid-join/sequence-grid-join.js";
import type { ArrangementCell } from "./arrangement.js";

/**
 * The join an arrangement cell draws. A cell's `gridJoin` is a tri-state:
 * undefined follows the first layer's sequence, null draws one grid, a join
 * is the cell's own pair. Every layer in the cell shares the resolved join
 * (the engine moves overlaid layers onto the pair), so the cell is the owner,
 * never a layer.
 */
type CellJoinSource = Pick<ArrangementCell, "layers" | "gridJoin">;

/** True when the cell carries no join of its own and follows its sequence. */
export function arrangementCellFollowsSequence(
  cell: Pick<ArrangementCell, "gridJoin">
): boolean {
  return cell.gridJoin === undefined;
}

/**
 * The cell's resolved join, or null for one grid. A stored value that is not
 * a join (an older build's leftovers) counts as following the sequence.
 */
export function arrangementCellGridJoin(cell: CellJoinSource): GridJoin | null {
  const own = cell.gridJoin;
  if (own === null) return null;
  if (isGridJoin(own)) return own;
  return sequenceGridJoin(cell.layers[0]?.sequence);
}

/**
 * The first layer's sequence carrying the cell's resolved join: the one
 * sequence the cell's preview and card draw with, and the only place the
 * cell's join is applied. The same object comes back when nothing changes,
 * so a cell without an own join renders with the identical sequence it used
 * before. Null for an empty cell.
 */
export function arrangementCellSequence(
  cell: CellJoinSource
): SequenceData | null {
  const sequence = cell.layers[0]?.sequence;
  if (!sequence) return null;
  return withSequenceGridJoin(sequence, arrangementCellGridJoin(cell));
}
