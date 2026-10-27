<!--
  Hand Motions as a Guide web page, on the topic template The Grid set
  (2026-10-10). Each move and each combination keeps its words on its own
  picture: the three moves stand side by side with their names and captions,
  then the six combinations follow on the shared board, each example with its
  name and description. Words, moves and examples come from the shared Hand
  Motions record the lesson also reads.

  One screen at a time (2026-10-24 fit pass): the three moves, then the six
  combinations they make. The pictures grow with the window (--fit).
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    HandSide,
    MotionType,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import { CombinationPlayback } from "#lib/shared/guide-topics/combination-playback.svelte.js";
  import { onMount } from "svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import {
    HAND_COMBINATIONS,
    type HandCombinationId,
    MOTION_MAP_HOME,
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    motionMapArrowData,
    motionMapTargets,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import GuidePictograph from "../_components/GuidePictograph.svelte";
  import TopicScreens from "./TopicScreens.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");

  /**
   * Austen's intro, split into sentences so the first can be the lede; the
   * words are unchanged. The combinations lead comes from the shared record.
   */
  const COPY = {
    three: "guide_topic_hand_motions_three",
    arrow: "guide_topic_hand_motions_arrow",
    hand: "guide_topic_hand_motions_hand",
  } as const satisfies Record<string, TranslationKey>;

  /** The book's motion boxes: the blue hand from its resting point. */
  const targets = motionMapTargets(MOTION_MAP_HOME);
  const staticData: PictographData = {
    id: "hand-motions-page-static",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.STATIC,
        startLocation: MOTION_MAP_HOME,
        endLocation: MOTION_MAP_HOME,
        hand: HandSide.LEFT,
        propType: PropType.HAND,
        gridMode: GridMode.DIAMOND,
      }),
    },
  } as PictographData;
  const MOVE_DATA: Record<HandMove, PictographData> = {
    shift: motionMapArrowData(MOTION_MAP_HOME, targets[0]!),
    dash: motionMapArrowData(MOTION_MAP_HOME, targets[2]!),
    static: staticData,
  };

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
  const labels = $derived([
    "Three moves",
    ...groups.map((g) =>
      g.length === HAND_COMBINATIONS.length
        ? "Combinations"
        : g.map((c) => t(c.name)).join(", ")
    ),
  ]);
  const ids = (g: (typeof HAND_COMBINATIONS)[number][]): HandCombinationId[] =>
    g.map((c) => c.id);
</script>

<TopicScreens
  title={handMotionsTopicText("title")}
  {kicker}
  {lessonHref}
  {frame}
  {labels}
>
  {#snippet screen(n)}
    <div class="hand-motions-topic">
      {#if n === 0}
        <div class="intro">
          <p class="lede">{t(COPY.three)}</p>
          <p><Sentences text={`${t(COPY.arrow)} ${t(COPY.hand)}`} /></p>
        </div>

        <div class="moves-wrap">
          <ul class="moves">
            {#each MOTION_MAP_MOVES as move (move.id)}
              <li class="move">
                <div class="pic">
                  <GuidePictograph
                    data={MOVE_DATA[move.id]}
                    size="lg"
                    eager
                    forceTheme={picTheme}
                    propType={PropType.HAND}
                    showTKA={false}
                  />
                </div>
                <h2>{handMotionsTopicText(move.name)}</h2>
                <p class="caption">{handMotionsTopicText(move.caption)}</p>
              </li>
            {/each}
          </ul>
        </div>
      {:else if groups[n - 1]}
        {@const group = groups[n - 1]!}
        <section class="combinations" aria-label={labels[n]}>
          {#if n === 1}
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
  .intro {
    display: grid;
    gap: clamp(0.5rem, 1.5vh, 0.9rem);
  }
  /* Balanced lines: a centered sentence never ends on a stranded word. */
  .intro p,
  .lead {
    margin: 0 auto;
    max-width: 44rem;
    text-align: center;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.55;
    text-wrap: balance;
  }
  /* The book's italic serif, as the topic header's lede was. */
  .intro .lede {
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
  }

  /* The three moves stay one row at every width, each name and caption
     under its own picture. Columns run wider than the pictures so a caption
     keeps to one line where there is room. */
  .moves-wrap {
    container-type: inline-size;
  }
  .moves {
    --gap: clamp(0.75rem, 3cqw, 2.5rem);
    --col: min(calc(14rem * var(--fit, 1)), (100cqw - 2 * var(--gap)) / 3);
    --pic: min(calc(10rem * var(--fit, 1)), var(--col));
    display: grid;
    grid-template-columns: repeat(3, var(--col));
    justify-content: center;
    gap: var(--gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .move {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.3rem;
    text-align: center;
  }
  .pic {
    width: var(--pic);
    margin-bottom: 0.35rem;
  }
  /* guide.css fixes each GuidePictograph size to a set width and height;
     here the column decides, so the three share one size. */
  .pic :global(.guide-pictograph .pictograph-wrapper) {
    width: 100%;
    height: auto;
    max-width: none;
    border-radius: 0.6rem;
    overflow: hidden;
  }
  /* Section headings in the book's serif, as on the reflow pages. */
  .hand-motions-topic .move h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.35rem, 3cqw, 2.1rem);
    font-weight: 700;
    line-height: 1.1;
  }
  .caption {
    margin: 0;
    font-size: clamp(0.85rem, 1.6cqw, 1rem);
    line-height: 1.4;
    text-wrap: balance;
  }

  .combinations {
    display: grid;
    gap: 1rem;
  }
  /* The board reads the app's theme variables; point them at this page's
     palette so its descriptions follow the Guide's light and dark ink. */
  /* The board grows with the window (--fit); its six cells share its
     width. */
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
  /* Each screen's cells sit in one row; all six in one row on a large window, which
     the board only does from 56rem, so that is its floor there. */
  .board.all {
    width: min(100%, max(56rem, calc(8rem * 6 * var(--fit, 1))));
  }
  .board :global(.description) {
    color: var(--theme-text-dim);
  }
  /* Combination names in the book's serif, matching the move names above. */
  .board :global(.name) {
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 2cqw, 1.4rem);
    font-weight: 700;
  }
</style>
