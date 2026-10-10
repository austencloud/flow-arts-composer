<!--
ModeQuizSection - Identify diamond vs box grid
-->
<script lang="ts">
  import LessonGridDisplay from "#lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";

  let {
    question,
    answerState,
    selectedAnswer,
    onAnswer,
  }: {
    question: { correctAnswer: string; id: number };
    answerState: "idle" | "correct" | "incorrect";
    selectedAnswer: string | null;
    onAnswer: (answer: "diamond" | "box") => void;
  } = $props();
</script>

<div class="quiz-section mode-quiz">
  <h3 class="quiz-title">Which grid is this?</h3>
  <p class="quiz-subtitle">Identify if this is a Diamond or Box grid</p>

  <div class="grid-display">
    <LessonGridDisplay
      type={question.correctAnswer as "diamond" | "box"}
      size="medium"
    />
  </div>

  <div class="answer-buttons">
    <button
      class="answer-btn"
      class:selected={selectedAnswer === "diamond"}
      class:correct={answerState === "correct" && selectedAnswer === "diamond"}
      class:incorrect={answerState === "incorrect" &&
        selectedAnswer === "diamond"}
      class:reveal-correct={answerState === "incorrect" &&
        question.correctAnswer === "diamond"}
      onclick={() => onAnswer("diamond")}
      disabled={answerState !== "idle"}
      aria-label="Select Diamond grid"
    >
      <i class="fa-solid fa-diamond" aria-hidden="true"></i>
      <span>Diamond</span>
      {#if answerState !== "idle" && selectedAnswer === "diamond"}
        <span class="result-icon">{answerState === "correct" ? "✓" : "✗"}</span>
      {/if}
    </button>

    <button
      class="answer-btn"
      class:selected={selectedAnswer === "box"}
      class:correct={answerState === "correct" && selectedAnswer === "box"}
      class:incorrect={answerState === "incorrect" && selectedAnswer === "box"}
      class:reveal-correct={answerState === "incorrect" &&
        question.correctAnswer === "box"}
      onclick={() => onAnswer("box")}
      disabled={answerState !== "idle"}
      aria-label="Select Box grid"
    >
      <i class="fa-solid fa-square" aria-hidden="true"></i>
      <span>Box</span>
      {#if answerState !== "idle" && selectedAnswer === "box"}
        <span class="result-icon">{answerState === "correct" ? "✓" : "✗"}</span>
      {/if}
    </button>
  </div>

  {#if answerState !== "idle"}
    <div
      class="feedback"
      class:correct={answerState === "correct"}
      class:incorrect={answerState === "incorrect"}
    >
      {#if answerState === "correct"}
        <span>Correct! That's the {question.correctAnswer} grid.</span>
      {:else}
        <span
          >Not quite! That was the <strong>{question.correctAnswer}</strong> grid.</span
        >
      {/if}
    </div>
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
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--theme-text);
    margin: 0;
    text-align: center;
  }

  .quiz-subtitle {
    font-size: 1rem;
    color: var(--theme-text-dim);
    margin: 0;
    text-align: center;
  }

  .grid-display {
    width: 100%;
    max-width: 280px;
    aspect-ratio: 1;
    padding: 1rem;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 2px solid var(--theme-stroke);
  }

  .answer-buttons {
    display: flex;
    gap: 1rem;
    width: 100%;
    max-width: 400px;
  }

  .answer-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem;
    min-height: 80px;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 12px;
    color: var(--theme-text);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    position: relative;
  }

  .answer-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent);
    transform: translateY(-2px);
  }

  .answer-btn:disabled {
    cursor: default;
  }

  .answer-btn i {
    font-size: 1.5rem;
    opacity: 0.8;
  }

  .answer-btn.correct {
    background: color-mix(in srgb, var(--semantic-success, #50c878) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #50c878) 60%, transparent);
    animation: correctPulse 0.5s ease;
  }

  @keyframes correctPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
    100% {
      transform: scale(1);
    }
  }

  .answer-btn.incorrect {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent);
    animation: shake var(--duration-dramatic) ease;
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  .answer-btn.reveal-correct {
    background: color-mix(in srgb, var(--semantic-success, #50c878) 15%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #50c878) 40%, transparent);
  }

  .result-icon {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .answer-btn.correct .result-icon {
    color: var(--semantic-success, #50c878);
  }

  .answer-btn.incorrect .result-icon {
    color: var(--semantic-error, #ef4444);
  }

  .feedback {
    padding: 0.875rem 1.25rem;
    border-radius: 10px;
    font-size: 0.9375rem;
    text-align: center;
    animation: slideUp var(--duration-emphasis) ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .feedback.correct {
    background: color-mix(in srgb, var(--semantic-success, #50c878) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-success, #50c878) 30%, transparent);
    color: var(--semantic-success, #50c878);
  }

  .feedback.incorrect {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    color: var(--semantic-warning, #f59e0b);
  }

  @media (max-width: 500px) {
    .quiz-title {
      font-size: 1.25rem;
    }

    .answer-buttons {
      flex-direction: column;
    }

    .grid-display {
      max-width: 240px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-section,
    .answer-btn,
    .feedback {
      animation: none;
      transition: none;
    }
  }
</style>
