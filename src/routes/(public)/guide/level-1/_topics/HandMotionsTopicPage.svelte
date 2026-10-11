<!--
  Hand Motions as a Guide web page, on the topic template The Grid set
  (2026-10-10). Each move and each combination keeps its words on its own
  picture: the three moves stand side by side with their names and captions,
  then the six combinations follow on the shared board, each example with its
  name and description. Words, moves and examples come from the shared Hand
  Motions record the lesson also reads.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    HandSide,
    MotionType,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import {
    MOTION_MAP_HOME,
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    motionMapArrowData,
    motionMapTargets,
    plainTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import GuidePictograph from "../_components/GuidePictograph.svelte";
  import TopicHeader from "./TopicHeader.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");

  /**
   * Austen's intro and combinations lead, split into sentences so the first
   * can be the lede; the words are unchanged. "We'll explore each one
   * individually:" is left off: the board shows each one right below.
   */
  const COPY = {
    three: "guide_topic_hand_motions_three",
    arrow: "guide_topic_hand_motions_arrow",
    hand: "guide_topic_hand_motions_hand",
    six: "guide_topic_hand_motions_six",
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
</script>

<article class="hand-motions-topic">
  <TopicHeader
    {kicker}
    title={handMotionsTopicText("title")}
    lede={t(COPY.three)}
  />

  <p class="intro">{t(COPY.arrow)} {t(COPY.hand)}</p>

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

  <section class="combinations" aria-labelledby="hand-combinations-lead">
    <p id="hand-combinations-lead" class="lead">{t(COPY.six)}</p>
    <div class="board" class:dark={darkMode}>
      <HandCombinationBoard
        showDescriptions
        label={plainTopicText("verified_level1_hand_motions_76")}
      />
    </div>
  </section>

  {#if lessonHref}
    <p class="lesson-link">
      <LinkChip href={lessonHref}
        ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        Learn this interactively</LinkChip
      >
    </p>
  {/if}
</article>

<style>
  .hand-motions-topic {
    max-width: 90rem;
    margin: 0 auto;
    padding: 1rem clamp(1rem, 4cqw, 2.5rem) 2rem;
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
  .intro,
  .lead {
    margin: 0 auto;
    max-width: 44rem;
    text-align: center;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.55;
    text-wrap: balance;
  }

  /* The three moves stay one row at every width, each name and caption
     under its own picture. Columns run wider than the pictures so a caption
     keeps to one line where there is room. */
  .moves-wrap {
    container-type: inline-size;
  }
  .moves {
    --gap: clamp(0.75rem, 3cqw, 2.5rem);
    --col: min(14rem, (100cqw - 2 * var(--gap)) / 3);
    --pic: min(10rem, var(--col));
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
  .board {
    width: 100%;
    max-width: 76rem;
    margin: 0 auto;
    --theme-text: var(--ink, #1a1a1a);
    --theme-text-dim: color-mix(in srgb, var(--ink, #1a1a1a) 75%, transparent);
    --theme-panel-bg: transparent;
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

  /* LinkChip reads the app's theme variables; point them at this page's
     palette, as the host does for its own title-band chip. */
  .lesson-link {
    margin: 0;
    justify-self: center;
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
</style>
