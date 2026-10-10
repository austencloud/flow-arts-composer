/**
 * Play arcade progress store — personal bests, stars, challenge unlocks.
 *
 * Dual-write strategy mirrors ConceptProgressTracker
 * (../../services/concept-progress-tracker.ts):
 * - localStorage: instant reads/writes, works for guests too.
 * - Firestore (users/{uid}/playProgress/current): durable, cross-device sync.
 *   Regular writes are fire-and-forget once signed in; initializeForUser
 *   awaits its own write so the sign-in merge settles deterministically.
 *
 * Unlike ConceptProgressTracker this is a closure factory, not a class — no
 * subscribers/reactivity needed here (callers read via getProgress /
 * getGameProgress after mutating calls). The browser-only singleton getter
 * lives in ../get-play-progress-store.ts.
 */
import { z } from "zod";
import {
  firestoreGet,
  firestoreSet,
} from "#lib/shared/firestore/firestore-crud.js";
import { getUserPlayProgressPath } from "../../data/firestore-paths";
import {
  applyResult,
  emptyGameProgress,
  mergeProgress,
} from "../domain/progression";
import type {
  ArcadeSessionResult,
  GameId,
  GameProgress,
  PlayProgress,
} from "../domain/arcade-types";

const STORAGE_KEY = "tka_play_progress";
const DOC_ID = "current";

const GradeSchema = z.union([
  z.literal("S"),
  z.literal("A"),
  z.literal("B"),
  z.literal("C"),
  z.literal("D"),
]);
const StarsSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const StoredGameProgressSchema = z
  .object({
    bestScore: z.number(),
    bestGrade: GradeSchema.nullable(),
    starsByChallenge: z.record(z.string(), StarsSchema).optional(),
    challengesUnlocked: z.number().optional(),
    // Legacy names written before game progression was separated from the
    // official TKA level system. Read them, but never write them again.
    starsByLevel: z.record(z.string(), StarsSchema).optional(),
    levelsUnlocked: z.number().optional(),
    totalPlays: z.number(),
  })
  .transform((stored): GameProgress => ({
    bestScore: stored.bestScore,
    bestGrade: stored.bestGrade,
    starsByChallenge: stored.starsByChallenge ?? stored.starsByLevel ?? {},
    challengesUnlocked: stored.challengesUnlocked ?? stored.levelsUnlocked ?? 1,
    totalPlays: stored.totalPlays,
  }));

const StoredPlayProgressSchema = z.object({
  games: z.record(z.string(), StoredGameProgressSchema),
  lastUpdated: z.string().optional(),
});

/** Firestore doc shape for users/{uid}/playProgress/current. */
const PlayProgressDocSchema = z.object({
  id: z.string(),
  games: z.record(z.string(), StoredGameProgressSchema),
  lastUpdated: z.string(),
});

export interface PlayProgressStore {
  /** Synchronous read from memory (hydrated from localStorage at first get). */
  getProgress(): PlayProgress;
  getGameProgress(gameId: GameId): GameProgress;
  /** Applies a session result; persists localStorage immediately, Firestore
   *  fire-and-forget when signed in. Returns updated progress + isNewBest. */
  recordResult(result: Omit<ArcadeSessionResult, "isNewBest">): {
    progress: GameProgress;
    isNewBest: boolean;
  };
  /** Wire Firestore sync after sign-in; merges by lastUpdated (mergeProgress). */
  initializeForUser(userId: string): Promise<void>;
  reset(): void; // test hook
}

function emptyPlayProgress(): PlayProgress {
  return { games: {}, lastUpdated: new Date(0).toISOString() };
}

function normalizeGames(games: Record<string, unknown>): PlayProgress["games"] {
  return Object.fromEntries(
    Object.entries(games).map(([gameId, stored]) => [
      gameId,
      StoredGameProgressSchema.parse(stored),
    ])
  ) as PlayProgress["games"];
}

export function createPlayProgressStore(): PlayProgressStore {
  let progress: PlayProgress | null = null;
  let userId: string | null = null;

  function loadFromLocalStorage(): PlayProgress {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return emptyPlayProgress();
      const parsed = StoredPlayProgressSchema.parse(JSON.parse(stored));
      return {
        games: parsed.games as PlayProgress["games"],
        lastUpdated: parsed.lastUpdated ?? new Date(0).toISOString(),
      };
    } catch (error) {
      console.warn(
        "[play-progress-store] Failed to load progress from localStorage:",
        error
      );
      return emptyPlayProgress();
    }
  }

  function ensureLoaded(): PlayProgress {
    if (progress === null) {
      progress = loadFromLocalStorage();
    }
    return progress;
  }

  function saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.error(
        "[play-progress-store] Failed to save progress to localStorage:",
        error
      );
    }
  }

  async function writeToFirestore(): Promise<void> {
    if (!userId || !progress) return;
    await firestoreSet(
      getUserPlayProgressPath(userId),
      DOC_ID,
      { games: progress.games, lastUpdated: progress.lastUpdated } as Record<
        string,
        unknown
      >,
      { merge: true }
    );
  }

  function syncToFirestoreFireAndForget(): void {
    writeToFirestore().catch((error) => {
      console.error(
        "[play-progress-store] Failed to sync progress to Firestore:",
        error
      );
    });
  }

  function getProgress(): PlayProgress {
    return ensureLoaded();
  }

  function getGameProgress(gameId: GameId): GameProgress {
    const current = ensureLoaded();
    return current.games[gameId] ?? emptyGameProgress();
  }

  function recordResult(result: Omit<ArcadeSessionResult, "isNewBest">): {
    progress: GameProgress;
    isNewBest: boolean;
  } {
    const current = ensureLoaded();
    const existing = current.games[result.gameId] ?? emptyGameProgress();
    const isNewBest = result.score > existing.bestScore;

    const updatedGame = applyResult(existing, {
      challengeNumber: result.challengeNumber,
      score: result.score,
      starsEarned: result.starsEarned,
      grade: result.grade,
    });

    progress = {
      games: { ...current.games, [result.gameId]: updatedGame },
      lastUpdated: new Date().toISOString(),
    };
    saveToLocalStorage();
    syncToFirestoreFireAndForget();

    return { progress: updatedGame, isNewBest };
  }

  async function initializeForUser(uid: string): Promise<void> {
    const current = ensureLoaded();
    userId = uid;

    const remoteDoc = await firestoreGet(
      getUserPlayProgressPath(uid),
      DOC_ID,
      PlayProgressDocSchema
    );

    if (!remoteDoc) {
      // No Firestore data yet — upload current localStorage data if there's
      // anything worth syncing.
      if (Object.keys(current.games).length > 0) {
        try {
          await writeToFirestore();
        } catch (error) {
          console.error(
            "[play-progress-store] Failed to seed Firestore progress:",
            error
          );
        }
      }
      return;
    }

    const remoteProgress: PlayProgress = {
      // firestoreGet applies the schema in production. Normalizing once more
      // keeps this boundary honest for alternate adapters and tests that
      // return a raw legacy document.
      games: normalizeGames(remoteDoc.games),
      lastUpdated: remoteDoc.lastUpdated,
    };

    const merged = mergeProgress(current, remoteProgress);
    if (merged === remoteProgress) {
      progress = remoteProgress;
      saveToLocalStorage();
    } else {
      // Local is newer (offline edits) — push it back up.
      try {
        await writeToFirestore();
      } catch (error) {
        console.error(
          "[play-progress-store] Failed to push local progress to Firestore:",
          error
        );
      }
    }
  }

  function reset(): void {
    progress = null;
    userId = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort — non-browser test contexts may not have localStorage
    }
  }

  return {
    getProgress,
    getGameProgress,
    recordResult,
    initializeForUser,
    reset,
  };
}
