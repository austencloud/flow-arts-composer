/**
 * SessionCompletionProcessor
 *
 * Post-session processing for training sessions: computes accuracy + grade and
 * saves the result to performance history.
 */

import type * as performanceHistoryTrackerModule from "./performance-history-tracker";
import type { StoredPerformance } from "#lib/shared/train/domain/train-database-models.js";
import { PracticeMode } from "../domain/enums/train-enums";
import { trackTrainSessionCompleted } from "../analytics/train-events";

export interface SessionCompletionParams {
  totalSteps: number;
  totalHits: number;
  totalMisses: number;
  maxCombo: number;
  currentScore: number;
  bpm: number;
  practiceMode: PracticeMode;
  sequenceId?: string;
  sequenceName?: string;
  sessionDuration: number;
}

export interface SessionCompletionResult {
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  accuracy: number;
}

export class SessionCompletionProcessor {
  constructor(
    private historyTracker: typeof performanceHistoryTrackerModule
  ) {}

  async processCompletion(
    params: SessionCompletionParams
  ): Promise<SessionCompletionResult> {
    const accuracy =
      params.totalSteps > 0 ? (params.totalHits / params.totalSteps) * 100 : 0;

    const grade = this.calculateGrade(accuracy);

    await this.savePerformanceHistory(params, accuracy, grade);
    trackTrainSessionCompleted({
      sequenceId: params.sequenceId,
      bpm: params.bpm,
      practiceMode: params.practiceMode,
      totalSteps: params.totalSteps,
      totalHits: params.totalHits,
      totalMisses: params.totalMisses,
      maxCombo: params.maxCombo,
      score: params.currentScore,
      accuracy,
      grade,
      durationSeconds: params.sessionDuration,
    });

    return { grade, accuracy };
  }

  private calculateGrade(accuracy: number): "S" | "A" | "B" | "C" | "D" | "F" {
    if (accuracy >= 95) return "S";
    if (accuracy >= 85) return "A";
    if (accuracy >= 70) return "B";
    if (accuracy >= 55) return "C";
    if (accuracy >= 40) return "D";
    return "F";
  }

  private async savePerformanceHistory(
    params: SessionCompletionParams,
    accuracy: number,
    grade: "S" | "A" | "B" | "C" | "D" | "F"
  ): Promise<void> {
    try {
      const storedPerformance: StoredPerformance = {
        id: crypto.randomUUID(),
        sequenceId: params.sequenceId ?? "unknown",
        sequenceName: params.sequenceName ?? "Unknown Sequence",
        performedAt: new Date(),
        detectionMethod: "mediapipe",
        bpm: params.bpm,
        beatResultsJson: "[]",
        score: {
          percentage: Math.round(accuracy * 10) / 10,
          grade,
          perfectHits: params.totalHits,
          goodHits: 0,
          misses: params.totalMisses,
          maxCombo: params.maxCombo,
        },
        metadata: {
          sessionDuration: params.sessionDuration,
        },
      };

      await this.historyTracker.savePerformance(storedPerformance);
    } catch (error) {
      console.error("Failed to save session to history:", error);
    }
  }
}
