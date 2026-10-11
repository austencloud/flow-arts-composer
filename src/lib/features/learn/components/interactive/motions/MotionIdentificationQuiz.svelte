<!--
MotionIdentificationQuiz - Quiz to identify motion types from animations
User must play animation first, then identify the motion type (1-6)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    MOTION_QUIZ_QUESTIONS,
    MOTION_TYPE_INFO,
    type MotionTypeNumber,
    type MotionQuizQuestion,
  } from "../../../domain/constants/motion-quiz-data";
  import MotionVisualizer from "./MotionVisualizer.svelte";
  import MotionQuizHeader from "./motion-quiz/MotionQuizHeader.svelte";
  import MotionTypeButton from "./motion-quiz/MotionTypeButton.svelte";
  import MotionQuizFeedback from "./motion-quiz/MotionQuizFeedback.svelte";
  import MotionQuizResults from "./motion-quiz/MotionQuizResults.svelte";

  let { onComplete } = $props<{
    onComplete?: () => void;
  }>();

  const hapticService = getHapticFeedback();

  function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  const quizQuestions = $state(shuffle(MOTION_QUIZ_QUESTIONS).slice(0, 8));

  let currentQuestionIndex = $state(0);
  let selectedAnswer = $state<MotionTypeNumber | null>(null);
  let showResult = $state(false);
  let correctCount = $state(0);
  let quizComplete = $state(false);

  const currentQuestion = $derived(quizQuestions[currentQuestionIndex]);
  const score = $derived(
    Math.round((correctCount / quizQuestions.length) * 100)
  );
  const isPassing = $derived(score >= 70);

  function selectAnswer(answer: MotionTypeNumber) {
    if (showResult || !currentQuestion) return;

    selectedAnswer = answer;
    showResult = true;

    if (answer === currentQuestion.correctAnswer) {
      correctCount++;
      hapticService?.trigger("success");
    } else {
      hapticService?.trigger("error");
    }
  }

  function nextQuestion() {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      currentQuestionIndex++;
      selectedAnswer = null;
      showResult = false;
      hapticService?.trigger("selection");
    } else {
      quizComplete = true;
      hapticService?.trigger("success");
    }
  }
</script>

<div class="motion-quiz">
  {#if !quizComplete}
    <MotionQuizHeader
      currentQuestion={currentQuestionIndex}
      totalQuestions={quizQuestions.length}
      {correctCount}
      {showResult}
    />

    {#if currentQuestion}
      <div class="question-area">
        <p class="question-prompt">What type of motion is this?</p>

        <MotionVisualizer
          leftStart={currentQuestion.leftStart}
          leftEnd={currentQuestion.leftEnd}
          rightStart={currentQuestion.rightStart}
          rightEnd={currentQuestion.rightEnd}
          leftMotion={currentQuestion.leftMotion}
          rightMotion={currentQuestion.rightMotion}
          motionType={currentQuestion.correctAnswer}
          showLabels={true}
          showMotionType={false}
        />
      </div>

      <div class="answers-grid">
        {#each MOTION_TYPE_INFO as type}
          <MotionTypeButton
            {type}
            isSelected={type.num === selectedAnswer}
            isCorrect={type.num === currentQuestion.correctAnswer}
            {showResult}
            disabled={showResult}
            onclick={() => selectAnswer(type.num)}
          />
        {/each}
      </div>

      {#if showResult}
        <MotionQuizFeedback
          isCorrect={selectedAnswer === currentQuestion.correctAnswer}
          correctAnswer={currentQuestion.correctAnswer}
        />

        <button class="next-button" onclick={nextQuestion}>
          {currentQuestionIndex < quizQuestions.length - 1
            ? "Next Question"
            : "See Results"}
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </button>
      {/if}
    {/if}
  {:else}
    <MotionQuizResults
      {score}
      {correctCount}
      totalQuestions={quizQuestions.length}
      {isPassing}
      onFinish={() => onComplete?.()}
    />
  {/if}
</div>

<style>
  .motion-quiz {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    width: 100%;
  }

  .question-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .question-prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .answers-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.625rem;
  }

  .next-button {
    align-self: center;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 2rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #06b6d4) 25%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    border-radius: 10px;
    color: var(--theme-accent, #22d3ee);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 35%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #06b6d4) 35%, transparent) 100%
    );
    border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 60%, transparent);
  }

  @media (max-width: 480px) {
    .answers-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
