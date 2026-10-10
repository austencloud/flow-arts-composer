/**
 * CompositionSyncer
 *
 * Coordinates between local (Dexie/IndexedDB) and cloud (Firestore) storage.
 *
 * Strategy:
 * - Writes go to local first (instant), then Firebase in the background
 * - On app load, pulls from Firebase and merges with local (cloud wins on conflicts)
 * - Unauthenticated users only get local storage
 *
 * This is NOT a real-time sync (no onSnapshot listeners). It syncs on:
 * 1. App load (pull from cloud, merge)
 * 2. Each save/delete/favorite operation (push to cloud)
 */

import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";
import {
  saveComposition as dexieSaveComposition,
  deleteComposition as dexieDeleteComposition,
  toggleFavorite as dexieToggleFavorite,
  getCompositions as dexieGetCompositions,
} from "./dexie-composition-repository";
import {
  isAuthenticated as firebaseIsAuthenticated,
  saveComposition as firebaseSaveComposition,
  deleteComposition as firebaseDeleteComposition,
  getCompositions as firebaseGetCompositions,
  updateFavorite as firebaseUpdateFavorite,
} from "./firebase-composition-repository";
import type { ErrorHandler } from '#lib/shared/application/services/error-handler.js'
import {
  trackCompositionDeleted,
  trackCompositionFavoriteChanged,
  trackCompositionSaved,
} from "#lib/features/compose/analytics/compose-events.js";

export class CompositionSyncer {
  private hasSynced = false;

  /**
   * Save a composition to both local and cloud.
   * Local save is synchronous (returns immediately).
   * Cloud save happens in the background.
   */
  async saveComposition(composition: Composition): Promise<Composition> {
    // Local first - always succeeds
    const saved = await dexieSaveComposition(composition);

    // Cloud in the background - fire and forget
    if (firebaseIsAuthenticated()) {
      firebaseSaveComposition(saved).catch((err) => {
        try {
          const errorHandler = getErrorHandler() as ErrorHandler;
          errorHandler.showWarning("Saved locally, but cloud sync failed. Changes may not appear on other devices.");
        } catch {
          console.warn("Cloud save failed, composition saved locally:", err);
        }
      });
    }

    trackCompositionSaved({
      compositionId: saved.id,
      cellCount: saved.cells.length,
      rows: saved.layout.rows,
      columns: saved.layout.cols,
    });

    return saved;
  }

  /**
   * Delete a composition from both local and cloud.
   */
  async deleteComposition(compositionId: string): Promise<void> {
    await dexieDeleteComposition(compositionId);

    if (firebaseIsAuthenticated()) {
      firebaseDeleteComposition(compositionId).catch((err) => {
        try {
          const errorHandler = getErrorHandler() as ErrorHandler;
          errorHandler.showWarning("Deleted locally, but cloud sync failed. It may reappear on other devices.");
        } catch {
          console.warn("Cloud delete failed:", err);
        }
      });
    }

    trackCompositionDeleted(compositionId);
  }

  /**
   * Toggle favorite in both local and cloud.
   */
  async toggleFavorite(compositionId: string): Promise<boolean> {
    const newStatus =
      await dexieToggleFavorite(compositionId);

    if (firebaseIsAuthenticated()) {
      firebaseUpdateFavorite(compositionId, newStatus)
        .catch((err) => {
          try {
            const errorHandler = getErrorHandler() as ErrorHandler;
            errorHandler.showWarning("Updated locally, but cloud sync failed.");
          } catch {
            console.warn("Cloud favorite update failed:", err);
          }
        });
    }

    trackCompositionFavoriteChanged(compositionId, newStatus);

    return newStatus;
  }

  /**
   * Load all compositions. If authenticated and not yet synced,
   * pulls from Firebase first and merges with local.
   */
  async getCompositions(): Promise<Composition[]> {
    // If authenticated and haven't synced yet, merge cloud data
    if (
      firebaseIsAuthenticated() &&
      !this.hasSynced
    ) {
      await this.syncFromCloud();
      this.hasSynced = true;
    }

    // Always read from local (which now includes merged cloud data)
    return dexieGetCompositions({
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
  }

  /**
   * Pull compositions from Firebase and merge with local storage.
   * Cloud wins on conflicts (same ID, cloud has newer updatedAt).
   * Local-only compositions are preserved.
   * Cloud-only compositions are added to local.
   */
  private async syncFromCloud(): Promise<void> {
    try {
      const [cloudCompositions, localCompositions] = await Promise.all([
        firebaseGetCompositions(),
        dexieGetCompositions(),
      ]);

      if (cloudCompositions.length === 0 && localCompositions.length === 0) {
        return;
      }

      const localMap = new Map(localCompositions.map((c) => [c.id, c]));
      const cloudMap = new Map(cloudCompositions.map((c) => [c.id, c]));

      // Merge cloud into local
      for (const cloudComp of cloudCompositions) {
        const localComp = localMap.get(cloudComp.id);

        if (!localComp) {
          // Cloud-only: add to local
          await dexieSaveComposition(cloudComp);
        } else {
          // Both exist: cloud wins if newer
          const cloudTime = cloudComp.updatedAt?.getTime() ?? 0;
          const localTime = localComp.updatedAt?.getTime() ?? 0;
          if (cloudTime > localTime) {
            await dexieSaveComposition(cloudComp);
          }
        }
      }

      // Push local-only compositions to cloud
      for (const localComp of localCompositions) {
        if (!cloudMap.has(localComp.id)) {
          firebaseSaveComposition(localComp).catch((err) => {
            console.warn(`Failed to push local composition ${localComp.id} to cloud:`, err);
          });
        }
      }
    } catch (error) {
      console.error("Cloud sync failed, using local data:", error);
      try {
        const errorHandler = getErrorHandler() as ErrorHandler;
        errorHandler.showWarning("Couldn't sync compositions from the cloud. Showing local data.");
      } catch {
        // ErrorHandler not available
      }
    }
  }

  /**
   * Force a re-sync from cloud on next load.
   */
  invalidateSync(): void {
    this.hasSynced = false;
  }
}

export const compositionSyncer = new CompositionSyncer();
