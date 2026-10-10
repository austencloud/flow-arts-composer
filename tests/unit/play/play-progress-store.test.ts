import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFirestoreGet = vi.fn();
const mockFirestoreSet = vi.fn();

vi.mock("#lib/shared/firestore/firestore-crud.js", () => ({
  firestoreGet: (...args: unknown[]) => mockFirestoreGet(...args),
  firestoreSet: (...args: unknown[]) => mockFirestoreSet(...args),
}));

import { createPlayProgressStore } from "#lib/features/learn/play/services/play-progress-store.js";
import type { ArcadeSessionResult } from "#lib/features/learn/play/domain/arcade-types.js";

function baseResult(
  overrides: Partial<Omit<ArcadeSessionResult, "isNewBest">> = {}
): Omit<ArcadeSessionResult, "isNewBest"> {
  return {
    gameId: "speed-blitz",
    challengeNumber: 1,
    score: 900,
    correctCount: 8,
    totalCount: 10,
    accuracyPercentage: 80,
    longestStreak: 5,
    bestCombo: 5,
    grade: "A",
    starsEarned: 1,
    durationSeconds: 42,
    completedAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

describe("createPlayProgressStore", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFirestoreGet.mockReset();
    mockFirestoreSet.mockReset().mockResolvedValue("current");
  });

  it("first play creates fresh progress for that game", () => {
    const store = createPlayProgressStore();
    expect(store.getGameProgress("speed-blitz")).toEqual({
      bestScore: 0,
      bestGrade: null,
      starsByChallenge: {},
      challengesUnlocked: 1,
      totalPlays: 0,
    });

    const { progress, isNewBest } = store.recordResult(baseResult());
    expect(isNewBest).toBe(true);
    expect(progress.bestScore).toBe(900);
    expect(progress.totalPlays).toBe(1);
    expect(store.getGameProgress("speed-blitz")).toEqual(progress);
  });

  it("persists to localStorage immediately", () => {
    const store = createPlayProgressStore();
    store.recordResult(baseResult());

    const raw = localStorage.getItem("tka_play_progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.games["speed-blitz"].bestScore).toBe(900);
    expect(parsed.games["speed-blitz"]).toHaveProperty("starsByChallenge");
    expect(parsed.games["speed-blitz"]).toHaveProperty("challengesUnlocked");
    expect(parsed.games["speed-blitz"]).not.toHaveProperty("starsByLevel");
    expect(parsed.games["speed-blitz"]).not.toHaveProperty("levelsUnlocked");
  });

  it("migrates legacy game-level progress from localStorage", () => {
    localStorage.setItem(
      "tka_play_progress",
      JSON.stringify({
        games: {
          "speed-blitz": {
            bestScore: 1500,
            bestGrade: "A",
            starsByLevel: { "1": 3, "2": 1 },
            levelsUnlocked: 3,
            totalPlays: 8,
          },
        },
        lastUpdated: "2026-08-01T12:00:00.000Z",
      })
    );

    const progress = createPlayProgressStore().getGameProgress("speed-blitz");

    expect(progress.starsByChallenge).toEqual({ "1": 3, "2": 1 });
    expect(progress.challengesUnlocked).toBe(3);
  });

  it("keeps best score/stars on a worse repeat result; isNewBest false", () => {
    const store = createPlayProgressStore();
    store.recordResult(baseResult({ score: 900, starsEarned: 2 }));
    const { progress, isNewBest } = store.recordResult(
      baseResult({ score: 400, starsEarned: 1 })
    );

    expect(isNewBest).toBe(false);
    expect(progress.bestScore).toBe(900);
    expect(progress.starsByChallenge["1"]).toBe(2);
    expect(progress.totalPlays).toBe(2);
  });

  it("flags isNewBest true when score beats the previous best", () => {
    const store = createPlayProgressStore();
    store.recordResult(baseResult({ score: 500 }));
    const { isNewBest } = store.recordResult(baseResult({ score: 1200 }));
    expect(isNewBest).toBe(true);
  });

  it("does not write to Firestore before initializeForUser (guest play)", () => {
    const store = createPlayProgressStore();
    store.recordResult(baseResult());
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  it("writes to Firestore (fire-and-forget) after initializeForUser", async () => {
    const store = createPlayProgressStore();
    mockFirestoreGet.mockResolvedValue(null);
    await store.initializeForUser("user-1");
    mockFirestoreSet.mockClear();

    store.recordResult(baseResult({ score: 1500 }));
    expect(mockFirestoreSet).toHaveBeenCalledWith(
      "users/user-1/playProgress",
      "current",
      expect.objectContaining({
        games: expect.any(Object),
        lastUpdated: expect.any(String),
      }),
      { merge: true }
    );
  });

  describe("initializeForUser merge (mergeProgress convention: newer lastUpdated wins)", () => {
    it("adopts remote progress when remote lastUpdated is newer than local", async () => {
      const store = createPlayProgressStore();
      store.recordResult(baseResult({ score: 100 })); // sets local lastUpdated = now

      mockFirestoreGet.mockResolvedValue({
        id: "current",
        games: {
          "speed-blitz": {
            bestScore: 9999,
            bestGrade: "S",
            starsByChallenge: { "1": 3 },
            challengesUnlocked: 4,
            totalPlays: 20,
          },
        },
        lastUpdated: "2099-01-01T00:00:00.000Z",
      });

      await store.initializeForUser("user-1");

      expect(store.getGameProgress("speed-blitz").bestScore).toBe(9999);
      expect(store.getGameProgress("speed-blitz").totalPlays).toBe(20);
    });

    it("migrates legacy game-level progress from Firestore", async () => {
      const store = createPlayProgressStore();
      mockFirestoreGet.mockResolvedValue({
        id: "current",
        games: {
          "speed-blitz": {
            bestScore: 2400,
            bestGrade: "S",
            starsByLevel: { "1": 3, "2": 2 },
            levelsUnlocked: 3,
            totalPlays: 12,
          },
        },
        lastUpdated: "2099-01-01T00:00:00.000Z",
      });

      await store.initializeForUser("user-1");

      expect(store.getGameProgress("speed-blitz")).toMatchObject({
        starsByChallenge: { "1": 3, "2": 2 },
        challengesUnlocked: 3,
      });
    });

    it("keeps local and pushes to Firestore when local lastUpdated is newer than remote", async () => {
      const store = createPlayProgressStore();
      store.recordResult(baseResult({ score: 100 })); // local lastUpdated = now (recent)

      mockFirestoreGet.mockResolvedValue({
        id: "current",
        games: {
          "speed-blitz": {
            bestScore: 1,
            bestGrade: "D",
            starsByChallenge: {},
            challengesUnlocked: 1,
            totalPlays: 1,
          },
        },
        lastUpdated: "2000-01-01T00:00:00.000Z",
      });

      await store.initializeForUser("user-1");

      expect(store.getGameProgress("speed-blitz").bestScore).toBe(100);
      expect(mockFirestoreSet).toHaveBeenCalledWith(
        "users/user-1/playProgress",
        "current",
        expect.objectContaining({ games: expect.any(Object) }),
        { merge: true }
      );
    });

    it("pushes local to Firestore when no remote doc exists and local has data", async () => {
      const store = createPlayProgressStore();
      store.recordResult(baseResult());
      mockFirestoreGet.mockResolvedValue(null);

      await store.initializeForUser("user-1");

      expect(mockFirestoreSet).toHaveBeenCalledWith(
        "users/user-1/playProgress",
        "current",
        expect.objectContaining({ games: expect.any(Object) }),
        { merge: true }
      );
    });

    it("does not write to Firestore when no remote doc exists and local is empty", async () => {
      const store = createPlayProgressStore();
      mockFirestoreGet.mockResolvedValue(null);

      await store.initializeForUser("user-1");

      expect(mockFirestoreSet).not.toHaveBeenCalled();
    });
  });

  it("reset clears in-memory and localStorage state", () => {
    const store = createPlayProgressStore();
    store.recordResult(baseResult());
    store.reset();

    expect(localStorage.getItem("tka_play_progress")).toBeNull();
    expect(store.getGameProgress("speed-blitz").bestScore).toBe(0);
  });
});
