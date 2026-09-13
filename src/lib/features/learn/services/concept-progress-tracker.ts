/**
 * ConceptProgressTracker
 *
 * Manages user progress through the TKA learning path.
 * Handles concept unlocking, progress tracking, and persistence.
 *
 * Dual-write strategy:
 * - localStorage: Instant reads/writes for responsive UI
 * - Firestore (via UserKnowledgeProfilePersister): Durable, cross-device sync
 *
 * On initialization:
 * - Loads from localStorage first (instant)
 * - If a persister is provided, loads from Firestore and merges
 *   (Firestore wins on conflict if its lastUpdated is newer)
 * - Subscribes to Firestore changes for cross-device sync
 * - Remote writes stay disabled until that first merge succeeds, so a failed
 *   or offline sign-in can never push un-merged local state over the server's
 *
 * Every hydrated snapshot (localStorage, first load, live snapshot, import)
 * passes through reconcileCompletion, which keeps `completedConcepts` and the
 * per-concept `status` records from contradicting each other.
 */

import { TKA_CONCEPTS, isConceptUnlocked } from "../domain/concepts";
import type {
  ConceptProgress,
  ConceptStatus,
  LearningProgress,
} from "../domain/types";
import type { UserKnowledgeProfilePersister } from "./user-knowledge-profile-persister";

const STORAGE_KEY = "tka_learning_progress";

export class ConceptProgressTracker {
  private progress: LearningProgress;
  private subscribers: Set<(progress: LearningProgress) => void> = new Set();
  private persister: UserKnowledgeProfilePersister | null;
  private userId: string | null = null;
  private firestoreUnsubscribe: (() => void) | null = null;
  private initialized = false;
  private initializingUserId: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(persister?: UserKnowledgeProfilePersister) {
    this.persister = persister ?? null;
    this.progress = this.loadFromLocalStorage();
  }

  /**
   * Initialize Firestore sync for an authenticated user.
   * Call this when the user signs in.
   * Loads from Firestore, merges with localStorage, and subscribes to changes.
   *
   * Never rejects: the one caller (TikaModule's auth effect) fires it without
   * awaiting, so a rejection here would only surface as an unhandled promise.
   * A failed sync is logged and leaves the tracker retryable instead.
   * Concurrent calls for the same user share the in-flight attempt.
   */
  async initializeForUser(userId: string): Promise<void> {
    if (this.initialized && this.userId === userId) return;
    if (this.initPromise && this.initializingUserId === userId) {
      return this.initPromise;
    }

    this.initializingUserId = userId;
    this.initPromise = this.connectUser(userId).finally(() => {
      if (this.initializingUserId === userId) {
        this.initializingUserId = null;
        this.initPromise = null;
      }
    });

    return this.initPromise;
  }

  private async connectUser(userId: string): Promise<void> {
    if (!this.persister) {
      this.userId = userId;
      this.initialized = true;
      return;
    }

    // `this.userId` stays null until the merge below settles. It is what
    // saveProgress() checks before writing, and a remote write issued before
    // the first load has landed writes an un-merged local state over the
    // server's: `completedConcepts` is an array, so a merge write replaces it
    // wholesale, and a fresh install that failed to load would erase every
    // completion earned on another device. Local writes keep working
    // throughout; they are pushed by the next successful attempt.
    try {
      const firestoreProgress = await this.persister.loadProgress(userId);

      if (firestoreProgress) {
        // Merge: Firestore wins if newer
        const localTimestamp = this.progress.lastUpdated.getTime();
        const firestoreTimestamp = firestoreProgress.lastUpdated.getTime();

        if (firestoreTimestamp >= localTimestamp) {
          this.progress = this.reconcileCompletion(firestoreProgress);
          this.saveToLocalStorage();
          this.notifySubscribers();
        } else {
          // Local is newer (offline edits), push to Firestore
          await this.persister.saveProgress(userId, this.progress);
        }
      } else {
        // No Firestore data exists - upload current localStorage data
        if (this.progress.completedConcepts.size > 0 || this.progress.concepts.size > 0) {
          await this.persister.saveProgress(userId, this.progress);
        }
      }
    } catch (error) {
      // Offline sign-in, a permission hiccup, a rejected write: none of them
      // may latch the tracker. Leaving `initialized` set here would block every
      // later attempt for the rest of the session, so cross-device sync would
      // stay dead until a reload.
      console.error(
        "[ConceptProgressTracker] Initial Firestore sync failed; staying local-only and leaving sync retryable:",
        error
      );
      this.userId = null;
      this.initialized = false;
      this.cleanupFirestoreSubscription();
      return;
    }

    this.userId = userId;
    this.initialized = true;

    // Subscribe to real-time changes for cross-device sync.
    // subscribeToProgress sets up its document reference asynchronously, so any
    // failure during setup (or a later snapshot error) only surfaces through the
    // onError callback — without it, cross-device sync silently stops working.
    this.cleanupFirestoreSubscription();
    this.firestoreUnsubscribe = this.persister.subscribeToProgress(
      userId,
      (remoteProgress) => {
        // Only apply remote changes if they're newer than local
        if (
          remoteProgress.lastUpdated.getTime() >
          this.progress.lastUpdated.getTime()
        ) {
          this.progress = this.reconcileCompletion(remoteProgress);
          this.saveToLocalStorage();
          this.notifySubscribers();
        }
      },
      (error) => {
        console.error(
          "[ConceptProgressTracker] Firestore progress subscription failed; cross-device sync is disabled until the next sign-in:",
          error
        );
      }
    );
  }

  /**
   * Clean up Firestore subscription. Call on sign-out.
   */
  disconnect(): void {
    this.cleanupFirestoreSubscription();
    this.userId = null;
    this.initialized = false;
    this.initializingUserId = null;
    this.initPromise = null;
  }

  private cleanupFirestoreSubscription(): void {
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }
  }

  private parseOptionalDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
    return undefined;
  }

  /**
   * Reconcile the two records of "completed" that a hydrated progress object
   * carries.
   *
   * `completedConcepts` is the authority everything downstream reads: it gates
   * unlocking, feeds `overallProgress` and the badge thresholds, and is the
   * completed list TIKA and the recommender consume. `concepts.get(id).status`
   * is what the path and detail views render. Nothing inside this class can
   * make the two disagree, but hydrated state can: a server-side write can add
   * an id to `completedConcepts` without leaving a per-concept record, and a
   * merged remote write can replace `completedConcepts` while stale concept
   * records survive. Either way the user sees a finished lesson offered as
   * unstarted (`getConceptStatus` falls through to "available"), or a lesson
   * that renders completed but is missing from every count.
   *
   * Completion is never revoked here — the union of both records wins, which
   * is the definition of completed this class already enforces on write.
   */
  private reconcileCompletion(progress: LearningProgress): LearningProgress {
    let completedSetChanged = false;

    for (const [conceptId, concept] of progress.concepts) {
      if (
        concept.status === "completed" &&
        !progress.completedConcepts.has(conceptId)
      ) {
        progress.completedConcepts.add(conceptId);
        completedSetChanged = true;
      }
    }

    for (const conceptId of progress.completedConcepts) {
      const existing = progress.concepts.get(conceptId);
      if (!existing) {
        progress.concepts.set(
          conceptId,
          this.createConceptRecord(conceptId, "completed")
        );
        continue;
      }
      if (existing.status !== "completed") {
        existing.status = "completed";
        existing.percentComplete = 100;
      }
    }

    // Only a set that grew invalidates the stored percentage; leave a
    // consistent record's own number alone.
    if (completedSetChanged) {
      this.updateOverallProgress(progress);
    }

    return progress;
  }

  private createConceptRecord(
    conceptId: string,
    status: ConceptStatus
  ): ConceptProgress {
    return {
      conceptId,
      status,
      percentComplete: status === "completed" ? 100 : 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      totalAttempts: 0,
      accuracy: 0,
      currentStreak: 0,
      bestStreak: 0,
      timeSpentSeconds: 0,
    };
  }

  private loadFromLocalStorage(): LearningProgress {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const concepts = new Map<string, ConceptProgress>();
        for (const [key, raw] of Object.entries(data.concepts || {})) {
          const value = raw as Record<string, unknown>;
          concepts.set(key, {
            conceptId: (value.conceptId as string) || key,
            status: (value.status as ConceptProgress["status"]) || "available",
            percentComplete: (value.percentComplete as number) || 0,
            correctAnswers: (value.correctAnswers as number) || 0,
            incorrectAnswers: (value.incorrectAnswers as number) || 0,
            totalAttempts: (value.totalAttempts as number) || 0,
            accuracy: (value.accuracy as number) || 0,
            currentStreak: (value.currentStreak as number) || 0,
            bestStreak: (value.bestStreak as number) || 0,
            timeSpentSeconds: (value.timeSpentSeconds as number) || 0,
            startedAt: this.parseOptionalDate(value.startedAt),
            completedAt: this.parseOptionalDate(value.completedAt),
            lastPracticedAt: this.parseOptionalDate(value.lastPracticedAt),
            nextPracticeAt: this.parseOptionalDate(value.nextPracticeAt),
          });
        }
        return this.reconcileCompletion({
          ...data,
          concepts,
          completedConcepts: new Set(data.completedConcepts || []),
          lastUpdated: new Date(data.lastUpdated),
        });
      }
    } catch (error) {
      console.warn("Failed to load learning progress:", error);
    }

    return this.createEmptyProgress();
  }

  private createEmptyProgress(): LearningProgress {
    return {
      concepts: new Map(),
      completedConcepts: new Set(),
      overallProgress: 0,
      totalCorrect: 0,
      totalTimeSpent: 0,
      badges: [],
      lastUpdated: new Date(),
    };
  }

  private saveToLocalStorage(): void {
    try {
      const data = {
        ...this.progress,
        concepts: Object.fromEntries(this.progress.concepts),
        completedConcepts: Array.from(this.progress.completedConcepts),
        lastUpdated: this.progress.lastUpdated.toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save learning progress to localStorage:", error);
    }
  }

  private saveProgress(): void {
    // Instant local write
    this.saveToLocalStorage();
    this.notifySubscribers();

    // Async Firestore write (fire-and-forget)
    if (this.persister && this.userId) {
      this.persister
        .saveProgress(this.userId, this.progress)
        .catch((error) => {
          console.error("Failed to save progress to Firestore:", error);
        });
    }
  }

  subscribe(callback: (progress: LearningProgress) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((callback) => callback(this.progress));
  }

  getProgress(): LearningProgress {
    return { ...this.progress };
  }

  getConceptStatus(conceptId: string): ConceptStatus {
    const progress = this.progress.concepts.get(conceptId);
    if (progress) return progress.status;

    if (isConceptUnlocked(conceptId, this.progress.completedConcepts)) {
      return "available";
    }

    return "locked";
  }

  getConceptProgress(conceptId: string): ConceptProgress {
    const existing = this.progress.concepts.get(conceptId);
    if (existing) return existing;

    return this.createConceptRecord(conceptId, this.getConceptStatus(conceptId));
  }

  startConcept(conceptId: string): void {
    const status = this.getConceptStatus(conceptId);
    if (status === "locked") {
      throw new Error(`Concept ${conceptId} is locked`);
    }

    const progress = this.getConceptProgress(conceptId);

    if (progress.status === "available") {
      progress.status = "in-progress";
      progress.startedAt = new Date();
    }

    this.progress.concepts.set(conceptId, progress);
    this.progress.currentConceptId = conceptId;
    this.progress.lastUpdated = new Date();

    this.saveProgress();
  }

  recordPracticeAttempt(
    conceptId: string,
    correct: boolean,
    timeSpentSeconds: number = 0
  ): void {
    const progress = this.getConceptProgress(conceptId);

    progress.totalAttempts++;
    progress.timeSpentSeconds += timeSpentSeconds;

    if (correct) {
      progress.correctAnswers++;
      progress.currentStreak++;
      progress.bestStreak = Math.max(
        progress.bestStreak,
        progress.currentStreak
      );
      this.progress.totalCorrect++;
    } else {
      progress.incorrectAnswers++;
      progress.currentStreak = 0;
    }

    progress.accuracy =
      (progress.correctAnswers / progress.totalAttempts) * 100;

    // Monotonic: correctAnswers only ever grows, so this never lowered the
    // percentage for a concept whose stats were tracked from the start. A
    // record reconciled from a bare `completedConcepts` entry has no answer
    // counts behind its 100, though, and practising it again must not walk a
    // completed lesson back to 10%.
    progress.percentComplete = Math.max(
      progress.percentComplete,
      Math.min((progress.correctAnswers / 10) * 100, 100)
    );

    progress.lastPracticedAt = new Date();
    progress.nextPracticeAt = this.calculateNextPracticeDate(progress);

    if (
      progress.percentComplete >= 100 &&
      progress.accuracy >= 80 &&
      progress.status !== "completed"
    ) {
      this.completeConcept(conceptId);
    } else {
      this.progress.concepts.set(conceptId, progress);
    }

    this.progress.totalTimeSpent += timeSpentSeconds;
    this.progress.lastUpdated = new Date();

    this.saveProgress();
  }

  completeConcept(conceptId: string): void {
    const progress = this.getConceptProgress(conceptId);

    progress.status = "completed";
    progress.completedAt = new Date();
    progress.percentComplete = 100;

    this.progress.concepts.set(conceptId, progress);
    this.progress.completedConcepts.add(conceptId);

    this.updateOverallProgress();
    this.checkBadges();

    this.progress.lastUpdated = new Date();
    this.saveProgress();
  }

  private calculateNextPracticeDate(
    progress: ConceptProgress,
    activeMisconceptionCount: number = 0
  ): Date {
    const intervals = [1, 3, 7, 14, 30];
    const reviewCount = Math.min(
      Math.floor(progress.correctAnswers / 5),
      intervals.length - 1
    );

    let daysToAdd = intervals[reviewCount] ?? 1;

    // Halve the interval when the user has active misconceptions
    // for the concept being reviewed, keeping minimum of 1 day
    if (activeMisconceptionCount > 0) {
      daysToAdd = Math.max(1, Math.floor(daysToAdd * 0.5));
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);

    return nextDate;
  }

  // Takes the record to update so reconciliation can run on progress that has
  // not been adopted as `this.progress` yet (the constructor's first load).
  private updateOverallProgress(
    progress: LearningProgress = this.progress
  ): void {
    const totalConcepts = TKA_CONCEPTS.length;
    const completedCount = progress.completedConcepts.size;
    progress.overallProgress = (completedCount / totalConcepts) * 100;
  }

  private checkBadges(): void {
    const badges = new Set(this.progress.badges);
    const completed = this.progress.completedConcepts.size;

    if (this.isCategoryComplete("foundation")) {
      badges.add("foundation-master");
    }
    if (this.isCategoryComplete("letters")) {
      badges.add("letter-master");
    }
    if (this.isCategoryComplete("combinations")) {
      badges.add("combination-master");
    }
    if (this.isCategoryComplete("advanced")) {
      badges.add("advanced-master");
    }

    if (completed >= 5) badges.add("first-five");
    if (completed >= 10) badges.add("halfway-there");
    if (completed >= 20) badges.add("almost-there");
    if (completed >= 28) badges.add("tka-master");

    // reduce instead of Math.max(...spread): spreading a large concept map into
    // a variadic call risks a call-stack overflow at high N, and Math.max() of
    // an empty spread returns -Infinity. reduce is safe for any size, including
    // an empty map (seeds at 0).
    let maxStreak = 0;
    for (const p of this.progress.concepts.values()) {
      if (p.bestStreak > maxStreak) maxStreak = p.bestStreak;
    }
    if (maxStreak >= 10) badges.add("streak-10");
    if (maxStreak >= 25) badges.add("streak-25");
    if (maxStreak >= 50) badges.add("streak-50");

    this.progress.badges = Array.from(badges);
  }

  private isCategoryComplete(category: string): boolean {
    const categoryConcepts = TKA_CONCEPTS.filter(
      (c) => c.category === category
    );
    return categoryConcepts.every((c) =>
      this.progress.completedConcepts.has(c.id)
    );
  }

  getConceptsDueForReview(): string[] {
    const now = new Date();
    const due: string[] = [];

    this.progress.concepts.forEach((progress, conceptId) => {
      if (
        progress.status === "completed" &&
        progress.nextPracticeAt &&
        new Date(progress.nextPracticeAt) <= now
      ) {
        due.push(conceptId);
      }
    });

    return due;
  }

  resetProgress(): void {
    this.progress = this.createEmptyProgress();
    this.saveProgress();
  }

  exportProgress(): string {
    return JSON.stringify(
      {
        concepts: Object.fromEntries(this.progress.concepts),
        completedConcepts: Array.from(this.progress.completedConcepts),
        currentConceptId: this.progress.currentConceptId,
        overallProgress: this.progress.overallProgress,
        totalCorrect: this.progress.totalCorrect,
        totalTimeSpent: this.progress.totalTimeSpent,
        badges: this.progress.badges,
        lastUpdated: this.progress.lastUpdated.toISOString(),
      },
      null,
      2
    );
  }

  importProgress(json: string): void {
    try {
      const data = JSON.parse(json);
      const concepts = new Map<string, ConceptProgress>();
      for (const [key, raw] of Object.entries(data.concepts || {})) {
        const value = raw as Record<string, unknown>;
        concepts.set(key, {
          conceptId: (value.conceptId as string) || key,
          status: (value.status as ConceptProgress["status"]) || "available",
          percentComplete: (value.percentComplete as number) || 0,
          correctAnswers: (value.correctAnswers as number) || 0,
          incorrectAnswers: (value.incorrectAnswers as number) || 0,
          totalAttempts: (value.totalAttempts as number) || 0,
          accuracy: (value.accuracy as number) || 0,
          currentStreak: (value.currentStreak as number) || 0,
          bestStreak: (value.bestStreak as number) || 0,
          timeSpentSeconds: (value.timeSpentSeconds as number) || 0,
          startedAt: this.parseOptionalDate(value.startedAt),
          completedAt: this.parseOptionalDate(value.completedAt),
          lastPracticedAt: this.parseOptionalDate(value.lastPracticedAt),
          nextPracticeAt: this.parseOptionalDate(value.nextPracticeAt),
        });
      }
      this.progress = this.reconcileCompletion({
        concepts,
        completedConcepts: new Set(data.completedConcepts || []),
        currentConceptId: data.currentConceptId,
        overallProgress: data.overallProgress || 0,
        totalCorrect: data.totalCorrect || 0,
        totalTimeSpent: data.totalTimeSpent || 0,
        badges: data.badges || [],
        lastUpdated: new Date(data.lastUpdated || Date.now()),
      });
      this.saveProgress();
    } catch (error) {
      console.error("Failed to import progress:", error);
      throw new Error("Invalid progress data");
    }
  }
}
