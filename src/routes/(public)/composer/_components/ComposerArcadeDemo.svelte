<!--
  ComposerArcadeDemo

  One real arcade round, live on the marketing page: the pictograph-reading
  game from the Learn module's Play arcade, running on the real session
  engine (createArcadeSession — scoring, streaks, stars), the real question
  generator, and real rendered pictographs. Show, don't tell.

  Standalone recipe (no PlayHub shell): create a session, set it as context
  during init (the game components read it via getArcadeSession), and start
  level 1 of "pictograph-to-letter" (Type 1 letters, 10 questions). The
  session engine is side-effect free — no progress store writes, nothing
  persisted — so a marketing round never touches the visitor's app state.

  The stage has a FIXED height and the quiz scrolls internally if it ever
  overflows (QuizContainer is built for a sized parent), so play/results
  swaps never reflow the page (no-layout-shift). This whole stack is heavy
  (quiz services + pictograph rendering), so the page mounts it through
  LazyMount only when the section nears the viewport.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    createArcadeSession,
    setArcadeSessionContext,
  } from "#lib/features/learn/play/state/arcade-session-state.svelte.js";
  import { getGame } from "#lib/features/learn/play/domain/game-registry.js";
  import PictographToLetterGame from "#lib/features/learn/play/games/PictographToLetterGame.svelte";

  const session = createArcadeSession();
  setArcadeSessionContext(session);

  const game = getGame("pictograph-to-letter");
  const level = game?.levels[0];

  let round = $state(0);
  function start() {
    if (game && level) session.startLevel(game, level);
  }
  start();

  function playAgain() {
    round += 1;
    start();
  }

  onDestroy(() => session.destroy());

  const result = $derived(session.phase.name === "results" ? session.phase.result : null);
  const questionCount = $derived(
    level?.mode.kind === "fixed" ? level.mode.questionCount : 0
  );
</script>

<div class="arcade-demo">
  <!-- HUD is always one fixed line (tabular-nums), so score/streak updates
       never nudge the stage below. -->
  <div class="hud" aria-live="off">
    <span class="hud-cell">Score <strong>{session.score}</strong></span>
    <span class="hud-cell">Streak <strong>{session.streak}</strong></span>
    <span class="hud-cell">
      Question <strong>{Math.min(session.questionIndex + 1, questionCount)}/{questionCount}</strong>
    </span>
  </div>

  <div class="stage">
    {#if result}
      <div class="results">
        <span class="stars" aria-label="{result.starsEarned} of 3 stars">
          {#each [1, 2, 3] as star (star)}
            <i
              class="fas fa-star"
              class:earned={star <= result.starsEarned}
              aria-hidden="true"
            ></i>
          {/each}
        </span>
        <p class="score-line">{result.score} points</p>
        <p class="detail-line">
          {result.correctCount}/{result.totalCount} correct, best streak {result.longestStreak}
        </p>
        <div class="results-actions">
          <button type="button" class="play-again" onclick={playAgain}>
            <i class="fas fa-rotate-right" aria-hidden="true"></i>
            <span>Play again</span>
          </button>
          <a href="/learn" class="arcade-link" data-sveltekit-reload>
            <span>Open the arcade</span>
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </a>
        </div>
      </div>
    {:else}
      {#key round}
        <PictographToLetterGame constraints={level?.constraints ?? {}} />
      {/key}
    {/if}
  </div>
</div>

<style>
  .arcade-demo {
    max-width: 36rem;
    margin: 1.6rem auto 0;
  }

  .hud {
    display: flex;
    justify-content: center;
    gap: 1.6rem;
    margin-bottom: 0.7rem;
    font-size: 0.82rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: oklch(0.6 0.02 270);
    font-variant-numeric: tabular-nums;
  }
  .hud-cell strong {
    color: oklch(0.9 0.03 270);
    font-weight: 650;
  }

  /* Fixed-height stage: the quiz scrolls internally if it ever overflows, so
     question changes and the results swap never resize the box. */
  .stage {
    height: min(680px, 82vh);
    border-radius: 18px;
    overflow: hidden;
    background: oklch(0.16 0.018 270 / 0.45);
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
    display: grid;
  }

  .results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.5rem;
    text-align: center;
  }
  .stars {
    display: flex;
    gap: 0.6rem;
    font-size: 1.9rem;
    color: oklch(0.35 0.03 270);
  }
  .stars .earned {
    color: #fbbf24;
  }
  .score-line {
    margin: 0.4rem 0 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: oklch(0.94 0.02 270);
  }
  .detail-line {
    margin: 0;
    font-size: 0.92rem;
    color: oklch(0.65 0.02 270);
  }
  .results-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.8rem;
    margin-top: 1.4rem;
  }
  .play-again,
  .arcade-link {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 46px;
    padding: 0 1.4rem;
    font-size: 0.98rem;
    font-weight: 650;
    font-family: inherit;
    border-radius: 12px;
    cursor: pointer;
    text-decoration: none;
    transition:
      transform 160ms ease,
      background 160ms ease,
      border-color 160ms ease;
  }
  .play-again {
    color: #fff;
    border: none;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    box-shadow: 0 10px 26px oklch(0.6 0.15 70 / 0.3);
  }
  .arcade-link {
    color: oklch(0.9 0.015 270);
    background: oklch(0.3 0.04 270 / 0.18);
    border: 1px solid oklch(0.5 0.06 270 / 0.3);
  }
  .play-again:hover,
  .arcade-link:hover {
    transform: translateY(-2px);
  }
  .arcade-link:hover {
    background: oklch(0.34 0.05 270 / 0.26);
    border-color: oklch(0.6 0.08 270 / 0.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .play-again,
    .arcade-link {
      transition: none;
    }
    .play-again:hover,
    .arcade-link:hover {
      transform: none;
    }
  }
</style>
