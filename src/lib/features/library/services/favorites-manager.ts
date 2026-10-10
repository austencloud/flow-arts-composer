/**
 * FavoritesManager - Favorites Collection Operations
 *
 * Manages the Favorites system collection. Delegates to
 * CollectionManager for the underlying collection membership.
 */

import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import {
  getFavoritesCollection,
  removeSequenceFromCollection,
  addSequenceToCollection,
  getCollectionSequences,
} from "#lib/shared/library/services/collection-manager.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

export class FavoritesManager {
  constructor() {}

  async toggleFavorite(sequenceId: string): Promise<boolean> {
    const favoritesCollection = await getFavoritesCollection();
    const isFavorited = favoritesCollection.sequenceIds.includes(sequenceId);

    if (isFavorited) {
      await removeSequenceFromCollection(favoritesCollection.id, sequenceId);
      this.logFavoriteAction(sequenceId, false);
      return false;
    } else {
      await addSequenceToCollection(favoritesCollection.id, sequenceId);
      this.logFavoriteAction(sequenceId, true);
      return true;
    }
  }

  async isFavorite(sequenceId: string): Promise<boolean> {
    const favoritesCollection = await getFavoritesCollection();
    return favoritesCollection.sequenceIds.includes(sequenceId);
  }

  async getFavorites(): Promise<LibrarySequence[]> {
    const favoritesCollection = await getFavoritesCollection();
    return getCollectionSequences(favoritesCollection.id);
  }

  async getFavoriteIds(): Promise<Set<string>> {
    const favoritesCollection = await getFavoritesCollection();
    return new Set(favoritesCollection.sequenceIds);
  }

  private logFavoriteAction(sequenceId: string, isFavorite: boolean): void {
    void logActivity(
      isFavorite ? "sequence_favorite" : "sequence_unfavorite",
      "social",
      { sequenceId }
    );
  }
}
