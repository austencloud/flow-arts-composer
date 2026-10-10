/**
 * DexieCompositionRepository - Composition Persistence Implementation
 *
 * Handles CRUD operations for compositions using Dexie.js (IndexedDB).
 * Compositions are flexible canvas arrangements containing sequences,
 * videos, images, and text in configurable grid layouts.
 */

import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";

/**
 * Options for querying compositions
 */
export interface CompositionQueryOptions {
  /** Filter by favorite status */
  isFavorite?: boolean;
  /** Search query (name) */
  searchQuery?: string;
  /** Sort field */
  sortBy?: "name" | "createdAt" | "updatedAt";
  /** Sort direction */
  sortDirection?: "asc" | "desc";
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * Statistics about saved compositions
 */
export interface CompositionStats {
  /** Total compositions saved */
  totalCompositions: number;
  /** Favorite compositions */
  favoriteCompositions: number;
  /** Total cells across all compositions */
  totalCells: number;
}


export async function saveComposition(composition: Composition): Promise<Composition> {
  try {
    const now = new Date();
    const compositionToSave: Composition = {
      ...composition,
      updatedAt: now,
      createdAt: composition.createdAt || now,
    };

    await db.compositions.put(compositionToSave);
    return compositionToSave;
  } catch (error) {
    console.error("Failed to save composition:", error);
    throw new Error(
      `Failed to save composition: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getComposition(compositionId: string): Promise<Composition | null> {
  try {
    const composition = await db.compositions.get(compositionId);
    return composition ?? null;
  } catch (error) {
    console.error(`Failed to get composition ${compositionId}:`, error);
    return null;
  }
}

export async function updateComposition(
  compositionId: string,
  updates: Partial<Composition>
): Promise<Composition> {
  try {
    const existing = await db.compositions.get(compositionId);
    if (!existing) {
      throw new Error(`Composition ${compositionId} not found`);
    }

    const updated: Composition = {
      ...existing,
      ...updates,
      id: compositionId, // Ensure ID is not overwritten
      updatedAt: new Date(),
    };

    await db.compositions.put(updated);
    return updated;
  } catch (error) {
    console.error(`Failed to update composition ${compositionId}:`, error);
    throw new Error(
      `Failed to update composition: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function deleteComposition(compositionId: string): Promise<void> {
  try {
    await db.compositions.delete(compositionId);
  } catch (error) {
    console.error(`Failed to delete composition ${compositionId}:`, error);
    throw new Error(
      `Failed to delete composition: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getCompositions(
  options?: CompositionQueryOptions
): Promise<Composition[]> {
  try {
    let collection = db.compositions.toCollection();

    // Apply filters
    if (options?.isFavorite !== undefined) {
      collection = collection.filter(
        (comp) => comp.isFavorite === options.isFavorite
      );
    }

    if (options?.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      collection = collection.filter((comp) =>
        comp.name.toLowerCase().includes(query)
      );
    }

    let results = await collection.toArray();

    // Apply sorting
    const sortBy = options?.sortBy ?? "updatedAt";
    const sortDir = options?.sortDirection ?? "desc";

    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
        default:
          comparison =
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }

      return sortDir === "desc" ? -comparison : comparison;
    });

    // Apply pagination
    if (options?.offset !== undefined && options.offset > 0) {
      results = results.slice(options.offset);
    }

    if (options?.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  } catch (error) {
    console.error("Failed to get compositions:", error);
    return [];
  }
}

// ============================================================================
// FAVORITES
// ============================================================================

export async function toggleFavorite(compositionId: string): Promise<boolean> {
  try {
    const composition = await db.compositions.get(compositionId);
    if (!composition) {
      throw new Error(`Composition ${compositionId} not found`);
    }

    const newFavoriteStatus = !composition.isFavorite;
    await db.compositions.update(compositionId, {
      isFavorite: newFavoriteStatus,
      updatedAt: new Date(),
    });

    return newFavoriteStatus;
  } catch (error) {
    console.error(`Failed to toggle favorite for ${compositionId}:`, error);
    throw new Error(
      `Failed to toggle favorite: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getFavorites(): Promise<Composition[]> {
  try {
    // isFavorite is stored as a JS boolean, and IndexedDB cannot index boolean
    // values — so the record never enters the isFavorite index and the stored
    // value is never the numeric 1 this query looked for, making .equals(1)
    // match nothing. Filter-scan to match the boolean, as getCompositions/
    // getStats already do.
    return await db.compositions
      .filter((c) => c.isFavorite === true)
      .toArray();
  } catch (error) {
    console.error("Failed to get favorites:", error);
    return [];
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export async function deleteCompositions(compositionIds: string[]): Promise<void> {
  try {
    await db.compositions.bulkDelete(compositionIds);
  } catch (error) {
    console.error("Failed to delete compositions:", error);
    throw new Error(
      `Failed to delete compositions: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

export async function getStats(): Promise<CompositionStats> {
  try {
    const allCompositions = await db.compositions.toArray();

    const totalCompositions = allCompositions.length;
    const favoriteCompositions = allCompositions.filter(
      (c) => c.isFavorite
    ).length;
    const totalCells = allCompositions.reduce(
      (sum, c) => sum + c.cells.length,
      0
    );

    return {
      totalCompositions,
      favoriteCompositions,
      totalCells,
    };
  } catch (error) {
    console.error("Failed to get composition stats:", error);
    return {
      totalCompositions: 0,
      favoriteCompositions: 0,
      totalCells: 0,
    };
  }
}

// ============================================================================
// UTILITY
// ============================================================================

export async function exists(compositionId: string): Promise<boolean> {
  try {
    const composition = await db.compositions.get(compositionId);
    return composition !== undefined;
  } catch (error) {
    console.error(`Failed to check existence of ${compositionId}:`, error);
    return false;
  }
}

export async function count(options?: CompositionQueryOptions): Promise<number> {
  try {
    if (!options) {
      return await db.compositions.count();
    }

    // For filtered counts, we need to get the filtered results
    const results = await getCompositions({
      ...options,
      limit: undefined, // Remove limit for count
      offset: undefined, // Remove offset for count
    });
    return results.length;
  } catch (error) {
    console.error("Failed to count compositions:", error);
    return 0;
  }
}
