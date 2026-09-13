/**
 * ConceptProgressTracker persistence/state integrity.
 *
 * These cover the two records of progress that can silently disagree —
 * `completedConcepts` (what unlocking, counts, badges and TIKA read) versus the
 * per-concept `status` records (what the path and detail views render) — and
 * the sign-in merge, where a failed first load used to leave the tracker
 * writing un-merged local state straight over the server's document.
 *
 * The persister is a hand-rolled double rather than a mock of
 * UserKnowledgeProfilePersister's Firestore calls: the tracker only ever sees
 * its three methods, and the real class would drag firebase/firestore into a
 * jsdom run for nothing. The progress logic under test is the real thing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConceptProgressTracker } from "./concept-progress-tracker";
import type { UserKnowledgeProfilePersister } from "./user-knowledge-profile-persister";
import type { ConceptProgress, LearningProgress } from "../domain/types";

const STORAGE_KEY = "tka_learning_progress";

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

interface FakePersister {
  asPersister: UserKnowledgeProfilePersister;
  loadProgress: ReturnType<typeof vi.fn>;
  saveProgress: ReturnType<typeof vi.fn>;
  subscribeToProgress: ReturnType<typeof vi.fn>;
  /** Push a remote snapshot into the last registered subscription. */
  emit(progress: LearningProgress): void;
  unsubscribeCalls: number;
}

function createFakePersister(
  load: () => Promise<LearningProgress | null>
): FakePersister {
  let onRemote: ((progress: LearningProgress) => void) | null = null;
  const fake: Partial<FakePersister> = { unsubscribeCalls: 0 };

  const loadProgress = vi.fn(load);
  const saveProgress = vi.fn(async () => {});
  const subscribeToProgress = vi.fn(
    (_userId: string, callback: (progress: LearningProgress) => void) => {
      onRemote = callback;
      return () => {
        fake.unsubscribeCalls = (fake.unsubscribeCalls ?? 0) + 1;
      };
    }
  );

  Object.assign(fake, {
    loadProgress,
    saveProgress,
    subscribeToProgress,
    asPersister: {
      loadProgress,
      saveProgress,
      subscribeToProgress,
    } as unknown as UserKnowledgeProfilePersister,
    emit(progress: LearningProgress) {
      if (!onRemote) throw new Error("no subscription registered");
      onRemote(progress);
    },
  });

  return fake as FakePersister;
}

describe("ConceptProgressTracker completion reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports a concept completed when only completedConcepts carries it", () => {
    // Shape written by the server-side TIKA verifier: the completed list is
    // updated but no per-concept record lands alongside it.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        concepts: {},
        completedConcepts: ["grid", "hand-positions"],
        overallProgress: 0,
        totalCorrect: 0,
        totalTimeSpent: 0,
        badges: [],
        lastUpdated: new Date("2026-09-01T00:00:00.000Z").toISOString(),
      })
    );

    const tracker = new ConceptProgressTracker();

    expect(tracker.getConceptStatus("grid")).toBe("completed");
    expect(tracker.getConceptStatus("hand-positions")).toBe("completed");
    expect(tracker.getConceptProgress("grid").status).toBe("completed");
    expect(tracker.getConceptProgress("grid").percentComplete).toBe(100);
    // Untouched concepts are unaffected.
    expect(tracker.getConceptStatus("gamma-motion")).toBe("available");
  });

  it("adds a concept whose record says completed back into completedConcepts", () => {
    // Shape left behind when a merge write replaces the completedConcepts
    // array but the stale concept records survive.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
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
        overallProgress: 0,
        totalCorrect: 10,
        totalTimeSpent: 0,
        badges: [],
        lastUpdated: new Date("2026-09-01T00:00:00.000Z").toISOString(),
      })
    );

    const tracker = new ConceptProgressTracker();
    const progress = tracker.getProgress();

    expect(progress.completedConcepts.has("grid")).toBe(true);
    // The stored 0 is stale once the set grows; overall progress is derived.
    expect(progress.overallProgress).toBeGreaterThan(0);
  });

  it("keeps the stats of a completed record it did not have to synthesize", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
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
        overallProgress: 0,
        totalCorrect: 4,
        totalTimeSpent: 90,
        badges: [],
        lastUpdated: new Date("2026-09-01T00:00:00.000Z").toISOString(),
      })
    );

    const tracker = new ConceptProgressTracker();
    const record = tracker.getConceptProgress("grid");

    expect(record.status).toBe("completed");
    expect(record.percentComplete).toBe(100);
    expect(record.correctAnswers).toBe(4);
    expect(record.bestStreak).toBe(3);
  });

  it("does not walk a reconciled completion back below 100% when practised again", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        concepts: {},
        completedConcepts: ["grid"],
        overallProgress: 0,
        totalCorrect: 0,
        totalTimeSpent: 0,
        badges: [],
        lastUpdated: new Date("2026-09-01T00:00:00.000Z").toISOString(),
      })
    );

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
  });

  it("reconciles a remote snapshot before adopting it", async () => {
    const persister = createFakePersister(async () => null);
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");

    persister.emit(
      remoteProgress({
        completedConcepts: new Set(["grid"]),
        lastUpdated: new Date("2027-01-01T00:00:00.000Z"),
      })
    );

    expect(tracker.getConceptStatus("grid")).toBe("completed");
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
    expect(persister.subscribeToProgress).toHaveBeenCalledTimes(1);
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
    let resolveLoad: ((value: LearningProgress | null) => void) | null = null;
    const persister = createFakePersister(
      () =>
        new Promise<LearningProgress | null>((resolve) => {
          resolveLoad = resolve;
        })
    );
    const tracker = new ConceptProgressTracker(persister.asPersister);

    const first = tracker.initializeForUser("user-1");
    const second = tracker.initializeForUser("user-1");

    resolveLoad!(null);
    await Promise.all([first, second]);

    expect(persister.loadProgress).toHaveBeenCalledTimes(1);
    expect(persister.subscribeToProgress).toHaveBeenCalledTimes(1);
  });

  it("still lets a newer remote document win on a successful sign-in", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        concepts: {},
        completedConcepts: [],
        overallProgress: 0,
        totalCorrect: 0,
        totalTimeSpent: 0,
        badges: [],
        lastUpdated: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      })
    );
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
    expect(persister.subscribeToProgress).toHaveBeenCalledTimes(1);
    expect(tracker.getConceptStatus("grid")).toBe("completed");
  });

  it("keeps writing to Firestore after a successful sign-in", async () => {
    const persister = createFakePersister(async () => null);
    const tracker = new ConceptProgressTracker(persister.asPersister);

    await tracker.initializeForUser("user-1");
    tracker.completeConcept("grid");

    expect(persister.saveProgress).toHaveBeenCalledTimes(1);
  });
});
