<!--
GridIdentificationQuiz - Coordinator for grid concept quiz

Two phases:
1. Mode Identification: Diamond vs Box (5 questions)
2. Point Identification: Click the correct point (8 questions)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onDestroy } from "svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { GRID_DIRECTIONS } from "../../domain/constants/grid-constants";
  import QuizProgressBar from "./grid-quiz/QuizProgressBar.svelte";
  import ModeQuizSection from "./grid-quiz/ModeQuizSection.svelte";
  import PointQuizSection from "./grid-quiz/PointQuizSection.svelte";
  import QuizCompleteSection from "./grid-quiz/QuizCompleteSection.svelte";

  let { onComplete } = $props<{
    onComplete?: () => void;
  }>();

  const hapticService = getHapticFeedback();

  let answerTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (answerTimer !== null) clearTimeout(answerTimer);
  });

  type QuizPhase = "mode" | "point" | "complete";
  type AnswerState = "idle" | "correct" | "incorrect";

  // Quiz state
  let phase = $state<QuizPhase>("mode");
  let currentQuestion = $state(0);
  let score = $state(0);
  let answerState = $state<AnswerState>("idle");
  let selectedAnswer = $state<string | null>(null);

  // Questions
  const modeQuestions = $state(generateModeQuestions());
  const pointQuestions = $state(generatePointQuestions());

  function generateModeQuestions() {
    const questions = [];
    for (let i = 0; i < 5; i++) {
      questions.push({
        correctAnswer: Math.random() > 0.5 ? "diamond" : "box",
        id: i,
      });
    }
    return questions;
  }

  function generatePointQuestions() {
    const shuffled = [...GRID_DIRECTIONS].sort(() => Math.random() - 0.5);
    return shuffled.map((dir, i) => ({
      direction: dir,
      id: i,
    }));
  }

  function handleModeAnswer(answer: "diamond" | "box") {
    if (answerState !== "idle") return;

    selectedAnswer = answer;
    const question = modeQuestions[currentQuestion]!;

    if (answer === question.correctAnswer) {
      answerState = "correct";
      score++;
      hapticService?.trigger("success");
    } else {
      answerState = "incorrect";
      hapticService?.trigger("error");
    }

    answerTimer = setTimeout(() => {
      answerTimer = null;
      if (currentQuestion < modeQuestions.length - 1) {
        currentQuestion++;
        answerState = "idle";
        selectedAnswer = null;
      } else {
        phase = "point";
        currentQuestion = 0;
        answerState = "idle";
        selectedAnswer = null;
      }
    }, 300);
  }

  function handlePointClick(direction: string) {
    if (answerState !== "idle") return;

    selectedAnswer = direction;
    const question = pointQuestions[currentQuestion]!;

    if (direction === question.direction) {
      answerState = "correct";
      score++;
      hapticService?.trigger("success");
    } else {
      answerState = "incorrect";
      hapticService?.trigger("error");
    }

    answerTimer = setTimeout(() => {
      answerTimer = null;
      if (currentQuestion < pointQuestions.length - 1) {
        currentQuestion++;
        answerState = "idle";
        selectedAnswer = null;
      } else {
        phase = "complete";
      }
    }, 300);
  }

  function restartQuiz() {
    phase = "mode";
    currentQuestion = 0;
    score = 0;
    answerState = "idle";
    selectedAnswer = null;
    modeQuestions.length = 0;
    modeQuestions.push(...generateModeQuestions());
    pointQuestions.length = 0;
    pointQuestions.push(...generatePointQuestions());
  }

  const totalQuestions = $derived(modeQuestions.length + pointQuestions.length);
</script>

<div class="grid-quiz">
  <QuizProgressBar
    {phase}
    {currentQuestion}
    modeQuestionsCount={modeQuestions.length}
    pointQuestionsCount={pointQuestions.length}
  />

  {#if phase === "mode"}
    <ModeQuizSection
      question={modeQuestions[currentQuestion]!}
      {answerState}
      {selectedAnswer}
      onAnswer={handleModeAnswer}
    />
  {:else if phase === "point"}
    <PointQuizSection
      question={pointQuestions[currentQuestion]!}
      {answerState}
      {selectedAnswer}
      onPointClick={handlePointClick}
    />
  {:else}
    <QuizCompleteSection
      {score}
      {totalQuestions}
      onRestart={restartQuiz}
      onComplete={() => onComplete?.()}
    />
  {/if}
</div>

<style>
  .grid-quiz {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  @media (max-width: 500px) {
    .grid-quiz {
      padding: 1rem;
    }
  }
</style>
