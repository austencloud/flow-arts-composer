/**
 * Autosave Service
 *
 * Saves sequence drafts to Dexie (IndexedDB) first - no auth required,
 * works offline, survives a page reload. If the user is authenticated,
 * we also fire a non-blocking Firestore sync so the draft is backed up
 * to the cloud when connectivity is available.
 *
 * Domain: Create module - Draft persistence
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance, getAuthSync } from "$lib/shared/auth/firebase";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import {
  createDraftSequence,
  type DraftSequence,
} from "../domain/draft-sequence";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { db } from "$lib/shared/persistence/database/tka-database";
import { UserWorkType } from "$lib/shared/persistence/domain/enums/user-work-type";

export class Autosaver {
  private autosaveInterval: number | null = null;
  private activeSessionId: string | null = null;
  private isDirty = false;
  private saving = false;
  private finalizingDraft = false;
  private saveCompletion: Promise<void> | null = null;
  private cloudSaveQueue: Promise<void> = Promise.resolve();

  private queueCloudSave(operation: () => Promise<void>): void {
    const queued = this.cloudSaveQueue.then(operation, operation);
    this.cloudSaveQueue = queued.catch((error) => {
      // Cloud backup is secondary to the completed local write, but every
      // failure remains attributed and the queue stays usable for the next
      // autosave or completion drain.
      console.warn("[Autosaver] Firestore draft sync failed:", error);
    });
  }

  /**
   * Save a draft.
   *
   * Always writes to Dexie first - instant, no auth needed, works offline.
   * If the user is signed in we also kick off a Firestore sync in the
   * background so the draft reaches the cloud, but we never await it here.
   */
  async saveDraft(
    sessionId: string,
    sequenceData: SequenceData
  ): Promise<boolean> {
    // Completion owns the draft lifecycle until its pending local and cloud
    // writes settle. An edit made during this window keeps isDirty set and is
    // picked up by the next interval after finalization.
    if (this.finalizingDraft) return false;

    // Guard against concurrent saves (interval + manual can overlap)
    if (this.saving) {
      await this.saveCompletion;
      return false;
    }
    this.saving = true;
    let releaseSave!: () => void;
    this.saveCompletion = new Promise((resolve) => {
      releaseSave = resolve;
    });

    // Capture-and-clear the dirty flag up front. A markDirty() that lands while
    // the write below is awaiting must NOT be erased — clearing before the await
    // means such an edit re-sets isDirty and still triggers the next interval
    // save. On failure we re-arm below so the edit is retried, not lost.
    this.isDirty = false;

    try {
      // --- Dexie (local, always) ---
      // Deep-clone via JSON to strip non-cloneable objects (Firestore Timestamps,
      // class instances, functions) that IndexedDB's structured clone rejects.
      const cloneableData = JSON.parse(
        JSON.stringify({
          sessionId,
          sequenceData,
          stepCount: sequenceData.steps.length,
          name: sequenceData.name,
        })
      );

      // Keep exactly one draft row per (type, tabId). userWork is ++id
      // auto-increment, so put() with no key INSERTs a fresh row on every
      // autosave — unbounded growth, and recovery would restore the oldest
      // near-empty snapshot. Delete existing rows for this key (mirrors
      // deleteDraft's [type+tabId] query), then add the current one.
      await db.userWork
        .where("[type+tabId]")
        .equals([UserWorkType.SEQUENCE_DRAFT, "create"])
        .delete();

      await db.userWork.add({
        type: UserWorkType.SEQUENCE_DRAFT,
        tabId: "create",
        data: cloneableData,
        lastModified: new Date(),
        version: 1,
      });

      // --- Firestore (cloud, fire-and-forget) ---
      const user = getAuthSync().currentUser;
      if (user) {
        const draftData = createDraftSequence(
          sessionId,
          user.uid,
          sequenceData
        );
        // Deep-clone the sequence data via JSON to strip undefined values -
        // Firestore rejects them (e.g. startPlacement.startPlacement can be
        // undefined on fresh pictographs). Timestamps are added after the
        // clone since serverTimestamp() is a Firestore sentinel, not JSON.
        const cleanData = JSON.parse(JSON.stringify(draftData));
        cleanData.createdAt = serverTimestamp();
        cleanData.updatedAt = serverTimestamp();

        this.queueCloudSave(async () => {
          const firestore = await getFirestoreInstance();
          const draftRef = doc(
            firestore,
            `users/${user.uid}/drafts/${sessionId}`
          );
          await trackWrite(() => setDoc(draftRef, cleanData, { merge: true }));
        });
      }

      return true;
    } catch (err) {
      // Write failed — re-arm the dirty flag so the next interval tick retries
      // this edit (we cleared it up front for the race fix above).
      this.isDirty = true;
      throw err;
    } finally {
      this.saving = false;
      releaseSave();
      this.saveCompletion = null;
    }
  }

  /**
   * Load a draft for session recovery.
   *
   * Checks Dexie first - if we have a local copy we use it immediately
   * without touching the network. Falls back to Firestore only when
   * Dexie has nothing and the user is authenticated.
   */
  async loadDraft(sessionId?: string): Promise<DraftSequence | null> {
    // --- Dexie (local, always first) ---
    try {
      // Return the NEWEST draft. Older damaged DBs may still hold multiple rows
      // from the pre-fix insert-every-save bug; sort by lastModified and take the
      // last so recovery restores the most recent autosave, not the oldest
      // near-empty snapshot. Post-fix there is only ever one row.
      const drafts = await db.userWork
        .where("[type+tabId]")
        .equals([UserWorkType.SEQUENCE_DRAFT, "create"])
        .sortBy("lastModified");
      const localDraft = drafts[drafts.length - 1];

      if (localDraft?.data) {
        const data = localDraft.data as {
          sessionId: string;
          sequenceData: SequenceData;
          stepCount: number;
          name?: string;
        };

        return {
          sessionId: data.sessionId,
          userId: "",
          sequenceData: data.sequenceData,
          stepCount: data.stepCount,
          name: data.name,
          createdAt: null as unknown as Timestamp,
          updatedAt: null as unknown as Timestamp,
        };
      }
    } catch (err) {
      console.warn("[Autosaver] Dexie draft load failed:", err);
    }

    // --- Firestore fallback ---
    const user = getAuthSync().currentUser;
    if (!user || !sessionId) return null;

    const firestore = await getFirestoreInstance();
    const draftRef = doc(firestore, `users/${user.uid}/drafts/${sessionId}`);
    const snapshot = await getDoc(draftRef);

    if (!snapshot.exists()) return null;

    return snapshot.data() as DraftSequence;
  }

  /**
   * Resolve the session identity before autosave starts. A normal Create reload
   * resumes the local draft's identity; an explicit deep link or pending edit
   * starts a distinct session so unrelated work is never folded together.
   */
  async resolveSessionForStart(
    allowRecovery: boolean,
    createId: () => string = () => crypto.randomUUID()
  ): Promise<{ sessionId: string; recovered: boolean }> {
    if (allowRecovery) {
      const draft = await this.loadDraft();
      if (draft?.sessionId?.trim()) {
        return { sessionId: draft.sessionId, recovered: true };
      }
    }

    return { sessionId: createId(), recovered: false };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(sessionId: string): Promise<void> {
    await this.deleteLocalDraft(sessionId);

    const user = getAuthSync().currentUser;
    if (!user) return;

    const firestore = await getFirestoreInstance();
    const draftRef = doc(firestore, `users/${user.uid}/drafts/${sessionId}`);
    await trackWrite(() => deleteDoc(draftRef));
  }

  /**
   * Delete only the local draft owned by this Create session.
   */
  async deleteLocalDraft(sessionId = this.activeSessionId): Promise<void> {
    if (!sessionId) return;

    this.finalizingDraft = true;
    this.isDirty = false;

    try {
      // A local save can enqueue its cloud write before it resolves. Drain in
      // that order so the later atomic cloud delete cannot be resurrected by
      // an older autosave finishing late.
      await this.saveCompletion;
      await this.cloudSaveQueue;

      const drafts = await db.userWork
        .where("[type+tabId]")
        .equals([UserWorkType.SEQUENCE_DRAFT, "create"])
        .toArray();
      const matchingIds = drafts.flatMap((draft) => {
        const data = draft.data as { sessionId?: string } | undefined;
        return data?.sessionId === sessionId && draft.id !== undefined
          ? [draft.id]
          : [];
      });

      if (matchingIds.length > 0) {
        await db.userWork.bulkDelete(matchingIds);
      }
    } finally {
      this.finalizingDraft = false;
    }
  }

  getSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Get all drafts for current user
   */
  async getAllDrafts(): Promise<DraftSequence[]> {
    const user = getAuthSync().currentUser;
    if (!user) return [];

    const firestore = await getFirestoreInstance();
    const draftsRef = collection(firestore, `users/${user.uid}/drafts`);
    const snapshot = await getDocs(draftsRef);

    return snapshot.docs.map((doc) => doc.data() as DraftSequence);
  }

  /**
   * Start autosave interval
   * @param onSave Callback to get current sequence data
   * @param sessionId Current session ID
   * @param intervalMs Autosave interval in milliseconds (default: 30s)
   */
  startAutosave(
    onSave: () => SequenceData | null,
    sessionId: string,
    intervalMs = 30000,
    onDraftSaved?: (sequenceData: SequenceData) => Promise<void> | void
  ): void {
    this.stopAutosave();
    this.activeSessionId = sessionId;

    this.autosaveInterval = window.setInterval(async () => {
      if (!this.isDirty) return;

      const sequenceData = onSave();
      if (!sequenceData || sequenceData.steps.length === 0) return;

      try {
        const saved = await this.saveDraft(sessionId, sequenceData);
        if (!saved) return;
        void Promise.resolve(onDraftSaved?.(sequenceData)).catch((error) => {
          console.warn("[Autosaver] Session tracking failed:", error);
        });
      } catch (error) {
        console.error("Failed to autosave draft:", error);
      }
    }, intervalMs);
  }

  /**
   * Stop autosave interval
   */
  stopAutosave(): void {
    if (this.autosaveInterval !== null) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  /**
   * Mark that changes have been made (needs autosave)
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Clean up old drafts (older than N days)
   */
  async cleanupOldDrafts(daysOld = 7): Promise<number> {
    const user = getAuthSync().currentUser;
    if (!user) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffTimestamp = cutoffDate.getTime();

    const firestore = await getFirestoreInstance();
    const draftsRef = collection(firestore, `users/${user.uid}/drafts`);
    const snapshot = await getDocs(draftsRef);

    let deletedCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const draft = docSnapshot.data() as DraftSequence;
      const updatedAt = draft.updatedAt as Timestamp;

      if (updatedAt.toMillis() < cutoffTimestamp) {
        await deleteDoc(docSnapshot.ref);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}
