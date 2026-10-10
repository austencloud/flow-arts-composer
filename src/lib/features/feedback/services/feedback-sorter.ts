import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { ClaimStatusDeriver } from "./claim-status-deriver";
import { groupByLane } from "./swim-lane-deriver";
import type { SwimLane } from "#lib/shared/feedback/domain/feedback-contract-types.js";

export class FeedbackSorter {
  private readonly PRIORITY_ORDER: Record<string, number> = {
    "": 0, // No priority - highest sort priority (appears first)
    high: 1,
    medium: 2,
    low: 3,
  };

  private readonly claimStatusDeriver: ClaimStatusDeriver;

  constructor(claimStatusDeriver?: ClaimStatusDeriver) {
    this.claimStatusDeriver = claimStatusDeriver ?? new ClaimStatusDeriver();
  }

  /**
   * Get the claim status deriver for external access (e.g., WIP counting)
   */
  getClaimStatusDeriver(): ClaimStatusDeriver {
    return this.claimStatusDeriver;
  }

  sortByPriority(items: FeedbackItem[]): FeedbackItem[] {
    return [...items].sort((a, b) => {
      const priorityA = this.PRIORITY_ORDER[a.priority || ""] ?? 4;
      const priorityB = this.PRIORITY_ORDER[b.priority || ""] ?? 4;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // Secondary sort: oldest first within same priority
      return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
    });
  }

  /**
   * Group items by their DERIVED status (based on claim state), not stored status.
   *
   * Key behavior:
   * - Items with active claims → "in-progress" (regardless of stored status)
   * - Items with stale/no claims but stored status "in-progress" → "new" (orphaned)
   * - All other statuses pass through unchanged
   *
   * This ensures the "in-progress" column only shows items actively being worked on.
   */
  groupByStatus(
    items: FeedbackItem[]
  ): Record<"new" | "in-progress" | "in-review" | "completed", FeedbackItem[]> {
    const grouped: Record<string, FeedbackItem[]> = {
      new: [],
      "in-progress": [],
      "in-review": [],
      completed: [],
    };

    for (const item of items) {
      // Filter out soft-deleted items
      if (item.isDeleted) continue;

      // Filter out archived items - they don't appear in Kanban
      if (item.status === "archived") continue;

      // Derive effective status from claim state
      const { displayStatus } = this.claimStatusDeriver.deriveEffectiveStatus(item);

      // Group by derived status
      if (grouped[displayStatus]) {
        grouped[displayStatus]?.push(item);
      }
    }

    // Sort each column by priority
    return {
      new: this.sortByPriority(grouped.new ?? []),
      "in-progress": this.sortByPriority(grouped["in-progress"] ?? []),
      "in-review": this.sortByPriority(grouped["in-review"] ?? []),
      completed: this.sortByPriority(grouped.completed ?? []),
    };
  }

  groupByStatusAndLane(
    items: FeedbackItem[]
  ): Record<"new" | "in-progress" | "in-review" | "completed", Record<SwimLane, FeedbackItem[]>> {
    const byStatus = this.groupByStatus(items);

    return {
      new: groupByLane(byStatus.new),
      "in-progress": groupByLane(byStatus["in-progress"]),
      "in-review": groupByLane(byStatus["in-review"]),
      completed: groupByLane(byStatus.completed),
    };
  }

  getDeferredItems(items: FeedbackItem[]): FeedbackItem[] {
    return items.filter(
      (item: FeedbackItem) =>
        item.status === "archived" && item.deferredUntil && !item.isDeleted
    );
  }
}
