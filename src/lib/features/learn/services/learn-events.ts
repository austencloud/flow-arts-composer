import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackLessonStarted(lessonId: string, status: string): void {
  void logActivity("lesson_start", "learn", { lessonId, status });
}

export function trackLessonCompleted(lessonId: string): void {
  void logActivity("lesson_complete", "learn", { lessonId });
}

export function trackQuizStarted(properties: {
  quizId: string;
  challengeNumber: number;
  mode: string;
  quizType?: string;
}): void {
  void logActivity("quiz_start", "learn", {
    quizId: properties.quizId,
    challenge_number: properties.challengeNumber,
    mode: properties.mode,
    quiz_type: properties.quizType,
  });
}

export function trackQuizAnswer(properties: {
  quizId: string;
  challengeNumber: number;
  questionNumber: number;
  correct: boolean;
  roundKind: string;
}): void {
  void logActivity("quiz_answer", "learn", {
    quizId: properties.quizId,
    challenge_number: properties.challengeNumber,
    question_number: properties.questionNumber,
    correct: properties.correct,
    round_kind: properties.roundKind,
  });
}

export function trackQuizCompleted(properties: {
  quizId: string;
  challengeNumber: number;
  score: number;
  correctCount: number;
  totalCount: number;
  accuracyPercentage: number;
  durationSeconds: number;
}): void {
  void logActivity("quiz_complete", "learn", {
    quizId: properties.quizId,
    challenge_number: properties.challengeNumber,
    score: properties.score,
    correct_count: properties.correctCount,
    total_count: properties.totalCount,
    accuracy_percentage: properties.accuracyPercentage,
    duration: Math.round(properties.durationSeconds * 1000),
  });
}
