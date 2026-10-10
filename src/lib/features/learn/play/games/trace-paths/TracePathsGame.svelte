<!--
TracePathsGame — composes the trace round and talks to the arcade.

It does four things and delegates everything else:
  1. Resolves content for the challenge (a real sequence, or a generated hand path
     walk) and hands it to the converters. It never builds route geometry.
  2. Owns the state factory and publishes it on context.
  3. Reports each finished round to the engine via `submitRound`, already priced
     by `scoreTraceRound`.
  4. Offers the two access alternatives the design gates unlocks on — Tap Route
     and a step-through preview — both of which complete content and neither of
     which claims a trace score.

One live region, polite, for the whole game. Instructions and checkpoint results
share it so a screen reader hears a single running commentary instead of three
competing ones.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { generateSequenceMatchQuestion } from "../../../quiz/services/sequence-question-generator";
  import { QuizType } from "../../../quiz/domain/enums/quiz-enums";
  import { getArcadeSession } from "../../state/arcade-session-state.svelte";
  import type { QuestionConstraints } from "../../domain/arcade-types";
  import type {
    TraceConversionResult,
    TraceMetrics,
  } from "./domain/trace-types";
  import { sequenceToTraceRound } from "./services/sequence-to-trace";
  import {
    handPathToTraceRound,
    pairHandPathsToTraceRound,
  } from "./services/hand-path-to-trace";
  import {
    createTracePathsState,
    setTracePathsContext,
    type TraceRoundOutcome,
  } from "./state/trace-paths-state.svelte";
  import TraceStage from "./components/TraceStage.svelte";
  import TraceFeedback from "./components/TraceFeedback.svelte";
  import TraceSettings from "./components/TraceSettings.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();

  const showRoute = $derived(constraints.showRoute ?? true);
  const handCount = $derived(constraints.handCount ?? 1);
  const traceStepCount = $derived(constraints.traceStepCount ?? 1);

  let lastOutcome = $state<TraceRoundOutcome | null>(null);
  /**
   * The word behind the route, when the route came from a real sequence.
   * ALWAYS through the simplifier: a LOOP sequence repeats its word by
   * construction, and the player should read FΨ, never FΨFΨFΨFΨ. Generated
   * hand-path walks have no word, and null renders nothing rather than
   * inventing a name for them.
   */
  let roundWord = $state<string | null>(null);
  let showSettings = $state(false);
  let showStepThrough = $state(false);
  let isLoading = $state(true);

  const trace = createTracePathsState({
    toleranceScale: constraints.toleranceScale ?? 1,
    onRoundScored: reportRound,
  });
  setTracePathsContext(trace);

  // Content resolution

  /**
   * The four cardinal grid locations. This is the diamond grid the app defaults
   * to, and a route built from these points is the same geometry the hand-path
   * renderer draws — the converter samples it through `getPathPoints`, so
   * nothing here invents a coordinate.
   */
  const CARDINALS: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];

  function pick<T>(items: readonly T[], fallback: T): T {
    if (items.length === 0) return fallback;
    return items[Math.floor(Math.random() * items.length)] ?? fallback;
  }

  /**
   * A walk of `steps` hops around the grid, never repeating the location it is
   * standing on — a repeat would silently become a hold, and holds are asked
   * for explicitly, not stumbled into.
   */
  function walk(steps: number, from?: GridLocation): GridLocation[] {
    const locations: GridLocation[] = [
      from ?? pick(CARDINALS, GridLocation.NORTH),
    ];
    for (let i = 0; i < steps; i++) {
      const current = locations[locations.length - 1]!;
      const options = CARDINALS.filter((loc) => loc !== current);
      locations.push(pick(options, GridLocation.NORTH));
    }
    return locations;
  }

  /** A hand that stays put for the whole round: the same location, every beat. */
  function stay(steps: number, at: GridLocation): GridLocation[] {
    return Array.from({ length: steps + 1 }, () => at);
  }

  /**
   * Challenges with a `wordLength` trace a REAL sequence from the catalog, so the
   * top of the ladder is the actual choreography rather than a generated shape.
   * Everything below builds a hand-path walk of the requested length.
   */
  async function resolveRound(): Promise<TraceConversionResult> {
    if (constraints.wordLength !== undefined) {
      // We borrow the catalog generator purely as a source of real sequences.
      // `lessonType` is required by its signature and is only ever stamped on
      // the QuizQuestionData it returns for history and analytics — and we read
      // nothing from that object except `questionContent`, and persist none of
      // it. If a trace-shaped QuizType is ever added, swap it here.
      const question = await generateSequenceMatchQuestion(
        `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        {
          optionCount: 4,
          stepCount: traceStepCount,
          lessonType: QuizType.CARD_TO_MANDALA,
        }
      );
      const sequence = question.questionContent as SequenceData;
      roundWord = simplifyRepeatedWord(sequence.word);
      return sequenceToTraceRound(sequence);
    }

    // A generated walk is not a named sequence, so there is no word to show.
    roundWord = null;

    if (handCount < 2) {
      return handPathToTraceRound(
        createHandPath(walk(traceStepCount)),
        HandSide.LEFT
      );
    }

    const leftPath = walk(traceStepCount);
    // "Hold and Move": one hand anchors while the other travels. Red prefers a
    // point blue never occupies so the hands don't contend for the same place —
    // but a walk long enough to visit all four cardinals leaves no such point,
    // and in that case anywhere but blue's start is still a usable anchor.
    const untouched = CARDINALS.filter((loc) => !leftPath.includes(loc));
    const anchorOptions =
      untouched.length > 0
        ? untouched
        : CARDINALS.filter((loc) => loc !== leftPath[0]);
    const rightPath = constraints.requireHold
      ? stay(traceStepCount, pick(anchorOptions, GridLocation.SOUTH))
      : walk(traceStepCount);

    return pairHandPathsToTraceRound(
      createHandPath(leftPath),
      createHandPath(rightPath)
    );
  }

  async function loadNextRound(): Promise<void> {
    if (session.phase.name !== "playing") return;
    isLoading = true;
    lastOutcome = null;
    try {
      const result = await resolveRound();
      trace.loadRound(result);
    } catch {
      // A generator that can't produce content is an earned error, not a crash.
      // The retry below re-runs exactly this path and the rest of Learn is
      // untouched.
      trace.loadRound({
        ok: false,
        error: {
          code: "empty-round",
          message: "This route could not be built.",
        },
      });
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------

  /**
   * Hand the round to the engine. Points are already priced by
   * `scoreTraceRound`; the engine uses them verbatim and applies no speed bonus
   * and no streak multiplier to a performance round.
   *
   * An ASSISTED round reports correct with zero points. It completed the
   * content — the player walked the route, in order — and it deliberately does
   * not claim a trace score, because nothing about the line between the taps was
   * observed. Reporting it as a miss would let an access feature end a survival
   * run, which is the opposite of what it is for.
   */
  function reportRound(outcome: TraceRoundOutcome): void {
    lastOutcome = outcome;
    const metrics: TraceMetrics = outcome.metrics;

    session.submitRound<TraceMetrics>({
      kind: "performance",
      isCorrect: outcome.assisted || outcome.score.points > 0,
      points: outcome.score.points,
      elapsedMs: metrics.elapsedMs,
      metrics,
      // Aggregates and identifiers only. No sample arrays ever leave the state
      // module, so none can reach the engine or storage from here.
      questionData: {
        roundId: outcome.round.id,
        gridMode: outcome.round.gridMode,
        beatCount: outcome.round.beats.length,
        handCount: Object.keys(outcome.round.hands).length,
        assisted: outcome.assisted,
        coverage: metrics.coverage,
        accuracy: metrics.accuracy,
        continuity: metrics.continuity,
        synchrony: metrics.synchrony,
        divergenceReason: metrics.divergence?.reason ?? null,
        divergenceBeat: metrics.divergence?.beatIndex ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  onMount(() => {
    void loadNextRound();
  });

  onDestroy(() => trace.destroy());

  const phase = $derived(trace.phase);
</script>

<div class="trace-game">
  <!-- The one live region for this game. Polite: instructions and results are
       running commentary, not alerts. -->
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {trace.statusText}
    {trace.cue ?? ""}
  </div>

  {#if isLoading && phase.name === "loading"}
    <p class="stage-message">{tDynamic("learn_trace_building")}</p>
  {:else if phase.name === "error"}
    <section
      class="error-panel"
      aria-label={tDynamic("learn_trace_unavailable")}
    >
      <p class="error-message">{trace.statusText}</p>
      <p class="error-note">
        {tDynamic("learn_trace_error_note")}
      </p>
      <button
        type="button"
        class="action primary"
        onclick={() => void loadNextRound()}
      >
        {tDynamic("learn_trace_another_route")}
      </button>
    </section>
  {:else if phase.name === "feedback" && lastOutcome}
    <TraceFeedback
      metrics={phase.metrics}
      score={phase.score}
      assisted={lastOutcome.assisted}
      onNext={() => void loadNextRound()}
      onRetry={() => trace.retryRound()}
    />
  {:else}
    <TraceStage {showRoute} onExit={() => session.backToChallenges()} />

    {#if roundWord}
      <p class="round-word">{roundWord}</p>
    {/if}

    <!-- Visible mirror of the live region. Its own full-width row, so a
         sentence that grows has nothing beside it to shove. -->
    <p class="instruction">{trace.statusText}</p>

    <!-- The cue keeps its slot whether or not it has text, so an ignored third
         finger never nudges the layout. -->
    <p class="cue" class:visible={trace.cue !== null}>
      {trace.cue ?? " "}
    </p>

    {#if phase.name === "paused"}
      <div class="paused-row">
        <button
          type="button"
          class="action primary"
          onclick={() => trace.resume()}
        >
          {tDynamic("learn_trace_resume")}
        </button>
      </div>
    {/if}
  {/if}

  <div class="drawers">
    <button
      type="button"
      class="drawer-toggle"
      aria-expanded={showStepThrough}
      onclick={() => (showStepThrough = !showStepThrough)}
    >
      {tDynamic("learn_trace_step_through")}
    </button>
    <button
      type="button"
      class="drawer-toggle"
      aria-expanded={showSettings}
      onclick={() => (showSettings = !showSettings)}
    >
      {tDynamic("learn_trace_round_options")}
    </button>
  </div>

  {#if showStepThrough && trace.round}
    <!-- Step-through preview: keyboard, switch, mouse, and screen-reader users
         read each hand's path one beat at a time and can mark the route walked.
         It completes the content and claims no trace score. -->
    <section
      class="step-through"
      aria-label={tDynamic("learn_trace_step_through")}
    >
      <p class="step-text">{trace.previewText}</p>
      <div class="step-controls">
        <button
          type="button"
          class="action secondary"
          onclick={() => trace.stepPreview(-1)}
          disabled={trace.previewBeat === 0}
        >
          {tDynamic("learn_trace_previous_beat")}
        </button>
        <button
          type="button"
          class="action secondary"
          onclick={() => trace.stepPreview(1)}
          disabled={trace.previewBeat >= (trace.round?.beats.length ?? 1) - 1}
        >
          {tDynamic("learn_trace_next_beat")}
        </button>
        <button
          type="button"
          class="action primary"
          onclick={() => trace.completeStepThrough()}
        >
          {tDynamic("learn_trace_mark_walked")}
        </button>
      </div>
      <p class="step-note">
        {tDynamic("learn_trace_step_note")}
      </p>
    </section>
  {/if}

  {#if showSettings}
    <TraceSettings />
  {/if}
</div>

<style>
  .trace-game {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .stage-message {
    margin: auto;
    font-size: var(--font-size-base);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .round-word {
    margin: 0;
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .instruction {
    margin: 0;
    padding: 0 0.75rem;
    text-align: center;
    font-size: var(--font-size-base);
    font-weight: 600;
    line-height: 1.4;
    color: var(--theme-text, #fff);
  }

  /* Reserved slot: visibility, never display, so the row's height is constant
     whether or not a cue is showing. */
  .cue {
    margin: 0;
    padding: 0 0.75rem;
    text-align: center;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    visibility: hidden;
  }

  .cue.visible {
    visibility: visible;
  }

  .paused-row,
  .drawers {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-shrink: 0;
    padding: 0 0.75rem 0.5rem;
  }

  .error-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
    width: 100%;
    max-width: 42rem;
    margin: auto;
    padding: 1rem;
    box-sizing: border-box;
    border-radius: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .error-message {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .error-note {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .step-through {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
    padding: 0.875rem;
    box-sizing: border-box;
    border-radius: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .step-text {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--theme-text, #fff);
  }

  .step-note {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .step-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Every action here is a button. No standalone text links — if it is meant to
     be clicked, it looks clickable. */
  .action,
  .drawer-toggle {
    min-height: var(--min-touch-target);
    padding: 0 1rem;
    border-radius: 0.75rem;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  .action.secondary,
  .drawer-toggle {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    background: transparent;
    color: var(--theme-text, #fff);
  }

  .action.secondary:hover,
  .drawer-toggle:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .action.primary {
    border: 1px solid var(--game-accent, #818cf8);
    background: color-mix(
      in srgb,
      var(--game-accent, #818cf8) 24%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .action.primary:hover {
    background: color-mix(
      in srgb,
      var(--game-accent, #818cf8) 36%,
      transparent
    );
  }

  .action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action:focus-visible,
  .drawer-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #818cf8);
    outline-offset: 2px;
  }

  @media (min-width: 1680px) {
    .instruction {
      font-size: var(--font-size-lg);
    }

    .step-through,
    .error-panel {
      max-width: 56rem;
    }

    .action,
    .drawer-toggle {
      font-size: var(--font-size-base);
    }
  }
</style>
