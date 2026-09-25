<!--
ArcadeResults — end-of-challenge results screen for the Play arcade.

Rendered by PlayHub at phase "results". SIDE-EFFECT-FREE by contract: no
store writes, no confetti, no history persistence — PlayHub owns all of
that and passes the outcome in as props (isNewBest, updated progress).
This component is pure presentation plus session-method action callbacks.

Reveal choreography (collapses to instant under prefers-reduced-motion):
grade springs in → score counts up → earned stars pop 200ms apart with a
heavier 400ms beat on the last one → best line → stats → actions.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Spring } from "svelte/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";
  import { analyzeErrors } from "$lib/features/learn/services/gap-detector";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type {
    ArcadeSessionResult,
    GameProgress,
  } from "../domain/arcade-types";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import AnimatedScoreCounter from "./AnimatedScoreCounter.svelte";
  import QuizMisconceptionSummary from "./QuizMisconceptionSummary.svelte";

  let {
    result,
    progress,
    isNewBest,
    hasNextChallenge,
  }: {
    result: ArcadeSessionResult;
    progress: GameProgress;
    isNewBest: boolean;
    hasNextChallenge: boolean;
  } = $props();

  const session = getArcadeSession();

  // Game/challenge come from the session's results phase — the props carry the
  // outcome, the phase carries the definitions needed to replay/advance.
  const resultsCtx = $derived(
    session.phase.name === "results" ? session.phase : null
  );
  const accent = $derived(resultsCtx?.game.accentColor ?? "transparent");

  // Wrong answers → detected gaps (sync, no IO — see gap-detector docs).
  const gaps = $derived(
    analyzeErrors(
      session.records.filter((r) => !r.event.isCorrect).map((r) => r.event)
    )
  );

  const reduced = reducedMotion();

  const gradeScale = new Spring(reduced ? 1 : 0, {
    stiffness: 0.2,
    damping: 0.45,
  });
  let revealScore = $state(reduced);
  let revealBest = $state(reduced);
  let revealStats = $state(reduced);
  let revealExtras = $state(reduced);
  let starRevealed = $state([reduced, reduced, reduced]);

  let timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    if (reduced) return; // everything already visible, spring already at 1

    gradeScale.target = 1;

    const scoreAt = DURATION.dramatic;
    const starsAt = DURATION.dramatic * 2;

    // Earned stars pop DURATION.normal (200ms) apart; the gap before the
    // last earned star doubles (400ms) for a heavier landing beat.
    const starTimes: number[] = [];
    let t = starsAt;
    for (let i = 0; i < result.starsEarned; i++) {
      const isLast = i === result.starsEarned - 1;
      if (i > 0) t += isLast ? DURATION.normal * 2 : DURATION.normal;
      starTimes.push(t);
    }
    const starsEnd =
      starTimes.length > 0
        ? starTimes[starTimes.length - 1]! + DURATION.emphasis
        : starsAt;

    timers.push(setTimeout(() => (revealScore = true), scoreAt));
    starTimes.forEach((time, i) => {
      timers.push(setTimeout(() => (starRevealed[i] = true), time));
    });
    timers.push(
      setTimeout(() => (revealBest = true), starsEnd + DURATION.fast)
    );
    timers.push(
      setTimeout(
        () => (revealStats = true),
        starsEnd + DURATION.fast + DURATION.normal
      )
    );
    timers.push(
      setTimeout(
        () => (revealExtras = true),
        starsEnd + DURATION.fast + DURATION.normal * 2
      )
    );
  });

  onDestroy(() => {
    for (const timer of timers) clearTimeout(timer);
  });

  // --- Actions (session methods only — PlayHub wraps transitions) -------
  function handleReplay() {
    if (!resultsCtx) return;
    getHapticFeedback().trigger("selection");
    session.startChallenge(resultsCtx.game, resultsCtx.challenge);
  }

  function handleNext() {
    if (!resultsCtx) return;
    const next = resultsCtx.game.challenges.find(
      (l) => l.challengeNumber === resultsCtx.challenge.challengeNumber + 1
    );
    if (!next) return;
    getHapticFeedback().trigger("selection");
    session.startChallenge(resultsCtx.game, next);
  }

  function handleBack() {
    getHapticFeedback().trigger("selection");
    session.backToChallenges();
  }
</script>

<div class="results-shell">
  <div class="arcade-results" style="--game-accent: {accent}">
    <!-- 1. Grade: spring scale-in. Transform only — the hero box is fixed, zero layout shift. -->
    <div
      class="grade-hero"
      role="img"
      aria-label={t("learn_ui_grade_value", { grade: result.grade })}
    >
      <span
        class="grade-letter"
        style="transform: scale({gradeScale.current}); opacity: {Math.min(
          1,
          gradeScale.current
        )}"
      >
        {result.grade}
      </span>
    </div>

    <!-- 2. Score count-up -->
    <div class="score-block reveal" class:shown={revealScore}>
      <AnimatedScoreCounter
        value={result.score}
        delay={reduced ? 0 : DURATION.dramatic}
        duration={reduced ? 0 : DURATION.dramatic * 2}
      />
      <span class="score-label">{t("learn_ui_score")}</span>
    </div>

    <!-- 3. Stars -->
    <div
      class="stars-row"
      role="img"
      aria-label={t("learn_ui_stars_of", {
        current: result.starsEarned,
        total: 3,
      })}
    >
      {#each [0, 1, 2] as i (i)}
        {@const earned = i < result.starsEarned}
        <svg
          class="result-star"
          class:earned
          class:popped={starRevealed[i]}
          class:heavy={earned && i === result.starsEarned - 1}
          width="44"
          height="44"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 2l2.94 6.36 6.96.6-5.27 4.6 1.58 6.81L12 16.77l-6.21 3.6 1.58-6.81L2.1 8.96l6.96-.6L12 2z"
            fill={earned ? "currentColor" : "none"}
            stroke="currentColor"
            stroke-width={earned ? 0 : 1.5}
            stroke-linejoin="round"
          />
        </svg>
      {/each}
    </div>

    <!-- 4. Best delta (reserved height either way — no shift between states) -->
    <p
      class="best-line reveal"
      class:shown={revealBest}
      class:new-best={isNewBest}
    >
      {isNewBest
        ? t("learn_ui_new_best")
        : t("learn_ui_best_value", { score: progress.bestScore })}
    </p>

    <!-- 5. Stats -->
    <div class="stats-row reveal" class:shown={revealStats}>
      <div class="stat">
        <span class="stat-value">{Math.round(result.accuracyPercentage)}%</span>
        <span class="stat-label">{t("learn_ui_accuracy")}</span>
      </div>
      <div class="stat">
        <span class="stat-value">{result.longestStreak}</span>
        <span class="stat-label">{t("learn_ui_best_streak")}</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatTime(result.durationSeconds)}</span>
        <span class="stat-label">{t("learn_ui_time")}</span>
      </div>
    </div>

    <!-- 6 + 7. Misconceptions + actions -->
    <div class="extras reveal" class:shown={revealExtras}>
      {#if gaps.length > 0}
        <QuizMisconceptionSummary {gaps} />
      {/if}

      <div class="actions">
        <button
          type="button"
          class="action-button"
          class:primary={!hasNextChallenge}
          onclick={handleReplay}
        >
          {t("learn_ui_replay_challenge")}
        </button>
        {#if hasNextChallenge}
          <button
            type="button"
            class="action-button primary"
            onclick={handleNext}
          >
            {t("learn_ui_next_challenge")}
          </button>
        {/if}
        <button type="button" class="action-button ghost" onclick={handleBack}>
          {t("learn_ui_back_to_challenges")}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Scroll owner: fills whatever the mode panel gives it. On a tall/4K
     viewport where the results column is shorter than the box, the
     margin-block: auto on .arcade-results below absorbs the spare height and
     the whole column centers. On a short viewport where content already
     exceeds the box, the auto margins resolve to 0 and it scrolls exactly as
     before. */
  .results-shell {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .arcade-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md, 0.75rem);
    width: 100%;
    max-width: 480px;
    margin-inline: auto;
    margin-block: auto;
    padding: var(--spacing-lg, 1rem);
  }

  /* Grade hero — fixed box, letter animates via transform only */
  .grade-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    height: clamp(5rem, 16vw, 7rem);
  }

  .grade-letter {
    font-size: clamp(4rem, 13vw, 5.5rem);
    font-weight: 800;
    line-height: 1;
    color: var(--game-accent);
    text-shadow: 0 0 32px
      color-mix(in srgb, var(--game-accent) 45%, transparent);
    will-change: transform;
  }

  /* Reveal blocks: always laid out (reserved space), fade+drift in via
     opacity/transform only — nothing below them ever moves. */
  .reveal {
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity var(--duration-normal, 200ms) ease,
      transform var(--duration-normal, 200ms) ease;
  }

  .reveal.shown {
    opacity: 1;
    transform: none;
  }

  .score-block {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .score-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Stars */
  .stars-row {
    display: flex;
    gap: var(--spacing-sm, 0.5rem);
  }

  .result-star {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
  }

  .result-star.earned {
    color: var(--game-accent);
    filter: drop-shadow(
      0 0 8px color-mix(in srgb, var(--game-accent) 55%, transparent)
    );
    opacity: 0;
    transform: scale(0);
  }

  .result-star.earned.popped {
    opacity: 1;
    transform: scale(1);
    transition:
      transform var(--duration-emphasis, 280ms)
        cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity var(--duration-fast, 150ms) ease;
  }

  /* The last earned star lands heavier: longer pop, bigger overshoot */
  .result-star.earned.heavy.popped {
    transition:
      transform var(--duration-dramatic, 350ms) cubic-bezier(0.34, 1.9, 0.64, 1),
      opacity var(--duration-fast, 150ms) ease;
  }

  /* Best delta — reserved line height, both states same footprint */
  .best-line {
    margin: 0;
    min-height: 1.5rem;
    line-height: 1.5rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .best-line.new-best {
    color: var(--game-accent);
  }

  /* Stats */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-sm, 0.5rem);
    width: 100%;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: var(--spacing-sm, 0.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
  }

  .stat-value {
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #ffffff);
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Extras: misconceptions + actions */
  .extras {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 0.75rem);
    width: 100%;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 0.5rem);
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0 var(--spacing-lg, 1rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: filter var(--duration-fast, 150ms) ease;
  }

  .action-button:hover {
    filter: brightness(1.15);
  }

  .action-button:active {
    filter: brightness(0.9);
  }

  .action-button.primary {
    background: color-mix(in srgb, var(--game-accent) 22%, transparent);
    border-color: color-mix(in srgb, var(--game-accent) 55%, transparent);
  }

  .action-button.ghost {
    background: transparent;
    border-color: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* Composed-panel tier — the results column anchors against the starfield
     instead of floating on it, same treatment as ChallengePicker's game-detail
     panel. Austen's 4K monitor runs Windows display scaling, so this starts
     at 1024 rather than waiting for a 2560 gate that may never fire for him. */
  @media (min-width: 1024px) {
    .arcade-results {
      padding: clamp(2rem, 2.5vw, 3rem);
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      border-radius: 24px;
      box-shadow:
        0 32px 80px -32px
          color-mix(in srgb, var(--game-accent) 32%, transparent),
        0 2px 0 0 color-mix(in srgb, var(--game-accent) 12%, transparent) inset;
    }
  }

  /* Type/size growth tier — previously gated at 1920 (a threshold that may
     never fire once Windows display scaling divides his 4K panel down to a
     ~1920-2000 CSS viewport). Moved to 1200 with the clamp floors/vw rates
     rescaled so growth stays continuous rather than jumping straight to the
     old max the moment the tier activates. */
  @media (min-width: 1200px) {
    .arcade-results {
      max-width: clamp(560px, 42vw, 760px);
    }

    .grade-hero {
      height: clamp(5rem, 11vw, 9.5rem);
    }

    .grade-letter {
      font-size: clamp(4rem, 9vw, 8rem);
    }

    .stars-row {
      gap: var(--spacing-md, 0.75rem);
    }

    .result-star {
      width: clamp(40px, 3vw, 60px);
      height: clamp(40px, 3vw, 60px);
    }

    .best-line {
      font-size: var(--font-size-base, 1rem);
    }

    .stat {
      padding: var(--spacing-md, 0.75rem);
      border-radius: 14px;
    }

    .stat-value {
      font-size: clamp(
        var(--font-size-lg, 1.125rem),
        1.6vw,
        var(--font-size-2xl, 1.5rem)
      );
    }

    .stat-label {
      font-size: var(--font-size-sm, 0.875rem);
    }

    .action-button {
      min-height: 52px;
      padding: 0 var(--spacing-xl, 1.5rem);
      font-size: var(--font-size-base, 1rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reveal,
    .result-star,
    .action-button {
      transition: none;
    }

    .reveal {
      transform: none;
    }
  }
</style>
