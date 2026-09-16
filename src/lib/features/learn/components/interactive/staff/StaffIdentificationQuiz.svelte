<!--
StaffIdentificationQuiz - Coordinator for staff position and rotation quiz
Tests understanding of: Alpha/Beta/Gamma placements, Thumb orientations, Prospin/Antispin
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onDestroy } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    type StaffQuizQuestion,
    generateStaffQuizQuestions,
  } from "../../../domain/constants/staff-quiz-questions";
  import StaffQuizProgressBar from "./staff-quiz/StaffQuizProgressBar.svelte";
  import StaffQuizSection from "./staff-quiz/StaffQuizSection.svelte";
  import StaffQuizCompleteSection from "./staff-quiz/StaffQuizCompleteSection.svelte";

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
  let selectedAnswer = $state<string | null>(null);
  const questions = $state<StaffQuizQuestion[]>(generateStaffQuizQuestions());

  const isComplete = $derived(currentQuestion >= questions.length);

  function getCurrentQuestion(): StaffQuizQuestion {
    return questions[currentQuestion]!;
  }

  function handleAnswer(answer: string) {
    if (answerState !== "idle") return;

    selectedAnswer = answer;
    const question = getCurrentQuestion();

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
      if (currentQuestion < questions.length - 1) {
        currentQuestion++;
        answerState = "idle";
        selectedAnswer = null;
      } else {
        answerState = "idle";
        currentQuestion++;
      }
    }, 1500);
  }

  function restartQuiz() {
    currentQuestion = 0;
    score = 0;
    answerState = "idle";
    selectedAnswer = null;
    questions.length = 0;
    questions.push(...generateStaffQuizQuestions());
  }
</script>

<div class="staff-quiz">
  <StaffQuizProgressBar
    {currentQuestion}
    totalQuestions={questions.length}
    {isComplete}
  />

  {#if !isComplete}
    <StaffQuizSection
      question={getCurrentQuestion()}
      {answerState}
      {selectedAnswer}
      onAnswer={handleAnswer}
    />
  {:else}
    <StaffQuizCompleteSection
      {score}
      totalQuestions={questions.length}
      onRestart={restartQuiz}
      onComplete={() => onComplete?.()}
    />
  {/if}
</div>

<style>
  .staff-quiz {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  @media (max-width: 500px) {
    .staff-quiz {
      padding: 1rem;
    }
  }
</style>
