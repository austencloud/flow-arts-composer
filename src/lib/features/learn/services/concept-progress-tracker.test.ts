/**
 * ConceptProgressTracker persistence/state integrity.
 *
 * These cover the two records of progress that can silently disagree —
 * `completedConcepts` (what unlocking, counts, badges and TIKA read) versus the
 * per-concept `status` records (what the path and detail views render) — and
 * the sign-in merge, where a failed or superseded first load used to leave the
 * tracker writing un-merged (or the wrong account's) state to the server.
 *
 * The persister is a hand-rolled double rather than a mock of
 * UserKnowledgeProfilePersister's Firestore calls: the tracker only ever sees
 * its three methods, and the real class would drag firebase/firestore into a
 * jsdom run for nothing. The progress logic under test is the real thing, and
 * so are TKA_CONCEPTS and the badge thresholds the assertions compute against.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConceptProgressTracker } from "./concept-progress-tracker";
import type { UserKnowledgeProfilePersister } from "./user-knowledge-profile-persister";
import { TKA_CONCEPTS } from "../domain/concepts";
import type { ConceptProgress, LearningProgress } from "../domain/types";

const STORAGE_KEY = "tka_learning_progress";

/** The overall percentage the tracker derives from a completion count. */
function expectedOverall(completedCount: number): number {
  return (completedCount / TKA_CONCEPTS.length) * 100;
}

function conceptRecord(
  conceptId: string,
  overrides: Partial<ConceptProgress> = {}
): ConceptProgress {
  return {
    conceptId,
    status: "in-progress",
    percentComplete: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    totalAttempts: 0,
    accuracy: 0,
    currentStreak: 0,
    bestStreak: 0,
    timeSpentSeconds: 0,
    ...overrides,
  };
}

function remoteProgress(
  overrides: Partial<LearningProgress> = {}
): LearningProgress {
  return {
    concepts: new Map(),
    completedConcepts: new Set(),
    overallProgress: 0,
    totalCorrect: 0,
    totalTimeSpent: 0,
    badges: [],
    lastUpdated: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function storedProgress(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    concepts: {},
    completedConcepts: [],
    overallProgress: 0,
    totalCorrect: 0,
    totalTimeSpent: 0,
    badges: [],
    lastUpdated: new Date("2026-09-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function writeStoredProgress(overrides: Record<string, unknown> = {}): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProgress(overrides)));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakePersister {
  asPersister: UserKnowledgeProfilePersister;
  loadProgress: ReturnType<typeof vi.fn>;
  saveProgress: ReturnType<typeof vi.fn>;
  subscribeToProgress: ReturnType<typeof vi.fn>;
  /** Ordered log of "subscribe:<uid>" / "unsubscribe:<uid>" / "save:<uid>". */
  events: string[];
  /** The user id of the most recent saveProgress call, if any. */
  lastSaveOwner(): string | undefined;
  /** Push a remote snapshot into the subscription registered for a user. */
  emit(userId: string, progress: LearningProgress): void;
}

function createFakePersister(
  load: (userId: string) => Promise<LearningProgress | null>
): FakePersister {
  const events: string[] = [];
  const listeners = new Map<string, (progress: LearningProgress) => void>();

  const loadProgress = vi.fn((userId: string) => load(userId));
  const saveProgress = vi.fn(async (userId: string) => {
    events.push(`save:${userId}`);
  });
  const subscribeToProgress = vi.fn(
    (userId: string, callback: (progress: LearningProgress) => void) => {
      events.push(`subscribe:${userId}`);
      listeners.set(userId, callback);
      return () => {
        events.push(`unsubscribe:${userId}`);
        listeners.delete(userId);
      };
    }
  );

  return {
    loadProgress,
    saveProgress,
    subscribeToProgress,
    events,
    asPersister: {
      loadProgress,
      saveProgress,
      subscribeToProgress,
    } as unknown as UserKnowledgeProfilePersister,
    lastSaveOwner() {
      const calls = saveProgress.mock.calls;
      return calls.length ? (calls[calls.length - 1]![0] as string) : undefined;
    },
    emit(userId: string, progress: LearningProgress) {
      const listener = listeners.get(userId);
      if (!listener)
        throw new Error(`no subscription registered for ${userId}`);
      listener(progress);
    },
  };
}

describe("ConceptProgressTracker completion reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports a concept completed when only completedConcepts carries it", () => {
    // Shape written by the server-side TIKA verifier: the completed list is
    // updated but no per-concept record lands alongside it.
    writeStoredProgress({ completedConcepts: ["grid", "hand-placements"] });

    const tracker = new ConceptProgressTracker();

    expect(tracker.getConceptStatus("grid")).toBe("completed");
    expect(tracker.getConceptStatus("hand-placements")).toBe("completed");
    expect(tracker.getConceptProgress("grid").status).toBe("completed");
    expect(tracker.getConceptProgress("grid").percentComplete).toBe(100);
    // Untouched concepts are unaffected.
    expect(tracker.getConceptStatus("gamma-motion")).toBe("available");
  });

  it("adds a concept whose record says completed back into completedConcepts", () => {
    // Shape left behind when a merge write replaces the completedConcepts
    // array but the stale concept records survive.
    writeStoredProgress({
      concepts: {
        grid: conceptRecord("grid", {
          status: "completed",
          percentComplete: 100,
          correctAnswers: 10,
          totalAttempts: 10,
          accuracy: 100,
        }),
      },
      completedConcepts: [],
      totalCorrect: 10,
    });

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect([...progress.completedConcepts]).toEqual(["grid"]);
    expect(progress.overallProgress).toBe(expectedOverall(1));
  });

  it("derives overallProgress from the reconciled set, not the stored number", () => {
    // The set already contained the completion, so nothing is *added* here —
    // the stored 0 is still wrong and must not survive.
    writeStoredProgress({
      completedConcepts: ["grid"],
      overallProgress: 0,
    });

    expect(new ConceptProgressTracker().getProgress().overallProgress).toBe(
      expectedOverall(1)
    );
  });

  it("raises a completed record that stored less than 100 percent", () => {
    writeStoredProgress({
      concepts: {
        grid: conceptRecord("grid", {
          status: "completed",
          percentComplete: 40,
          correctAnswers: 4,
        }),
      },
      completedConcepts: ["grid"],
    });

    const record = new ConceptProgressTracker().getConceptProgress("grid");
    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    // Its own answer counts are still its own.
    expect(record.correctAnswers).toBe(4);
  });

  it("awards the badges the reconciled completion count has earned", () => {
    const completed = TKA_CONCEPTS.slice(0, 5).map((concept) => concept.id);
    writeStoredProgress({ completedConcepts: completed, badges: [] });

    const badges = new ConceptProgressTracker().getProgress().badges;

    expect(badges).toContain("first-five");
    expect(badges).not.toContain("halfway-there");
  });

  it("never drops a badge the stored progress already carried", () => {
    writeStoredProgress({ completedConcepts: [], badges: ["streak-10"] });

    expect(new ConceptProgressTracker().getProgress().badges).toEqual([
      "streak-10",
    ]);
  });

  it("keeps the stats of a completed record it did not have to synthesize", () => {
    writeStoredProgress({
      concepts: {
        grid: conceptRecord("grid", {
          status: "in-progress",
          percentComplete: 40,
          correctAnswers: 4,
          totalAttempts: 5,
          accuracy: 80,
          bestStreak: 3,
        }),
      },
      completedConcepts: ["grid"],
      totalCorrect: 4,
      totalTimeSpent: 90,
    });

    const tracker = new ConceptProgressTracker();
    const record = tracker.getConceptProgress("grid");

    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    expect(record.correctAnswers).toBe(4);
    expect(record.bestStreak).toBe(3);
  });

  it("does not walk a reconciled completion back below 100% when practised again", () => {
    writeStoredProgress({ completedConcepts: ["grid"] });

    const tracker = new ConceptProgressTracker();
    tracker.recordPracticeAttempt("grid", true, 5);

    const record = tracker.getConceptProgress("grid");
    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    expect(record.correctAnswers).toBe(1);
  });

  it("still tracks a normal concept's percentage from its answer count", () => {
    const tracker = new ConceptProgressTracker();
    tracker.startConcept("grid");

    tracker.recordPracticeAttempt("grid", true, 1);
    expect(tracker.getConceptProgress("grid").percentComplete).toBe(10);

    tracker.recordPracticeAttempt("grid", false, 1);
    expect(tracker.getConceptProgress("grid").percentComplete).toBe(10);
    expect(tracker.getConceptStatus("grid")).toBe("in-progress");
    expect(tracker.getProgress().overallProgress).toBe(expectedOverall(0));
  });

  it("reconciles a remote snapshot before adopting it", async () => {
    const persister = createFakePersister(async () => null);
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");

    persister.emit(
      "user-1",
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );

    expect(tracker.getConceptStatus("grid")).toBe("completed");
    expect(tracker.getProgress().overallProgress).toBe(expectedOverall(1));
  });

  it("reconciles the document adopted by the first load", async () => {
    const persister = createFakePersister(async () =>
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");

    expect(tracker.getConceptStatus("grid")).toBe("completed");
    expect(tracker.getProgress().overallProgress).toBe(expectedOverall(1));
  });
});

describe("ConceptProgressTracker legacy concept id alias", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("hydrates a stored hand-positions completion as hand-placements", () => {
    // Shape left behind by data written before "hand-positions" was renamed
    // to "hand-placements" with no migration.
    writeStoredProgress({ completedConcepts: ["grid", "hand-positions"] });

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect(progress.completedConcepts.has("hand-placements")).toBe(true);
    expect(progress.completedConcepts.has("hand-positions")).toBe(false);
    expect(tracker.getConceptStatus("hand-placements")).toBe("completed");
  });

  it("merges a legacy hand-positions record onto hand-placements without un-completing it", () => {
    writeStoredProgress({
      concepts: {
        "hand-positions": conceptRecord("hand-positions", {
          status: "completed",
          percentComplete: 100,
          correctAnswers: 9,
          bestStreak: 6,
        }),
        "hand-placements": conceptRecord("hand-placements", {
          status: "in-progress",
          percentComplete: 40,
          correctAnswers: 4,
          bestStreak: 2,
        }),
      },
      completedConcepts: ["hand-positions"],
    });

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect([...progress.concepts.keys()]).not.toContain("hand-positions");
    expect(progress.completedConcepts.has("hand-positions")).toBe(false);

    const record = tracker.getConceptProgress("hand-placements");
    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    // Neither side's earned stats are thrown away by the merge.
    expect(record.correctAnswers).toBe(9);
    expect(record.bestStreak).toBe(6);
  });

  it("only ever writes the current id back to storage", () => {
    writeStoredProgress({ completedConcepts: ["hand-positions"] });

    const tracker = new ConceptProgressTracker();
    // Any write path (here, an unrelated completion) re-saves the whole
    // progress object; the legacy id must not survive that round trip.
    tracker.completeConcept("grid");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.completedConcepts).toContain("hand-placements");
    expect(stored.completedConcepts).not.toContain("hand-positions");
    expect(Object.keys(stored.concepts)).not.toContain("hand-positions");
  });

  it("hydrates a stored staff-positions completion as staff-placements", () => {
    // Same gap as hand-positions/hand-placements above, for the second id
    // the audit found still unaliased: "staff-positions" -> "staff-placements".
    writeStoredProgress({ completedConcepts: ["grid", "staff-positions"] });

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect(progress.completedConcepts.has("staff-placements")).toBe(true);
    expect(progress.completedConcepts.has("staff-positions")).toBe(false);
    expect(tracker.getConceptStatus("staff-placements")).toBe("completed");
  });

  it("merges a legacy staff-positions record onto staff-placements without un-completing it", () => {
    writeStoredProgress({
      concepts: {
        "staff-positions": conceptRecord("staff-positions", {
          status: "completed",
          percentComplete: 100,
          correctAnswers: 9,
          bestStreak: 6,
        }),
        "staff-placements": conceptRecord("staff-placements", {
          status: "in-progress",
          percentComplete: 40,
          correctAnswers: 4,
          bestStreak: 2,
        }),
      },
      completedConcepts: ["staff-positions"],
    });

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect([...progress.concepts.keys()]).not.toContain("staff-positions");
    expect(progress.completedConcepts.has("staff-positions")).toBe(false);

    const record = tracker.getConceptProgress("staff-placements");
    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    expect(record.correctAnswers).toBe(9);
    expect(record.bestStreak).toBe(6);
  });

  it("keeps timeSpentSeconds idempotent across repeated re-merges of the same legacy+current pair", () => {
    // The persister's `{ merge: true }` write never removes the legacy id
    // from a saved Firestore document (deleteField only lands on the next
    // save), so aliasLegacyConceptIds can run again on the same pair across
    // more than one hydration. A running sum would double the practice time
    // on every re-merge; the max-based merge must land on the same total
    // no matter how many times it runs over unchanged input.
    const stored = () => ({
      concepts: {
        "hand-positions": conceptRecord("hand-positions", {
          status: "completed",
          timeSpentSeconds: 120,
        }),
        "hand-placements": conceptRecord("hand-placements", {
          status: "in-progress",
          timeSpentSeconds: 45,
        }),
      },
      completedConcepts: ["hand-positions"],
    });

    writeStoredProgress(stored());
    const first = new ConceptProgressTracker();
    const firstRecord = first.getConceptProgress("hand-placements");
    expect(firstRecord.timeSpentSeconds).toBe(120);

    // A second hydration of the exact same legacy+current shape (as if the
    // legacy id had survived another merge write) must land on the same
    // number, not 120 + 120.
    writeStoredProgress(stored());
    const second = new ConceptProgressTracker();
    const secondRecord = second.getConceptProgress("hand-placements");
    expect(secondRecord.timeSpentSeconds).toBe(120);
  });
});

describe("ConceptProgressTracker sign-in merge", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not write to Firestore when the first load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const persister = createFakePersister(async () => {
      throw new Error("offline");
    });
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await expect(tracker.initializeForUser("user-1")).resolves.toBeUndefined();

    // A completion earned after the failed sign-in must stay local: the
    // remote document still holds completions this session never saw, and a
    // merge write would replace its completedConcepts array with this one.
    tracker.completeConcept("grid");

    expect(persister.saveProgress).not.toHaveBeenCalled();
    expect(persister.subscribeToProgress).not.toHaveBeenCalled();
    expect(tracker.getConceptStatus("grid")).toBe("completed");
  });

  it("retries after a failed first load instead of latching", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempt = 0;
    const persister = createFakePersister(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      });
    });
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");
    await tracker.initializeForUser("user-1");

    expect(persister.loadProgress).toHaveBeenCalledTimes(2);
    expect(persister.events).toEqual(["subscribe:user-1"]);
    expect(tracker.getConceptStatus("grid")).toBe("completed");
  });

  it("pushes local progress once a later attempt succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempt = 0;
    const persister = createFakePersister(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return null;
    });
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");
    tracker.completeConcept("grid");
    expect(persister.saveProgress).not.toHaveBeenCalled();

    await tracker.initializeForUser("user-1");

    expect(persister.saveProgress).toHaveBeenCalledTimes(1);
    const [, pushed] = persister.saveProgress.mock.calls[0] as [
      string,
      LearningProgress,
    ];
    expect(pushed.completedConcepts.has("grid")).toBe(true);
  });

  it("shares one load between concurrent calls for the same user", async () => {
    const load = deferred<LearningProgress | null>();
    const persister = createFakePersister(() => load.promise);
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const first = tracker.initializeForUser("user-1");
    const second = tracker.initializeForUser("user-1");

    load.resolve(null);
    await Promise.all([first, second]);

    expect(persister.loadProgress).toHaveBeenCalledTimes(1);
    expect(persister.events).toEqual(["subscribe:user-1"]);
  });

  it("still lets a newer remote document win on a successful sign-in", async () => {
    writeStoredProgress({
      lastUpdated: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });
    const persister = createFakePersister(async () =>
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        totalCorrect: 12,
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");

    expect(persister.saveProgress).not.toHaveBeenCalled();
    expect(tracker.getProgress().totalCorrect).toBe(12);
    // The adopted document is mirrored into localStorage.
    const mirrored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(mirrored.completedConcepts).toContain("grid");
  });

  it("pushes local progress when it is newer than the remote document", async () => {
    const persister = createFakePersister(async () =>
      remoteProgress({ lastUpdated: new Date("2020-01-01T00:00:00.000Z") })
    );
    const tracker = new ConceptProgressTracker(persister.asPersister);
    tracker.completeConcept("grid");

    await tracker.initializeForUser("user-1");

    expect(persister.saveProgress).toHaveBeenCalledTimes(1);
    expect(persister.events).toEqual(["save:user-1", "subscribe:user-1"]);
    expect(tracker.getConceptStatus("grid")).toBe("completed");
  });

  it("keeps writing to Firestore after a successful sign-in", async () => {
    const persister = createFakePersister(async () => null);
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");
    tracker.completeConcept("grid");

    expect(persister.saveProgress).toHaveBeenCalledTimes(1);
    expect(persister.lastSaveOwner()).toBe("user-1");
  });
});

describe("ConceptProgressTracker account switching", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function createTwoUserPersister() {
    const loads = new Map<
      string,
      ReturnType<typeof deferred<LearningProgress | null>>
    >();
    const persister = createFakePersister((userId) => {
      const pending = deferred<LearningProgress | null>();
      loads.set(userId, pending);
      return pending.promise;
    });
    return { persister, loads };
  }

  it("writes nothing to the previous user while the next one's load is in flight", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await a;
    expect(persister.events).toEqual(["subscribe:user-a"]);

    // B signs in; B's load has not resolved yet.
    const b = tracker.initializeForUser("user-b");

    // A Learn action inside that window must not reach anyone's document —
    // least of all the account that just signed out.
    tracker.completeConcept("grid");
    expect(persister.saveProgress.mock.calls.map((call) => call[0])).toEqual(
      []
    );
    // It is still recorded locally.
    expect(tracker.getConceptStatus("grid")).toBe("completed");

    // A's ownership was retired the moment the switch started, before the
    // await, which is what closes the window.
    expect(persister.events).toEqual([
      "subscribe:user-a",
      "unsubscribe:user-a",
    ]);

    loads.get("user-b")!.resolve(null);
    await b;

    // Once B owns the tracker, writes resume as B: first the deferred push of
    // what happened during the window, then the next action. (That the
    // window's progress goes to B at all is the unnamespaced-cache issue in
    // the report's follow-ups — one device's storage is not scoped per
    // account. This test pins only who the writes are addressed to.)
    tracker.completeConcept("hand-placements");
    expect(persister.saveProgress.mock.calls.map((call) => call[0])).toEqual([
      "user-b",
      "user-b",
    ]);
  });

  it("does not write to the previous user when the switch is to a load that fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await a;

    const b = tracker.initializeForUser("user-b");
    loads.get("user-b")!.reject(new Error("offline"));
    await b;

    tracker.completeConcept("grid");

    expect(persister.saveProgress).not.toHaveBeenCalled();
    expect(persister.events).toEqual([
      "subscribe:user-a",
      "unsubscribe:user-a",
    ]);
  });

  it("ignores a load for the previous user that resolves after the next one", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    const b = tracker.initializeForUser("user-b");

    // B answers first and takes ownership; A's slow load lands afterwards.
    loads.get("user-b")!.resolve(null);
    await b;
    loads.get("user-a")!.resolve(
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );
    await a;

    // A never subscribes, and B's subscription is never torn down for it.
    expect(persister.events).toEqual(["subscribe:user-b"]);
    // A's document is not adopted into the signed-in user's view.
    expect(tracker.getConceptStatus("grid")).toBe("available");

    tracker.completeConcept("grid");
    expect(persister.lastSaveOwner()).toBe("user-b");
  });

  it("lets a stale attempt fail without disconnecting the user that took over", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    const b = tracker.initializeForUser("user-b");

    loads.get("user-b")!.resolve(null);
    await b;
    loads.get("user-a")!.reject(new Error("offline"));
    await a;

    expect(persister.events).toEqual(["subscribe:user-b"]);

    tracker.completeConcept("grid");
    expect(persister.lastSaveOwner()).toBe("user-b");
  });

  it("hands over cleanly when the previous user's load resolves first", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await a;

    const b = tracker.initializeForUser("user-b");
    loads.get("user-b")!.resolve(null);
    await b;

    expect(persister.events).toEqual([
      "subscribe:user-a",
      "unsubscribe:user-a",
      "subscribe:user-b",
    ]);
    tracker.completeConcept("grid");
    expect(persister.lastSaveOwner()).toBe("user-b");
  });

  it("does not connect a user whose load resolves after disconnect", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    tracker.disconnect();
    loads.get("user-a")!.resolve(
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );
    await a;

    expect(persister.events).toEqual([]);
    expect(tracker.getConceptStatus("grid")).toBe("available");

    // Signed out: a completion stays on this device only.
    tracker.completeConcept("grid");
    expect(persister.saveProgress).not.toHaveBeenCalled();
  });

  it("drops a snapshot delivered after the user signed out", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const a = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await a;

    const listener = persister.subscribeToProgress.mock.calls[0]![1] as (
      progress: LearningProgress
    ) => void;
    tracker.disconnect();
    listener(
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );

    expect(tracker.getConceptStatus("grid")).toBe("available");
  });

  it("can sign back in after disconnect", async () => {
    const { persister, loads } = createTwoUserPersister();
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const first = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await first;
    tracker.disconnect();

    const second = tracker.initializeForUser("user-a");
    loads.get("user-a")!.resolve(null);
    await second;

    expect(persister.events).toEqual([
      "subscribe:user-a",
      "unsubscribe:user-a",
      "subscribe:user-a",
    ]);
  });
});
