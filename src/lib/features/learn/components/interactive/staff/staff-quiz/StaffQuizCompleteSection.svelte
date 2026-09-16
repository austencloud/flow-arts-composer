<!--
StaffQuizCompleteSection - Score display and completion actions
-->
<script lang="ts">
  let {
    score,
    totalQuestions,
    onRestart,
    onComplete,
  }: {
    score: number;
    totalQuestions: number;
    onRestart: () => void;
    onComplete: () => void;
  } = $props();

  const scorePercent = $derived((score / totalQuestions) * 100);

  const scoreEmoji = $derived(() => {
    if (scorePercent === 100) return "🏆";
    if (scorePercent >= 80) return "🌟";
    if (scorePercent >= 60) return "👍";
    return "📚";
  });

  const scoreMessage = $derived(() => {
    if (scorePercent === 100) return "Perfect! You're a Staff Master!";
    if (scorePercent >= 80) return "Excellent! Great understanding!";
    if (scorePercent >= 60) return "Good job! Keep practicing!";
    return "Keep learning! Review the lesson and try again.";
  });
</script>

<div class="quiz-section complete">
  <div class="complete-icon">{scoreEmoji()}</div>
  <h3 class="complete-title">Quiz Complete!</h3>
  <div class="score-display">
    <span class="score-value">{score}</span>
    <span class="score-separator">/</span>
    <span class="score-total">{totalQuestions}</span>
  </div>
  <p class="score-message">{scoreMessage()}</p>

  <div class="score-breakdown">
    <h4>Topics Covered</h4>
    <div class="topic-badges">
      <span class="topic-badge placement">
        <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
        Placements
      </span>
      <span class="topic-badge thumb">
        <i class="fa-solid fa-hand-point-up" aria-hidden="true"></i>
        Thumbs
      </span>
      <span class="topic-badge rotation">
        <i class="fa-solid fa-sync-alt" aria-hidden="true"></i>
        Rotations
      </span>
    </div>
  </div>

  <div class="complete-actions">
    <button class="action-btn secondary" onclick={onRestart}>
      <i class="fa-solid fa-rotate" aria-hidden="true"></i>
      Try Again
    </button>
    <button class="action-btn primary" onclick={onComplete}>
      <i class="fa-solid fa-check" aria-hidden="true"></i>
      Finish
    </button>
  </div>
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

  .complete {
    padding: 2rem 1rem;
  }

  .complete-icon {
    font-size: 4rem;
    line-height: 1;
    margin-bottom: 0.5rem;
  }

  .complete-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
    margin: 0;
  }

  .score-display {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    margin: 1rem 0;
  }

  .score-value {
    font-size: 3rem;
    font-weight: 800;
    color: var(--theme-accent, #22d3ee);
  }

  .score-separator {
    font-size: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .score-total {
    font-size: 1.5rem;
    color: var(--theme-text-dim);
  }

  .score-message {
    font-size: 1rem;
    color: var(--theme-text-dim);
    margin: 0 0 1rem;
    text-align: center;
  }

  .score-breakdown {
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    margin-bottom: 1rem;
    width: 100%;
    max-width: 352px;
  }

  .score-breakdown h4 {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    margin: 0 0 0.75rem;
    text-align: center;
  }

  .topic-badges {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .topic-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .topic-badge.placement {
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    color: var(--semantic-error);
  }

  .topic-badge.thumb {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 15%, transparent);
    color: var(--semantic-info);
  }

  .topic-badge.rotation {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .complete-actions {
    display: flex;
    gap: 1rem;
    width: 100%;
    max-width: 352px;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    min-height: var(--min-touch-target);
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .action-btn.secondary {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke-strong);
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  .action-btn.secondary:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .action-btn.primary {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent),
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    color: white;
  }

  .action-btn.primary:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent),
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent)
    );
    border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 60%, transparent);
    transform: translateY(-2px);
  }

  @media (max-width: 500px) {
    .complete-actions {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-section,
    .action-btn {
      animation: none;
      transition: none;
    }
  }
</style>
