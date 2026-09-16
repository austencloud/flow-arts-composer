<!--
WordBuildingQuiz - Coordinator for word formation quiz
Questions about letter sequences, motion types, placement transitions, and LOOPs
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onDestroy } from "svelte";
  import {
    type WordQuizQuestion,
    generateWordQuizQuestions,
  } from "../../../domain/constants/word-quiz-questions";
  import WordQuizProgressBar from "./word-quiz/WordQuizProgressBar.svelte";
  import WordQuizSection from "./word-quiz/WordQuizSection.svelte";
  import WordQuizCompleteSection from "./word-quiz/WordQuizCompleteSection.svelte";

  let { onComplete } = $props<{ onComplete?: () => void }>();

  const hapticService = getHapticFeedback();

  let answerTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (answerTimer !== null) clearTimeout(answerTimer);
  });

  type AnswerState = "idle" | "correct" | "incorrect";

  // Quiz state
  let currentQuestion = $state(0);
  let score = $state(0);
  let answerState = $state<AnswerState>("idle");
  let selectedAnswer = $state<number | null>(null);
  let currentStep = $state(0);
  const shuffledQuestions = $state<WordQuizQuestion[]>(
    generateWordQuizQuestions()
  );

  const isComplete = $derived(currentQuestion >= shuffledQuestions.length);

  function getCurrentQuestion(): WordQuizQuestion {
    return shuffledQuestions[currentQuestion]!;
  }

  function handleAnswer(answerIndex: number) {
    if (answerState !== "idle") return;

    selectedAnswer = answerIndex;
    const question = getCurrentQuestion();

    if (answerIndex === question.correctAnswer) {
      answerState = "correct";
      score++;
      hapticService?.trigger("success");
    } else {
      answerState = "incorrect";
      hapticService?.trigger("error");
    }

    answerTimer = setTimeout(() => {
      answerTimer = null;
      if (currentQuestion < shuffledQuestions.length - 1) {
        currentQuestion++;
        answerState = "idle";
        selectedAnswer = null;
        currentStep = 0;
      } else {
        answerState = "idle";
        currentQuestion++;
      }
    }, 2500);
  }

  function restartQuiz() {
    shuffledQuestions.length = 0;
    shuffledQuestions.push(...generateWordQuizQuestions());
    currentQuestion = 0;
    score = 0;
    answerState = "idle";
    selectedAnswer = null;
    currentStep = 0;
  }

  function handleStepChange(index: number) {
    currentStep = index;
  }
</script>

<div class="word-quiz">
  <WordQuizProgressBar
    {currentQuestion}
    totalQuestions={shuffledQuestions.length}
    {isComplete}
  />

  {#if !isComplete}
    <WordQuizSection
      question={getCurrentQuestion()}
      {answerState}
      {selectedAnswer}
      {currentStep}
      onAnswer={handleAnswer}
      onStepChange={handleStepChange}
    />
  {:else}
    <WordQuizCompleteSection
      {score}
      totalQuestions={shuffledQuestions.length}
      onRestart={restartQuiz}
      onComplete={() => onComplete?.()}
    />
  {/if}
</div>

<style>
  .word-quiz {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  @media (max-width: 500px) {
    .word-quiz {
      padding: 1rem;
    }
  }
</style>
