import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackTrainSessionStarted(properties: {
  sequenceId?: string;
  bpm: number;
  detectionMethod: string;
  totalSteps: number;
}): void {
  void logActivity("train_session_started", "learn", {
    sequenceId: properties.sequenceId,
    bpm: properties.bpm,
    detection_method: properties.detectionMethod,
    total_steps: properties.totalSteps,
  });
}

export function trackTrainSessionCompleted(properties: {
  sequenceId?: string;
  bpm: number;
  practiceMode: string;
  totalSteps: number;
  totalHits: number;
  totalMisses: number;
  maxCombo: number;
  score: number;
  accuracy: number;
  grade: string;
  durationSeconds: number;
}): void {
  void logActivity("train_session_completed", "learn", {
    sequenceId: properties.sequenceId,
    bpm: properties.bpm,
    practice_mode: properties.practiceMode,
    total_steps: properties.totalSteps,
    total_hits: properties.totalHits,
    total_misses: properties.totalMisses,
    max_combo: properties.maxCombo,
    score: properties.score,
    accuracy: Math.round(properties.accuracy * 10) / 10,
    grade: properties.grade,
    duration: Math.round(properties.durationSeconds * 1000),
  });
}
