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
  never scrolls. Read inside the lesson (no lesson id), the page leaves out
  the two hands and the quiz, which the lesson around it already plays.
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
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
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, frame, lessonId }: TopicPageProps = $props();

  /** What the reader has found on this visit, as the lesson keeps it. */
  let mapMoves = $state<Partial<Record<HandMove, ComboHand>>>({});
  let pairsFound = $state<Partial<Record<HandCombinationId, HandPair>>>({});
  let quizAnswered = $state<HandCombinationId[]>([]);
  /** The quiz stays up until its last answer has had its moment. */
  let quizOpen = $state(true);
  /** Each practice round is a new quiz, its six asked in a new order. */
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
  function practiceAgain(): void {
    quizAnswered = [];
    quizRound += 1;
    quizOpen = true;
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
  const labels = $derived([
    "Three moves",
    "The map",
    ...groups.map((g) =>
      g.length === HAND_COMBINATIONS.length
        ? "Combinations"
        : g.map((c) => t(c.name)).join(", ")
    ),
    ...(playScreens ? ["Two hands", "Quiz"] : []),
  ]);
  /** Each card opens its combination's own page or screen. */
  const cellHref = (id: HandCombinationId) => {
    const combination = HAND_COMBINATIONS.find((c) => c.id === id);
    return combination ? localHref(combination.webHref) : null;
  };
  const ids = (g: (typeof HAND_COMBINATIONS)[number][]): HandCombinationId[] =>
    g.map((c) => c.id);
</script>

<TopicScreens
  title={handMotionsTopicText("title")}
  {kicker}
  lessonHref={null}
  {frame}
  {labels}
>
  {#snippet screen(n)}
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
              <HandMotionsMapStage found={mapMoves} onFind={foundMove} />
            {/if}
          </div>
        </section>
      {:else if playScreens && n === pairsScreen}
        <section class="stage" aria-labelledby="hand-pairs-heading">
          <h2 id="hand-pairs-heading">{handMotionsTopicText("pairsPrompt")}</h2>
          <div class="figure play" class:dark={darkMode}>
            {#if browser}
              <HandPairsStage found={pairsFound} onFind={foundCombination} />
            {/if}
          </div>
        </section>
      {:else if playScreens && n === quizScreen}
        <section class="stage" aria-labelledby="hand-quiz-heading">
          <Crossfade key={quizOpen} duration={DURATION.emphasis} animateHeight>
            {#if quizOpen}
              <div class="stage">
                <h2 id="hand-quiz-heading">{t("learn_motion_quiz_prompt")}</h2>
                <div class="figure play" class:dark={darkMode}>
                  {#if browser}
                    {#key quizRound}
                      <HandMotionsQuizStage
                        answered={quizAnswered}
                        onAnswer={answeredQuiz}
                        onFinish={() => (quizOpen = false)}
                      />
                    {/key}
                  {/if}
                </div>
              </div>
            {:else}
              <div class="stage">
                <div class="board all" class:dark={darkMode} style:--per-row={6}>
                  <HandCombinationBoard
                    showDescriptions
                    {darkMode}
                    printMode={!darkMode}
                    {cellHref}
                    label={handMotionsTopicText("combinationsLead")}
                  />
                </div>
                <p class="again">
                  <PanelButton variant="secondary" onclick={practiceAgain}>
                    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                    <span>{t("learn_ui_practice_again")}</span>
                  </PanelButton>
                </p>
              </div>
            {/if}
          </Crossfade>
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
  /* The quiz and its finished board swap in one crossfade, which spans the
     screen so the board keeps its width. */
  .stage > :global(.crossfade) {
    justify-self: stretch;
  }
  .play {
    width: 100%;
    /* The stages size to the window by the lesson's unit, which leaves room
       for the lesson's heading and buttons. The Guide's title, pills and
       prompt take a little more, so the unit gives that back. */
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

  /* Practice again, centred under the finished board. */
  .again {
    display: flex;
    justify-content: center;
    margin: 0;
  }
</style>
