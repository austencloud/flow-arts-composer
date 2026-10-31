<!--
  Type 1 Dual-Shifts as a Guide web page, on the topic template The Grid set
  (2026-10-10). One screen at a time, the same on every window (2026-10-26).
  Screens 1 to 6 draw one mode each, in the record's order: its line on where
  it travels, then its card (a start box and its four-count loop in its
  element's colour), with a link to that mode's Timing and Direction guide.
  Tog-Opp closes the Split and Together modes with the practice line. Screen
  7 is the Gamma page's sequence that switches between Quarter-Opp and
  Quarter-Same, with Austen's closing lines.

  Screen 1 opens with Austen's Dual-Shift definition and a link to the Timing
  and Direction page, which keys the six modes by timing and direction. The
  guide links there and does not draw the key again (2026-10-28, Austen: one
  explainer per concept). Each mode card plays the mode as a moving animation over its start box
  and four-count loop, the count that is playing ringed (2026-10-27,
  Austen: each mode screen shows the animation with the strip below it);
  the animation is the Timing and Direction guides' player on the same
  hand path, and only the switching sequence's counts glide in. Every mode
  screen keeps room for that opening, for
  the longest lead and for the practice line, and the header stays the same
  on every screen (steadyHead), so all six cards draw at one size and stand
  in one place. The loops come from the shared Dual-Shifts
  record the print sheets also read, and the pictographs grow with the window
  (--fit).
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { onMount } from "svelte";
  import { browser } from "$app/env";
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
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    DUAL_SHIFT_MODE_GUIDES,
    DUAL_SHIFT_MODES,
    DUAL_SHIFTS_WEB_COPY,
    dualShiftElement,
    dualShiftSteps,
    dualShiftSwitchingSteps,
    dualShiftsTitle,
    dualShiftsTopicHtml,
    dualShiftsTopicLines,
    plainLine,
    type DualShiftMode,
    type DualShiftModeId,
  } from "#lib/shared/guide-topics/dual-shifts-topic.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { getElementImagePath } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import TopicScreens from "./TopicScreens.svelte";
  import { dualShiftScreens } from "./dual-shift-screens";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  /** Austen's definition opens the page as its lede. */
  const lede = plainLine(dualShiftsTopicLines("intro")[0] ?? "");
  /** The line set above a mode's card: where it travels, or how it moves.
   *  Split-Opp's line names both Opp modes, so Tog-Opp has none. */
  const MODE_LEADS: Partial<Record<DualShiftModeId, TranslationKey>> = {
    "split-same": DUAL_SHIFTS_WEB_COPY.sameLeadSplit,
    "tog-same": DUAL_SHIFTS_WEB_COPY.sameLeadTog,
    "split-opp": DUAL_SHIFTS_WEB_COPY.oppLead,
    "quarter-opp": DUAL_SHIFTS_WEB_COPY.quarterOppLead,
    "quarter-same": DUAL_SHIFTS_WEB_COPY.quarterSameLead,
  };
  const LEAD_KEYS = Object.values(MODE_LEADS).filter(
    (key): key is TranslationKey => key !== undefined
  );
  /** The practice line closes the Split and Together modes. */
  const PRACTICE_AFTER: DualShiftModeId = "tog-opp";

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

  /** Where a count's hands start, for the glide that plays the count. */
  function startPose(step: StepData): PictographData | null {
    try {
      return startPlacementDeriver.deriveFromFirstStep(
        step
      ) as unknown as PictographData;
    } catch {
      return null;
    }
  }

  /** Each mode's loop, and the switching sequence. */
  type LoopId = DualShiftModeId | "switching";
  type Loop = {
    id: LoopId;
    mode: DualShiftMode | null;
    start: StepData;
    counts: { step: StepData; pose: PictographData | null }[];
  };
  const loopOf = (
    id: LoopId,
    steps: StepData[],
    mode: DualShiftMode | null
  ): Loop => {
    const [start, ...counts] = steps;
    return {
      id,
      mode,
      start: start!,
      counts: counts.map((step) => ({ step, pose: startPose(step) })),
    };
  };
  const LOOPS: Loop[] = [
    ...DUAL_SHIFT_MODES.map((mode) =>
      loopOf(mode.id, dualShiftSteps(mode), mode)
    ),
    loopOf("switching", dualShiftSwitchingSteps(), null),
  ];
  const LOOP_BY_ID = new Map(LOOPS.map((l) => [l.id, l]));

  /**
   * The switching sequence has no animation, so its counts glide instead.
   * It plays once when its screen opens: count 1's hands glide from
   * their start points as its arrows fade in, then the next count, so the
   * loop reads as a path. Each then holds its finished pictures, the book's
   * view; a hover or tap replays it. Reduced motion and print keep the
   * finished pictures. The glide is the one LessonPictographStage plays for
   * a move.
   */
  const COUNT_MS = 1050;
  const loopMs = (id: LoopId) =>
    COUNT_MS * (LOOP_BY_ID.get(id)?.counts.length ?? 4);
  /** Milliseconds into each loop's play; absent = at rest, finished. */
  let elapsed = $state<Partial<Record<LoopId, number>>>({});
  const startedAt = new Map<LoopId, number>();
  let raf: number | null = null;
  /** Loops play once they are on screen and every count has drawn. */
  const inView = new Set<LoopId>();
  const played = new Set<LoopId>();
  const drawn = new Set<string>();
  let armed = false;

  function countProgress(id: LoopId, count: number): number | null {
    const ms = elapsed[id];
    if (ms === undefined) return null;
    const linear = Math.min(
      1,
      Math.max(0, (ms - (count - 1) * COUNT_MS) / COUNT_MS)
    );
    return 1 - Math.pow(1 - linear, 3);
  }

  function tick(now: number) {
    for (const [id, start] of startedAt) {
      const ms = Math.min(loopMs(id), Math.max(0, now - start));
      elapsed[id] = ms;
      if (ms >= loopMs(id)) startedAt.delete(id);
    }
    raf = startedAt.size > 0 ? requestAnimationFrame(tick) : null;
  }

  function play(ids: readonly LoopId[]) {
    const now = performance.now();
    for (const id of ids) {
      startedAt.set(id, now);
      elapsed[id] = 0;
    }
    raf ??= requestAnimationFrame(tick);
  }

  function replay(id: LoopId) {
    if (elapsed[id] === loopMs(id)) play([id]);
  }

  /** The loops that glide: the modes play in their animation instead. */
  const GLIDES = LOOPS.filter((l) => !l.mode);

  /** Plays the loops on screen once every count of each has drawn. */
  function playWhenReady() {
    if (!armed) return;
    const ready = GLIDES.filter((l) => inView.has(l.id) && !played.has(l.id));
    if (ready.length === 0) return;
    if (!ready.every((l) => l.counts.every((c) => drawn.has(c.step.id))))
      return;
    for (const l of ready) played.add(l.id);
    play(ready.map((l) => l.id));
  }

  function onCountDrawn(stepId: string) {
    drawn.add(stepId);
    playWhenReady();
  }

  /** A card reports itself on screen; its screen may open later. */
  function watchLoop(node: HTMLElement, id: LoopId) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        inView.add(id);
        playWhenReady();
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function settle() {
    startedAt.clear();
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    elapsed = {};
  }

  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The loops wait at their start points until their screen opens.
    armed = true;
    for (const l of GLIDES) elapsed[l.id] = 0;
    playWhenReady();
    window.addEventListener("beforeprint", settle);
    return () => {
      window.removeEventListener("beforeprint", settle);
      armed = false;
      settle();
    };
  });

  // One screen per mode, then switching (dual-shift-screens.ts).
  const screens = $derived(
    dualShiftScreens((id) => t(LOOP_BY_ID.get(id)!.mode!.name))
  );
</script>

{#snippet pictograph(
  step: StepData,
  isStart: boolean,
  progress: number | null,
  pose: PictographData | null,
  onDrawn?: () => void
)}
  <PictographContainer
    pictographData={step}
    onReady={onDrawn}
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
    motionStep={progress === null ? null : step}
    motionStartData={progress === null ? null : pose}
    motionProgress={progress}
    arrowOpacity={progress ?? 1}
  />
{/snippet}

<!-- A card: the mode's name and the link to its guide over its start box
     and counts, in its element's colours. The switching sequence has no
     name; its lead names it. -->
{#snippet card(loop: Loop, labelledBy: string)}
  {@const { id, mode, start, counts } = loop}
  <!-- Replay is a pointer extra; every loop has already played on view. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="mode"
    class:switching={!mode}
    style:--el={mode ? dualShiftElement(mode).accentColor : null}
    style:--el-deep={mode ? dualShiftElement(mode).darkComplement : null}
    aria-labelledby={labelledBy}
    use:watchLoop={id}
    onpointerenter={() => replay(id)}
    onclick={() => replay(id)}
  >
    {#if mode}
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
    {/if}
    <div class="loop">
      <div class="cell start" class:guide-step-active={isPlaying(mode, 0)}>
        {@render pictograph(start, true, null, null)}
      </div>
      <div class="counts">
        {#each counts as { step, pose }, n (step.id)}
          <div class="cell" class:guide-step-active={isPlaying(mode, n + 1)}>
            {@render pictograph(
              step,
              false,
              countProgress(id, n + 1),
              pose,
              () => onCountDrawn(step.id)
            )}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

<TopicScreens
  title={dualShiftsTitle()}
  {kicker}
  {lessonHref}
  {frame}
  labels={screens.labels}
  steadyHead
>
  {#snippet screen(n)}
    {@const view = screens.views[n]}
    <div class="dual-shifts-topic" class:dark={darkMode}>
      {#if view?.kind === "mode"}
        {@const loop = LOOP_BY_ID.get(view.mode)!}
        {@const opens = n === 0}
        <section class="set">
          <!-- Every mode screen holds the room of screen 1's opening, of
               every lead and of the practice line, so each card draws at one
               size in one place; what this screen does not say stays hidden,
               and a hidden link leaves the tab order. -->
          <div class="opening" class:unsaid={!opens} aria-hidden={!opens}>
            <p class="lede">{lede}</p>
            <span class="all-modes-link">
              <LinkChip
                size="md"
                href="/timing-and-direction"
                tabindex={opens ? undefined : -1}
                >{t(DUAL_SHIFTS_WEB_COPY.allModesLink)}</LinkChip
              >
            </span>
          </div>
          <div class="slot lead-slot">
            {#each LEAD_KEYS as key (key)}
              {@const said = key === MODE_LEADS[view.mode]}
              <p class="lead" class:unsaid={!said} aria-hidden={!said}>
                <Sentences text={t(key)} />
              </p>
            {/each}
          </div>
          {@render card(loop, `dual-shift-${view.mode}`)}
          <div class="slot">
            <p
              class="lead"
              class:unsaid={view.mode !== PRACTICE_AFTER}
              aria-hidden={view.mode !== PRACTICE_AFTER}
            >
              <Sentences html={dualShiftsTopicHtml("practice")} />
            </p>
          </div>
        </section>
      {:else if view?.kind === "switching"}
        <section class="set">
          <p class="lead" id="dual-shift-switching">
            <Sentences text={t(DUAL_SHIFTS_WEB_COPY.switchingLead)} />
          </p>
          {@render card(LOOP_BY_ID.get("switching")!, "dual-shift-switching")}
          <p class="lead">
            <Sentences text={t(DUAL_SHIFTS_WEB_COPY.continuous)} />
          </p>
          <p class="lead">
            <Sentences html={t(DUAL_SHIFTS_WEB_COPY.gammaPractice)} />
          </p>
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
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
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
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
    text-wrap: balance;
  }
  /* A line and the pictures it introduces stay together. */
  .set {
    display: grid;
    gap: 0.85rem;
  }
  /* A mode screen's line slots: every possible line shares one cell, so the
     slot is as tall as the longest; the lines this mode does not say keep
     their room but stay unseen. A lead sits on the card, the closing line
     under it. */
  .slot {
    display: grid;
  }
  .slot > .lead {
    grid-area: 1 / 1;
  }
  .lead-slot > .lead {
    align-self: end;
  }
  .unsaid {
    visibility: hidden;
  }
  /* Screen 1's opening: the lede, then the link to the six-mode key on the
     Timing and Direction page. */
  .opening {
    display: grid;
    justify-items: center;
    gap: 0.85rem;
  }
  /* On a wide window the opening and the mode leads run wider, one line
     for the opening, so the mode's animation keeps its room (a Quarter-Opp
     lead held four lines at 44rem). */
  @container (min-width: 60rem) {
    .opening {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      column-gap: 1.25rem;
    }
    .opening > .lede {
      margin: 0;
    }
    .lead-slot > .lead {
      max-width: 60rem;
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
     colour. The card grows with the window (--fit) but never drops under
     the width where a loop's four counts sit in one row, which would make
     it taller as it shrinks. */
  .mode {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --seam: color-mix(in srgb, var(--tint) 45%, var(--ink, #1a1a1a) 10%);
    container-type: inline-size;
    display: grid;
    gap: 0.75rem;
    box-sizing: border-box;
    width: min(100%, max(37rem, calc(34rem * var(--fit, 1))));
    margin: 0 auto;
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--tint) 55%, transparent);
    background: color-mix(in srgb, var(--tint) 12%, transparent);
  }
  .dark .mode {
    background: color-mix(in srgb, var(--tint) 16%, transparent);
  }
  /* The switching sequence moves between two modes, so it wears neither
     element: a plain ink wash. */
  .mode.switching {
    --el: color-mix(in srgb, var(--ink, #1a1a1a) 55%, transparent);
    --el-deep: var(--ink, #1a1a1a);
  }
  /* The card's head: the name over its guide link, centered, on a narrow
     card; the name left and the link right on a wide one. */
  .mode-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  @container (min-width: 34rem) {
    .mode-head {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: space-between;
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

  /* The start box leads in its own frame; the counts fuse into one block
     with hairline seams (GuideStepStrip's shape). Narrow: the counts sit
     two to a row beside the start; wide: four to a row, so a mode's loop is
     one row and the switching sequence two, counts 5 to 8 under 1 to 4. */
  .loop {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 0.6rem;
    align-items: start;
  }
  .counts {
    --round: calc(0.75rem - 1px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--seam);
    border: 1px solid var(--seam);
    border-radius: 0.75rem;
  }
  /* The block rounds its corner counts rather than clipping, so the ring on
     the playing count shows on every edge. */
  .counts > .cell:nth-child(1) {
    border-top-left-radius: var(--round);
  }
  .counts > .cell:nth-child(2) {
    border-top-right-radius: var(--round);
  }
  .counts > .cell:nth-child(3) {
    border-bottom-left-radius: var(--round);
  }
  .counts > .cell:nth-child(4) {
    border-bottom-right-radius: var(--round);
  }
  @container (min-width: 34rem) {
    .loop {
      grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
    }
    .counts {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .counts > .cell:nth-child(n) {
      border-radius: 0;
    }
    .counts > .cell:nth-child(1) {
      border-radius: var(--round) 0 0 var(--round);
    }
    .counts > .cell:nth-child(4) {
      border-radius: 0 var(--round) var(--round) 0;
    }
  }
  /* The switching sequence's eight counts never ring; its block clips. */
  .switching .counts {
    overflow: hidden;
  }
  /* The switching sequence keeps its two rows of four down to the width
     where a count is still about 64 px across. */
  @container (min-width: 21rem) {
    .switching .loop {
      grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
    }
    .switching .counts {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  /* The pictograph paints its own ground once drawn; until then the cell
     shows a faint tint in either theme (the host settles dark mode after
     first paint, so a fixed white would flash on dark). */
  .cell {
    aspect-ratio: 1;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }
  .start {
    border: 1px solid var(--seam);
    border-radius: 0.75rem;
  }
  .cell :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
