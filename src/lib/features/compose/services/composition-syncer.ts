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

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import type { Composition } from "$lib/shared/animation-engine/domain/compose-types";
import {
  saveComposition as dexieSaveComposition,
  deleteComposition as dexieDeleteComposition,
  toggleFavorite as dexieToggleFavorite,
  getCompositions as dexieGetCompositions,
  getCompositionForOwner as dexieGetCompositionForOwner,
  getLegacyCompositions as dexieGetLegacyCompositions,
} from "./dexie-composition-repository";
import {
  getUserId as firebaseGetUserId,
  saveComposition as firebaseSaveComposition,
  deleteComposition as firebaseDeleteComposition,
  getCompositions as firebaseGetCompositions,
  updateFavorite as firebaseUpdateFavorite,
} from "./firebase-composition-repository";
import type { ErrorHandler } from '$lib/shared/application/services/error-handler'
import {
  trackCompositionDeleted,
  trackCompositionFavoriteChanged,
  trackCompositionSaved,
} from "$lib/features/compose/analytics/compose-events";

export class CompositionSyncer {
  private syncedOwner: string | null = null;

  private currentOwner(): string {
    return firebaseGetUserId() ?? "local:guest";
  }

  /**
   * Save a composition to both local and cloud.
   * Local save is synchronous (returns immediately).
   * Cloud save happens in the background.
   */
  async saveComposition(composition: Composition): Promise<Composition> {
    const ownerId = this.currentOwner();
    if (composition.ownerId && composition.ownerId !== ownerId) {
      throw new Error("Cannot save a composition owned by another account");
    }
    const saved = await dexieSaveComposition({ ...composition, ownerId });

    // Cloud in the background - fire and forget
    if (ownerId !== "local:guest") {
      firebaseSaveComposition(saved, ownerId).catch((err) => {
        if (this.syncedOwner === ownerId) this.syncedOwner = null;
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
    const ownerId = this.currentOwner();
    if (!await dexieGetCompositionForOwner(compositionId, ownerId)) return;
    await dexieDeleteComposition(compositionId);

    if (ownerId !== "local:guest") {
      firebaseDeleteComposition(compositionId, ownerId).catch((err) => {
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
    const ownerId = this.currentOwner();
    if (!await dexieGetCompositionForOwner(compositionId, ownerId)) {
      throw new Error("Composition is unavailable for this account");
    }
    const newStatus =
      await dexieToggleFavorite(compositionId);

    if (ownerId !== "local:guest") {
      firebaseUpdateFavorite(compositionId, newStatus, ownerId)
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
    const ownerId = this.currentOwner();
    if (ownerId !== "local:guest" && this.syncedOwner !== ownerId) {
      if (await this.syncFromCloud(ownerId) && this.currentOwner() === ownerId) {
        this.syncedOwner = ownerId;
      }
    }

    // Always read from local (which now includes merged cloud data)
    const local = await dexieGetCompositions({
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
    if (this.currentOwner() !== ownerId) return this.getCompositions();
    return local.filter((composition) => composition.ownerId === ownerId);
  }

  async getComposition(id: string): Promise<Composition | null> {
    return dexieGetCompositionForOwner(id, this.currentOwner());
  }

  async getLegacyCompositions(): Promise<Composition[]> {
    return dexieGetLegacyCompositions();
  }

  async importLegacyComposition(id: string): Promise<Composition | null> {
    const legacy = (await dexieGetLegacyCompositions()).find((composition) => composition.id === id);
    if (!legacy) return null;
    const copy = { ...legacy, id: `comp-${crypto.randomUUID()}`, ownerId: this.currentOwner(),
      createdAt: new Date(), updatedAt: new Date() };
    return this.saveComposition(copy);
  }

  /**
   * Pull compositions from Firebase and merge with local storage.
   * Cloud wins on conflicts (same ID, cloud has newer updatedAt).
   * Local-only compositions are preserved.
   * Cloud-only compositions are added to local.
   */
  private async syncFromCloud(ownerId: string): Promise<boolean> {
    try {
      const [cloudCompositions, localCompositions] = await Promise.all([
        firebaseGetCompositions(ownerId),
        dexieGetCompositions(),
      ]);

      if (this.currentOwner() !== ownerId) return false;
      const ownedLocal = localCompositions.filter((composition) => composition.ownerId === ownerId);

      if (cloudCompositions.length === 0 && ownedLocal.length === 0) {
        return true;
      }

      const localMap = new Map(ownedLocal.map((c) => [c.id, c]));
      const cloudMap = new Map(cloudCompositions.map((c) => [c.id, c]));

      // Merge cloud into local
      for (const cloudComp of cloudCompositions) {
        if (this.currentOwner() !== ownerId) return false;
        const ownedCloudComp = { ...cloudComp, ownerId };
        const localComp = localMap.get(cloudComp.id);

        if (!localComp) {
          // Cloud-only: add to local
          await dexieSaveComposition(ownedCloudComp, { preserveUpdatedAt: true });
        } else {
          // Both exist: cloud wins if newer
          const cloudTime = cloudComp.updatedAt?.getTime() ?? 0;
          const localTime = localComp.updatedAt?.getTime() ?? 0;
          if (cloudTime > localTime) {
            await dexieSaveComposition(ownedCloudComp, { preserveUpdatedAt: true });
          } else if (localTime > cloudTime) {
            await firebaseSaveComposition(localComp, ownerId);
          }
        }
      }

      // Push local-only compositions to cloud
      for (const localComp of ownedLocal) {
        if (this.currentOwner() !== ownerId) return false;
        if (!cloudMap.has(localComp.id)) {
          await firebaseSaveComposition(localComp, ownerId);
        }
      }
      return true;
    } catch (error) {
      console.error("Cloud sync failed, using local data:", error);
      try {
        const errorHandler = getErrorHandler() as ErrorHandler;
        errorHandler.showWarning("Couldn't sync compositions from the cloud. Showing local data.");
      } catch {
        // ErrorHandler not available
      }
      return false;
    }
  }

  /**
   * Force a re-sync from cloud on next load.
   */
  invalidateSync(): void {
    this.syncedOwner = null;
  }
}

export const compositionSyncer = new CompositionSyncer();
