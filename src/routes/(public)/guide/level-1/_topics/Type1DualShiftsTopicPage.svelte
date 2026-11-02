<!--
  Type 1 Dual-Shifts as a Guide web page, on the topic template The Grid set
  (2026-10-10). One screen per mode, in the record's order, the same on
  every window (2026-10-26). Each mode's card plays the mode as a moving
  animation over its start box and four-count loop, the count that is
  playing ringed (2026-10-27), in its element's colour, with a link to that
  mode's Timing and Direction guide. The Gamma page's switching sequence
  left the web page on 2026-10-31 for a later sequencing page (the print
  sheet keeps it).

  The page opens the hand combinations' run: the switcher of all six under
  the kicker, then one group of two columns (2026-11-01, Austen's review: a
  title and a pill row stacked under the switcher read as "a text sandwich
  with chips as the bun", and a tall window left the words column mostly
  empty). The text column is the same on every screen: the title
  "Dual-Shift" in its two colours, Austen's definition, the line on the six
  modes with the link to the Timing and Direction page (which keys the six
  modes; the guide does not draw the key again, 2026-10-28), then the six
  modes as tiles in two columns of three (ScreenList; Austen, 2026-11-02):
  each tile the mode's element, its name and its start and end positions,
  the tiles filling the column down to the card's foot, the current one
  tinted with its element's colour.

  Switching a mode changes only the card (Austen, same day): its inner
  content crossfades and the list's tint moves; the title, words, link and
  list hold still. The mode's line on where it travels sits in the card,
  under its name; Split-Opp's line names both Opp modes, so Tog-Opp's card
  carries the practice line that closes the Split and Together modes. The
  card grows with the window (--fit) to its picture's bound and the group
  stands centred in the body; the title, words and link are centred in
  their column and the tiles fill it, each tile's content centred.
  The card's start box says "Start" and joins the four counts as one strip
  with hairline seams, like the other combination pages' cards.
  Quarter-Same's sun yellow is a gold on this page only (Austen read the
  full yellow as hard to look at). On a narrow
  window the column stands over the card, the list folds into one row of
  pills right above it, and the card's loop stays one row so the card ends
  above the footer.
-->
<script lang="ts">
  import { browser } from "$app/env";
  import Sentences from "../../_components/Sentences.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import HandMotionPlayer from "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import {
    TIMING_DIRECTION_MODES,
    type TimingDirectionModeId,
  } from "#lib/features/learn/components/interactive/foundations/pictograph-foundation-content.js";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    DUAL_SHIFT_MODE_GUIDES,
    DUAL_SHIFT_MODES,
    DUAL_SHIFTS_WEB_COPY,
    dualShiftElement,
    dualShiftSteps,
    dualShiftsTopicHtml,
    dualShiftsTopicLines,
    plainLine,
    type DualShiftMode,
    type DualShiftModeId,
  } from "#lib/shared/guide-topics/dual-shifts-topic.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { getElementImagePath } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { HAND_COMBINATIONS } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import TopicScreens from "./TopicScreens.svelte";
  import HandTypeSwitcher from "./HandTypeSwitcher.svelte";
  import CombinationName from "./CombinationName.svelte";
  import ScreenList, { type ScreenListItem } from "./ScreenList.svelte";
  import { dualShiftScreens } from "./dual-shift-screens";
  import {
    navCombination,
    runFrame,
    type RunNavTarget,
  } from "./hand-type-switcher";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  /** The page's combination in the run: its name is the title. */
  const DUAL_SHIFT = HAND_COMBINATIONS.find((c) => c.id === "dual-shift")!;
  const pageFrame = $derived(runFrame(frame, (c) => t(c.name)));

  /** Austen's definition opens the page as its lede. */
  const lede = plainLine(dualShiftsTopicLines("intro")[0] ?? "");
  /** A mode's line in its card: where it travels, or how it moves.
   *  Split-Opp's line names both Opp modes, so Tog-Opp has none. */
  const MODE_LEADS: Partial<Record<DualShiftModeId, TranslationKey>> = {
    "split-same": DUAL_SHIFTS_WEB_COPY.sameLeadSplit,
    "tog-same": DUAL_SHIFTS_WEB_COPY.sameLeadTog,
    "split-opp": DUAL_SHIFTS_WEB_COPY.oppLead,
    "quarter-opp": DUAL_SHIFTS_WEB_COPY.quarterOppLead,
    "quarter-same": DUAL_SHIFTS_WEB_COPY.quarterSameLead,
  };
  /** The practice line closes the Split and Together modes, in the card of
   *  the last of them. */
  const PRACTICE_AFTER: DualShiftModeId = "tog-opp";

  /** A mode's colour on this page: its element's, with the sun's yellow
   *  turned gold (Quarter-Same). The shared element colours stay as they
   *  are everywhere else. */
  const PAGE_GOLD = "#e3b341";
  const modeColor = (mode: DualShiftMode) =>
    mode.id === "quarter-same" ? PAGE_GOLD : dualShiftElement(mode).accentColor;

  /** Each mode's animation: the Timing and Direction guides' sequence for
   *  the same hand path (the two records author the same five rows). */
  const PLAYER_MODE: Record<DualShiftModeId, TimingDirectionModeId> = {
    "split-same": "ss",
    "tog-same": "ts",
    "split-opp": "so",
    "tog-opp": "to",
    "quarter-opp": "qo",
    "quarter-same": "qs",
  };
  const playerSequence = (id: DualShiftModeId) =>
    TIMING_DIRECTION_MODES.find((m) => m.id === PLAYER_MODE[id])!.sequence;
  /** The beat a mode's animation is on: 0 while the start shows, then 1
   *  to 4. Kept with its mode, so a new screen never rings the last one's. */
  let playing = $state<{ id: DualShiftModeId; beat: number } | null>(null);
  const isPlaying = (mode: DualShiftMode | null, beat: number) =>
    mode !== null && playing?.id === mode.id && playing.beat === beat;

  /** Each mode's loop: its start box and four counts. */
  type Loop = {
    id: DualShiftModeId;
    mode: DualShiftMode;
    start: StepData;
    counts: StepData[];
  };
  const loopOf = (mode: DualShiftMode): Loop => {
    const [start, ...counts] = dualShiftSteps(mode);
    return { id: mode.id, mode, start: start!, counts };
  };
  const LOOP_BY_ID = new Map(
    DUAL_SHIFT_MODES.map((mode) => [mode.id, loopOf(mode)])
  );

  // One screen per mode (dual-shift-screens.ts).
  const screens = $derived(
    dualShiftScreens((id) => t(LOOP_BY_ID.get(id)!.mode.name))
  );
  /** Each mode's row wears its element: its icon, its start and end
   *  positions, and the current row's tint. */
  const listItems = $derived<ScreenListItem[]>(
    screens.views.map((view, n) => {
      const mode = LOOP_BY_ID.get(view.mode)!.mode;
      return {
        label: screens.labels[n] ?? "",
        icon: getElementImagePath(dualShiftElement(mode).element),
        tail: mode.travel,
        color: modeColor(mode),
      };
    })
  );

  /** A line's breaks are the print layout's; in the card they read as
   *  spaces. */
  const unbroken = (html: string) => html.replace(/\s*<br\s*\/?>\s*/gi, " ");
</script>

{#snippet pictograph(step: StepData, isStart: boolean)}
  <PictographContainer
    pictographData={step}
    gridMode={GridMode.DIAMOND}
    leftPropTypeOverride={PropType.HAND}
    rightPropTypeOverride={PropType.HAND}
    showTKA={false}
    showPlacements={!isStart}
    showElemental={!isStart}
    showReversals={false}
    showTnD={false}
    showNonRadialPoints={false}
    stepNumberOverride={true}
    {darkMode}
    printMode={!darkMode}
  />
{/snippet}

<!-- A mode's line, as its card shows it. -->
{#snippet modeLine(id: DualShiftModeId)}
  {@const lead = MODE_LEADS[id]}
  {#if lead}<Sentences
      text={t(lead)}
    />{:else if id === PRACTICE_AFTER}<Sentences
      html={unbroken(dualShiftsTopicHtml("practice"))}
    />{/if}
{/snippet}

<!-- A card: the mode's name and the link to its guide, its line, then its
     animation over its start box and counts, in its element's colours. The
     card stays put across modes; its inside crossfades. -->
{#snippet card(loop: Loop, labelledBy: string)}
  <div
    class="mode"
    style:--el={modeColor(loop.mode)}
    style:--el-deep={dualShiftElement(loop.mode).darkComplement}
    aria-labelledby={labelledBy}
  >
    <Crossfade key={loop.id} duration={DURATION.emphasis}>
      {@render cardInside(loop, labelledBy)}
    </Crossfade>
  </div>
{/snippet}

{#snippet cardInside(loop: Loop, labelledBy: string)}
  {@const { mode, start, counts } = loop}
  <div class="mode-inside">
    <div class="mode-head">
      <h2 class="mode-name" id={labelledBy}>
        <img
          class="element"
          src={getElementImagePath(dualShiftElement(mode).element)}
          alt=""
        />
        {t(mode.name)}
      </h2>
      <span class="mode-link">
        <LinkChip size="md" href={DUAL_SHIFT_MODE_GUIDES[mode.id]}
          >{t(DUAL_SHIFTS_WEB_COPY.openModeGuide, {
            mode: t(mode.name),
          })}</LinkChip
        >
      </span>
    </div>
    <!-- Every mode's line in one cell, this mode's shown, so the card is
         the same height on every mode. -->
    <div class="mode-lines">
      {#each DUAL_SHIFT_MODES as other (other.id)}
        <p
          class="mode-line"
          class:shown={other.id === mode.id}
          aria-hidden={other.id === mode.id ? undefined : "true"}
        >
          {@render modeLine(other.id)}
        </p>
      {/each}
    </div>
    <div class="player">
      {#if browser}
        <HandMotionPlayer
          primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
          sequence={playerSequence(mode.id)}
          ariaLabel={t(mode.name)}
          showElementalGlyph
          onStepChange={(step) =>
            (playing = {
              id: mode.id,
              beat: step < 1 ? 0 : Math.floor(step),
            })}
        />
      {/if}
    </div>
    <div class="loop">
      <div class="cell" class:guide-step-active={isPlaying(mode, 0)}>
        {@render pictograph(start, true)}
      </div>
      {#each counts as step, n (step.id)}
        <div class="cell" class:guide-step-active={isPlaying(mode, n + 1)}>
          {@render pictograph(step, false)}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet switcher()}
  <HandTypeSwitcher current="dual-shift" {darkMode} />
{/snippet}

<!-- The mode screens keep their plain names; a page of the run is named by
     its combination, in its colours. -->
{#snippet navName(target: RunNavTarget)}
  {@const combination = navCombination(target, () => null)}
  {#if combination}<CombinationName
      {combination}
      {darkMode}
    />{:else}{target.text.replaceAll("-", "\u2011")}{/if}
{/snippet}

<TopicScreens
  title={t(DUAL_SHIFT.name)}
  {kicker}
  {lessonHref}
  frame={pageFrame}
  labels={screens.labels}
  steadyHead
  bodyHead
  beforeTitle={switcher}
  navLabel={navName}
>
  {#snippet screen(n, go)}
    {@const view = screens.views[n]}
    <div class="dual-shifts-topic" class:dark={darkMode}>
      {#if view}
        {@const loop = LOOP_BY_ID.get(view.mode)!}
        <section class="set">
          <div class="column">
            <p class="column-title" aria-hidden="true">
              <CombinationName combination={DUAL_SHIFT} {darkMode} />
            </p>
            <p class="lede">{lede}</p>
            <div class="modes-row">
              <p class="lead modes-line">
                {t("guide_topic_dual_shifts_modes_line")}
              </p>
              <span class="all-modes-link">
                <LinkChip size="md" href="/timing-and-direction"
                  >{t(DUAL_SHIFTS_WEB_COPY.allModesLink)}</LinkChip
                >
              </span>
            </div>
            <ScreenList items={listItems} current={n} {go} />
          </div>
          <div class="figure">
            {@render card(loop, `dual-shift-${view.mode}`)}
          </div>
        </section>
      {/if}
    </div>
  {/snippet}
</TopicScreens>

<style>
  .dual-shifts-topic {
    display: grid;
    gap: clamp(1.25rem, 2.4cqw, 2rem);
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  /* Keep the guide's global .guide-content type rules out, as GridTopicPage
     does; :where keeps these below the class rules that follow. */
  .dual-shifts-topic :global(:where(p, h2, span, em, strong)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .dual-shifts-topic :global(strong) {
    font-weight: 700;
  }
  /* Balanced lines: a centered sentence never ends on a stranded word. */
  .lead {
    margin: 0 auto;
    max-width: 44rem;
    text-align: center;
    /* Rises with a tall window, beside a card that grows with it. */
    font-size: clamp(1rem, 1.4cqw, max(1.15rem, 1.3vh));
    line-height: 1.55;
    text-wrap: balance;
  }
  /* The book's italic serif, as the topic header's lede was. */
  .lede {
    margin: 0 auto;
    max-width: 44rem;
    text-align: center;
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.62vw, max(1.4rem, 1.65vh));
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
    text-wrap: balance;
  }
  /* Narrow: the column (title, words, then the row of pills) over the
     card. */
  .set {
    display: grid;
    gap: clamp(0.9rem, 2.4cqw, 1.5rem);
    padding-bottom: 1rem;
  }
  .column {
    display: grid;
    gap: 0.85rem;
    justify-items: center;
    width: 100%;
    min-width: 0;
  }
  /* "Dual-Shift" in its two colours, at the size the frame's title had
     beside the switcher's 44 px chips. */
  .column-title {
    margin: 0;
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-weight: var(--guide-script-weight, 700);
    font-size: clamp(2.4rem, 1rem + 4.4vh, 4.25rem);
    line-height: 1.1;
    text-align: center;
  }
  /* A phone holds the column, the pill row and the whole card above the
     footer: the column and the card draw tighter, and the playing picture
     takes the height left (--fit). */
  @media (max-width: 520px) {
    .set {
      gap: 0.75rem;
      padding-bottom: 0.5rem;
    }
    .column {
      gap: 0.6rem;
    }
    .column-title {
      font-size: 2.3rem;
      line-height: 1.05;
    }
    .column .modes-row {
      gap: 0.4rem 1rem;
    }
    .figure .mode {
      --pad: 0.6rem;
    }
    .figure .mode-inside {
      gap: 0.5rem;
    }
    .mode .player {
      width: min(100%, calc(14rem * var(--fit, 1)));
    }
  }
  /* The line on the six modes with the link to their key on the Timing and
     Direction page beside it. */
  .modes-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .modes-row > .modes-line {
    margin: 0;
  }
  .figure {
    min-width: 0;
  }
  /* Wide: the text column beside the card, one group centred under the
     switcher and standing at its top, as on the other pages of the run.
     The column keeps a reading measure (380 to 480 px); the card's column
     takes the rest up to the card's cap. */
  @container (min-width: 56rem) {
    .set {
      grid-template-columns: clamp(23.75rem, 30cqw, 30rem) minmax(0, 68rem);
      justify-content: center;
      align-items: stretch;
      column-gap: clamp(2rem, 3cqw, 3.5rem);
      padding-block: 1rem;
    }
    /* The column runs the card's height: the list takes what the words
       leave, down to the card's foot. */
    .column {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .figure {
      align-self: start;
    }
    /* The title, definition and guide line centred in the column (Austen,
       2026-11-01); the list's rows still run its full width, their names
       at the left. */
    .column :is(.lede, .lead) {
      margin: 0;
      max-width: none;
    }
    .figure > .mode {
      margin-inline: 0;
    }
  }
  /* LinkChip reads the app's theme variables: the page's ink, and on a
     card the card's element. */
  .all-modes-link,
  .mode-link {
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
  .mode-link {
    --theme-accent: var(--tint);
  }
  /* A tall window: the column's pill a step larger, with the words. */
  @media (min-height: 1200px) {
    .all-modes-link :global(.link-chip.md) {
      min-height: 52px;
      padding: 0.6rem 1.35rem;
      font-size: 1.15rem;
    }
  }

  /* On a light page the pale elements (air, sun) need their deep colour
     mixed in to be seen; on a dark page the element colour stands on its
     own. */
  .mode {
    --tint: color-mix(in srgb, var(--el) 70%, var(--el-deep));
  }
  .dark .mode {
    --tint: var(--el);
  }
  .element {
    width: 1.5em;
    height: 1.5em;
    flex: none;
  }
  /* The book's two-tone Type 1 colour code for "Dual-Shift": Dual = cyan,
     -Shift = purple (LETTER_TYPE_COLORS), the purple lifted on dark. */
  .dual-shifts-topic :global(.cy),
  .dual-shifts-topic :global(.pu) {
    font-weight: 700;
  }
  .dual-shifts-topic :global(.cy) {
    color: #36c3ff;
  }
  .dual-shifts-topic :global(.pu) {
    color: #6f2da8;
  }
  .dark :global(.pu) {
    color: #b48cff;
  }

  /* Each mode card wears its element (water, earth, fire, air, moon or sun,
     from the choreo-card palette) as a wash, a border and the name's
     colour. The card grows with the window (--fit) up to the text column's
     neighbour cap, and keeps the width where a loop's four counts sit in one
     row wherever the window has it. */
  .mode {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --seam: color-mix(in srgb, var(--tint) 45%, var(--ink, #1a1a1a) 10%);
    container-type: inline-size;
    display: grid;
    box-sizing: border-box;
    width: min(100%, 68rem, max(37rem, calc(34rem * var(--fit, 1))));
    margin: 0 auto;
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--tint) 55%, transparent);
    background: color-mix(in srgb, var(--tint) 12%, transparent);
    transition:
      background-color var(--duration-emphasis) var(--ease-standard, ease),
      border-color var(--duration-emphasis) var(--ease-standard, ease);
  }
  /* The card's inside, which crossfades from mode to mode. */
  .mode-inside {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  /* The mode's line under its name; the lines share one cell so the card
     keeps its height. */
  .mode-lines {
    display: grid;
  }
  .dual-shifts-topic .mode-line {
    grid-area: 1 / 1;
    margin: 0;
    visibility: hidden;
    color: var(--ink, #1a1a1a);
    font-size: clamp(0.95rem, 2.4cqw, 1.1rem);
    line-height: 1.5;
    text-wrap: pretty;
    --sentence-display: inline;
  }
  .dual-shifts-topic .mode-line.shown {
    visibility: visible;
  }
  .dark .mode {
    background: color-mix(in srgb, var(--tint) 16%, transparent);
  }
  /* The card's head: the name left and the guide link right. On a narrow
     card the tinted pill right above it already names the mode, so the
     name stays for screen readers and the link stands alone; the mode's
     line stays for screen readers too, so a phone keeps the whole card
     above the footer. */
  .mode-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  @container (max-width: 33.99rem) {
    .mode-head {
      justify-content: center;
    }
    .dual-shifts-topic .mode-name,
    .dual-shifts-topic .mode-lines {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* Mode names in the book's serif. */
  .dual-shifts-topic .mode-name {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--el-deep);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.5rem, 4.5cqw, 2rem);
    font-weight: 700;
    line-height: 1.1;
  }
  .dark .mode-name {
    color: var(--ink, #f4f4f8);
  }
  .mode-name .element {
    width: 1.15em;
    height: 1.15em;
  }

  /* The mode playing, square, over its strip. It grows with the window
     (--fit) like the pictographs, so the screen still fits. */
  .player {
    width: min(100%, calc(17rem * var(--fit, 1)));
    aspect-ratio: 1;
    margin: 0 auto;
  }

  /* The start box ("Start" in its corner) and the four counts fuse into one
     block with hairline seams (GuideStepStrip's shape; 2026-11-01, Austen:
     the start joins count 1 with the same hairline, no gap), five to a row
     at every width, so a mode's loop is one row and a phone's card ends
     above the footer. The block rounds its end boxes rather than clipping,
     so the ring on the playing box shows on every edge. */
  .loop {
    --round: calc(0.75rem - 1px);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    background: var(--seam);
    border: 1px solid var(--seam);
    border-radius: 0.75rem;
  }
  .loop > .cell:first-child {
    border-radius: var(--round) 0 0 var(--round);
  }
  .loop > .cell:last-child {
    border-radius: 0 var(--round) var(--round) 0;
  }
  /* The box playing wears the ring inside its own edge, unscaled: a raised
     box would cover its neighbour's corner label. */
  .loop > .cell {
    position: relative;
  }
  .loop > .cell.guide-step-active {
    z-index: auto;
    transform: none;
    box-shadow: none;
    animation: none;
  }
  .loop > .cell.guide-step-active::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 3px rgba(251, 191, 36, 0.9),
      inset 0 0 12px rgba(251, 191, 36, 0.45);
    pointer-events: none;
  }
  /* The pictograph paints its own ground once drawn; until then the cell
     shows a faint tint in either theme (the host settles dark mode after
     first paint, so a fixed white would flash on dark). */
  .cell {
    aspect-ratio: 1;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }
  .cell :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
  /* The counts' position labels follow the page, not the app (the renderer
     inverts them whenever the app is dark). */
  .dual-shifts-topic:not(.dark) .cell :global(.placement-glyph) {
    filter: none;
  }
  .dual-shifts-topic.dark .cell :global(.placement-glyph) {
    filter: invert(0.9);
  }
</style>
