<!--
Type1QuizSection - Main quiz UI with letter, pictograph, and answers
-->
<script lang="ts">
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    type MotionPattern,
    type Type1LetterQuestion,
    PATTERN_INFO,
  } from "../../../../../domain/constants/type1-letter-questions";
  import Type1LetterDisplay from "./Type1LetterDisplay.svelte";
  import Type1PictographDisplay from "./Type1PictographDisplay.svelte";
  import Type1AnswerButton from "./Type1AnswerButton.svelte";
  import Type1Feedback from "./Type1Feedback.svelte";

  let {
    question,
    isLoadingPictograph,
    pictographData,
    answerState,
    selectedAnswer,
    onAnswer,
  }: {
    question: Type1LetterQuestion;
    isLoadingPictograph: boolean;
    pictographData: PictographData | null;
    answerState: "idle" | "correct" | "incorrect";
    selectedAnswer: MotionPattern | null;
    onAnswer: (pattern: MotionPattern) => void;
  } = $props();

  const patterns: MotionPattern[] = ["pro-pro", "anti-anti", "hybrid"];
</script>

<div class="quiz-section">
  <h3 class="quiz-title">What motion pattern is this letter?</h3>

  <Type1LetterDisplay letter={question.letter} />

  <Type1PictographDisplay isLoading={isLoadingPictograph} {pictographData} />

  <div class="answer-buttons">
    {#each patterns as pattern}
      {@const info = PATTERN_INFO[pattern]}
      {@const isSelected = selectedAnswer === pattern}
      {@const isCorrectAnswer = question.pattern === pattern}
      {@const showCorrect = answerState === "correct" && isSelected}
      {@const showIncorrect = answerState === "incorrect" && isSelected}
      {@const revealCorrect = answerState === "incorrect" && isCorrectAnswer}

      <Type1AnswerButton
        {pattern}
        {info}
        {isSelected}
        {showCorrect}
        {showIncorrect}
        {revealCorrect}
        {answerState}
        disabled={answerState !== "idle" || isLoadingPictograph}
        onSelect={() => onAnswer(pattern)}
      />
    {/each}
  </div>

  {#if answerState !== "idle"}
    <Type1Feedback
      {answerState}
      letter={question.letter}
      correctInfo={PATTERN_INFO[question.pattern]}
    />
  {/if}
</div>

<style>
  .quiz-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    animation: fadeIn var(--duration-emphasis) ease;
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
  }

  .answer-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 400px;
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
