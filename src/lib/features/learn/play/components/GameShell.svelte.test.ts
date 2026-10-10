/**
 * Coin-flip regression test (component layer).
 *
 * Play used to score by coin flip — the fix (arcade-session-state.svelte.ts)
 * makes the engine the single source of truth: every submitted answer's
 * correctness deterministically drives score, streak, and the final result.
 * The jsdom logic suite (tests/unit/play/arcade-session.test.ts) already
 * proves the engine's own math. This test proves the last mile: what the
 * engine computes is what actually renders in the DOM, with zero randomness
 * or drift introduced between "submit" and "display".
 *
 * Mounts a thin harness (GameShellTestHarness.svelte) instead of the full
 * PlayHub/GameShell tree — per the plan's fallback, the real games pull in
 * question-generator CSV loads and pictograph 3D rendering that are heavy
 * and orthogonal to what's under test here (score/results plumbing, not
 * game rendering).
 */
import { flushSync } from "svelte";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import GameShellTestHarness from "./GameShellTestHarness.svelte";
import { scoreAnswer } from "../domain/scoring";
import type { ArcadeSession } from "../state/arcade-session-state.svelte";
import type {
  GameDefinition,
  ChallengeDefinition,
} from "../domain/arcade-types";
import type { QuizAnswerEvent } from "#lib/features/learn/quiz/domain/models/quiz-models.js";

// Minimal fake event — only `isCorrect` matters to the engine. Shape copied
// from tests/unit/play/arcade-session.test.ts's evt() helper.
function evt(isCorrect: boolean): QuizAnswerEvent {
  return {
    isCorrect,
    questionData: {
      questionId: "q",
      questionContent: null,
      answerOptions: [],
      correctAnswer: null,
      questionType: "letter" as never,
      answerType: "button" as never,
      lessonType: "pictograph_to_letter" as never,
    },
    selectedOptionId: "a",
    selectedContent: null,
    correctContent: null,
    quizType: "pictograph_to_letter" as never,
    answeredAt: new Date(),
  };
}

const GAME: GameDefinition = {
  id: "pictograph-to-letter",
  title: "Name That Pictograph",
  tagline: "test",
  accentColor: "#000",
  quizType: "pictograph_to_letter" as never,
  capabilities: { scoring: "quiz" },
  curriculum: { status: "unclassified" },
  challenges: [],
};

const TWO_QUESTION_CHALLENGE: ChallengeDefinition = {
  challengeNumber: 1,
  title: "Test Challenge",
  mode: { kind: "fixed", questionCount: 2 },
  constraints: {},
  stars: { one: 100, two: 500, three: 1000 },
};

describe("GameShell coin-flip regression (component layer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submitted answer correctness flows 1:1 to the displayed results", async () => {
    // Control Date.now() so the expected score is computed, never
    // hardcoded: scoreAnswer() is fed the exact answerTimeMs this test
    // drives, so a coin-flip regression (engine ignoring the submitted
    // event, or the UI reading a different value than the engine computed)
    // would fail this assertion even though the numbers "look plausible".
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    let session: ArcadeSession | undefined;
    render(GameShellTestHarness, {
      onReady: (s: ArcadeSession) => {
        session = s;
      },
    });
    if (!session)
      throw new Error("harness did not report a session via onReady");

    session.startChallenge(GAME, TWO_QUESTION_CHALLENGE);

    // Question 1: correct, answered 800ms after it was shown (full-speed
    // bonus bucket, streakBefore 0).
    session.markQuestionShown();
    clock += 800;
    session.submitAnswer(evt(true));
    const expectedFirstPoints = scoreAnswer({
      isCorrect: true,
      answerTimeMs: 800,
      streakBefore: 0,
    });

    // Question 2: incorrect — always 0 points regardless of timing, and
    // this is the 2nd of 2 fixed questions, so the challenge completes here.
    session.markQuestionShown();
    clock += 3000;
    session.submitAnswer(evt(false));

    const expectedScore = expectedFirstPoints;

    flushSync();

    const phaseStatus = page.getByRole("status", {
      name: "session phase",
      exact: true,
    });
    await expect.element(phaseStatus).toHaveTextContent("results");

    const correctCount = page.getByRole("status", {
      name: "result correct count",
      exact: true,
    });
    await expect.element(correctCount).toHaveTextContent("1");

    const totalCount = page.getByRole("status", {
      name: "result total count",
      exact: true,
    });
    await expect.element(totalCount).toHaveTextContent("2");

    const resultScore = page.getByRole("status", {
      name: "result score",
      exact: true,
    });
    await expect.element(resultScore).toHaveTextContent(String(expectedScore));

    const liveScore = page.getByRole("status", {
      name: "live score",
      exact: true,
    });
    await expect.element(liveScore).toHaveTextContent(String(expectedScore));
  });
});
