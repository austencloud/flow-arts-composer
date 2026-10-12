import type { ArrangementCell } from "../domain/arrangement.js";
import type { CellEffect } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * A cell as the retired Arrange tab stored it: an `ArrangementCell` plus the
 * v1 look fields the converter still reads from and writes to saved
 * compositions. New code uses `ArrangementCell` and its `appearance`.
 */
export interface GridCell extends ArrangementCell {
  effect?: CellEffect;
  trailMode?: TrailMode;
  effort?: string;
}

/** The result of a geometric transform on one layer's sequence. */
export interface TransformResult {
  success: boolean;
  transformed?: SequenceData;
  error?: string;
}

/** The grid as `compositionToGridState` returns it. */
export interface GridStateSnapshot {
  cells: GridCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
}
