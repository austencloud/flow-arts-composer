/**
 * System State Service Implementation
 *
 * Unified data hub that loads and caches core admin collections.
 * Fetches users and announcements once and derives all views from this snapshot.
 */

import { collection, getDocs, Timestamp } from "firebase/firestore";
import {
  getFirestoreInstance,
  getAuthSync,
} from "#lib/shared/auth/firebase.js";
import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
import type {
  SystemState,
  CachedUserMetadata,
  CachedAnnouncement,
  AdminUserAccountSummary,
} from "./types";

// Cache TTL: 2-3 minutes for ops work (stale data is acceptable)
const SYSTEM_STATE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Query timeout for Firebase operations
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

export class SystemStateManager {
  private cachedState: SystemState | null = null;

  constructor() {}

  /**
   * Check if Firestore is available
   */
  private async isFirestoreAvailable(): Promise<boolean> {
    const firestore = await getFirestoreInstance();
    return (
      firestore !== null &&
      firestore !== undefined &&
      getAuthSync().currentUser !== null
    );
  }

  /**
   * Get system state (cached or fresh)
   */
  async getSystemState(): Promise<SystemState> {
    // Return cached data if still valid
    if (this.cachedState && this.isCacheValid()) {
      return this.cachedState;
    }

    if (!(await this.isFirestoreAvailable())) {
      return this.getEmptySystemState();
    }

    try {
      const now = Date.now();
      const expiresAt = now + SYSTEM_STATE_CACHE_TTL_MS;

      // Load all collections in parallel
      const [users, announcements, accountSummary] = await Promise.all([
        this.loadUsers(),
        this.loadAnnouncements(),
        this.loadAccountSummary(),
      ]);

      const systemState: SystemState = {
        users,
        announcements,
        accountSummary,
        loadedAt: now,
        expiresAt,
      };

      // Cache the result
      this.cachedState = systemState;
      return systemState;
    } catch (error) {
      console.error("Failed to load system state:", error);
      return this.getEmptySystemState();
    }
  }

  private async loadAccountSummary(): Promise<AdminUserAccountSummary | null> {
    try {
      const response = await withTimeout(
        authedFetch("/api/admin/user-summary"),
        QUERY_TIMEOUT_MS,
        null
      );
      if (!response?.ok) {
        throw new Error(
          response
            ? `Account summary returned ${response.status}`
            : "Account summary timed out"
        );
      }

      const summary = (await response.json()) as Record<string, unknown>;
      const fields: Array<keyof AdminUserAccountSummary> = [
        "totalAuthAccounts",
        "registeredAccounts",
        "anonymousAccounts",
        "totalProfiles",
        "registeredProfiles",
        "anonymousProfiles",
        "missingRegisteredProfiles",
      ];
      for (const field of fields) {
        const value = summary[field];
        if (!Number.isInteger(value) || (value as number) < 0) {
          throw new Error(`Account summary has an invalid ${field}`);
        }
      }

      return summary as unknown as AdminUserAccountSummary;
    } catch (error) {
      console.error("Failed to load registered account summary:", error);
      return null;
    }
  }

  /**
   * Load all users with metadata
   */
  private async loadUsers(): Promise<CachedUserMetadata[]> {
    try {
      const firestore = await getFirestoreInstance();
      const result = await withTimeout<
        | [
            Awaited<ReturnType<typeof getDocs>>,
            Awaited<ReturnType<typeof getDocs>>,
          ]
        | null
      >(
        Promise.all([
          getDocs(collection(firestore, "users")),
          getDocs(collection(firestore, "userPrivateProfiles")),
        ]),
        QUERY_TIMEOUT_MS,
        null
      );

      if (!result) {
        return [];
      }
      const [snapshot, privateSnapshot] = result;

      const privateProfiles = new Map<string, Record<string, unknown>>(
        privateSnapshot.docs.map((profile) => [
          profile.id,
          profile.data() as Record<string, unknown>,
        ])
      );
      const users: CachedUserMetadata[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>;
        users.push(
          this.parseUserDocument(
            doc.id,
            data,
            privateProfiles.get(doc.id) ?? {}
          )
        );
      });

      return users;
    } catch (error) {
      console.error("Failed to load users:", error);
      return [];
    }
  }

  /**
   * Parse user document into CachedUserMetadata
   */
  private parseUserDocument(
    userId: string,
    data: Record<string, unknown>,
    privateData: Record<string, unknown>
  ): CachedUserMetadata {
    const lastActivity = data["lastActivityDate"];
    let lastActivityDate: Date | null = null;
    if (lastActivity) {
      lastActivityDate =
        lastActivity instanceof Timestamp
          ? lastActivity.toDate()
          : new Date(lastActivity as string);
    }

    const createdAt = data["createdAt"];
    let createdAtDate: Date | null = null;
    if (createdAt) {
      createdAtDate =
        createdAt instanceof Timestamp
          ? createdAt.toDate()
          : new Date(createdAt as string);
    }

    return {
      id: userId,
      displayName: (data["displayName"] as string) ?? "Unknown",
      email: (privateData["email"] as string) ?? null,
      photoURL: (data["photoURL"] as string) ?? null,
      sequenceCount: (data["sequenceCount"] as number) ?? 0,
      publicSequenceCount: (data["publicSequenceCount"] as number) ?? 0,
      totalViews: (data["totalViews"] as number) ?? 0,
      shareCount: (data["shareCount"] as number) ?? 0,
      lastActivityDate,
      createdAt: createdAtDate,
      disabled: (data["disabled"] as boolean) ?? false,
      role: (data["role"] as string) ?? "user",
      isAnonymous: (data["isAnonymous"] as boolean) ?? false,
      attribution:
        (privateData["attribution"] as Record<string, unknown> | undefined) ??
        null,
      lastLocation:
        (privateData["lastLocation"] as
          | import("#lib/shared/presence/domain/models/presence-models.js").PresenceLocation
          | undefined) ?? null,
    };
  }

  /**
   * Load all announcements
   */
  private async loadAnnouncements(): Promise<CachedAnnouncement[]> {
    try {
      const firestore = await getFirestoreInstance();
      const announcementsRef = collection(firestore, "announcements");
      const snapshot = await withTimeout(
        getDocs(announcementsRef),
        QUERY_TIMEOUT_MS,
        null
      );

      if (!snapshot) {
        return [];
      }

      const announcements: CachedAnnouncement[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt = data["createdAt"];
        let createdAtDate: Date | null = null;
        if (createdAt) {
          createdAtDate =
            createdAt instanceof Timestamp
              ? createdAt.toDate()
              : new Date(createdAt as string);
        }

        const expiresAt = data["expiresAt"];
        let expiresAtDate: Date | null = null;
        if (expiresAt) {
          expiresAtDate =
            expiresAt instanceof Timestamp
              ? expiresAt.toDate()
              : new Date(expiresAt as string);
        }

        announcements.push({
          id: doc.id,
          title: (data["title"] as string) ?? "Untitled",
          message: (data["message"] as string) ?? "",
          severity:
            (data["severity"] as "info" | "warning" | "critical") ?? "info",
          // Announcements are written with `targetAudience` (a single audience
          // enum) and `showAsModal` (boolean) by announcement-manager. The old
          // reads of `audiences`/`displayMode` matched no written field, so
          // every cached announcement collapsed to [] / "modal".
          audiences: data["targetAudience"]
            ? [data["targetAudience"] as string]
            : [],
          displayMode: data["showAsModal"] === true ? "modal" : "banner",
          createdAt: createdAtDate,
          expiresAt: expiresAtDate,
          actionLabel: (data["actionLabel"] as string) ?? undefined,
          actionUrl: (data["actionUrl"] as string) ?? undefined,
        });
      });

      return announcements;
    } catch (error) {
      console.error("Failed to load announcements:", error);
      return [];
    }
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid(): boolean {
    if (!this.cachedState) {
      return false;
    }
    return Date.now() < this.cachedState.expiresAt;
  }

  /**
   * Invalidate the cache
   */
  invalidateCache(): void {
    this.cachedState = null;
  }

  /**
   * Get TTL remaining in milliseconds
   */
  getCacheTTLRemaining(): number {
    if (!this.cachedState) {
      return 0;
    }
    const remaining = this.cachedState.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Return empty system state when Firebase is unavailable
   */
  private getEmptySystemState(): SystemState {
    return {
      users: [],
      announcements: [],
      accountSummary: null,
      loadedAt: Date.now(),
      expiresAt: Date.now(),
    };
  }
}
