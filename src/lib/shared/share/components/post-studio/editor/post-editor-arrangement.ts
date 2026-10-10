import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";

/** Keep the Arrange grid's 8×8 backing cells so every visible position can be edited. */
export function createBlankArrangementSnapshot(): ArrangementSnapshot {
  return {
    schemaVersion: 1,
    cells: Array.from({ length: 64 }, (_, index) => {
      const row = Math.floor(index / 8);
      const col = index % 8;
      return {
        id: `cell-${row}-${col}`,
        row,
        col,
        layers: [],
        beatOffset: 0,
        colSpan: 1,
        rowSpan: 1,
        mediaType: "animation" as const,
      };
    }),
    gridRows: 2,
    gridCols: 2,
    bpm: 120,
    skipStartPlacement: true,
  };
}
