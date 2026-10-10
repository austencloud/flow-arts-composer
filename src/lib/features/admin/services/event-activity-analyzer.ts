/**
 * Event Activity Analyzer
 *
 * Analyzes activity log events for analytics dashboards.
 * Handles event breakdowns, module usage, user activity over time, and recent activity.
 */

import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { getDailyActiveUsers, getEventCounts, queryEvents } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import {
  getEventTypeDisplay,
  getModuleDisplay,
} from "./config/analytics-config";
import {
  extractUserDisplayDetails,
  type UserDisplayDetails,
} from "./utils/profile-picture-resolver";
import type { UserActivityPoint, AnalyticsTimeRange, EventTypeBreakdown, ModuleUsageData, RecentActivityEvent } from "./types";

// Timeout for Firebase queries (10 seconds)
const QUERY_TIMEOUT_MS = 10000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export class EventActivityAnalyzer {

  /**
   * Get user activity over time
   *
   * Primary: Uses activity log events for accurate per-day tracking
   * Fallback: Uses lastActivityDate from user documents
   */
  async getUserActivity(
    timeRange: AnalyticsTimeRange
  ): Promise<UserActivityPoint[]> {
    const { startDate, days } = timeRange;

    try {
      // Try to get activity from the activity log service first
      const dailyActiveUsers =
        await getDailyActiveUsers(startDate, days);

      // If we got data from activity logs, use it
      if (dailyActiveUsers.size > 0) {
        const activityPoints: UserActivityPoint[] = [];
        for (let i = 0; i < days; i++) {
          const dayDate = new Date(startDate);
          dayDate.setDate(dayDate.getDate() + i);
          const dateKey = dayDate.toISOString().split("T")[0] ?? "";
          activityPoints.push({
            date: dateKey,
            activeUsers: dailyActiveUsers.get(dateKey) ?? 0,
          });
        }
        return activityPoints;
      }

      // Fallback: Use lastActivityDate from user documents
      return this.getUserActivityFromLastActivityDate(startDate, days);
    } catch (error) {
      console.error("[EventActivityAnalyzer] Failed to get user activity:", error);
      return this.getUserActivityFromLastActivityDate(startDate, days);
    }
  }

  /**
   * Fallback: Get user activity from lastActivityDate field
   * Only shows the most recent day each user was active
   */
  private async getUserActivityFromLastActivityDate(
    startDate: Date,
    days: number
  ): Promise<UserActivityPoint[]> {
    try {
      const firestore = await getFirestoreInstance();
      const usersRef = collection(firestore, "users");
      const snapshot = await withTimeout(
        getDocs(usersRef),
        QUERY_TIMEOUT_MS,
        null
      );

      if (!snapshot || snapshot.empty) {
        return this.getEmptyActivityPoints(startDate, days);
      }

      // Extract lastActivityDate from each user
      const userActivityDates: Date[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const lastActivity = data["lastActivityDate"];
        if (lastActivity) {
          const date = lastActivity.toDate
            ? lastActivity.toDate()
            : new Date(lastActivity);
          userActivityDates.push(date);
        }
      });

      // Create a map of date string -> count
      const activityByDay = new Map<string, number>();

      // Initialize all days in range with 0
      for (let i = 0; i < days; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const dateKey = dayDate.toISOString().split("T")[0] ?? "";
        activityByDay.set(dateKey, 0);
      }

      // Count users active on each day
      for (const activityDate of userActivityDates) {
        const dateKey = activityDate.toISOString().split("T")[0] ?? "";
        if (activityByDay.has(dateKey)) {
          activityByDay.set(dateKey, (activityByDay.get(dateKey) ?? 0) + 1);
        }
      }

      // Convert to array of points
      const activityPoints: UserActivityPoint[] = [];
      for (let i = 0; i < days; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const dateKey = dayDate.toISOString().split("T")[0] ?? "";
        activityPoints.push({
          date: dateKey,
          activeUsers: activityByDay.get(dateKey) ?? 0,
        });
      }

      return activityPoints;
    } catch (error) {
      console.error(
        "[EventActivityAnalyzer] Failed to get user activity from lastActivityDate:",
        error
      );
      return this.getEmptyActivityPoints(startDate, days);
    }
  }

  /**
   * Generate empty activity points for error cases
   */
  private getEmptyActivityPoints(
    startDate: Date,
    days: number
  ): UserActivityPoint[] {
    const activityPoints: UserActivityPoint[] = [];
    for (let i = 0; i < days; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      const dateKey = dayDate.toISOString().split("T")[0] ?? "";
      activityPoints.push({ date: dateKey, activeUsers: 0 });
    }
    return activityPoints;
  }

  /**
   * Get activity event breakdown by type for the time range
   */
  async getEventTypeBreakdown(
    timeRange: AnalyticsTimeRange
  ): Promise<EventTypeBreakdown[]> {
    try {
      const eventCounts = await getEventCounts(
        timeRange.startDate,
        timeRange.endDate
      );

      const breakdown: EventTypeBreakdown[] = [];
      for (const [eventType, count] of eventCounts.entries()) {
        const config = getEventTypeDisplay(eventType);
        breakdown.push({
          eventType,
          count,
          label: config.label,
          color: config.color,
        });
      }

      // Sort by count descending
      breakdown.sort((a, b) => b.count - a.count);

      return breakdown;
    } catch (error) {
      console.error("[EventActivityAnalyzer] Failed to get event type breakdown:", error);
      return [];
    }
  }

  /**
   * Get module usage statistics for the time range
   * Supports module:tab format (e.g., "create:generate")
   */
  async getModuleUsage(
    timeRange: AnalyticsTimeRange
  ): Promise<ModuleUsageData[]> {
    try {
      // Query for module_view events in the time range
      // Firestore max limit is 10000, but we use 5000 for safety
      const events = await queryEvents({
        eventType: "module_view",
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
        limit: 5000,
      });

      // Count views per module:tab combination
      const moduleCounts = new Map<string, number>();
      for (const event of events) {
        const moduleWithTab = (event.metadata?.module as string) ?? "unknown";
        moduleCounts.set(
          moduleWithTab,
          (moduleCounts.get(moduleWithTab) ?? 0) + 1
        );
      }

      const moduleUsage: ModuleUsageData[] = [];
      for (const [module, views] of moduleCounts.entries()) {
        const config = getModuleDisplay(module);
        moduleUsage.push({
          module,
          views,
          label: config.label,
          color: config.color,
        });
      }

      // Sort by views descending
      moduleUsage.sort((a, b) => b.views - a.views);

      return moduleUsage;
    } catch (error) {
      console.error("[EventActivityAnalyzer] Failed to get module usage:", error);
      return [];
    }
  }

  /**
   * Get recent activity events (across all users) with user details
   */
  async getRecentActivity(limitCount: number): Promise<RecentActivityEvent[]> {
    try {
      const events = await queryEvents({
        limit: limitCount,
        orderDirection: "desc",
      });

      const filteredEvents = events.filter((event) => event.id !== undefined);

      // Get unique user IDs and fetch their details
      const uniqueUserIds = [...new Set(filteredEvents.map((e) => e.userId))];
      const userDetailsMap = await this.fetchUserDetails(uniqueUserIds);

      return filteredEvents.map((event) => ({
        id: event.id as string,
        eventType: event.eventType,
        category: event.category,
        timestamp: event.timestamp,
        userId: event.userId,
        metadata: event.metadata,
        user: userDetailsMap.get(event.userId),
      }));
    } catch (error) {
      console.error("[EventActivityAnalyzer] Failed to get recent activity:", error);
      return [];
    }
  }

  /**
   * Fetch user details for a list of user IDs
   */
  private async fetchUserDetails(
    userIds: string[]
  ): Promise<Map<string, UserDisplayDetails>> {
    const userMap = new Map<string, UserDisplayDetails>();

    if (userIds.length === 0) return userMap;

    try {
      const firestore = await getFirestoreInstance();

      // Fetch user documents in parallel
      const userPromises = userIds.map(async (userId) => {
        try {
          const userDocRef = doc(firestore, `users/${userId}`);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const data = userDoc.data();
            return {
              userId,
              details: extractUserDisplayDetails(data),
            };
          }
          return {
            userId,
            details: {
              displayName: "Unknown User",
              photoURL: null,
              email: null,
            },
          };
        } catch {
          return {
            userId,
            details: {
              displayName: "Unknown User",
              photoURL: null,
              email: null,
            },
          };
        }
      });

      const results = await Promise.all(userPromises);

      for (const result of results) {
        userMap.set(result.userId, result.details);
      }
    } catch (error) {
      console.error("[EventActivityAnalyzer] Failed to fetch user details:", error);
    }

    return userMap;
  }
}
