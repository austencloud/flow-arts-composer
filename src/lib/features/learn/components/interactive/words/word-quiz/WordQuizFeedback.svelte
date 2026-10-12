<!--
WordQuizFeedback - Feedback display with explanation
-->
<script lang="ts">
  let {
    answerState,
    explanation,
  }: {
    answerState: "correct" | "incorrect";
    explanation: string;
  } = $props();
</script>

<div
  class="feedback"
  class:correct={answerState === "correct"}
  class:incorrect={answerState === "incorrect"}
>
  <div class="feedback-header">
    {#if answerState === "correct"}
      <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
      <span>Correct!</span>
    {:else}
      <i class="fa-solid fa-times-circle" aria-hidden="true"></i>
      <span>Not quite!</span>
    {/if}
  </div>
  <p class="explanation">{explanation}</p>
</div>

<style>
  .feedback {
    width: 100%;
    max-width: 500px;
    padding: 1rem 1.25rem;
    border-radius: 12px;
    animation: slideUp var(--duration-emphasis) var(--ease-standard);
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
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent);
  }

  .feedback.incorrect {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #fb923c) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #fb923c) 25%, transparent);
  }

  .feedback-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-weight: 700;
    font-size: 1rem;
  }

  .feedback.correct .feedback-header {
    color: var(--theme-accent, #22d3ee);
  }

  .feedback.incorrect .feedback-header {
    color: var(--semantic-warning, #fb923c);
  }

  .explanation {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  @media (prefers-reduced-motion: reduce) {
    .feedback {
      animation: none;
    }
  }
</style>
