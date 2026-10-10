/**
 * User Activity Service Implementation (Admin)
 *
 * Allows admins to view all users' activity and presence.
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
  where,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { PresenceTracker } from "#lib/shared/presence/services/presence-tracker.js";
import type {
  UserWithActivity, SessionSummary, UserActivityQueryOptions } from "./types";
import type {
  ActivityEvent,
  ActivityCategory,
  ActivityEventType,
} from "#lib/shared/analytics/domain/models/activity-event.js";
import type { UserPresenceWithId } from "#lib/shared/presence/domain/models/presence-models.js";
export class UserActivityTracker {
  constructor(private presenceService: PresenceTracker) {}

  async getAllUsersWithPresence(): Promise<UserWithActivity[]> {
    try {
      const firestore = await getFirestoreInstance();
      // Get all users from Firestore
      const usersRef = collection(firestore, "users");
      const usersSnapshot = await getDocs(usersRef);

      const users: UserWithActivity[] = [];

      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        const isOnline = await this.presenceService.isUserOnline(doc.id);

        users.push({
          userId: doc.id,
          displayName: (data["displayName"] as string) ?? "Unknown",
          email: (data["email"] as string) ?? "",
          photoURL: (data["photoURL"] as string | null) ?? null,
          online: isOnline,
          lastSeen: (data["lastActivityDate"] as Timestamp)?.toMillis() ?? 0,
        });
      }

      // Sort: online first, then by last seen
      users.sort((a, b) => {
        if (a.online !== b.online) {
          return a.online ? -1 : 1;
        }
        return b.lastSeen - a.lastSeen;
      });

      return users;
    } catch (error) {
      console.error("Failed to get users with presence:", error);
      return [];
    }
  }

  subscribeToAllPresence(
    callback: (users: UserPresenceWithId[]) => void
  ): () => void {
    return this.presenceService.subscribeToAllPresence(callback);
  }

  subscribeToAllUsers(
    callback: (users: UserPresenceWithId[]) => void
  ): () => void {
    const allFirestoreUsers: Map<
      string,
      {
        displayName: string;
        email: string;
        photoURL: string | null;
        isAnonymous: boolean;
        lastLocation: import("#lib/shared/presence/domain/models/presence-models.js").PresenceLocation | null;
      }
    > = new Map();
    let presenceUsers: UserPresenceWithId[] = [];
    let isFirestoreReady = false;
    let isPresenceReady = false;
    let unsubscribeFirestore: (() => void) | null = null;

    // Subscribe to Firestore users collection for real-time updates
    (async () => {
      try {
        const firestore = await getFirestoreInstance();
        const usersRef = collection(firestore, "users");

        // Use onSnapshot instead of getDocs to get real-time updates
        unsubscribeFirestore = onSnapshot(
          usersRef,
          (snapshot) => {
            // Clear and rebuild the map on each snapshot
            allFirestoreUsers.clear();

            snapshot.docs.forEach((doc) => {
              const data = doc.data();
              allFirestoreUsers.set(doc.id, {
                displayName: (data["displayName"] as string) ?? "Unknown",
                email: (data["email"] as string) ?? "",
                photoURL: (data["photoURL"] as string | null) ?? null,
                isAnonymous: (data["isAnonymous"] as boolean) ?? false,
                lastLocation:
                  (data["lastLocation"] as
                    | import("#lib/shared/presence/domain/models/presence-models.js").PresenceLocation
                    | undefined) ?? null,
              });
            });

            isFirestoreReady = true;
            if (isPresenceReady) {
              mergeAndNotify();
            }
          },
          (error) => {
            console.error(
              "[UserActivityTracker] Firestore subscription error:",
              error
            );
          }
        );
      } catch (error) {
        console.error(
          "[UserActivityTracker] Failed to subscribe to users:",
          error
        );
      }
    })();

    // Subscribe to presence updates
    const unsubscribePresence = this.presenceService.subscribeToAllPresence(
      (users) => {
        presenceUsers = users;
        isPresenceReady = true;
        if (isFirestoreReady) {
          mergeAndNotify();
        }
      }
    );

    // Merge Firestore users with presence data and notify
    function mergeAndNotify() {
      const presenceMap = new Map(presenceUsers.map((u) => [u.userId, u]));
      const merged: UserPresenceWithId[] = [];

      // Add all Firestore users
      for (const [userId, userData] of allFirestoreUsers) {
        const presence = presenceMap.get(userId);

        if (presence) {
          // User has presence data - merge with Firestore data
          // Prefer Firestore displayName as it's the authoritative source for admin edits
          merged.push({
            ...presence,
            displayName: userData.displayName || presence.displayName,
            email: userData.email || presence.email,
            photoURL: userData.photoURL ?? presence.photoURL,
            isAnonymous: userData.isAnonymous,
            location: presence.location ?? userData.lastLocation ?? undefined,
          });
        } else {
          // User exists in Firestore but no presence data - create default
          merged.push({
            userId,
            displayName: userData.displayName,
            email: userData.email,
            photoURL: userData.photoURL,
            online: false,
            activityStatus: "offline",
            lastActivity: 0, // Never seen
            lastSeen: 0,
            currentModule: "",
            currentTab: null,
            sessionId: "",
            device: "desktop",
            isAnonymous: userData.isAnonymous,
            location: userData.lastLocation ?? undefined,
          });
        }
      }

      // Sort: active first, then by last activity (most recent first)
      merged.sort((a, b) => {
        if (a.activityStatus !== b.activityStatus) {
          return a.activityStatus === "active" ? -1 : 1;
        }
        return b.lastActivity - a.lastActivity;
      });

      callback(merged);
    }

    // Return cleanup function
    return () => {
      unsubscribePresence();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }

  async getUserActivity(
    options: UserActivityQueryOptions
  ): Promise<ActivityEvent[]> {
    try {
      const firestore = await getFirestoreInstance();
      const activityRef = collection(
        firestore,
        `users/${options.userId}/activityLog`
      );

      let q = query(activityRef, orderBy("timestamp", "desc"));

      if (options.startDate) {
        q = query(
          q,
          where("timestamp", ">=", Timestamp.fromDate(options.startDate))
        );
      }

      if (options.endDate) {
        q = query(
          q,
          where("timestamp", "<=", Timestamp.fromDate(options.endDate))
        );
      }

      if (options.sessionId) {
        q = query(q, where("sessionId", "==", options.sessionId));
      }

      if (options.limit) {
        q = query(q, firestoreLimit(options.limit));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data["userId"] as string,
          sessionId: data["sessionId"] as string | undefined,
          category: data["category"] as ActivityCategory,
          eventType: data["eventType"] as ActivityEventType,
          timestamp: (data["timestamp"] as Timestamp).toDate(),
          metadata: data["metadata"] as ActivityEvent["metadata"],
          client: data["client"] as ActivityEvent["client"],
        };
      });
    } catch (error) {
      console.error("Failed to get user activity:", error);
      return [];
    }
  }

  async getUserSessions(userId: string, limit = 10): Promise<SessionSummary[]> {
    try {
      // Get recent activity and group by sessionId
      const events = await this.getUserActivity({
        userId,
        limit: 500,
      });

      // Group by session
      const sessionMap = new Map<string, ActivityEvent[]>();
      for (const event of events) {
        const sessionId = event.sessionId ?? "unknown";
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, []);
        }
        sessionMap.get(sessionId)!.push(event);
      }

      // Build session summaries
      const sessions: SessionSummary[] = [];
      for (const [sessionId, sessionEvents] of sessionMap) {
        if (sessionEvents.length === 0) continue;

        // Sort events by timestamp
        sessionEvents.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        const startedAt = sessionEvents[0]!.timestamp;
        const endedAt = sessionEvents[sessionEvents.length - 1]!.timestamp;
        const duration = endedAt.getTime() - startedAt.getTime();

        // Get unique modules visited
        const modules = new Set<string>();
        for (const event of sessionEvents) {
          if (event.metadata?.module) {
            modules.add(event.metadata.module as string);
          }
        }

        sessions.push({
          sessionId,
          startedAt,
          endedAt,
          duration,
          eventCount: sessionEvents.length,
          modules: Array.from(modules),
        });
      }

      // Sort by start time (most recent first) and limit
      sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return sessions.slice(0, limit);
    } catch (error) {
      console.error("Failed to get user sessions:", error);
      return [];
    }
  }

  async getSessionActivity(
    userId: string,
    sessionId: string
  ): Promise<ActivityEvent[]> {
    return this.getUserActivity({
      userId,
      sessionId,
      limit: 200,
    });
  }

  async getPresenceStats(): Promise<{
    activeCount: number;
    inactiveCount: number;
    byModule: Record<string, number>;
    byDevice: Record<string, number>;
  }> {
    return this.presenceService.getPresenceStats();
  }
}
