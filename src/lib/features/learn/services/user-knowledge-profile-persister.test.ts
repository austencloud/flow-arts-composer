/**
 * UserKnowledgeProfilePersister subscription cancellation.
 *
 * The seam under test is the asynchronous setup: `getDocRef` awaits the
 * Firestore instance, so there is a window in which the caller holds a cancel
 * function but no onSnapshot listener exists yet. Cancelling in that window has
 * to prevent the listener from ever being registered — otherwise a sign-out or
 * an account switch leaves a live listener delivering one account's document to
 * a callback its owner believes is gone.
 *
 * firebase/firestore and the app's Firebase bootstrap are mocked: this exercises
 * the persister's own cancellation bookkeeping, not Firestore. No emulator, no
 * network, no production data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const onSnapshot = vi.fn();
const getFirestoreInstance = vi.fn();
const setDoc = vi.fn();
const DELETE_FIELD = Symbol("deleteField");

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_firestore: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteField: vi.fn(() => DELETE_FIELD),
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
  serverTimestamp: vi.fn(() => "server-timestamp"),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: () => getFirestoreInstance(),
}));

vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: vi.fn((write: () => Promise<unknown>) => write()),
}));

const { UserKnowledgeProfilePersister } =
  await import("./user-knowledge-profile-persister");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("UserKnowledgeProfilePersister.subscribeToProgress", () => {
  beforeEach(() => {
    onSnapshot.mockReset();
    getFirestoreInstance.mockReset();
  });

  it("never registers a listener when cancelled during async setup", async () => {
    const firestore = deferred<object>();
    getFirestoreInstance.mockReturnValue(firestore.promise);
    const callback = vi.fn();

    const persister = new UserKnowledgeProfilePersister();
    const cancel = persister.subscribeToProgress("user-1", callback);

    // Sign-out lands before the Firestore instance resolves.
    cancel();
    firestore.resolve({});
    await firestore.promise;
    await Promise.resolve();

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("reports no setup error to a caller that already cancelled", async () => {
    const failure = Promise.reject(new Error("firestore unavailable"));
    failure.catch(() => {});
    getFirestoreInstance.mockReturnValue(failure);
    const onError = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const persister = new UserKnowledgeProfilePersister();
    const cancel = persister.subscribeToProgress("user-1", vi.fn(), onError);
    cancel();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("tears down a listener that was already registered", async () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);
    getFirestoreInstance.mockResolvedValue({});

    const persister = new UserKnowledgeProfilePersister();
    const cancel = persister.subscribeToProgress("user-1", vi.fn());
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));

    cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("drops a snapshot delivered after cancellation", async () => {
    onSnapshot.mockReturnValue(vi.fn());
    getFirestoreInstance.mockResolvedValue({});
    const callback = vi.fn();

    const persister = new UserKnowledgeProfilePersister();
    const cancel = persister.subscribeToProgress("user-1", callback);
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));

    const onNext = onSnapshot.mock.calls[0]![1] as (snap: unknown) => void;
    cancel();
    onNext({
      exists: () => true,
      data: () => ({ completedConcepts: ["grid"] }),
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("delivers a snapshot while the subscription is live", async () => {
    onSnapshot.mockReturnValue(vi.fn());
    getFirestoreInstance.mockResolvedValue({});
    const callback = vi.fn();

    const persister = new UserKnowledgeProfilePersister();
    persister.subscribeToProgress("user-1", callback);
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));

    const onNext = onSnapshot.mock.calls[0]![1] as (snap: unknown) => void;
    onNext({
      exists: () => true,
      data: () => ({ completedConcepts: ["grid"] }),
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const progress = callback.mock.calls[0]![0];
    expect(progress.completedConcepts.has("grid")).toBe(true);
  });

  it("cancels the previous subscription when a new one starts, and the old cancel does not kill the new one", async () => {
    const firstUnsubscribe = vi.fn();
    const secondUnsubscribe = vi.fn();
    onSnapshot
      .mockReturnValueOnce(firstUnsubscribe)
      .mockReturnValueOnce(secondUnsubscribe);
    getFirestoreInstance.mockResolvedValue({});

    const persister = new UserKnowledgeProfilePersister();
    const cancelFirst = persister.subscribeToProgress("user-a", vi.fn());
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));

    persister.subscribeToProgress("user-b", vi.fn());
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));

    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
    expect(secondUnsubscribe).not.toHaveBeenCalled();

    // A late cancel from the superseded subscription must not reach user-b's.
    cancelFirst();
    expect(secondUnsubscribe).not.toHaveBeenCalled();
  });
});

describe("UserKnowledgeProfilePersister.saveProgress legacy id cleanup", () => {
  beforeEach(() => {
    setDoc.mockReset();
    getFirestoreInstance.mockResolvedValue({});
  });

  it("marks every legacy concept id in the alias table for deletion under concepts", async () => {
    const { LEGACY_CONCEPT_ID_ALIASES } = await import(
      "./concept-progress-tracker"
    );
    const persister = new UserKnowledgeProfilePersister();

    await persister.saveProgress("user-1", {
      concepts: new Map([
        [
          "hand-placements",
          {
            conceptId: "hand-placements",
            status: "completed",
            percentComplete: 100,
            correctAnswers: 0,
            incorrectAnswers: 0,
            totalAttempts: 0,
            accuracy: 0,
            currentStreak: 0,
            bestStreak: 0,
            timeSpentSeconds: 0,
          },
        ],
      ]),
      completedConcepts: new Set(["hand-placements"]),
      overallProgress: 0,
      totalCorrect: 0,
      totalTimeSpent: 0,
      badges: [],
      lastUpdated: new Date("2026-09-17T00:00:00.000Z"),
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
    const written = setDoc.mock.calls[0]![1] as { concepts: Record<string, unknown> };

    // The legitimate current-id entry survives the write untouched.
    expect(written.concepts["hand-placements"]).toMatchObject({
      status: "completed",
    });

    // Every legacy id from the alias table carries a deleteField() sentinel,
    // so a stale legacy entry left over from an older merge write (which
    // `{ merge: true }` would otherwise never clear) is removed on this save.
    for (const legacyId of Object.keys(LEGACY_CONCEPT_ID_ALIASES)) {
      expect(written.concepts[legacyId]).toBe(DELETE_FIELD);
    }
  });
});
