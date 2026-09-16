<!--
SpeedRounds - Fast classification drill for placement type recognition.
A pictograph appears center screen, user classifies as Alpha/Beta/Gamma via tap or keyboard.
Builds automaticity through speed pressure and streak mechanics.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import PlacementVisualizer from './PlacementVisualizer.svelte';
  import StreakDisplay from './construction-quiz/StreakDisplay.svelte';
  import type { PlacementsExperienceStateManager } from './placement-experience-state.svelte';
  import type {
    PlacementType,
    PlacementQuestion,
  } from '../../../domain/constants/placement-quiz-data';
  import {
    ALPHA_PLACEMENTS,
    BETA_PLACEMENTS,
    GAMMA_PLACEMENTS,
  } from '../../../domain/constants/placement-quiz-data';
  import { GridMode } from '$lib/shared/pictograph/grid/domain/enums/grid-enums';
import { onDestroy } from 'svelte';

  // Props

  interface Props {
    experienceState: PlacementsExperienceStateManager;
    onComplete: () => void;
  }

  let { experienceState, onComplete }: Props = $props();

  const hapticService = getHapticFeedback();

  // Question Pool - Tiered by Difficulty

  /** Obvious placements: opposite cardinals (alpha), same cardinal (beta), adjacent cardinals (gamma). */
  const OBVIOUS_POOL: PlacementQuestion[] = [
    { left: 'N', right: 'S', gridMode: GridMode.DIAMOND, type: 'alpha' },
    { left: 'E', right: 'W', gridMode: GridMode.DIAMOND, type: 'alpha' },
    { left: 'N', right: 'N', gridMode: GridMode.DIAMOND, type: 'beta' },
    { left: 'S', right: 'S', gridMode: GridMode.DIAMOND, type: 'beta' },
    { left: 'N', right: 'E', gridMode: GridMode.DIAMOND, type: 'gamma' },
    { left: 'S', right: 'W', gridMode: GridMode.DIAMOND, type: 'gamma' },
  ];

  /** Mixed pool: diamond + box placements. */
  const MIXED_POOL: PlacementQuestion[] = [
    ...ALPHA_PLACEMENTS.map((p) => ({ ...p, type: 'alpha' as PlacementType })),
    ...BETA_PLACEMENTS.map((p) => ({ ...p, type: 'beta' as PlacementType })),
    ...GAMMA_PLACEMENTS.map((p) => ({ ...p, type: 'gamma' as PlacementType })),
  ];

  /** Full pool includes all placements (same as mixed for current data set). */
  const FULL_POOL: PlacementQuestion[] = MIXED_POOL;

  // Core State

  let totalAttempted = $state(0);
  let totalCorrect = $state(0);
  let streak = $state(0);
  let bestStreak = $state(0);
  let feedbackState = $state<'idle' | 'correct' | 'wrong'>('idle');
  let correctAnswer = $state<PlacementType>('alpha');
  let selectedAnswer = $state<PlacementType | null>(null);
  let timeRemaining = $state(100);
  let showSummary = $state(false);
  let currentQuestion = $state<PlacementQuestion>(pickQuestion());
  let questionKey = $state(0); // Forces re-render of visualizer on new question

  // Difficulty Derived from Streak

  const displayTimeMs = $derived.by(() => {
    if (streak < 5) return 3000;
    if (streak < 10) return 2000;
    return 1500;
  });

  const labelsVisible = $derived(streak < 10);

  function getPool(): PlacementQuestion[] {
    if (streak < 5) return OBVIOUS_POOL;
    if (streak < 10) return MIXED_POOL;
    return FULL_POOL;
  }

  // Question Generation

  function pickQuestion(): PlacementQuestion {
    const pool = getPool();
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx]!;
  }

  function nextQuestion() {
    const q = pickQuestion();
    currentQuestion = q;
    correctAnswer = q.type;
    selectedAnswer = null;
    feedbackState = 'idle';
    timeRemaining = 100;
    questionKey++;
    startTimer();
  }

  // Timer (requestAnimationFrame countdown)

  let timerRafId: number | null = null;
  let timerStartTime = 0;
  let timerDuration = 0;

  function startTimer() {
    cancelTimer();
    timerStartTime = performance.now();
    timerDuration = displayTimeMs;
    timerRafId = requestAnimationFrame(tickTimer);
  }

  function tickTimer(now: number) {
    const elapsed = now - timerStartTime;
    const remaining = Math.max(0, 1 - elapsed / timerDuration);
    timeRemaining = remaining * 100;

    if (remaining <= 0) {
      timerRafId = null;
      handleTimeout();
      return;
    }

    timerRafId = requestAnimationFrame(tickTimer);
  }

  function cancelTimer() {
    if (timerRafId !== null) {
      cancelAnimationFrame(timerRafId);
      timerRafId = null;
    }
  }

  // Answer Handling

  function handleAnswer(answer: PlacementType) {
    if (feedbackState !== 'idle') return;
    cancelTimer();
    selectedAnswer = answer;
    totalAttempted++;

    const isCorrect = answer === correctAnswer;
    experienceState.recordQuizAnswer(isCorrect);

    if (isCorrect) {
      feedbackState = 'correct';
      totalCorrect++;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
      hapticService?.trigger('success');

      // Fast transition to next question
      setTimeout(() => {
        if (!showSummary) nextQuestion();
      }, 300);
    } else {
      feedbackState = 'wrong';
      streak = 0;
      hapticService?.trigger('error');

      // Pause to show correct answer, then next
      setTimeout(() => {
        if (!showSummary) nextQuestion();
      }, 1200);
    }
  }

  function handleTimeout() {
    if (feedbackState !== 'idle') return;
    totalAttempted++;
    feedbackState = 'wrong';
    streak = 0;
    experienceState.recordQuizAnswer(false);
    hapticService?.trigger('error');

    setTimeout(() => {
      if (!showSummary) nextQuestion();
    }, 1200);
  }

  // Keyboard Input

  function handleKeydown(event: KeyboardEvent) {
    if (showSummary) return;

    const key = event.key.toLowerCase();
    if (key === 'a' || key === 'arrowleft') {
      event.preventDefault();
      handleAnswer('alpha');
    } else if (key === 'b' || key === 'arrowup') {
      event.preventDefault();
      handleAnswer('beta');
    } else if (key === 'g' || key === 'arrowright') {
      event.preventDefault();
      handleAnswer('gamma');
    }
  }

  // Done / Summary

  function handleDone() {
    cancelTimer();
    if (totalAttempted > 0) {
      showSummary = true;
    } else {
      onComplete();
    }
  }

  function handleDismissSummary() {
    showSummary = false;
    onComplete();
  }

  const accuracy = $derived(
    totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0
  );

  // Zone Feedback Classes

  function zoneClass(type: PlacementType): string {
    if (feedbackState === 'correct' && selectedAnswer === type) return 'zone-correct';
    if (feedbackState === 'wrong') {
      if (selectedAnswer === type) return 'zone-wrong';
      if (type === correctAnswer) return 'zone-highlight';
    }
    return '';
  }

  // Lifecycle

  // Start the first question timer
  startTimer();

  onDestroy(() => {
    cancelTimer();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="speed-rounds" role="application" aria-label="Speed classification drill">
  {#if showSummary}
    <!-- Summary overlay -->
    <div class="summary" role="dialog" aria-label="Speed rounds summary">
      <h2 class="summary-title">Speed Rounds Complete</h2>

      <div class="summary-stats">
        <div class="stat">
          <span class="stat-value">{totalAttempted}</span>
          <span class="stat-label">Attempted</span>
        </div>
        <div class="stat">
          <span class="stat-value">{accuracy}%</span>
          <span class="stat-label">Accuracy</span>
        </div>
        <div class="stat">
          <span class="stat-value">{bestStreak}</span>
          <span class="stat-label">Best Streak</span>
        </div>
      </div>

      <button class="done-button-primary" onclick={handleDismissSummary}>
        Continue
      </button>
    </div>
  {:else}
    <!-- Top zone: Beta -->
    <div class="top-zone">
      <button
        class="zone-button zone-beta {zoneClass('beta')}"
        onclick={() => handleAnswer('beta')}
        aria-label="Beta"
        disabled={feedbackState !== 'idle'}
      >
        <span class="zone-symbol">β</span>
        {#if labelsVisible}
          <span class="zone-label">Beta</span>
        {/if}
      </button>
    </div>

    <!-- Middle row: Alpha | Pictograph | Gamma -->
    <div class="middle-row">
      <button
        class="zone-button zone-alpha {zoneClass('alpha')}"
        onclick={() => handleAnswer('alpha')}
        aria-label="Alpha"
        disabled={feedbackState !== 'idle'}
      >
        <span class="zone-symbol">α</span>
        {#if labelsVisible}
          <span class="zone-label">Alpha</span>
        {/if}
      </button>

      <div class="pictograph-container">
        {#key questionKey}
          <PlacementVisualizer
            leftHand={currentQuestion.left}
            rightHand={currentQuestion.right}
            gridMode={currentQuestion.gridMode}
            showLetter={false}
          />
        {/key}

        <!-- Countdown bar -->
        <div class="countdown-track" aria-hidden="true">
          <div
            class="countdown-fill"
            class:countdown-urgent={timeRemaining < 30}
            style="width: {timeRemaining}%"
          ></div>
        </div>
      </div>

      <button
        class="zone-button zone-gamma {zoneClass('gamma')}"
        onclick={() => handleAnswer('gamma')}
        aria-label="Gamma"
        disabled={feedbackState !== 'idle'}
      >
        <span class="zone-symbol">γ</span>
        {#if labelsVisible}
          <span class="zone-label">Gamma</span>
        {/if}
      </button>
    </div>

    <!-- Streak + Done -->
    <div class="bottom-row">
      <StreakDisplay {streak} {bestStreak} />

      <button class="done-button" onclick={handleDone} aria-label="Finish speed rounds">
        Done
      </button>
    </div>
  {/if}
</div>

<style>
  .speed-rounds {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  }


  .top-zone {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .middle-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
  }

  .zone-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    min-width: 80px;
    padding: 0.75rem 1rem;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .zone-button:active:not(:disabled) {
    transform: scale(0.96);
  }

  .zone-button:disabled {
    cursor: default;
  }

  /* Type-specific accent borders */
  .zone-alpha {
    border-left: 4px solid #22d3ee;
  }

  .zone-beta {
    border-top: 4px solid #f59e0b;
  }

  .zone-gamma {
    border-right: 4px solid #a78bfa;
  }

  .zone-symbol {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .zone-label {
    font-size: var(--font-size-compact, 12px);
    margin-top: 0.25rem;
    opacity: 0.7;
    transition: opacity 0.3s ease;
  }

  /* Feedback states */
  .zone-correct {
    background: rgba(34, 197, 94, 0.25);
    border-color: #22c55e;
  }

  .zone-wrong {
    background: rgba(239, 68, 68, 0.25);
    border-color: #ef4444;
  }

  .zone-highlight {
    background: rgba(34, 197, 94, 0.15);
    border-color: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
  }


  .pictograph-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 200px;
    flex-shrink: 0;
  }


  .countdown-track {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
  }

  .countdown-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--theme-accent, #60a5fa);
    transition: background 0.3s ease;
  }

  .countdown-urgent {
    background: var(--semantic-error, #ef4444);
  }


  .bottom-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .done-button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .done-button:hover {
    color: var(--theme-text, #ffffff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }


  .summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    width: 100%;
  }

  .summary-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    margin: 0;
  }

  .summary-stats {
    display: flex;
    gap: 2rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-accent, #60a5fa);
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.5));
  }

  .done-button-primary {
    padding: 0.75rem 2rem;
    border: none;
    border-radius: 10px;
    background: var(--theme-accent, #60a5fa);
    color: #000;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .done-button-primary:hover {
    opacity: 0.9;
  }


  @media (prefers-reduced-motion: reduce) {
    .zone-button {
      transition: none;
    }

    .countdown-fill {
      transition: none;
    }

    .zone-label {
      transition: none;
    }

    .done-button {
      transition: none;
    }

    .done-button-primary {
      transition: none;
    }
  }
</style>
