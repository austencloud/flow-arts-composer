/**
 * ArrangeGridPersister - localStorage persistence for the arrange grid
 *
 * Manages reading/writing grid state to localStorage with version migration.
 * v6: 6x6 grid with enabled toggles
 * v7: 8x8 backing array with gridRows/gridCols dimensions
 */

import type { GridConfig } from "../state/arrange-grid-state.svelte";
import {
  MAX_GRID_SIZE,
  createInitialGrid,
} from "../state/arrange-grid-state.svelte";
import type { CellMediaType } from "$lib/shared/animation-engine/domain/compose-types";
import type { TunnelLayerConfig } from "$lib/shared/animation-engine/domain/compose-types";
import { gridCellsToComposition } from "./arrange-composition-converter";
import { saveComposition as dexieSaveComposition } from "../../../services/dexie-composition-repository";
import type { GridCell } from "../state/arrange-grid-state.svelte";

const STORAGE_KEY = "compose-arrange-grid-v7";
const STORAGE_KEY_V6 = "compose-arrange-grid-v6";
const SAVED_COMPOSITIONS_KEY = "compose-saved-compositions";

const DEFAULT_GRID_ROWS = 2;
const DEFAULT_GRID_COLS = 2;

/** v6 GridCell had an `enabled` boolean field */
interface V6GridCell {
  id: string;
  row: number;
  col: number;
  enabled: boolean;
  layers: TunnelLayerConfig[];
  beatOffset: number;
  colSpan: number;
  rowSpan: number;
  mediaType?: CellMediaType;
}

interface SavedComposition {
  id: string;
  name: string;
  createdAt: number;
  cells: GridCell[];
  bpm: number;
  skipStartPlacement: boolean;
  gridRows: number;
  gridCols: number;
}

export function normalizePersistedGridCell<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  normalized.leftMotionVisible ??= source.blueMotionVisible;
  normalized.rightMotionVisible ??= source.redMotionVisible;
  delete normalized.blueMotionVisible;
  delete normalized.redMotionVisible;
  return normalized as T;
}

function clampDimension(n: number): number {
  return Math.max(1, Math.min(MAX_GRID_SIZE, Math.round(n)));
}

export function loadGrid(): GridConfig {
  if (typeof window === "undefined") {
    return {
      cells: createInitialGrid(),
      gridRows: DEFAULT_GRID_ROWS,
      gridCols: DEFAULT_GRID_COLS,
    };
  }

  try {
    // Try v7 first (8x8 backing array + gridRows/gridCols)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored) as GridConfig;
      if (config.cells.length === MAX_GRID_SIZE * MAX_GRID_SIZE) {
        const migratedCells = config.cells.map((cell) => ({
          ...normalizePersistedGridCell(cell),
          mediaType: cell.mediaType ?? "animation",
        }));
        return {
          cells: migratedCells,
          gridRows: clampDimension(config.gridRows ?? DEFAULT_GRID_ROWS),
          gridCols: clampDimension(config.gridCols ?? DEFAULT_GRID_COLS),
        };
      }
    }

    // Migrate from v6 (6x6 grid with enabled toggles -> 8x8 with dimensions)
    const storedV6 = localStorage.getItem(STORAGE_KEY_V6);
    if (storedV6) {
      const configV6 = JSON.parse(storedV6) as { cells: V6GridCell[] };
      if (configV6.cells.length === 36) {
        const newCells = createInitialGrid();

        for (const oldCell of configV6.cells) {
          if (oldCell.row < 6 && oldCell.col < 6) {
            const newIndex = oldCell.row * MAX_GRID_SIZE + oldCell.col;
            const newCell = newCells[newIndex];
            if (newCell) {
              newCells[newIndex] = {
                ...newCell,
                layers: oldCell.layers ?? [],
                beatOffset: oldCell.beatOffset ?? 0,
                colSpan: Math.min(
                  oldCell.colSpan ?? 1,
                  MAX_GRID_SIZE - oldCell.col
                ),
                rowSpan: Math.min(
                  oldCell.rowSpan ?? 1,
                  MAX_GRID_SIZE - oldCell.row
                ),
                mediaType: (oldCell.mediaType ?? "animation") as CellMediaType,
              };
            }
          }
        }

        const migratedConfig: GridConfig = {
          cells: newCells,
          gridRows: 6,
          gridCols: 6,
        };
        saveGrid(migratedConfig);
        localStorage.removeItem(STORAGE_KEY_V6);
        return migratedConfig;
      }
    }
  } catch (err) {
    console.warn("Failed to load grid config from localStorage:", err);
  }

  return {
    cells: createInitialGrid(),
    gridRows: DEFAULT_GRID_ROWS,
    gridCols: DEFAULT_GRID_COLS,
  };
}

export function saveGrid(config: GridConfig): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn("Failed to save grid config to localStorage:", err);
  }
}

export async function migrateLocalStorageCompositions(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(SAVED_COMPOSITIONS_KEY);
    if (!stored) return;

    const saved: SavedComposition[] = JSON.parse(stored);
    if (!Array.isArray(saved) || saved.length === 0) {
      localStorage.removeItem(SAVED_COMPOSITIONS_KEY);
      return;
    }

    for (const comp of saved) {
      const composition = gridCellsToComposition(comp.id, comp.name, {
        cells: comp.cells.map(normalizePersistedGridCell),
        gridRows: comp.gridRows ?? 2,
        gridCols: comp.gridCols ?? 2,
        bpm: comp.bpm ?? 120,
        skipStartPlacement: comp.skipStartPlacement ?? true,
      });
      // Preserve original creation date
      composition.createdAt = new Date(comp.createdAt);
      composition.updatedAt = new Date(comp.createdAt);

      await dexieSaveComposition(composition);
    }

    localStorage.removeItem(SAVED_COMPOSITIONS_KEY);
  } catch (err) {
    console.warn("Failed to migrate localStorage compositions:", err);
    // Non-fatal - compositions remain in localStorage for next attempt
  }
}
