import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";

/** The grid behind an arrangement project's card: its shown size and populated cells. */
export interface ArrangementSummary {
  rows: number;
  cols: number;
  sequences: number;
}

function isArrangementItem(
  item: unknown
): item is { kind: "arrangement"; snapshot: ArrangementSnapshot } {
  if (!item || typeof item !== "object") return false;
  const { kind, snapshot } = item as { kind?: unknown; snapshot?: unknown };
  return kind === "arrangement" && !!snapshot && typeof snapshot === "object";
}

/**
 * The first arrangement item's grid, for a project a schema or store has
 * already validated. Both the guest and the signed-in listings call this so
 * an arrangement card reads the same whichever one built it.
 */
export function arrangementSummaryOf(project: {
  tracks: readonly { items: readonly unknown[] }[];
}): ArrangementSummary | undefined {
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (!isArrangementItem(item)) continue;
      const { gridRows, gridCols, cells } = item.snapshot;
      return {
        rows: gridRows,
        cols: gridCols,
        sequences: cells.filter(
          (cell) =>
            cell.row < gridRows && cell.col < gridCols && cell.layers.length > 0
        ).length,
      };
    }
  }
  return undefined;
}
