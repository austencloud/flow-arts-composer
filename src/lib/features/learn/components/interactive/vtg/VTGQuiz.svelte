<!--
VTGQuiz - Quiz to identify VTG modes from animations
User watches animation and identifies which VTG mode is being shown
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    shuffleArray,
    type VTGMode,
    VTG_QUESTIONS,
  } from "../../../domain/constants/vtg-quiz-data";
  import VTGVisualizer from "./VTGVisualizer.svelte";
  import VTGQuizHeader from "./vtg-quiz/VTGQuizHeader.svelte";
  import VTGAnswerGrid from "./vtg-quiz/VTGAnswerGrid.svelte";
  import VTGQuizFeedback from "./vtg-quiz/VTGQuizFeedback.svelte";
  import VTGNextButton from "./vtg-quiz/VTGNextButton.svelte";
  import VTGQuizResults from "./vtg-quiz/VTGQuizResults.svelte";

  let { onComplete } = $props<{
    onComplete?: () => void;
  }>();

  const hapticService = getHapticFeedback();

  // Take 8 shuffled questions for quiz
  const quizQuestions = $state(shuffleArray(VTG_QUESTIONS).slice(0, 8));

  let currentQuestionIndex = $state(0);
  let selectedAnswer = $state<VTGMode | null>(null);
  let showResult = $state(false);
  let correctCount = $state(0);
  let quizComplete = $state(false);

  const currentQuestion = $derived(quizQuestions[currentQuestionIndex]);
  const isLastQuestion = $derived(
    currentQuestionIndex >= quizQuestions.length - 1
  );

  function selectAnswer(answer: VTGMode) {
    if (showResult || !currentQuestion) return;

    selectedAnswer = answer;
    showResult = true;

    if (answer === currentQuestion) {
      correctCount++;
      hapticService?.trigger("success");
    } else {
      hapticService?.trigger("error");
    }
  }

  function nextQuestion() {
    if (!isLastQuestion) {
      currentQuestionIndex++;
      selectedAnswer = null;
      showResult = false;
      hapticService?.trigger("selection");
    } else {
      quizComplete = true;
      hapticService?.trigger("success");
    }
  }

  function finishQuiz() {
    onComplete?.();
  }
</script>

<div class="vtg-quiz">
  {#if !quizComplete}
    <VTGQuizHeader
      currentQuestion={currentQuestionIndex}
      totalQuestions={quizQuestions.length}
      {correctCount}
      {showResult}
    />

    {#if currentQuestion}
      <div class="question-area">
        <p class="question-prompt">What VTG mode is this?</p>
        <VTGVisualizer
          mode={currentQuestion}
          showLabels={true}
          autoPlay={false}
        />
      </div>

      <VTGAnswerGrid
        correctAnswer={currentQuestion}
        {selectedAnswer}
        {showResult}
        onSelect={selectAnswer}
      />

      {#if showResult}
        <VTGQuizFeedback
          isCorrect={selectedAnswer === currentQuestion}
          correctAnswer={currentQuestion}
        />
        <VTGNextButton {isLastQuestion} onclick={nextQuestion} />
      {/if}
    {/if}
  {:else}
    <VTGQuizResults
      {correctCount}
      totalQuestions={quizQuestions.length}
      onFinish={finishQuiz}
    />
  {/if}
</div>

<style>
  .vtg-quiz {
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
    color: var(--theme-text);
    margin: 0;
  }
</style>
