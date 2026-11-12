/**
 * Presence Service Implementation
 *
 * Manages real-time user presence using Firebase Realtime Database.
 * Uses activity-based detection (like Facebook) to show actual user engagement,
 * not just whether they have the app open.
 */

import {
  ref,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  off,
  get,
  remove,
  push,
} from "firebase/database";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp as fsServerTimestamp,
} from "firebase/firestore";
import posthog from "posthog-js";
import { database, auth, getFirestoreInstance } from "../../auth/firebase";
import { BREAKPOINTS } from "../../device/domain/constants/device-constants";
import type {
  UserPresence,
  UserPresenceWithId,
  PresenceStats,
  ActivityStatus,
  PresenceLocation,
  StoredPresence,
} from "../domain/models/presence-models";
import {
  IDLE_TIMEOUT_MINUTES,
  locationsEqual,
} from "../domain/models/presence-models";
import {
  aggregatePresenceTree,
  aggregateStoredPresence,
} from "../domain/presence-aggregation";
import { ActivityTracker } from "../utils/activity-tracker";

export class PresenceTracker {
  private currentPresence: UserPresence | null = null;
  private initialized = false;
  private userPresenceRef: ReturnType<typeof ref> | null = null;
  private connectionRef: ReturnType<typeof ref> | null = null;
  private unsubscribeConnectionState: (() => void) | null = null;
  private connectionGeneration = 0;
  private activityTracker: ActivityTracker | null = null;
  private userDeleted = false;
  private pendingLocation: PresenceLocation | null = null;
  /** The account the live presence node belongs to. */
  private ownerUid: string | null = null;
  private warnedWriteFailure = false;

  constructor() {}

  /**
   * A guest who signs into an existing account gets a new uid without a
   * sign-out, so goOffline never runs. Left alone, the tracker keeps writing
   * presence/{guestUid} under the new account's token and the rules refuse
   * every write. Drop the old account's state locally (that node is no longer
   * ours to write; its queued onDisconnect handlers clean it up) so the next
   * initialize() starts fresh for whoever is signed in now.
   * Returns true when the tracker belongs to the signed-in account.
   */
  private ownsCurrentAccount(): boolean {
    if (!this.ownerUid) return true;
    if (auth.currentUser?.uid === this.ownerUid) return true;
    this.stopActivityTracking();
    this.stopConnectionTracking();
    this.connectionGeneration++;
    this.connectionRef = null;
    this.userPresenceRef = null;
    this.currentPresence = null;
    this.initialized = false;
    this.userDeleted = false;
    this.ownerUid = null;
    return false;
  }

  /** Presence is best-effort: a refused write is logged once, never thrown. */
  private warnWriteFailure(error: unknown): void {
    if (this.warnedWriteFailure) return;
    this.warnedWriteFailure = true;
    console.warn("[PresenceTracker] Presence write failed:", error);
  }

  /**
   * Get session ID from PostHog (automatic session tracking)
   * Falls back to generated ID if PostHog not available
   */
  private getSessionId(): string {
    try {
      const posthogSessionId = posthog.get_session_id?.();
      if (posthogSessionId) return posthogSessionId;
    } catch {
      // PostHog not initialized
    }

    // Fallback: generate a simple session ID
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Detect device type from user agent and screen size
   */
  private detectDevice(): "desktop" | "mobile" | "tablet" {
    if (typeof window === "undefined") return "desktop";

    const userAgent = navigator.userAgent.toLowerCase();
    const screenWidth = window.innerWidth;

    const isMobileUA =
      /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent
      );
    const isTabletUA = /ipad|tablet|playbook|silk/i.test(userAgent);

    if (isTabletUA || (isMobileUA && screenWidth >= BREAKPOINTS.MOBILE)) {
      return "tablet";
    }

    if (isMobileUA || screenWidth < BREAKPOINTS.MOBILE) {
      return "mobile";
    }

    return "desktop";
  }

  /**
   * Check if the user's Firestore document exists.
   * If not, the user was deleted and we should not write presence.
   */
  private async checkUserExists(userId: string): Promise<boolean> {
    try {
      const firestore = await getFirestoreInstance();
      const userDoc = await getDoc(doc(firestore, "users", userId));
      return userDoc.exists();
    } catch (err) {
      console.warn("[PresenceTracker] Could not verify user exists:", err);
      // If we can't check, assume user exists to avoid breaking presence for real users
      return true;
    }
  }

  /**
   * Clean up presence for a deleted user.
   */
  private async cleanupDeletedUser(): Promise<void> {
    this.userDeleted = true;
    this.stopActivityTracking();
    this.stopConnectionTracking();

    if (this.userPresenceRef) {
      try {
        await remove(this.userPresenceRef);
      } catch {
        // Could not remove presence
      }
    }

    this.currentPresence = null;
    this.initialized = false;
    this.userPresenceRef = null;
    this.connectionRef = null;
  }

  /**
   * Provide the caller's IP-derived location (from the layout server load).
   * Stored and written into the presence record + user doc on initialize().
   * Null is ignored so a prior good location is never clobbered.
   */
  setLocation(location: PresenceLocation | null): void {
    // Null never clobbers a prior good location.
    if (!location) return;
    // Skip identical re-sends. The layout $effect re-fires on every navigation
    // with the same stable geo, so without this guard each navigation would
    // issue a redundant RTDB + Firestore write.
    if (locationsEqual(this.pendingLocation, location)) return;
    this.pendingLocation = location;
    // If already initialized this session, persist immediately.
    if (this.initialized) {
      void this.persistLocation();
    }
  }

  /** Write the pending location to live presence and the owner's private profile. */
  private async persistLocation(): Promise<void> {
    const loc = this.pendingLocation;
    if (!loc) return;
    const user = auth.currentUser;
    if (!user) return;

    // 1) Live location on the presence record (for the map of online users).
    if (this.connectionRef && this.currentPresence) {
      this.currentPresence.location = loc;
      await this.writeCurrentConnection().catch((error) =>
        this.warnWriteFailure(error)
      );
    }

    // 2) Persistent last-known location stays owner-private in Firestore.
    try {
      const firestore = await getFirestoreInstance();
      await setDoc(
        doc(firestore, "userPrivateProfiles", user.uid),
        { lastLocation: { ...loc, updatedAt: fsServerTimestamp() } },
        { merge: true }
      );
    } catch (error) {
      console.warn("[PresenceTracker] lastLocation write failed:", error);
    }
  }

  async initialize(): Promise<void> {
    this.ownsCurrentAccount();
    if (this.initialized) return;
    if (this.userDeleted) return; // User was deleted, don't reinitialize

    const user = auth.currentUser;
    if (!user) return;

    const userId = user.uid;

    // Verify user document exists in Firestore before setting up presence
    const userExists = await this.checkUserExists(userId);
    if (!userExists) {
      // Remember whose deletion this is, so a later account switch clears it.
      this.ownerUid = userId;
      await this.cleanupDeletedUser();
      return;
    }

    // The account may have changed (or another call finished) during the check.
    if (auth.currentUser?.uid !== userId || this.initialized) return;

    this.ownerUid = userId;
    this.userPresenceRef = ref(database, `presence/${userId}`);

    const now = Date.now();

    // Create presence data with activity tracking
    // Session ID from PostHog (or fallback), device detected locally.
    // Anonymous (guest) users have no displayName/email/photoURL — RTDB rejects
    // any object containing `undefined`, so omit those keys entirely when absent
    // rather than writing `undefined`/`null` values.
    this.currentPresence = {
      online: true,
      activityStatus: "active",
      lastActivity: now,
      lastSeen: now,
      currentModule: "create",
      currentTab: null,
      sessionId: this.getSessionId(),
      device: this.detectDevice(),
      ...(this.pendingLocation ? { location: this.pendingLocation } : {}),
      ...(user.displayName ? { displayName: user.displayName } : {}),
      ...(user.email ? { email: user.email } : {}),
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    };

    this.initialized = true;
    this.startConnectionTracking(userId);
    this.startActivityTracking();

    // Persist last-known location to the user doc (non-blocking).
    if (this.pendingLocation) {
      void this.persistLocation();
    }
  }

  /**
   * RTDB connections can drop and reconnect without remounting the app. Each
   * reconnect receives a fresh child so an old server-side disconnect handler
   * can remove only the connection that actually ended.
   */
  private startConnectionTracking(userId: string): void {
    this.stopConnectionTracking();
    const connectedRef = ref(database, ".info/connected");

    this.unsubscribeConnectionState = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) {
        this.connectionGeneration++;
        this.connectionRef = null;
        return;
      }
      const generation = ++this.connectionGeneration;
      void this.registerConnection(userId, generation);
    });
  }

  private stopConnectionTracking(): void {
    this.unsubscribeConnectionState?.();
    this.unsubscribeConnectionState = null;
  }

  private async registerConnection(
    userId: string,
    generation: number
  ): Promise<void> {
    if (!this.currentPresence || !this.userPresenceRef || this.userDeleted) {
      return;
    }
    if (userId !== this.ownerUid || !this.ownsCurrentAccount()) return;

    const nextConnection = push(
      ref(database, `presence/${userId}/connections`)
    );
    const connectionKey = nextConnection.key;
    if (!connectionKey) {
      console.warn("[PresenceTracker] Could not allocate a connection ID");
      return;
    }

    try {
      // Queue cleanup before publishing the connection. Firebase runs these
      // server-side even when a tab crashes or its network disappears.
      await Promise.all([
        onDisconnect(nextConnection).remove(),
        onDisconnect(ref(database, `presence/${userId}/lastSeen`)).set(
          serverTimestamp()
        ),
      ]);

      if (
        generation !== this.connectionGeneration ||
        this.userDeleted ||
        !this.currentPresence ||
        !this.userPresenceRef
      ) {
        await remove(nextConnection);
        return;
      }

      const now = Date.now();
      this.currentPresence.online = true;
      this.currentPresence.activityStatus = "active";
      this.currentPresence.lastActivity = now;
      this.currentPresence.lastSeen = now;

      await update(this.userPresenceRef, {
        schemaVersion: 2,
        lastSeen: serverTimestamp(),
        [`connections/${connectionKey}`]: {
          ...this.currentPresence,
          lastSeen: serverTimestamp(),
          lastActivity: serverTimestamp(),
        },
      });
      if (generation === this.connectionGeneration) {
        this.connectionRef = nextConnection;
      } else {
        await remove(nextConnection);
      }
    } catch (error) {
      console.warn("[PresenceTracker] Connection registration failed:", error);
      if (this.connectionRef === nextConnection) {
        this.connectionRef = null;
      }
    }
  }

  private async writeCurrentConnection(): Promise<void> {
    if (!this.ownsCurrentAccount()) return;
    const connectionKey = this.connectionRef?.key;
    if (!connectionKey || !this.userPresenceRef || !this.currentPresence) {
      return;
    }

    await update(this.userPresenceRef, {
      schemaVersion: 2,
      lastSeen: serverTimestamp(),
      [`connections/${connectionKey}`]: {
        ...this.currentPresence,
        online: true,
        lastSeen: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
    });
  }

  /** Start tracking user interactions for activity-based presence */
  private startActivityTracking(): void {
    if (this.activityTracker) return;

    this.activityTracker = new ActivityTracker({
      onActivity: () => {
        void this.handleUserActivity().catch((error) =>
          console.warn("[PresenceTracker] Activity update failed:", error)
        );
      },
    });

    this.activityTracker.start();
  }

  /** Stop activity tracking */
  private stopActivityTracking(): void {
    if (this.activityTracker) {
      this.activityTracker.stop();
      this.activityTracker = null;
    }
  }

  /** Handle detected user activity */
  private async handleUserActivity(): Promise<void> {
    if (!this.ownsCurrentAccount()) {
      await this.initialize();
      return;
    }
    if (!this.currentPresence) return;
    if (this.userDeleted) return;

    // Periodically verify user still exists (every ~30 activity updates)
    if (Math.random() < 0.03) {
      const user = auth.currentUser;
      if (user) {
        const userExists = await this.checkUserExists(user.uid);
        if (!userExists) {
          await this.cleanupDeletedUser();
          return;
        }
      }
    }

    const now = Date.now();
    this.currentPresence.lastActivity = now;
    this.currentPresence.lastSeen = now;
    this.currentPresence.online = true;
    this.currentPresence.activityStatus = "active";

    // A full child write also repairs this connection if a legacy tab replaced
    // the old flat user node during the rollout.
    await this.writeCurrentConnection();
  }

  async updateLocation(module: string, tab?: string | null): Promise<void> {
    this.ownsCurrentAccount();
    if (this.userDeleted) return;

    if (!this.currentPresence) {
      // Try to initialize first
      await this.initialize();
      if (!this.currentPresence) return;
    }

    const now = Date.now();
    this.currentPresence.currentModule = module;
    this.currentPresence.currentTab = tab ?? null;
    this.currentPresence.lastSeen = now;
    this.currentPresence.lastActivity = now;
    this.currentPresence.online = true;
    this.currentPresence.activityStatus = "active";

    // Navigation counts as activity and publishes the full current connection.
    // Navigation fires this without awaiting, so a refusal must not escape as
    // an unhandled rejection.
    await this.writeCurrentConnection().catch((error) =>
      this.warnWriteFailure(error)
    );
  }

  async goOffline(): Promise<void> {
    // After an account switch the old node is not ours to write; the check
    // resets local state and leaves nothing more to do.
    if (!this.ownsCurrentAccount()) return;
    // Stop activity tracking first
    this.stopActivityTracking();
    this.stopConnectionTracking();

    const connection = this.connectionRef;
    const userPresence = this.userPresenceRef;
    this.connectionGeneration++;
    this.connectionRef = null;

    if (connection) {
      await remove(connection);
    }
    if (userPresence) {
      await update(userPresence, { lastSeen: serverTimestamp() });
    }

    this.currentPresence = null;
    this.initialized = false;
    this.userPresenceRef = null;
    this.ownerUid = null;
  }

  getCurrentPresence(): UserPresence | null {
    return this.currentPresence ? { ...this.currentPresence } : null;
  }

  subscribeToAllPresence(
    callback: (users: UserPresenceWithId[]) => void
  ): () => void {
    const presenceListRef = ref(database, "presence");
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = (data: Record<string, StoredPresence> | null) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      const users = aggregatePresenceTree(data);
      callback(users);

      const nextExpiry = users
        .filter((user) => user.activityStatus === "active")
        .reduce(
          (soonest, user) =>
            Math.min(
              soonest,
              user.lastActivity + IDLE_TIMEOUT_MINUTES * 60_000
            ),
          Number.POSITIVE_INFINITY
        );
      if (Number.isFinite(nextExpiry)) {
        expiryTimer = setTimeout(
          () => emit(data),
          Math.max(0, nextExpiry - Date.now() + 25)
        );
      }
    };

    const handleValue = (snapshot: {
      val: () => Record<string, StoredPresence> | null;
    }) => {
      emit(snapshot.val());
    };

    onValue(presenceListRef, handleValue);

    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      off(presenceListRef, "value", handleValue);
    };
  }

  subscribeToUserPresence(
    userId: string,
    callback: (presence: UserPresence | null) => void
  ): () => void {
    const userPresenceRef = ref(database, `presence/${userId}`);
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = (stored: StoredPresence | null) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      const presence = stored ? aggregateStoredPresence(userId, stored) : null;
      callback(presence);
      if (presence?.activityStatus === "active") {
        expiryTimer = setTimeout(
          () => emit(stored),
          Math.max(
            0,
            presence.lastActivity +
              IDLE_TIMEOUT_MINUTES * 60_000 -
              Date.now() +
              25
          )
        );
      }
    };

    const handleValue = (snapshot: { val: () => StoredPresence | null }) => {
      emit(snapshot.val());
    };

    onValue(userPresenceRef, handleValue);

    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      off(userPresenceRef, "value", handleValue);
    };
  }

  async getPresenceStats(): Promise<PresenceStats> {
    const presenceListRef = ref(database, "presence");
    const snapshot = await get(presenceListRef);
    const users = aggregatePresenceTree(
      snapshot.val() as Record<string, StoredPresence> | null
    );

    if (users.length === 0) {
      return {
        activeCount: 0,
        inactiveCount: 0,
        byModule: {},
        byDevice: { desktop: 0, mobile: 0, tablet: 0 },
      };
    }

    const stats: PresenceStats = {
      activeCount: 0,
      inactiveCount: 0,
      byModule: {},
      byDevice: { desktop: 0, mobile: 0, tablet: 0 },
    };

    for (const presence of users) {
      if (presence.activityStatus === "active") {
        stats.activeCount++;
        stats.byModule[presence.currentModule] =
          (stats.byModule[presence.currentModule] ?? 0) + 1;
        stats.byDevice[presence.device]++;
      } else {
        stats.inactiveCount++;
      }
    }

    return stats;
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const userPresenceRef = ref(database, `presence/${userId}`);
    const snapshot = await get(userPresenceRef);
    const stored = snapshot.val() as StoredPresence | null;

    if (!stored) return false;

    return aggregateStoredPresence(userId, stored).activityStatus === "active";
  }

  /** Get detailed activity status for a user */
  async getUserActivityStatus(userId: string): Promise<ActivityStatus> {
    const userPresenceRef = ref(database, `presence/${userId}`);
    const snapshot = await get(userPresenceRef);
    const stored = snapshot.val() as StoredPresence | null;

    if (!stored) return "offline";

    return aggregateStoredPresence(userId, stored).activityStatus;
  }
}
