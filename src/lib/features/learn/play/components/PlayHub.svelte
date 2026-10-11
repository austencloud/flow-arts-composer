<!--
  PlayHub — the Play arcade front door and the ONLY phase router.

  Owns the arcade session: creates the engine, wraps every user-driven phase
  change in the View Transitions API, and sets the (wrapped) session into
  context for ChallengePicker / GameShell / ArcadeResults. Engine-internal
  transitions (submitAnswer → complete) stay unwrapped — snapshotting the
  whole page on every answered question would make each answer stutter.

  Also owns ALL results-phase side effects, so ArcadeResults stays pure
  presentation: records the result to the progress store exactly once per
  completed session, persists the attempt to quiz history with the engine's
  REAL score (this replaces QuizTab's persistQuizAttempt), and fires confetti
  on a new best or a 3-star clear. The recording runs in $effect.pre so
  isNewBest is known before the results screen ever paints.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { browser } from "$app/env";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { GAME_REGISTRY } from "../domain/game-registry";
  import { emptyGameProgress } from "../domain/progression";
  import type {
    ArcadeSessionResult,
    GameDefinition,
    GameId,
    GameProgress,
  } from "../domain/arcade-types";
  import {
    createArcadeSession,
    setArcadeSessionContext,
    type ArcadeSession,
  } from "../state/arcade-session-state.svelte";
  import { withViewTransition } from "../state/view-transition";
  import { getPlayProgressStore } from "../get-play-progress-store";
  import { getEffectiveUserId } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getDelightOrchestrator } from "#lib/shared/delight/get-delight-orchestrator.js";
  import * as quizHistoryRecorder from "#lib/features/learn/services/quiz-history-recorder.js";
  import * as letterToConceptMapper from "#lib/features/learn/services/letter-to-concept-mapper.js";
  import GameCard from "./GameCard.svelte";
  import GameShell from "./GameShell.svelte";
  import ChallengePicker from "./ChallengePicker.svelte";
  import ArcadeResults from "./ArcadeResults.svelte";

  // Session: engine + view-transitioned navigation seam

  const engine = createArcadeSession();

  /* Children get THIS object from context. Navigation methods crossfade the
     screen via the View Transitions API (skipped automatically under reduced
     motion by the wrapper); everything else passes straight through. */
  const session: ArcadeSession = {
    get phase() {
      return engine.phase;
    },
    get score() {
      return engine.score;
    },
    get streak() {
      return engine.streak;
    },
    get longestStreak() {
      return engine.longestStreak;
    },
    get misses() {
      return engine.misses;
    },
    get records() {
      return engine.records;
    },
    get rounds() {
      return engine.rounds;
    },
    get questionIndex() {
      return engine.questionIndex;
    },
    get presentedQuestionIndex() {
      return engine.presentedQuestionIndex;
    },
    get timeRemaining() {
      return engine.timeRemaining;
    },
    get accuracy() {
      return engine.accuracy;
    },
    selectGame: (game) => withViewTransition(() => engine.selectGame(game)),
    startChallenge: (game, challenge) =>
      withViewTransition(() => engine.startChallenge(game, challenge)),
    quitToHub: () => withViewTransition(() => engine.quitToHub()),
    backToChallenges: () => withViewTransition(() => engine.backToChallenges()),
    markQuestionShown: engine.markQuestionShown,
    submitAnswer: engine.submitAnswer,
    /* Unwrapped, exactly like submitAnswer: wrapping a round submission in a
       View Transition would stutter the moment a player lifts their hands. */
    submitRound: engine.submitRound,
    complete: engine.complete,
    destroy: engine.destroy,
  };
  setArcadeSessionContext(session);

  onDestroy(() => engine.destroy());

  /* The hero line used to read "Six games." while the registry already held
     eight — copy that goes stale the moment anyone adds a game. Derived from
     the registry instead, spelled as a word because that is how the sentence
     reads out loud. Module-constant, so it is fixed at first paint and can't
     shift the layout. */
  // Progress reads (store is non-reactive; bump the version after writes)

  let progressVersion = $state(0);

  function gameProgress(id: GameId): GameProgress {
    void progressVersion; // template reads re-run when a result lands
    if (!browser) return emptyGameProgress();
    return getPlayProgressStore().getGameProgress(id);
  }

  /* Signed-in users get their Firestore-synced bests merged in; guests stay
     on localStorage (the store getter is browser-only, effects are too). */
  $effect(() => {
    const userId = getEffectiveUserId();
    if (!userId || userId === "anonymous") return;
    getPlayProgressStore()
      .initializeForUser(userId)
      .then(() => {
        progressVersion += 1;
      })
      .catch((err) => {
        console.warn("[PlayHub] Play progress sync failed:", err);
      });
  });

  // Results-phase side effects — exactly once per completed session

  let resultsOutcome = $state<{
    progress: GameProgress;
    isNewBest: boolean;
  } | null>(null);
  /* Identity guard, deliberately non-reactive: the engine builds a fresh
     result object per completed session, so reference equality is the
     "already recorded" check that survives effect re-runs. */
  let recordedResult: ArcadeSessionResult | null = null;

  /* $effect.pre runs before the DOM updates for the results phase, so the
     store write happens and isNewBest is real BEFORE ArcadeResults paints. */
  $effect.pre(() => {
    const phase = engine.phase;
    if (phase.name !== "results") return;
    if (recordedResult === phase.result) return;
    recordedResult = phase.result;

    const outcome = getPlayProgressStore().recordResult(phase.result);
    resultsOutcome = outcome;
    progressVersion += 1;

    persistPlayAttempt(phase.game, phase.result);

    if (outcome.isNewBest || phase.result.starsEarned === 3) {
      getDelightOrchestrator().celebrate("perfect-quiz");
    }
  });

  /* QuizTab's persistQuizAttempt, ported: same guest guard, same wrong-answer
     shape for gap detection — but score/counts/duration are the engine's real
     values instead of the old coin-flip session's. Fire-and-forget. */
  function persistPlayAttempt(
    game: GameDefinition,
    result: ArcadeSessionResult
  ) {
    const userId = getEffectiveUserId();
    if (!userId || userId === "anonymous") return;

    /* Quiz history is a QUIZ record. A performance game has no QuizType and no
       option list, so there is no attempt here to describe — persisting one
       wrote the literal string "undefined" into the user's quizHistory and let
       a hand-tracing run move their quiz mastery and trend. */
    if (!game.quizType) return;

    const conceptId =
      letterToConceptMapper.getConceptId("A") ?? String(game.quizType);

    const wrongAnswers = engine.records
      .filter((r) => !r.event.isCorrect)
      .map((r) => ({
        selectedContent: r.event.selectedContent,
        correctContent: r.event.correctContent,
        quizType: String(r.event.quizType),
        answeredAt: r.event.answeredAt.toISOString(),
      }));

    quizHistoryRecorder
      .recordAttempt(userId, {
        conceptId,
        quizType: String(game.quizType),
        score: result.accuracyPercentage,
        correctCount: result.correctCount,
        totalCount: result.totalCount,
        timeSpentSeconds: Math.round(result.durationSeconds),
        timestamp: result.completedAt,
        wrongAnswers: wrongAnswers.length > 0 ? wrongAnswers : undefined,
      })
      .catch((err) => {
        console.warn("[PlayHub] Failed to persist play attempt:", err);
      });
  }

  const hasNextChallenge = $derived.by(() => {
    if (engine.phase.name !== "results" || !resultsOutcome) return false;
    const { game, challenge } = engine.phase;
    return (
      challenge.challengeNumber < game.challenges.length &&
      resultsOutcome.progress.challengesUnlocked > challenge.challengeNumber
    );
  });

  // One shared IntersectionObserver pauses offscreen preview loops

  let pauseObserver: IntersectionObserver | null = null;

  /* Applied to each grid slot. content-visibility already skips offscreen
     PAINT, but CSS animations keep ticking — this stops the ticking too. */
  function pauseWhenOffscreen(node: HTMLElement) {
    pauseObserver ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.toggleAttribute("data-paused", !entry.isIntersecting);
      }
    });
    pauseObserver.observe(node);
    return {
      destroy() {
        pauseObserver?.unobserve(node);
      },
    };
  }

  onDestroy(() => {
    pauseObserver?.disconnect();
    pauseObserver = null;
  });
</script>

{#if session.phase.name === "hub"}
  <div class="play-hub themed-scrollbar">
    <div class="hub-content">
      <header class="hub-hero">
        <h2 class="hero-title">{t("learn_ui_play")}</h2>
        <p class="hero-sub">
          {t("learn_ui_play_intro", { count: GAME_REGISTRY.length })}
        </p>
      </header>

      <ul class="game-grid">
        {#each GAME_REGISTRY as game, index (game.id)}
          <li class="card-slot" use:pauseWhenOffscreen>
            <GameCard
              {game}
              progress={gameProgress(game.id)}
              {index}
              onSelect={() => session.selectGame(game)}
            />
          </li>
        {/each}
      </ul>
    </div>
  </div>
{:else if session.phase.name === "challenge-select"}
  <ChallengePicker
    game={session.phase.game}
    progress={gameProgress(session.phase.game.id)}
  />
{:else if session.phase.name === "playing"}
  <GameShell />
{:else if session.phase.name === "results" && resultsOutcome}
  <ArcadeResults
    result={session.phase.result}
    progress={resultsOutcome.progress}
    isNewBest={resultsOutcome.isNewBest}
    {hasNextChallenge}
  />
{/if}

<style>
  .play-hub {
    /* The hub is its own container so the grid answers to the space the
       Learn tab actually gives it, not the viewport. */
    container-type: inline-size;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: var(--spacing-md);
  }

  /* Hero + grid move as one unit. margin-block: auto is the flex
     "center only if there's spare room" trick: on a tall/4K viewport where
     the content is shorter than the scroll box, the auto margins absorb the
     extra space and the block centers vertically. On a short viewport where
     content already exceeds the box height, the auto margins resolve to 0
     and it behaves exactly as before (top-anchored, scrolls). */
  .hub-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    width: 100%;
    margin-block: auto;
  }

  .hub-hero {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-xs) 0;
  }

  .hero-title {
    margin: 0;
    font-size: var(--font-size-3xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--theme-text, #ffffff);
  }

  .hero-sub {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .game-grid {
    list-style: none;
    margin: 0 auto;
    padding: 0 0 var(--spacing-xl);
    max-width: 1280px;
    width: 100%;
    display: grid;
    /* Intrinsic auto-fit instead of hardcoded px breakpoints: the column
       count derives from how many ~208px cards actually fit the container,
       so foldables/tablets (whose CSS widths don't line up with laptop
       breakpoints) pack 3 columns without us guessing their exact width.
       min(100%, …) keeps a single card from overflowing a very narrow phone.
       Explicit overrides below still curate the count on large displays. */
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: var(--spacing-md);
  }

  /* Cap at 4 columns from 1024 up. Without this, a ~208px auto-fit min would
     pack 5–6 tiny cards on a mid-size laptop (1024–1279). 4×2 also keeps the
     whole 8-game arcade on one screen up here. */
  @container (min-width: 1024px) {
    .game-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* Large-display tier — the grid stays 3 columns; cards get more room to
     grow into instead of the hub capping out at 1280px on a 4K monitor.
     Gaps tighten and the trailing padding drops so hero + two full rows fit
     a ~1000px-tall desktop viewport without scrolling. */
  @container (min-width: 1600px) {
    .hub-hero,
    .game-grid {
      max-width: 1680px;
    }

    .game-grid {
      gap: clamp(14px, 1cqi, 22px);
      padding-bottom: var(--spacing-md);
    }

    .hub-content {
      gap: var(--spacing-md);
    }

    .hero-title {
      font-size: clamp(var(--font-size-3xl), 2cqi, 2.5rem);
    }
  }

  /* 4K-native tier — this is where "designed for 4K" actually shows up: the
     hub stops looking like a stretched 1600px layout and claims the extra
     real estate. cqi keeps the growth continuous from 2000 through 3840
     instead of jumping to another fixed px number. */
  @container (min-width: 2000px) {
    .hub-hero,
    .game-grid {
      /* 2000, not 2200: with 21/10 stages, three 650px cards + gaps is the
         density where all six machines and the hero share one screen. */
      max-width: 2000px;
    }

    .hero-title {
      font-size: clamp(2.5rem, 1.8cqi, 3.5rem);
    }

    .hero-sub {
      font-size: clamp(var(--font-size-base), 0.6cqi, 1.375rem);
    }
  }

  .card-slot {
    min-width: 0;
  }

  /* The shared observer marks offscreen slots; every preview keyframe under
     one freezes. animation-play-state doesn't touch transitions, so entrance
     and hover stay live. The inner part must be :global — the attribute is
     toggled at runtime, and Svelte prunes selectors it can't see in markup. */
  .game-grid :global(.card-slot[data-paused] *) {
    animation-play-state: paused;
  }
</style>
