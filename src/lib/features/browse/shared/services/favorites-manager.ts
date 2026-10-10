/**
 * Favorites Service - Manages sequence favorites
 *
 * Handles favoriting/unfavoriting sequences with persistence
 * following the microservices architecture pattern.
 */

import { safeSessionStorageGet, safeSessionStorageSet } from "#lib/shared/foundation/services/storage-manager.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
export class FavoritesManager {
  private readonly CACHE_VERSION = "v2.1"; // ✅ ROBUST: Cache versioning
  private readonly STORAGE_KEY = `tka-${this.CACHE_VERSION}-favorites`;
  private favoritesCache: Set<string> | null = null;

  constructor() {
    // Initialize cache
    void this.loadFavoritesFromStorage();
  }

  async addToFavorites(sequenceId: string): Promise<void> {
    await this.ensureCacheLoaded();

    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }

    this.favoritesCache.add(sequenceId);
    await this.saveFavoritesToStorage();
  }

  async removeFromFavorites(sequenceId: string): Promise<void> {
    await this.ensureCacheLoaded();

    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }

    this.favoritesCache.delete(sequenceId);
    await this.saveFavoritesToStorage();
  }

  async toggleFavorite(sequenceId: string): Promise<void> {
    await this.ensureCacheLoaded();

    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }

    if (this.favoritesCache.has(sequenceId)) {
      this.favoritesCache.delete(sequenceId);
    } else {
      this.favoritesCache.add(sequenceId);
    }

    await this.saveFavoritesToStorage();
  }

  async isFavorite(sequenceId: string): Promise<boolean> {
    await this.ensureCacheLoaded();
    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }
    return this.favoritesCache.has(sequenceId);
  }

  async getFavorites(): Promise<string[]> {
    await this.ensureCacheLoaded();
    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }
    return Array.from(this.favoritesCache);
  }

  async setFavorite(sequenceId: string, isFavorite: boolean): Promise<void> {
    await this.ensureCacheLoaded();

    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }

    if (isFavorite) {
      this.favoritesCache.add(sequenceId);
    } else {
      this.favoritesCache.delete(sequenceId);
    }

    await this.saveFavoritesToStorage();
  }

  async clearFavorites(): Promise<void> {
    this.favoritesCache = new Set();
    await this.saveFavoritesToStorage();
  }

  async getFavoritesCount(): Promise<number> {
    await this.ensureCacheLoaded();
    if (!this.favoritesCache) {
      throw new Error("Favorites cache not initialized");
    }
    return this.favoritesCache.size;
  }

  // Private methods
  private ensureCacheLoaded(): void {
    if (this.favoritesCache === null) {
      this.loadFavoritesFromStorage();
    }
  }

  private loadFavoritesFromStorage(): void {
    try {
      const favorites = safeSessionStorageGet<string[]>(
        this.STORAGE_KEY,
        []
      );
      this.favoritesCache = new Set(favorites || []);
    } catch (error) {
      console.warn("Failed to load favorites from storage:", error);
      this.favoritesCache = new Set();
    }
  }

  private saveFavoritesToStorage(): void {
    try {
      if (!this.favoritesCache) {
        throw new Error("Favorites cache not initialized");
      }
      const favorites = Array.from(this.favoritesCache);
      safeSessionStorageSet(this.STORAGE_KEY, favorites);
    } catch (error) {
      console.error("Failed to save favorites to storage:", error);
      // Surface the failure - otherwise the favorite toggle silently fails to persist
      toast.error("Couldn't save your favorites. Changes may be lost when you leave.");
    }
  }
}
