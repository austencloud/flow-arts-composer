<!--
GameShell — the arcade chrome around a running game. Rendered by PlayHub
while session.phase.name === "playing".

Owns the top bar (back/quit, challenge label, question progress, score, streak
flame, countdown timer ring) and the crossfading question stage. Games are
dumb question renderers routed by phase.game.id below; each receives exactly
one prop (constraints) and talks to the engine via getArcadeSession().

Layout-shift discipline: the top bar is fixed-height; the question-progress
readout ghost-sizes to its widest value; score and timer use tabular-nums
with reserved width; the streak flame keeps its slot via visibility, never
display. Per-game accent is declared here as --game-accent (a local var —
never a --theme-* declaration) and consumed by descendants via var().

NOTE (deviation from the plan's "key = questionIndex" line): the engine
increments questionIndex synchronously inside submitAnswer() — at answer
click, before the feedback pause. Keying the stage on it would remount the
game mid-feedback, destroying the feedback banner, misconception hint, and
self-advance timer the plan's porting steps require keeping. The stage keys
on the playing-phase object instead: startChallenge() creates a fresh phase
object, so the crossfade fires on challenge entry and replay, never mid-question.
Question-to-question motion stays with the render kit's persistent-slot
animations, exactly as the legacy quizzes did.
-->
<script lang="ts">
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { formatTime } from "#lib/shared/sequence-viewer/utils/format-time.js";
  import { createSpring } from "#lib/shared/ui-animation/animations.svelte.js";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import { gameTitle, challengeTitle } from "../domain/play-labels";
  import { withViewTransition } from "../state/view-transition";
  import PictographToLetterGame from "../games/PictographToLetterGame.svelte";
  import LetterToPictographGame from "../games/LetterToPictographGame.svelte";
  import ValidNextGame from "../games/ValidNextGame.svelte";
  import PerformerWordGame from "../games/PerformerWordGame.svelte";
  import SpeedBlitzGame from "../games/SpeedBlitzGame.svelte";
  import MandalaMatchGame from "../games/MandalaMatchGame.svelte";
  import CardToMandalaGame from "../games/CardToMandalaGame.svelte";
  import MotionToMandalaGame from "../games/MotionToMandalaGame.svelte";
  import TracePathsGame from "../games/trace-paths/TracePathsGame.svelte";
  import WordBridgeGame from "../games/word-bridges/WordBridgeGame.svelte";

  const session = getArcadeSession();

  // Discriminated-union narrowing: everything below only renders when the
  // session is mid-challenge, and `playing` carries the game + challenge payload.
  const playing = $derived(
    session.phase.name === "playing" ? session.phase : null
  );

  /**
   * A game that asks for the full stage gets it: the shell keeps the bar's
   * height and its exits, and drops the question-progress readout and the
   * streak flourish that would otherwise compete with a surface the player is
   * drawing on.
   *
   * Read from the registry's `capabilities`, never from a game id. The moment
   * this becomes `id === "trace-paths"` it has to be repeated at every place
   * chrome is decided, and the next immersive game silently gets the wrong
   * shell.
   */
  const immersive = $derived(
    playing?.game.capabilities.immersiveStage === true
  );

  // Score display springs toward the engine's true score — the number the
  // player sees rolls up instead of snapping. "stiff" preset: fast, no
  // overshoot (a score that bounces past its value reads as a bug).
  const scoreSpring = createSpring(0, "stiff");
  $effect(() => {
    scoreSpring.target = session.score;
  });
  const displayedScore = $derived(Math.round(scoreSpring.current));

  // Fixed-mode question readout follows what is actually on screen. The deck
  // cursor advances when an answer is scored; the presentation cursor waits
  // until Continue has revealed the next question.
  const questionCount = $derived(
    playing?.challenge.mode.kind === "fixed"
      ? playing.challenge.mode.questionCount
      : 0
  );
  const questionNumber = $derived(
    questionCount > 0
      ? Math.min(session.presentedQuestionIndex + 1, questionCount)
      : 0
  );

  const maxMisses = $derived(
    playing?.challenge.mode.kind === "survival"
      ? playing.challenge.mode.maxMisses
      : 0
  );

  const countdownTotal = $derived(
    playing?.challenge.mode.kind === "countdown"
      ? playing.challenge.mode.seconds
      : 0
  );
  const timerPercent = $derived(
    countdownTotal > 0 ? (session.timeRemaining / countdownTotal) * 100 : 0
  );

  const streakLit = $derived(session.streak >= 3);

  let showQuitConfirm = $state(false);

  function handleBack() {
    // Mid-challenge with rounds on the board = confirm before throwing the run
    // away. An untouched challenge just goes back.
    //
    // `rounds`, not `records`: a performance game's traced rounds never appear
    // in the quiz-only `records` log, so reading that one would let a player
    // six traces into a run walk out with no confirmation at all.
    if (session.rounds.length > 0) {
      showQuitConfirm = true;
    } else {
      withViewTransition(() => session.backToChallenges());
    }
  }

  function confirmQuit() {
    withViewTransition(() => session.backToChallenges());
  }
</script>

{#if playing}
  <div class="game-shell" style="--game-accent: {playing.game.accentColor}">
    <header class="top-bar">
      <div class="top-bar-inner">
        <button
          type="button"
          class="back-button"
          onclick={handleBack}
          aria-label={t("learn_ui_back_to_challenges")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="challenge-label">
          <span class="game-title">{gameTitle(playing.game)}</span>
          <span class="challenge-title"
            >{challengeTitle(playing.challenge)}</span
          >
        </div>

        <!-- Immersive games keep the bar (and its exits) but drop the readouts
             that would compete with the stage. The bar's height is unchanged,
             so nothing below it moves. -->
        <div class="bar-status">
          {#if immersive}
            <!-- Intentionally empty: an immersive stage narrates its own
                 progress in its live region. -->
          {:else if playing.challenge.mode.kind === "fixed"}
            <!-- Ghost-sizer reserves the widest readout so 9→10 never shifts -->
            <span
              class="q-progress"
              aria-label={t("learn_ui_question_of", {
                current: questionNumber,
                total: questionCount,
              })}
            >
              <span class="q-sizer" aria-hidden="true"
                >{questionCount}/{questionCount}</span
              >
              <span class="q-live">{questionNumber}/{questionCount}</span>
            </span>
          {:else if playing.challenge.mode.kind === "survival"}
            <div
              class="miss-pips"
              role="img"
              aria-label={t("learn_ui_misses_of", {
                current: session.misses,
                total: maxMisses,
              })}
            >
              {#each Array(maxMisses) as _, i (i)}
                <span class="pip" class:missed={i < session.misses}></span>
              {/each}
            </div>
          {:else if playing.challenge.mode.kind === "countdown"}
            <div class="timer">
              <ProgressRing
                percent={timerPercent}
                size={32}
                strokeWidth={3}
                color="var(--game-accent)"
              />
              <span class="timer-text">{formatTime(session.timeRemaining)}</span
              >
            </div>
          {/if}
        </div>

        <!-- Streak flame: slot is always reserved; visibility flips at 3+.
             Immersive stages drop it entirely — a flourish appearing beside a
             surface someone is drawing on is a distraction, not a reward. -->
        <div
          class="streak"
          class:lit={streakLit && !immersive}
          aria-hidden={!streakLit || immersive}
        >
          <span class="flame" aria-hidden="true">🔥</span>
          <span class="streak-count">{session.streak}</span>
        </div>

        <div
          class="score"
          aria-label={t("learn_ui_score_value", { score: session.score })}
        >
          <span class="score-value">{displayedScore}</span>
        </div>
      </div>
    </header>

    <div class="stage">
      <Crossfade key={playing} fill>
        {#if playing.game.id === "pictograph-to-letter"}
          <PictographToLetterGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "letter-to-pictograph"}
          <LetterToPictographGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "valid-next"}
          <ValidNextGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "performer-word"}
          <PerformerWordGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "speed-blitz"}
          <SpeedBlitzGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "mandala-match"}
          <MandalaMatchGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "card-to-mandala"}
          <CardToMandalaGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "motion-to-mandala"}
          <MotionToMandalaGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "word-bridges"}
          <WordBridgeGame constraints={playing.challenge.constraints} />
        {:else if playing.game.id === "trace-paths"}
          <TracePathsGame constraints={playing.challenge.constraints} />
        {/if}
      </Crossfade>
    </div>

    <ConfirmDialog
      bind:isOpen={showQuitConfirm}
      title={t("learn_ui_leave_run_title")}
      message={t("learn_ui_leave_run_message")}
      confirmText={t("learn_ui_leave")}
      cancelText={t("learn_ui_keep_playing")}
      variant="warning"
      onConfirm={confirmQuit}
      onCancel={() => {}}
    />
  </div>
{/if}

<style>
  .game-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .top-bar {
    display: flex;
    justify-content: center;
    /* Fixed height: nothing inside may resize the bar */
    height: 56px;
    flex-shrink: 0;
    padding: 0 0.75rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  /* Large displays: the bar itself stays full-width (border spans edge to
     edge), but its contents center in a bounded row so score/timer don't
     end up meters apart on a 4K monitor. */
  .top-bar-inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 1800px;
  }

  .back-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .back-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
    transform: translateX(-2px);
  }

  .back-button:active {
    transform: translateX(-1px) scale(0.98);
  }

  .challenge-label {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }

  .game-title {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .challenge-title {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-status {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Ghost-sizer keeps the readout box at its widest value */
  .q-progress {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .q-sizer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .q-live {
    grid-area: 1 / 1;
    justify-self: end;
  }

  .miss-pips {
    display: flex;
    gap: 6px;
  }

  .pip {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke);
    transition: background var(--duration-fast) ease;
  }

  .pip.missed {
    background: var(--semantic-error);
    border-color: var(--semantic-error);
  }

  .timer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .timer-text {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    /* m:ss is 4 chars; reserve so 1:00 → 0:59 never wiggles */
    min-width: 4ch;
  }

  /* Streak flame — slot always reserved, visibility toggles (no shift) */
  .streak {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    visibility: hidden;
  }

  .streak.lit {
    visibility: visible;
  }

  .flame {
    font-size: 1rem;
    line-height: 1;
  }

  .streak-count {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--semantic-warning);
    /* Reserve two digits so 9 → 10 doesn't push the score */
    min-width: 2ch;
  }

  .score {
    flex-shrink: 0;
  }

  .score-value {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    font-size: var(--font-size-lg);
    color: var(--game-accent, var(--theme-accent));
    /* Reserve five digits; scores top out in the low thousands */
    min-width: 5ch;
    text-align: right;
  }

  .stage {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /* 4K-native tier — the bar is a per-viewport constant (never resizes
     mid-session, so this can't shift anything a running challenge depends on).
     Typography steps up one notch and the bar gains a little more height so
     it doesn't read as a thin phone strip stretched across a 3840px chrome. */
  @media (min-width: 2560px) {
    .top-bar {
      height: 72px;
    }

    .top-bar-inner {
      max-width: 2200px;
      gap: 1rem;
    }

    .game-title {
      font-size: var(--font-size-base);
    }

    .challenge-title {
      font-size: var(--font-size-sm);
    }

    .q-progress,
    .timer-text,
    .streak-count {
      font-size: var(--font-size-base);
    }

    .score-value {
      font-size: var(--font-size-2xl);
    }
  }
</style>
