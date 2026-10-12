<!--
WordQuizSection - Main quiz UI with visualizer and answers
-->
<script lang="ts">
  import WordVisualizer from "../WordVisualizer.svelte";
  import type { WordQuizQuestion } from "../../../../domain/constants/word-quiz-questions";
  import WordQuizTypeBadge from "./WordQuizTypeBadge.svelte";
  import WordQuizAnswerButton from "./WordQuizAnswerButton.svelte";
  import WordQuizFeedback from "./WordQuizFeedback.svelte";

  let {
    question,
    answerState,
    selectedAnswer,
    currentStep,
    onAnswer,
    onStepChange,
  }: {
    question: WordQuizQuestion;
    answerState: "idle" | "correct" | "incorrect";
    selectedAnswer: number | null;
    currentStep: number;
    onAnswer: (index: number) => void;
    onStepChange: (index: number) => void;
  } = $props();
</script>

<div class="quiz-section">
  <WordQuizTypeBadge type={question.type} />

  <h3 class="quiz-title">{question.question}</h3>

  {#if question.letters && question.letters.length > 0}
    <div class="visualizer-container">
      <WordVisualizer
        letters={question.letters}
        currentStepIndex={currentStep}
        isAnimating={true}
        animationSpeed={1500}
        showLetterLabel={answerState !== "idle"}
        showStepNumber={true}
        {onStepChange}
      />
    </div>
  {/if}

  <div class="answer-options">
    {#each question.options as option, i}
      {@const isSelected = selectedAnswer === i}
      {@const isCorrectAnswer = question.correctAnswer === i}
      {@const showCorrect = answerState === "correct" && isSelected}
      {@const showIncorrect = answerState === "incorrect" && isSelected}
      {@const revealCorrect = answerState === "incorrect" && isCorrectAnswer}

      <WordQuizAnswerButton
        index={i}
        {option}
        {isSelected}
        {showCorrect}
        {showIncorrect}
        {revealCorrect}
        {answerState}
        disabled={answerState !== "idle"}
        onSelect={() => onAnswer(i)}
      />
    {/each}
  </div>

  {#if answerState !== "idle"}
    <WordQuizFeedback {answerState} explanation={question.explanation} />
  {/if}
</div>

<style>
  .quiz-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    animation: fadeIn var(--duration-emphasis) var(--ease-standard);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .quiz-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text);
    margin: 0;
    text-align: center;
    line-height: 1.4;
  }

  .visualizer-container {
    width: 100%;
    max-width: 280px;
  }

  .answer-options {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    width: 100%;
    max-width: 500px;
  }

  @media (max-width: 500px) {
    .quiz-title {
      font-size: 1.125rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-section {
      animation: none;
    }
  }
</style>
