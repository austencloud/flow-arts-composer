import { POST_MIN_ITEM_SECONDS } from "@austencloud/video-editor/core";
import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";

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

/** One complete Arrange cycle, measured from the grid's own tempo. */
export function arrangementDurationSeconds(
  snapshot: ArrangementSnapshot
): number {
  const beats = calculateArrangementTotalBeats(
    snapshot.cells,
    snapshot.skipStartPlacement,
    snapshot.gridRows,
    snapshot.gridCols
  );
  return Math.max(
    POST_MIN_ITEM_SECONDS,
    (Math.max(1, beats) * 60) / snapshot.bpm
  );
}

/** The same beat that Arrange's playback engine would show at this source time. */
export function arrangementBeatAt(
  snapshot: ArrangementSnapshot,
  sourceTimeSeconds: number
): number {
  return (Math.max(0, sourceTimeSeconds) * snapshot.bpm) / 60;
}

/**
 * Grid beats one cell takes to finish a cycle. A cell running at twice the
 * grid's speed gets through its layers' common cycle in half the beats.
 */
export function arrangementCellCycleBeats(
  cell: ArrangementCell,
  skipStartPlacement: boolean
): number {
  const beats = calculateArrangementCellBeats(cell, skipStartPlacement);
  return beats / (cell.speedMultiplier ?? 1);
}

/**
 * The orchestrator step one layer shows at `gridBeat`. The cell's beat
 * offset delays it: a cell offset by two waits two grid beats and then plays
 * its first beat, and before that it shows the tail of its cycle, as a loop
 * that is phase-shifted does. The cell's speed scales its own beats, and a
 * layer's offset shifts that layer within the cell.
 *
 * Steps are 1-based for the orchestrator: with the start placement skipped a
 * cycle of N steps maps to 1..N; with it shown, 0 is the start pose and the
 * cycle is N + 1 beats long.
 */
export function arrangementLayerStep(
  gridBeat: number,
  cell: ArrangementCell,
  layer: TunnelLayerConfig,
  skipStartPlacement: boolean
): number {
  const stepCount = layer.sequence.steps?.length || 1;
  const cycle = skipStartPlacement ? stepCount : stepCount + 1;
  const speed = cell.speedMultiplier ?? 1;
  const layerBeat = (gridBeat - cell.beatOffset) * speed + layer.beatOffset;
  const wrapped = ((layerBeat % cycle) + cycle) % cycle;
  return skipStartPlacement ? wrapped + 1 : wrapped;
}
