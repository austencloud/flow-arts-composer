/**
 * quiz-history-recorder
 *
 * Append-only Firestore log of quiz attempts.
 * Each attempt is a document in users/{uid}/quizHistory.
 *
 * Computes ConceptMastery from raw attempts:
 * - Trend detection from the last 3 scores
 * - Mastery threshold: average >= 80% with 3+ attempts
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
  serverTimestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import { getUserQuizHistoryPath } from "../data/firestore-paths";
import type { QuizAttempt, ConceptMastery } from "../domain/quiz-history-types";

/** Minimum attempts required before considering a concept "mastered" */
const MASTERY_MIN_ATTEMPTS = 3;

/** Average score threshold for mastery (percentage) */
const MASTERY_SCORE_THRESHOLD = 80;

/** Number of recent scores used for trend detection */
const TREND_WINDOW = 3;

/**
 * Cap on attempts fetched when aggregating mastery across all concepts.
 * Matches getRecurringMisconceptions in gap-detector.ts so a high-volume
 * user can't trigger an unbounded Firestore read.
 */
const ALL_MASTERY_FETCH_LIMIT = 50;

async function getCollectionRef(userId: string) {
  const firestore = await getFirestoreInstance();
  return collection(firestore, getUserQuizHistoryPath(userId));
}

export async function recordAttempt(
  userId: string,
  attempt: Omit<QuizAttempt, "id">
): Promise<void> {
  try {
    const colRef = await getCollectionRef(userId);

    const doc: Record<string, unknown> = {
      conceptId: attempt.conceptId,
      quizType: attempt.quizType,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalCount: attempt.totalCount,
      timeSpentSeconds: attempt.timeSpentSeconds,
      timestamp: attempt.timestamp.toISOString(),
      createdAt: serverTimestamp(),
    };

    if (attempt.wrongAnswers && attempt.wrongAnswers.length > 0) {
      doc.wrongAnswers = attempt.wrongAnswers;
    }

    await trackWrite(() => addDoc(colRef, doc));
  } catch (error) {
    console.error("[QuizHistoryRecorder] Failed to record attempt:", error);
    throw error;
  }
}

export async function getHistory(
  userId: string,
  conceptId?: string,
  limit?: number
): Promise<QuizAttempt[]> {
  try {
    const colRef = await getCollectionRef(userId);

    const constraints: QueryConstraint[] = [];
    if (conceptId) {
      constraints.push(where("conceptId", "==", conceptId));
    }
    constraints.push(orderBy("timestamp", "desc"));
    if (limit) {
      constraints.push(firestoreLimit(limit));
    }

    const q = query(colRef, ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        conceptId: data.conceptId as string,
        quizType: data.quizType as string,
        score: data.score as number,
        correctCount: data.correctCount as number,
        totalCount: data.totalCount as number,
        timeSpentSeconds: data.timeSpentSeconds as number,
        timestamp: new Date(data.timestamp as string),
      };
    });
  } catch (error) {
    console.error("[QuizHistoryRecorder] Failed to get history:", error);
    throw error;
  }
}

export async function getConceptMastery(
  userId: string,
  conceptId: string
): Promise<ConceptMastery | null> {
  const attempts = await getHistory(userId, conceptId);
  if (attempts.length === 0) return null;

  return computeMastery(conceptId, attempts);
}

export async function getAllMasteryScores(
  userId: string
): Promise<Map<string, ConceptMastery>> {
  const allAttempts = await getHistory(userId, undefined, ALL_MASTERY_FETCH_LIMIT);
  const byConceptId = new Map<string, QuizAttempt[]>();

  for (const attempt of allAttempts) {
    const existing = byConceptId.get(attempt.conceptId) || [];
    existing.push(attempt);
    byConceptId.set(attempt.conceptId, existing);
  }

  const masteryMap = new Map<string, ConceptMastery>();
  for (const [conceptId, attempts] of byConceptId) {
    masteryMap.set(conceptId, computeMastery(conceptId, attempts));
  }

  return masteryMap;
}

/**
 * Compute mastery data from a list of attempts for a single concept.
 * Assumes attempts are sorted by timestamp descending (most recent first).
 */
function computeMastery(
  conceptId: string,
  attempts: QuizAttempt[]
): ConceptMastery {
  const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
  const averageScore = totalScore / attempts.length;
  const mostRecent = attempts[0]!;
  const lastScore = mostRecent.score;
  const lastAttemptAt = mostRecent.timestamp;

  const trend = detectTrend(attempts);
  const mastered =
    attempts.length >= MASTERY_MIN_ATTEMPTS &&
    averageScore >= MASTERY_SCORE_THRESHOLD;

  return {
    conceptId,
    attempts: attempts.length,
    averageScore: Math.round(averageScore * 10) / 10,
    lastScore,
    trend,
    mastered,
    lastAttemptAt,
  };
}

/**
 * Detect score trend from the most recent attempts.
 * Compares average of recent window to average of preceding window.
 */
function detectTrend(
  attempts: QuizAttempt[]
): "improving" | "stable" | "declining" {
  if (attempts.length < TREND_WINDOW) return "stable";

  const recent = attempts.slice(0, TREND_WINDOW);
  const recentAvg =
    recent.reduce((sum, a) => sum + a.score, 0) / recent.length;

  // Compare to earlier attempts
  const earlier = attempts.slice(TREND_WINDOW, TREND_WINDOW * 2);
  if (earlier.length === 0) return "stable";

  const earlierAvg =
    earlier.reduce((sum, a) => sum + a.score, 0) / earlier.length;

  const diff = recentAvg - earlierAvg;
  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}
