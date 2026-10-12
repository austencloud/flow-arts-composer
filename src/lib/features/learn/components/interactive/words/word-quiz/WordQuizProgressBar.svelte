<!--
WordQuizProgressBar - Progress indicator for word building quiz
-->
<script lang="ts">
  let {
    currentQuestion,
    totalQuestions,
    isComplete,
  }: {
    currentQuestion: number;
    totalQuestions: number;
    isComplete: boolean;
  } = $props();

  const progressPercent = $derived((currentQuestion / totalQuestions) * 100);
</script>

<div class="quiz-progress">
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progressPercent}%"></div>
  </div>
  <div class="progress-text">
    {#if !isComplete}
      Question {currentQuestion + 1} of {totalQuestions}
    {:else}
      Complete!
    {/if}
  </div>
</div>

<style>
  .quiz-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    height: 6px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--theme-accent, #a855f7),
      var(--theme-accent, #ec4899)
    );
    border-radius: 3px;
    transition: width var(--duration-emphasis) var(--ease-standard);
  }

  .progress-text {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }
  }
</style>
