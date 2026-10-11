/**
 * Session Manager Service
 *
 * Manages sequence session lifecycle:
 * - Session creation and tracking
 * - Session state persistence to Firestore
 * - Session cleanup
 *
 * Domain: Create module - Session management
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import {
  getFirestoreInstance,
  getAuthSync,
} from "#lib/shared/auth/firebase.js";
import {
  createSequenceSession,
  generateDeviceId,
  type SequenceSession,
} from "../domain/sequence-session";

export class SessionManager {
  private currentSession = $state<SequenceSession | null>(null);
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly sessionId: string = crypto.randomUUID(),
    private readonly deviceId: string = generateDeviceId()
  ) {}

  /**
   * Get the current active session
   */
  getCurrentSession(): SequenceSession | null {
    return this.currentSession;
  }

  /**
   * The one ID shared by the local draft and its Firestore session.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private buildSession(userId: string): SequenceSession {
    const sessionData = createSequenceSession(
      userId,
      this.deviceId,
      this.sessionId
    );

    return {
      ...sessionData,
      createdAt: serverTimestamp() as Timestamp,
      lastModified: serverTimestamp() as Timestamp,
      lastAutosave: null,
    };
  }

  async createSession(): Promise<SequenceSession | null> {
    return this.runExclusive(async () => {
      if (this.currentSession) return this.currentSession;

      const user = getAuthSync().currentUser;
      if (!user) {
        // Session tracking is optional for signed-out users. The same manager
        // can begin tracking later if an anonymous identity is provisioned.
        return null;
      }

      const session = this.buildSession(user.uid);

      const firestore = await getFirestoreInstance();
      const sessionRef = doc(
        firestore,
        `users/${user.uid}/sessions/${this.sessionId}`
      );
      await setDoc(sessionRef, session);

      this.currentSession = session;
      return session;
    });
  }

  /**
   * Persist the first meaningful session record after a non-empty draft lands.
   * Subsequent autosaves update that same record.
   */
  async recordAutosave(stepCount: number, name?: string): Promise<void> {
    await this.runExclusive(async () => {
      const user = getAuthSync().currentUser;
      if (!user) return;

      const firestore = await getFirestoreInstance();
      const sessionRef = doc(
        firestore,
        `users/${user.uid}/sessions/${this.sessionId}`
      );
      const lastAutosave = serverTimestamp() as Timestamp;
      const lastModified = serverTimestamp() as Timestamp;
      const session = this.currentSession ?? this.buildSession(user.uid);
      const updates: Partial<SequenceSession> = {
        isSaved: false,
        sequenceId: null,
        stepCount,
        lastAutosave,
        lastModified,
        status: "active",
      };

      if (name) updates.name = name;

      await setDoc(
        sessionRef,
        this.currentSession ? updates : { ...session, ...updates },
        { merge: true }
      );

      this.currentSession = {
        ...session,
        ...updates,
      };
    });
  }

  /**
   * Update session metadata
   */
  async updateSession(
    updates: Partial<Omit<SequenceSession, "sessionId" | "userId">>
  ): Promise<void> {
    if (!this.currentSession) {
      // No session was created (e.g. guest) — nothing to update.
      return;
    }

    const user = getAuthSync().currentUser;
    if (!user) {
      // Auth lapsed (token expired / signed out) after the session was created.
      // Cleanup paths like abandonSession() run on unmount and must not throw an
      // uncaught rejection — drop the local session and return.
      this.currentSession = null;
      return;
    }

    const firestore = await getFirestoreInstance();
    const sessionRef = doc(
      firestore,
      `users/${user.uid}/sessions/${this.currentSession.sessionId}`
    );

    await updateDoc(sessionRef, {
      ...updates,
      lastModified: serverTimestamp(),
    });

    // Update local state
    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastModified: serverTimestamp() as Timestamp,
    };
  }

  /**
   * Mark session as saved with sequence ID
   */
  async markAsSaved(sequenceId: string): Promise<void> {
    await this.runExclusive(async () => {
      const user = getAuthSync().currentUser;
      if (!user) return;

      const firestore = await getFirestoreInstance();
      const sessionRef = doc(
        firestore,
        `users/${user.uid}/sessions/${this.sessionId}`
      );
      const draftRef = doc(
        firestore,
        `users/${user.uid}/drafts/${this.sessionId}`
      );
      const session = this.currentSession ?? this.buildSession(user.uid);
      const completedSession: SequenceSession = {
        ...session,
        isSaved: true,
        sequenceId,
        status: "completed",
        lastModified: serverTimestamp() as Timestamp,
      };

      // Keep the cloud lifecycle atomic: a completed session must not retain
      // the draft it replaced, and a failed batch leaves both recoverable.
      const batch = writeBatch(firestore);
      batch.set(
        sessionRef,
        this.currentSession
          ? {
              isSaved: true,
              sequenceId,
              status: "completed",
              lastModified: completedSession.lastModified,
            }
          : completedSession,
        { merge: true }
      );
      batch.delete(draftRef);
      await batch.commit();

      this.currentSession = completedSession;
    });
  }

  /**
   * Update beat count in session
   */
  async updateStepCount(stepCount: number): Promise<void> {
    await this.updateSession({ stepCount });
  }

  /**
   * Mark last autosave timestamp
   */
  async markAutosaved(): Promise<void> {
    await this.updateSession({
      lastAutosave: serverTimestamp() as Timestamp,
    });
  }

  /**
   * Get recent sessions for current user
   */
  async getRecentSessions(limit = 10): Promise<SequenceSession[]> {
    const user = getAuthSync().currentUser;
    if (!user) return [];

    const firestore = await getFirestoreInstance();
    const sessionsRef = collection(firestore, `users/${user.uid}/sessions`);
    const q = query(sessionsRef, where("deviceId", "==", this.deviceId));

    const snapshot = await getDocs(q);
    const sessions = snapshot.docs.map(
      (doc) => ({ ...doc.data(), sessionId: doc.id }) as SequenceSession
    );

    // Sort by lastModified descending
    return sessions
      .sort(
        (a, b) =>
          (b.lastModified?.toMillis() ?? 0) - (a.lastModified?.toMillis() ?? 0)
      )
      .slice(0, limit);
  }

  /**
   * Load a session by ID
   */
  async loadSession(sessionId: string): Promise<SequenceSession | null> {
    const user = getAuthSync().currentUser;
    if (!user) return null;

    const firestore = await getFirestoreInstance();
    const sessionRef = doc(
      firestore,
      `users/${user.uid}/sessions/${sessionId}`
    );
    const snapshot = await getDoc(sessionRef);

    if (!snapshot.exists()) return null;

    const session = { ...snapshot.data(), sessionId } as SequenceSession;
    this.currentSession = session;
    return session;
  }

  /**
   * Clear current session (doesn't delete from Firestore)
   */
  clearSession(): void {
    this.currentSession = null;
  }

  /**
   * Abandon current session (marks as abandoned in Firestore)
   */
  async abandonSession(): Promise<void> {
    await this.runExclusive(async () => {
      if (!this.currentSession) return;

      // A later component teardown must not overwrite a completed session.
      if (this.currentSession.status === "completed") {
        this.currentSession = null;
        return;
      }

      const user = getAuthSync().currentUser;
      if (!user) {
        this.currentSession = null;
        return;
      }

      const firestore = await getFirestoreInstance();
      const sessionRef = doc(
        firestore,
        `users/${user.uid}/sessions/${this.sessionId}`
      );
      await updateDoc(sessionRef, {
        status: "abandoned",
        lastModified: serverTimestamp(),
      });
      this.currentSession = null;
    });
  }
}
