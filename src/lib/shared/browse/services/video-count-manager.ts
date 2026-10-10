/**
 * VideoCountManager - Manage video counts for sequences
 *
 * Provides efficient video count lookups with caching.
 * Reduces Firestore reads by caching counts.
 */

import { getVideosForSequence } from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";

export class VideoCountManager {
  // Cache video counts to avoid repeated Firestore queries
  private countCache = new Map<string, number>();
  // In-flight requests to prevent duplicate fetches.
  // fetchCount signals failure with null, so pending resolves number | null.
  private pendingRequests = new Map<string, Promise<number | null>>();

  constructor() {}

  async getVideoCount(sequenceId: string): Promise<number> {
    // Return cached count if available
    const cached = this.countCache.get(sequenceId);
    if (cached !== undefined) {
      return cached;
    }

    // Check for in-flight request. A failed fetch resolves null; surface it as
    // 0 for display without caching (the request path below does the caching).
    const pending = this.pendingRequests.get(sequenceId);
    if (pending) {
      return pending.then((count) => count ?? 0);
    }

    // Fetch and cache
    const request = this.fetchCount(sequenceId);
    this.pendingRequests.set(sequenceId, request);

    try {
      const count = await request;
      // Only cache a successful count. A failed fetch (null) is shown as 0 for
      // display but NOT cached, so a later call retries instead of pinning 0.
      if (count !== null) {
        this.countCache.set(sequenceId, count);
        return count;
      }
      return 0;
    } finally {
      this.pendingRequests.delete(sequenceId);
    }
  }

  async refreshCount(sequenceId: string): Promise<number> {
    // Clear cache and fetch fresh
    this.countCache.delete(sequenceId);
    return this.getVideoCount(sequenceId);
  }

  invalidateCache(sequenceId: string): void {
    this.countCache.delete(sequenceId);
  }

  // Returns null on failure so getVideoCount can distinguish a transient error
  // from a genuine zero and avoid caching the failure.
  private async fetchCount(sequenceId: string): Promise<number | null> {
    try {
      const videos = await getVideosForSequence(sequenceId);
      return videos.length;
    } catch (error) {
      console.warn(
        `[VideoCountManager] Failed to fetch video count for ${sequenceId}:`,
        error
      );
      return null;
    }
  }
}
