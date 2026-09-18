/**
 * localStorage adapter for the Shape tab. Module tabs do not own the URL, so
 * the tab remembers its matrix settings here; the standalone /shape-engine
 * route persists to the query string instead.
 *
 * Shape Engine lived in the Toys module until 2026-09-18. The legacy key is
 * read once so nobody loses their settings, then dropped on the next persist.
 */
import { SHAPE_MATRIX_LEVELS } from "$lib/shared/shape-matrix/app/shape-matrix-levels";
import type {
  ShapeMatrixAppPersistence,
  ShapeMatrixAppSnapshot,
} from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";

export const SHAPE_ENGINE_STORAGE_KEY = "create-shape-engine-state-v1";
export const SHAPE_ENGINE_LEGACY_STORAGE_KEY = "toys-shape-matrix-state-v1";

function parseSnapshot(raw: string | null): ShapeMatrixAppSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShapeMatrixAppSnapshot;
    return parsed && SHAPE_MATRIX_LEVELS.includes(parsed.level) ? parsed : null;
  } catch {
    return null;
  }
}

export function createShapeEnginePersistence(
  storage: Storage
): ShapeMatrixAppPersistence {
  return {
    restore: (): ShapeMatrixAppSnapshot | null => {
      try {
        return (
          parseSnapshot(storage.getItem(SHAPE_ENGINE_STORAGE_KEY)) ??
          parseSnapshot(storage.getItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY))
        );
      } catch {
        return null;
      }
    },
    persist: (snapshot: ShapeMatrixAppSnapshot): void => {
      try {
        storage.setItem(SHAPE_ENGINE_STORAGE_KEY, JSON.stringify(snapshot));
        storage.removeItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY);
      } catch {
        /* storage unavailable: the tab just starts fresh next visit */
      }
    },
  };
}
