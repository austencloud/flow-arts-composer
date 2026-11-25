<!--
  Hand Motions as a Guide web page, told in the lesson's order (Austen,
  2026-10-25: the written page is the lesson's script). The book's chart of
  the three motions first, then the motion map, then the six combinations.
  The page is the lesson too (Austen, 2026-10-27: no links out to a page
  with another background): the reader picks points on the map right here,
  two hands find the six, and the quiz is the last screen. These are the
  lesson's own stages; what the reader finds lasts while the page is open.
  Words, moves and examples come from the shared Hand Motions record the
  lesson also reads.
  Spec: docs/superpowers/specs/2026-10-25-hand-motions-script-page-design.md

  One screen at a time (2026-10-24 fit pass): the chart, the map, the
  combinations two, three or six to a screen by window size, then the two
  hands and the quiz. The figures grow with the window (--fit); the page
  never scrolls. The last screen says what comes next: the six combinations,
  a page each, how long each one is, and one button to begin (Austen,
  2026-11-23: the quiz ran straight into Dual-Shift's page "before they know
  what they're in for"). Finishing the quiz opens it. Read inside the lesson (no lesson id), the page leaves out
  the two hands, the quiz and that screen, which the lesson around it
  already plays.
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import HandMotionsMapStage from "#lib/features/learn/components/interactive/motions/HandMotionsMapStage.svelte";
  import HandPairsStage from "#lib/features/learn/components/interactive/motions/HandPairsStage.svelte";
  import HandMotionsQuizStage from "#lib/features/learn/components/interactive/motions/HandMotionsQuizStage.svelte";
  import type { HandPair } from "#lib/features/learn/components/interactive/motions/hand-pairs-round.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import HandMotionsChart from "#lib/shared/guide-topics/HandMotionsChart.svelte";
  import { CombinationPlayback } from "#lib/shared/guide-topics/combination-playback.svelte.js";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import {
    HAND_COMBINATIONS,
    type ComboHand,
    type HandCombinationId,
    handMotionsTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import TopicScreens from "./TopicScreens.svelte";
  import { combinationScreens } from "./combination-pages";
  import { dualShiftScreens } from "./dual-shift-screens";
  import { runFrame } from "./hand-type-switcher";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, frame, lessonId }: TopicPageProps = $props();

  /** What the reader has found on this visit, as the lesson keeps it. */
  let mapMoves = $state<Partial<Record<HandMove, ComboHand>>>({});
  let pairsFound = $state<Partial<Record<HandCombinationId, HandPair>>>({});
  let quizAnswered = $state<HandCombinationId[]>([]);
  /** A finished quiz starts over in a new order for a reader who comes
   *  back to it. */
  let quizRound = $state(0);

  function foundMove(made: ComboHand): void {
    if (!mapMoves[made.move]) mapMoves = { ...mapMoves, [made.move]: made };
  }
  function foundCombination(id: HandCombinationId, pair: HandPair): void {
    if (!pairsFound[id]) pairsFound = { ...pairsFound, [id]: pair };
  }
  function answeredQuiz(id: HandCombinationId): void {
    if (!quizAnswered.includes(id)) quizAnswered = [...quizAnswered, id];
  }
  function resetQuiz(): void {
    quizAnswered = [];
    quizRound += 1;
  }

  /**
   * The six examples play once when the board comes into view, left to
   * right. Each then holds its finished picture, the book's view; a hover
   * or tap replays it.
   */
  const playback = new CombinationPlayback();
  let board: HTMLDivElement | undefined = $state();

  // The board mounts when its screen opens; play it then.
  $effect(() => {
    if (board) return playback.playOnView(board);
  });

  // A large window shows all six combinations on one screen; a laptop or
  // landscape tablet three per screen; a phone two, so each picture and
  // its description stay readable.
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const perScreen = $derived(tier === "small" ? 2 : tier === "medium" ? 3 : 6);
  const groups = $derived(
    Array.from({ length: HAND_COMBINATIONS.length / perScreen }, (_, i) =>
      HAND_COMBINATIONS.slice(i * perScreen, (i + 1) * perScreen)
    )
  );
  /** Screens before the combinations: the chart and the map. */
  const LEAD_SCREENS = 2;
  /** The two hands and the quiz follow the combinations, outside the lesson. */
  const playScreens = $derived(lessonId !== null);
  const pairsScreen = $derived(LEAD_SCREENS + groups.length);
  const quizScreen = $derived(pairsScreen + 1);
  const nextScreen = $derived(quizScreen + 1);
  const pageFrame = $derived(runFrame(frame, (c) => t(c.name)));
  const labels = $derived([
    "Three moves",
    "The map",
    ...groups.map((g) =>
      g.length === HAND_COMBINATIONS.length
        ? "Combinations"
        : g.map((c) => t(c.name)).join(", ")
    ),
    ...(playScreens ? ["Two hands", "Quiz", "Up next"] : []),
  ]);
  /** Each card opens its combination's own page or screen. */
  const cellHref = (id: HandCombinationId) => {
    const combination = HAND_COMBINATIONS.find((c) => c.id === id);
    return combination ? localHref(combination.webHref) : null;
  };
  /** How many screens each combination takes in the run ahead. */
  const FIRST = HAND_COMBINATIONS[0]!;
  const screenCount = (id: HandCombinationId): number => {
    if (id === "dual-shift") return dualShiftScreens(String).views.length;
    const slug = HAND_COMBINATIONS.find((c) => c.id === id)!.guideSlug;
    return combinationScreens(slug, t).filter((s) => s.combination.id === id)
      .length;
  };
  const screensText = (id: HandCombinationId): string => {
    const count = screenCount(id);
    return count === 1
      ? t("guide_topic_run_screen")
      : t("guide_topic_run_screens", { count });
  };
  const ids = (g: (typeof HAND_COMBINATIONS)[number][]): HandCombinationId[] =>
    g.map((c) => c.id);
</script>

<TopicScreens
  title={handMotionsTopicText("title")}
  {kicker}
  lessonHref={null}
  frame={pageFrame}
  {labels}
>
  {#snippet screen(n, go)}
    <div class="hand-motions-topic">
      {#if n === 0}
        <p class="lede">{t("guide_topic_hand_motions_three")}</p>
        <section class="motions" aria-label={handMotionsTopicText("title")}>
          <div class="figure chart" class:dark={darkMode}>
            <HandMotionsChart {darkMode} printMode={!darkMode} />
          </div>
        </section>
      {:else if n === 1}
        <section class="stage" aria-labelledby="hand-map-heading">
          <h2 id="hand-map-heading">{handMotionsTopicText("mapPrompt")}</h2>
          <div class="figure play" class:dark={darkMode}>
            <!-- The Learn stages are stubbed out of the server build (feature
                 gate), so they render in the browser only, as on the
                 Dual-Shifts page. -->
            {#if browser}
              <HandMotionsMapStage found={mapMoves} onFind={foundMove} fitted />
            {/if}
          </div>
        </section>
      {:else if playScreens && n === pairsScreen}
        <section class="stage" aria-labelledby="hand-pairs-heading">
          <h2 id="hand-pairs-heading">{handMotionsTopicText("pairsPrompt")}</h2>
          <div class="figure play" class:dark={darkMode}>
            {#if browser}
              <HandPairsStage
                found={pairsFound}
                onFind={foundCombination}
                fitted
              />
            {/if}
          </div>
        </section>
      {:else if playScreens && n === quizScreen}
        <section class="stage" aria-labelledby="hand-quiz-heading">
          <h2 id="hand-quiz-heading">{t("learn_motion_quiz_prompt")}</h2>
          <div class="figure play" class:dark={darkMode}>
            {#if browser}
              {#key quizRound}
                <HandMotionsQuizStage
                  answered={quizAnswered}
                  onAnswer={answeredQuiz}
                  onFinish={() => {
                    go(nextScreen);
                    resetQuiz();
                  }}
                  fitted
                />
              {/key}
            {/if}
          </div>
        </section>
      {:else if playScreens && n === nextScreen}
        <section class="stage next" aria-labelledby="run-heading">
          <h2 id="run-heading">{t("guide_topic_run_heading")}</h2>
          <p class="lead">{t("guide_topic_run_line")}</p>
          <div class="board run" class:dark={darkMode} bind:this={board}>
            <HandCombinationBoard
              {darkMode}
              printMode={!darkMode}
              numbered
              captions={screensText}
              cellProgress={playback.cellProgress}
              onCellPlay={playback.replay}
              {cellHref}
              label={handMotionsTopicText("combinationsLead")}
            />
          </div>
          <p class="start">
            <PanelButton variant="primary" href={localHref(FIRST.webHref)}>
              <span>{t("guide_topic_run_start", { name: t(FIRST.name) })}</span>
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </PanelButton>
          </p>
        </section>
      {:else if groups[n - LEAD_SCREENS]}
        {@const group = groups[n - LEAD_SCREENS]!}
        <section class="combinations" aria-label={labels[n]}>
          {#if n === LEAD_SCREENS}
            <p id="hand-combinations-lead" class="lead">
              <Sentences text={handMotionsTopicText("combinationsLead")} />
            </p>
          {/if}
          <div
            class="board"
            class:dark={darkMode}
            class:all={group.length === HAND_COMBINATIONS.length}
            style:--per-row={group.length}
            bind:this={board}
          >
            <HandCombinationBoard
              only={ids([...group])}
              showDescriptions
              {darkMode}
              printMode={!darkMode}
              cellProgress={playback.cellProgress}
              onCellPlay={playback.replay}
              {cellHref}
              label={handMotionsTopicText("combinationsLead")}
            />
          </div>
        </section>
      {/if}
    </div>
  {/snippet}
</TopicScreens>

<style>
  .hand-motions-topic {
    display: grid;
    gap: clamp(1rem, 2.5cqw, 1.75rem);
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  /* Keep the guide's global .guide-content type rules out, as GridTopicPage
     does; :where keeps these below the class rules that follow. */
  .hand-motions-topic :global(:where(p, h2, li, span)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  /* Balanced lines: a centered sentence never ends on a stranded word. */
  .lede,
  .lead {
    margin: 0 auto;
    max-width: 44rem;
    text-align: center;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.55;
    text-wrap: balance;
  }
  /* The book's italic serif, as the topic header's lede was. */
  .hand-motions-topic .lede {
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
  }

  /* The chart and the map read the app's theme variables for their words,
     lines and grid chrome; point them at this page's ink in both themes. */
  .figure {
    --theme-text: var(--ink, #1a1a1a);
    --theme-text-dim: color-mix(in srgb, var(--ink, #1a1a1a) 75%, transparent);
    --theme-stroke: color-mix(in srgb, var(--ink, #1a1a1a) 22%, transparent);
    --theme-card-bg: transparent;
    --theme-panel-bg: transparent;
    --theme-accent: #647ff1;
  }
  .motions {
    width: 100%;
    margin: 0 auto;
  }
  /* The chart's boxes grow with the window (--fit), never past the share of
     the width its widest row (start, branch, two shift pictures) leaves
     them. The chart measures its own width: these cqw read it. */
  .chart {
    --chart-box: min(calc(7rem * var(--fit, 1)), (100cqw - 4rem) / 4.6);
    --chart-box-narrow: min(calc(4.5rem * var(--fit, 1)), 25cqw - 0.75rem);
  }

  /* The lesson's own stages, played on the page: the prompt above, the
     stage under it. The stages size themselves to the window, as they do
     in the lesson. */
  .stage {
    display: grid;
    gap: clamp(0.75rem, 2cqw, 1.5rem);
    justify-items: center;
    width: 100%;
  }
  .play {
    width: 100%;
    /* The map sizes to this page's fit box (its `fitted` prop reads
       --fit). The two hands and the quiz size to the window by the lesson's
       unit, which leaves room for the lesson's heading and buttons; the
       Guide's title, pills and prompt take a little more, so the unit gives
       that back, and their `fitted` prop lets the fit box shrink them past
       their floors where the window is too short (2026-11-03). */
    --lesson-vh: calc(1svh - 0.04rem);
  }
  /* The stage's prompt, one line where the width allows, as the lesson's
     prompt is: the stages need the height. */
  .hand-motions-topic .stage h2 {
    margin: 0;
    max-width: 60rem;
    text-align: center;
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 2cqw, 1.45rem);
    font-weight: 700;
    line-height: 1.2;
    text-wrap: balance;
  }

  .combinations {
    display: grid;
    gap: 1rem;
  }
  /* The board reads the app's theme variables; point them at this page's
     palette so its descriptions follow the Guide's light and dark ink. The
     board grows with the window (--fit); its cells share its width. */
  .board {
    --board-wide-columns: var(--per-row, 6);
    /* Never under 24rem, where the board drops to two columns: a narrower
       board would wrap into a taller one. */
    width: min(
      100%,
      max(24rem, calc(16rem * var(--fit, 1) * var(--per-row, 2)))
    );
    margin: 0 auto;
    --theme-text: var(--ink, #1a1a1a);
    --theme-text-dim: color-mix(in srgb, var(--ink, #1a1a1a) 75%, transparent);
    --theme-panel-bg: transparent;
  }
  /* All six in one row on a large window, which the board only does from
     56rem, so that is its floor there. */
  .board.all {
    width: min(100%, max(56rem, calc(8rem * 6 * var(--fit, 1))));
  }
  .board :global(.description) {
    color: var(--theme-text-dim);
  }
  /* Combination names in the book's serif, matching the move names. */
  .board :global(.name) {
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 2cqw, 1.4rem);
    font-weight: 700;
  }

  /* What comes next: the six in running order with their lengths, one row
     where the window has the width. */
  .hand-motions-topic .next h2 {
    font-size: clamp(1.4rem, 3cqw, 2.1rem);
  }
  .next {
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #e8590c;
  }
  .next .start {
    margin: 0;
  }
  .board.run {
    --board-wide-columns: 6;
    width: min(100%, max(19rem, calc(9rem * 6 * var(--fit, 1))));
  }
  /* A phone keeps two rows of three, so all six and the button stay on one
     screen. A short one drops the line and the button: the footer's Next
     already says Dual-Shift. */
  @media (max-width: 480px) {
    .next {
      gap: 0.6rem;
    }
    .next .lead {
      line-height: 1.35;
    }
    .board.run {
      width: 100%;
    }
    .board.run :global(.combination-board) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
    }
    .board.run :global(.cell) {
      padding: 0.3rem;
      gap: 0.3rem;
    }
    .board.run :global(.label) {
      gap: 0.2rem;
    }
    .board.run :global(.name) {
      font-size: 1rem;
    }
  }
  @media (max-width: 480px) and (max-height: 700px) {
    .next .lead,
    .next .start {
      display: none;
    }
    .hand-motions-topic .next h2 {
      font-size: 1.2rem;
    }
    .board.run :global(.art) {
      width: 5.5rem;
      margin-inline: auto;
    }
    .board.run :global(.cell) {
      padding-block: 0.2rem;
      gap: 0.15rem;
    }
    .board.run :global(.label) {
      gap: 0.1rem;
    }
  }
</style>
