/**
 * Performance History Tracker
 *
 * Manages training session history storage and retrieval using IndexedDB via Dexie.
 * Data is stored locally for fast access and offline support.
 */

import { db } from "#lib/shared/persistence/database/tka-database.js";
import {
  normalizeStoredBeatResultsJson,
  type StoredPerformance,
} from "#lib/shared/train/domain/train-database-models.js";
import type { PerformanceScore } from "#lib/shared/train/domain/performance-data.js";

export interface PersonalBest {
  sequenceId: string;
  sequenceName: string;
  bestScore: PerformanceScore;
  bestAccuracy: number;
  bestGrade: string;
  bestCombo: number;
  performanceId: string;
  achievedAt: Date;
}

export interface StatsOverview {
  totalSessions: number;
  totalPracticeTime: number;
  averageAccuracy: number;
  maxCombo: number;
}

/**
 * Save a completed performance session to IndexedDB
 */
export async function savePerformance(
  performance: StoredPerformance
): Promise<void> {
  try {
    await db.trainPerformances.add(performance);
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to save performance:",
      error
    );
    throw error;
  }
}

/**
 * Get recent training sessions, ordered by date descending
 */
export async function getRecentSessions(
  limit: number
): Promise<StoredPerformance[]> {
  try {
    const sessions = await db.trainPerformances
      .orderBy("performedAt")
      .reverse()
      .limit(limit)
      .toArray();

    return sessions.map((session) => ({
      ...session,
      beatResultsJson: normalizeStoredBeatResultsJson(session.beatResultsJson),
    }));
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to get recent sessions:",
      error
    );
    return [];
  }
}

/**
 * Get personal bests grouped by sequence
 * Returns the best performance (by percentage) for each unique sequence
 */
export async function getPersonalBests(): Promise<PersonalBest[]> {
  try {
    const allPerformances = await db.trainPerformances.toArray();

    if (allPerformances.length === 0) {
      return [];
    }

    // Group by sequenceId and find best for each
    const bestBySequence = new Map<string, StoredPerformance>();

    for (const performance of allPerformances) {
      const existing = bestBySequence.get(performance.sequenceId);

      if (
        !existing ||
        performance.score.percentage > existing.score.percentage ||
        (performance.score.percentage === existing.score.percentage &&
          performance.score.maxCombo > existing.score.maxCombo)
      ) {
        bestBySequence.set(performance.sequenceId, performance);
      }
    }

    // Convert to PersonalBest format
    const personalBests: PersonalBest[] = [];

    for (const [sequenceId, performance] of bestBySequence) {
      personalBests.push({
        sequenceId,
        sequenceName: performance.sequenceName,
        bestScore: performance.score,
        bestAccuracy: performance.score.percentage,
        bestGrade: performance.score.grade,
        bestCombo: performance.score.maxCombo,
        performanceId: performance.id,
        achievedAt: performance.performedAt,
      });
    }

    // Sort by accuracy descending
    personalBests.sort((a, b) => b.bestAccuracy - a.bestAccuracy);

    return personalBests;
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to get personal bests:",
      error
    );
    return [];
  }
}

/**
 * Get overall statistics across all sessions
 */
export async function getStatsOverview(): Promise<StatsOverview> {
  try {
    const allPerformances = await db.trainPerformances.toArray();

    if (allPerformances.length === 0) {
      return {
        totalSessions: 0,
        totalPracticeTime: 0,
        averageAccuracy: 0,
        maxCombo: 0,
      };
    }

    const totalSessions = allPerformances.length;

    const totalPracticeTime = allPerformances.reduce((sum, p) => {
      return sum + (p.metadata?.sessionDuration ?? 0);
    }, 0);

    // Calculate average accuracy
    const totalAccuracy = allPerformances.reduce((sum, p) => {
      return sum + p.score.percentage;
    }, 0);
    const averageAccuracy =
      Math.round((totalAccuracy / totalSessions) * 10) / 10;

    // Find max combo across all sessions
    const maxCombo = allPerformances.reduce((max, p) => {
      return Math.max(max, p.score.maxCombo);
    }, 0);

    return {
      totalSessions,
      totalPracticeTime,
      averageAccuracy,
      maxCombo,
    };
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to get stats overview:",
      error
    );
    return {
      totalSessions: 0,
      totalPracticeTime: 0,
      averageAccuracy: 0,
      maxCombo: 0,
    };
  }
}

/**
 * Get personal best for a specific sequence
 */
export async function getPersonalBest(
  sequenceId: string
): Promise<PersonalBest | null> {
  try {
    // Use the compound index for efficient querying
    const performances = await db.trainPerformances
      .where("sequenceId")
      .equals(sequenceId)
      .toArray();

    if (performances.length === 0) {
      return null;
    }

    // Find the best one - we know array is not empty at this point
    let best: StoredPerformance = performances[0]!;
    for (const performance of performances) {
      if (
        performance.score.percentage > best.score.percentage ||
        (performance.score.percentage === best.score.percentage &&
          performance.score.maxCombo > best.score.maxCombo)
      ) {
        best = performance;
      }
    }

    return {
      sequenceId: best.sequenceId,
      sequenceName: best.sequenceName,
      bestScore: best.score,
      bestAccuracy: best.score.percentage,
      bestGrade: best.score.grade,
      bestCombo: best.score.maxCombo,
      performanceId: best.id,
      achievedAt: best.performedAt,
    };
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to get personal best:",
      error
    );
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await db.trainPerformances.delete(sessionId);
  } catch (error) {
    console.error(
      "[performance-history-tracker] Failed to delete session:",
      error
    );
    throw error;
  }
}
