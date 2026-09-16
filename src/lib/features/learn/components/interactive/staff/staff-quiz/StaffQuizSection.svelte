<!--
StaffQuizSection - Main quiz UI with visualizer and answers
-->
<script lang="ts">
  import StaffPlacementVisualizer from "../StaffPlacementVisualizer.svelte";
  import {
    type StaffQuizQuestion,
    type PlacementType,
    getAnswerInfo,
  } from "../../../../domain/constants/staff-quiz-questions";
  import StaffQuizTypeBadge from "./StaffQuizTypeBadge.svelte";
  import StaffQuizAnswerButton from "./StaffQuizAnswerButton.svelte";
  import StaffQuizFeedback from "./StaffQuizFeedback.svelte";

  let {
    question,
    answerState,
    selectedAnswer,
    onAnswer,
  }: {
    question: StaffQuizQuestion;
    answerState: "idle" | "correct" | "incorrect";
    selectedAnswer: string | null;
    onAnswer: (answer: string) => void;
  } = $props();
</script>

<div class="quiz-section">
  <StaffQuizTypeBadge type={question.type} />

  <h3 class="quiz-title">{question.questionText}</h3>

  <div class="visualizer-container">
    <StaffPlacementVisualizer
      leftPosition={question.leftPos}
      rightPosition={question.rightPos}
      leftThumbOrientation={question.leftThumb}
      rightThumbOrientation={question.rightThumb}
      showLabels={true}
      showRotationPath={question.showRotationPath || false}
      rotationType={question.rotationType || "none"}
      highlightType={answerState !== "idle" && question.type === "placement"
        ? (question.correctAnswer as PlacementType)
        : null}
    />
  </div>

  <div class="answer-buttons" class:two-col={question.options.length === 2}>
    {#each question.options as option}
      {@const info = getAnswerInfo(option)}
      {@const isSelected = selectedAnswer === option}
      {@const isCorrectAnswer = question.correctAnswer === option}
      {@const showCorrect = answerState === "correct" && isSelected}
      {@const showIncorrect = answerState === "incorrect" && isSelected}
      {@const revealCorrect = answerState === "incorrect" && isCorrectAnswer}

      <StaffQuizAnswerButton
        {option}
        {info}
        {isSelected}
        {showCorrect}
        {showIncorrect}
        {revealCorrect}
        {answerState}
        disabled={answerState !== "idle"}
        onSelect={() => onAnswer(option)}
      />
    {/each}
  </div>

  {#if answerState !== "idle"}
    <StaffQuizFeedback
      {answerState}
      correctAnswer={question.correctAnswer}
      correctInfo={getAnswerInfo(question.correctAnswer)}
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
    line-height: 1.4;
  }

  .visualizer-container {
    width: 100%;
    max-width: 320px;
  }

  .answer-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    width: 100%;
    max-width: 500px;
  }

  .answer-buttons.two-col {
    grid-template-columns: repeat(2, 1fr);
    max-width: 352px;
  }

  @media (max-width: 500px) {
    .quiz-title {
      font-size: 1.125rem;
    }

    .answer-buttons {
      grid-template-columns: 1fr;
    }

    .answer-buttons.two-col {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-section {
      animation: none;
    }
  }
</style>
