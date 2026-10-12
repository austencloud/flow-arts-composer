<!--
QuizProgressBar - Progress indicator for grid quiz
-->
<script lang="ts">
  let {
    phase,
    currentQuestion,
    modeQuestionsCount,
    pointQuestionsCount,
  }: {
    phase: "mode" | "point" | "complete";
    currentQuestion: number;
    modeQuestionsCount: number;
    pointQuestionsCount: number;
  } = $props();

  const progressPercent = $derived(() => {
    const totalQuestions = modeQuestionsCount + pointQuestionsCount;
    const answered =
      phase === "mode" ? currentQuestion : modeQuestionsCount + currentQuestion;
    return (answered / totalQuestions) * 100;
  });

  const progressText = $derived(() => {
    if (phase === "mode") {
      return `Mode Quiz: ${currentQuestion + 1}/${modeQuestionsCount}`;
    } else if (phase === "point") {
      return `Point Quiz: ${currentQuestion + 1}/${pointQuestionsCount}`;
    }
    return "Complete!";
  });
</script>

<div class="quiz-progress">
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progressPercent()}%"></div>
  </div>
  <div class="progress-text">{progressText()}</div>
</div>

<style>
  .quiz-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    height: 6px;
    background: var(--theme-stroke, var(--theme-card-bg));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--theme-accent),
      var(--theme-accent-secondary, var(--theme-accent))
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
