/**
 * Simple Filter Persistence Service
 *
 * Just saves/loads basic filter history - no complex state management.
 */

import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import type { BrowseFilterType } from "../domain/enums/filtering-enums";
import type { BrowseFilterValue } from "../domain/types/filtering-types";
import type {
  FilterHistoryEntry,
  SimpleBrowseState,
} from "./filter-persister-types";
import {
  safeSessionStorageGet,
  safeSessionStorageSet,
  removeSessionStorageItem as safeSessionStorageRemove,
} from "../../foundation/services/storage-manager";

export class FilterPersister {
  // Bumped for the startPosition -> startPlacement BrowseFilterType rename:
  // a stale sessionStorage entry could carry filter.type "startPosition"
  // (the pre-rename enum value), which would no longer match
  // BrowseFilterType.STARTING_PLACEMENT ("startPlacement") on the read side.
  // sessionStorage already resets on tab close, so a version bump (matching
  // the csv-loader IndexedDB cache-key bump) is simpler and safer here than
  // teaching every read site to accept both string values.
  private readonly CACHE_VERSION = "v2.2"; // ✅ ROBUST: Cache versioning
  private readonly BROWSE_STATE_KEY = `tka-${this.CACHE_VERSION}-browse-state`;
  private readonly FILTER_HISTORY_KEY = `tka-${this.CACHE_VERSION}-filter-history`;
  private readonly MAX_HISTORY_SIZE = 50;

  saveBrowseState(state: SimpleBrowseState): void {
    try {
      const stateToSave = {
        ...state,
        lastUpdated: new Date(),
      };
      safeSessionStorageSet(this.BROWSE_STATE_KEY, stateToSave);
    } catch (error) {
      console.error("Failed to save browse state:", error);
    }
  }

  loadBrowseState(): SimpleBrowseState | null {
    try {
      const parsed = safeSessionStorageGet<Record<string, unknown>>(
        this.BROWSE_STATE_KEY,
        null
      );
      if (!parsed) return null;

      // Validate the loaded state structure
      if (
        // filterType is BrowseFilterType | null and defaults to null (the "no
        // active filter" state) — a string-only check discarded every saved
        // state that had a sort but no filter type.
        (parsed.filterType === null || typeof parsed.filterType === "string") &&
        parsed.filterValue !== undefined &&
        typeof parsed.sortMethod === "string"
      ) {
        return parsed as unknown as SimpleBrowseState;
      }

      console.warn("Invalid browse state structure, returning null");
      return null;
    } catch (error) {
      console.warn("Failed to load browse state:", error);
      return null;
    }
  }

  async saveFilterToHistory(filter: FilterHistoryEntry): Promise<void> {
    try {
      const history = await this.getFilterHistory();

      // Remove duplicate filters (same type and value)
      const filteredHistory = history.filter(
        (existing) =>
          existing.type !== filter.type ||
          JSON.stringify(existing.value) !== JSON.stringify(filter.value)
      );

      // Add new filter to the beginning
      const newHistory = [filter, ...filteredHistory].slice(
        0,
        this.MAX_HISTORY_SIZE
      );

      // Convert dates to strings for storage
      const historyToSave = newHistory.map((f) => ({
        ...f,
        appliedAt: f.appliedAt.toISOString(),
      }));

      safeSessionStorageSet(this.FILTER_HISTORY_KEY, historyToSave);
    } catch (error) {
      console.error("Failed to save filter to history:", error);
    }
  }

  getFilterHistory(): FilterHistoryEntry[] {
    try {
      const parsed = safeSessionStorageGet<unknown[]>(
        this.FILTER_HISTORY_KEY,
        []
      );
      if (!parsed || !Array.isArray(parsed)) return [];

      // Convert date strings back to Date objects with type validation
      return parsed
        .filter(
          (filter): filter is Record<string, unknown> =>
            typeof filter === "object" && filter !== null
        )
        .filter((filter) => this.isValidFilterHistoryEntry(filter))
        .map((filter) => ({
          type: filter["type"] as BrowseFilterType,
          value: filter["value"] as BrowseFilterValue,
          appliedAt: new Date(filter["appliedAt"] as string),
        }));
    } catch (error) {
      console.warn("Failed to load filter history:", error);
      return [];
    }
  }

  /**
   * Type guard for filter history entry validation
   */
  private isValidFilterHistoryEntry(obj: Record<string, unknown>): boolean {
    return (
      typeof obj["type"] === "string" &&
      obj["value"] !== undefined &&
      (typeof obj["appliedAt"] === "string" || obj["appliedAt"] instanceof Date)
    );
  }

  clearFilterHistory(): void {
    safeSessionStorageRemove(this.FILTER_HISTORY_KEY);
  }

  async getRecentFilters(limit: number = 10): Promise<FilterHistoryEntry[]> {
    const history = await this.getFilterHistory();
    return history.slice(0, limit);
  }

  clearAllState(): void {
    safeSessionStorageRemove(this.BROWSE_STATE_KEY);
    safeSessionStorageRemove(this.FILTER_HISTORY_KEY);
  }

  // Utility methods for filter management
  async getFilterFrequency(): Promise<Map<string, number>> {
    const history = await this.getFilterHistory();
    const frequency = new Map<string, number>();

    history.forEach((filter) => {
      const key = `${filter.type}:${JSON.stringify(filter.value)}`;
      frequency.set(key, (frequency.get(key) || 0) + 1);
    });

    return frequency;
  }

  async getMostUsedFilters(limit: number = 5): Promise<FilterHistoryEntry[]> {
    const frequency = await this.getFilterFrequency();
    const history = await this.getFilterHistory();

    // Sort by frequency, then by recency
    const sortedFilters = history.sort((a, b) => {
      const keyA = `${a.type}:${JSON.stringify(a.value)}`;
      const keyB = `${b.type}:${JSON.stringify(b.value)}`;
      const freqA = frequency.get(keyA) || 0;
      const freqB = frequency.get(keyB) || 0;

      if (freqA !== freqB) {
        return freqB - freqA; // Higher frequency first
      }
      return b.appliedAt.getTime() - a.appliedAt.getTime(); // More recent first
    });

    // Remove duplicates and limit results
    const uniqueFilters = new Map<string, FilterHistoryEntry>();
    sortedFilters.forEach((filter) => {
      const key = `${filter.type}:${JSON.stringify(filter.value)}`;
      if (!uniqueFilters.has(key)) {
        uniqueFilters.set(key, filter);
      }
    });

    return Array.from(uniqueFilters.values()).slice(0, limit);
  }

  getDefaultBrowseState(): SimpleBrowseState {
    return {
      filterType: null,
      filterValue: null,
      sortMethod: BrowseSortMethod.ALPHABETICAL,
    };
  }
}
