import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import { createStartPlacementFromBeatStart } from "#lib/shared/create/services/sequence-transforms.js";
import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
import { gridJoinCellResolver } from "@tka/render-core";
import type { GridJoin } from "@tka/tka-types";

/** One pictograph slot in a beat strip: the start position (index 0) or a beat. */
export interface NotationCell {
  key: string;
  data: StepData | StartPlacementData;
  label: string;
  isStart: boolean;
  /** 0 = start position, 1..N = beat number. */
  stepNumber: number;
}

/**
 * A joined cell is a copy of its step with the join stamped on. Rebuilding the
 * cells (any change to the sequence object) must hand back the same copy for an
 * unchanged step, because strips compare cell data by identity to decide which
 * pictographs to replace.
 */
const stampedCells = new WeakMap<object, { join: GridJoin; cell: object }>();

function stampJoin<T extends object>(cell: T, join: GridJoin): T {
  const known = stampedCells.get(cell);
  if (known && known.join.toward === join.toward && known.join.steps === join.steps) {
    return known.cell as T;
  }
  const stamped = gridJoinCellResolver({ conjoined: join })(cell);
  stampedCells.set(cell, { join, cell: stamped });
  return stamped;
}

/**
 * Build the ordered cells for a beat strip: a Start cell (real start position, or
 * derived from beat 1 when absent) followed by one cell per beat with 1-based labels.
 * Pure — no playback, no DOM. Mirrors the landing Infinite Spinner derivation so the
 * landing and practice surfaces produce identical strips.
 *
 * A joined sequence (`conjoined`) displays joined everywhere: every cell's data
 * carries the sequence's join so the renderers draw the two grids. This is
 * display-only; the stored steps never gain a `conjoined` field. Cell keys stay
 * the same across a join change (nothing caches by key, and a strip that resets
 * on a key change would jump back to its start when the join is edited).
 */
export function buildNotationCells(seq: SequenceData | null | undefined): NotationCell[] {
  if (!seq?.steps?.length) return [];
  const join = sequenceGridJoin(seq);
  const cells: NotationCell[] = [];

  const startPos =
    seq.startPlacement ?? (seq.steps[0] ? createStartPlacementFromBeatStart(seq.steps[0]) : null);
  if (startPos) {
    cells.push({
      key: `start-${seq.id ?? seq.word}`,
      data: join ? stampJoin(startPos, join) : startPos,
      label: "Start",
      isStart: true,
      stepNumber: 0,
    });
  }

  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i]!;
    cells.push({
      key: `beat-${i}-${step.letter ?? i}`,
      data: join ? stampJoin(step, join) : step,
      label: `${i + 1}`,
      isStart: false,
      stepNumber: i + 1,
    });
  }

  return cells;
}
