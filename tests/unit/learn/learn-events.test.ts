import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logActivity: vi.fn(),
}));

import { logActivity } from "$lib/shared/analytics/services/posthog-activity-logger";
import {
  trackLessonCompleted,
  trackLessonStarted,
  trackQuizAnswer,
  trackQuizCompleted,
  trackQuizStarted,
} from "$lib/features/learn/services/learn-events";

describe("Learn decision events", () => {
  beforeEach(() => vi.mocked(logActivity).mockClear());

  it("captures lesson entry and completion without lesson content", () => {
    trackLessonStarted("placements", "available");
    trackLessonCompleted("placements");

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      ["lesson_start", "learn", { lessonId: "placements", status: "available" }],
      ["lesson_complete", "learn", { lessonId: "placements" }],
    ]);
  });

  it("captures the quiz funnel with bounded aggregate fields", () => {
    trackQuizStarted({
      quizId: "pictograph-to-letter",
      challengeNumber: 2,
      mode: "fixed",
      quizType: "pictograph_to_letter",
    });
    trackQuizAnswer({
      quizId: "pictograph-to-letter",
      challengeNumber: 2,
      questionNumber: 1,
      correct: true,
      roundKind: "choice",
    });
    trackQuizCompleted({
      quizId: "pictograph-to-letter",
      challengeNumber: 2,
      score: 150,
      correctCount: 7,
      totalCount: 8,
      accuracyPercentage: 87.5,
      durationSeconds: 32.4,
    });

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      [
        "quiz_start",
        "learn",
        {
          quizId: "pictograph-to-letter",
          challenge_number: 2,
          mode: "fixed",
          quiz_type: "pictograph_to_letter",
        },
      ],
      [
        "quiz_answer",
        "learn",
        {
          quizId: "pictograph-to-letter",
          challenge_number: 2,
          question_number: 1,
          correct: true,
          round_kind: "choice",
        },
      ],
      [
        "quiz_complete",
        "learn",
        {
          quizId: "pictograph-to-letter",
          challenge_number: 2,
          score: 150,
          correct_count: 7,
          total_count: 8,
          accuracy_percentage: 87.5,
          duration: 32400,
        },
      ],
    ]);
  });
});
