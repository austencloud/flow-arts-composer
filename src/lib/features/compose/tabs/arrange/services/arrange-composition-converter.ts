/**
 * ArrangeCompositionConverter
 *
 * Converts between the Arrange tab's GridCell[] format (localStorage-era)
 * and the Composition/CellConfig format used by Dexie and the Browse tab.
 *
 * GridCell stores layers as TunnelLayerConfig[] with per-layer sequences.
 * CellConfig stores sequences[] at the cell level, with optional tunnelLayers.
 */

import type {
  Composition,
  CellConfig,
  CellType,
  MediaDisplayType,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import {
  getDefaultTrailSettings,
  getTunnelLayerColors,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type { CellMediaType } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { GridCell } from "../state/arrange-grid-state.svelte";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import type { GridStateSnapshot } from "./types";

/**
 * Map CellMediaType (Arrange) → MediaDisplayType (Composition).
 * Both use string literals; this bridges naming differences.
 */
function cellMediaToDisplayType(media: CellMediaType): MediaDisplayType {
  switch (media) {
    case "animation":
      return "animation";
    case "video":
      return "video";
    case "image":
      return "image";
    case "choreo-card":
      return "stepGrid";
    case "viewer-3d":
      return "animation";
    case "empty":
      return "animation";
    default:
      return "animation";
  }
}

/**
 * Map MediaDisplayType (Composition) → CellMediaType (Arrange).
 */
function displayTypeToCellMedia(
  display: MediaDisplayType | undefined
): CellMediaType {
  switch (display) {
    case "animation":
      return "animation";
    case "video":
      return "video";
    case "image":
      return "image";
    case "stepGrid":
      return "choreo-card";
    default:
      return "animation";
  }
}

function gridCellToCellConfig(cell: GridCell): CellConfig {
  const isTunnel = cell.layers.length > 1;
  const cellType: CellType = isTunnel ? "tunnel" : "single";
  const sequences = cell.layers.map((l) => l.sequence);

  const config: CellConfig = {
    id: cell.id,
    type: cellType,
    mediaType: cellMediaToDisplayType(cell.mediaType),
    sequences,
    trailSettings: getDefaultTrailSettings(),
  };

  // Preserve full tunnel layer configs for round-trip fidelity
  if (isTunnel) {
    config.tunnelLayers = cell.layers.map((l) => ({
      sequence: l.sequence,
      beatOffset: l.beatOffset,
      propColors: l.propColors,
      transformStack: l.transformStack ?? [],
      appliedTransforms: l.appliedTransforms,
    }));
  }

  return config;
}

function cellConfigToGridCell(
  config: CellConfig,
  row: number,
  col: number,
  backingCell: GridCell
): GridCell {
  let layers: TunnelLayerConfig[];

  if (config.tunnelLayers && config.tunnelLayers.length > 0) {
    // Full layer configs preserved from save
    layers = config.tunnelLayers;
  } else {
    // Reconstruct from sequences array with default colors
    layers = config.sequences.map((seq, i) => ({
      sequence: seq,
      beatOffset: 0,
      propColors: getTunnelLayerColors(i),
      transformStack: [],
    }));
  }

  return {
    ...backingCell,
    id: `cell-${row}-${col}`,
    row,
    col,
    layers,
    beatOffset: 0,
    colSpan: 1, // CellConfig doesn't store span info; default 1x1
    rowSpan: 1,
    mediaType: displayTypeToCellMedia(config.mediaType),
  };
}

function parseCellId(cellId: string): { row: number; col: number } | null {
  const match = cellId.match(/^cell-(\d+)-(\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
}

export function gridCellsToComposition(
  id: string,
  name: string,
  snapshot: GridStateSnapshot
): Composition {
  const { cells, gridRows, gridCols } = snapshot;

  // Only convert visible cells that have content
  const visibleCells = cells.filter(
    (c) => c.row < gridRows && c.col < gridCols && c.layers.length > 0
  );

  const cellConfigs: CellConfig[] = visibleCells.map((cell) =>
    gridCellToCellConfig(cell)
  );

  const now = new Date();

  return {
    id,
    name,
    layout: { rows: gridRows, cols: gridCols },
    cells: cellConfigs,
    arrangement: validateArrangementSnapshot({ schemaVersion: 1, ...snapshot }),
    createdAt: now,
    updatedAt: now,
    creator: "austen",
    isFavorite: false,
  };
}

export function compositionToGridState(
  composition: Composition
): GridStateSnapshot {
  if (composition.arrangement) {
    const snapshot = validateArrangementSnapshot(composition.arrangement);
    return {
      cells: snapshot.cells,
      gridRows: snapshot.gridRows,
      gridCols: snapshot.gridCols,
      bpm: snapshot.bpm,
      skipStartPlacement: snapshot.skipStartPlacement,
    };
  }
  const cells: GridCell[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        id: `cell-${row}-${col}`,
        row,
        col,
        layers: [],
        beatOffset: 0,
        colSpan: 1,
        rowSpan: 1,
        mediaType: "animation",
      });
    }
  }
  const { rows, cols } = composition.layout;

  for (const cellConfig of composition.cells) {
    const parsed = parseCellId(cellConfig.id);
    if (!parsed) continue;

    const { row, col } = parsed;
    if (row >= 8 || col >= 8) continue; // Out of max grid bounds

    const index = row * 8 + col;
    const backingCell = cells[index];
    if (!backingCell) continue;

    cells[index] = cellConfigToGridCell(cellConfig, row, col, backingCell);
  }

  return {
    cells,
    gridRows: rows,
    gridCols: cols,
    bpm: 120, // Composition doesn't store BPM; default
    skipStartPlacement: true,
  };
}
