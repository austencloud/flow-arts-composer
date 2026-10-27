<!--
  Type 1 Dual-Shifts as a Guide web page, on the topic template The Grid set
  (2026-10-10). Austen's Dual-Shift definition opens the page, then a key
  names the six modes by timing (Split, Together, Quarter) and direction
  (Same, Opposite) in the Timing and Direction lesson's words. Each chip
  links to that mode's Timing and Direction guide, the one place that
  teaches timing and direction (one explainer per concept).

  One screen at a time, the same on every window (2026-10-26, Austen: all
  six modes on the first table, then one at a time). Screen 1 is the lede,
  the intro line and the key. Screens 2 to 7 draw one mode each, in the
  record's order: its line on where it travels, then its card (a start box
  and its four-count loop in its element's colour). Tog-Opp closes the
  Split and Together modes with the practice line. Screen 8 is the Gamma
  page's sequence that switches between Quarter-Opp and Quarter-Same, with
  Austen's closing lines. Every mode screen keeps room for the longest lead
  and the practice line, so all six cards draw at one size and stand in one
  place. The loops come from the shared Dual-Shifts record the print sheets
  also read, and the pictographs grow with the window (--fit).
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    DUAL_SHIFT_DIRECTIONS,
    DUAL_SHIFT_KEY,
    DUAL_SHIFT_MODE_GUIDES,
    DUAL_SHIFT_MODES,
    DUAL_SHIFT_TIMINGS,
    DUAL_SHIFTS_WEB_COPY,
    dualShiftElement,
    dualShiftModeAt,
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
   * Each loop plays once when its screen opens: count 1's hands glide from
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

  /** Plays the loops on screen once every count of each has drawn. */
  function playWhenReady() {
    if (!armed) return;
    const ready = LOOPS.filter((l) => inView.has(l.id) && !played.has(l.id));
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
    for (const l of LOOPS) elapsed[l.id] = 0;
    playWhenReady();
    window.addEventListener("beforeprint", settle);
    return () => {
      window.removeEventListener("beforeprint", settle);
      armed = false;
      settle();
    };
  });

  // The key, one screen per mode, then switching (dual-shift-screens.ts).
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

<!-- A card: the mode's name over its start box and counts, in its element's
     colours. The switching sequence has no name; its lead names it. -->
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
      <h2 class="mode-name" id={labelledBy}>
        <img
          class="element"
          src={getElementImagePath(dualShiftElement(mode).element)}
          alt=""
        />
        {t(mode.name)}
      </h2>
    {/if}
    <div class="loop">
      <div class="cell start">
        {@render pictograph(start, true, null, null)}
      </div>
      <div class="counts">
        {#each counts as { step, pose }, n (step.id)}
          <div class="cell">
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
>
  {#snippet screen(n)}
    {@const view = screens.views[n]}
    <div class="dual-shifts-topic" class:dark={darkMode}>
      {#if view?.kind === "key"}
        <section class="set key-set">
          <p class="lede">{lede}</p>
          <p class="intro">
            <Sentences html={t(DUAL_SHIFTS_WEB_COPY.modesLead)} />
          </p>

          <!-- The six modes as timing x direction, in the lesson's words;
             each chip opens that mode's Timing and Direction guide. -->
          <div class="key-wrap">
            <table class="key">
              <thead>
                <tr>
                  <td></td>
                  {#each DUAL_SHIFT_DIRECTIONS as direction (direction)}
                    <th scope="col">
                      <span class="axis"
                        >{t(DUAL_SHIFT_KEY.direction[direction].name)}</span
                      >
                      <span class="says"
                        >{t(DUAL_SHIFT_KEY.direction[direction].says)}</span
                      >
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each DUAL_SHIFT_TIMINGS as timing (timing)}
                  <tr>
                    <th scope="row">
                      <span class="axis"
                        >{t(DUAL_SHIFT_KEY.timing[timing].name)}</span
                      >
                      <span class="says"
                        >{t(DUAL_SHIFT_KEY.timing[timing].says)}</span
                      >
                    </th>
                    {#each DUAL_SHIFT_DIRECTIONS as direction (direction)}
                      {@const mode = dualShiftModeAt(timing, direction)}
                      <td>
                        <a
                          class="mode-chip"
                          href={DUAL_SHIFT_MODE_GUIDES[mode.id]}
                          style:--el={dualShiftElement(mode).accentColor}
                          style:--el-deep={dualShiftElement(mode)
                            .darkComplement}
                        >
                          <img
                            class="element"
                            src={getElementImagePath(
                              dualShiftElement(mode).element
                            )}
                            alt=""
                          />
                          {t(mode.name)}
                        </a>
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {:else if view?.kind === "mode"}
        {@const loop = LOOP_BY_ID.get(view.mode)!}
        <section class="set">
          <!-- Every mode screen holds the room of every lead and of the
               practice line, so each card draws at one size in one place;
               the lines this mode does not say stay hidden. -->
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
  .intro,
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

  /* The 3 x 2 key: the six chips sit centered on the page, the timing
     words to their left and the direction words above, labelling the grid.
     Each chip opens that mode's Timing and Direction guide. */
  .key-wrap {
    container-type: inline-size;
  }
  .key {
    display: grid;
    grid-template-columns: 1fr auto auto 1fr;
    gap: 0.5rem 0.6rem;
    width: 100%;
    font-size: clamp(0.95rem, 1.3cqw, 1.05rem);
  }
  .key thead,
  .key tbody,
  .key tr {
    display: contents;
  }
  .key thead td {
    display: none;
  }
  .key th,
  .key td {
    display: block;
    padding: 0;
  }
  .key th {
    align-self: center;
    text-align: center;
    font-weight: 400;
  }
  .key thead th:first-of-type {
    grid-column: 2;
  }
  .key th[scope="row"] {
    grid-column: 1;
    justify-self: end;
    max-width: 14rem;
    padding-right: 0.4rem;
    text-align: right;
  }
  .key .axis {
    display: block;
    font-weight: 700;
  }
  .key .says {
    display: block;
    font-size: 0.86em;
    color: color-mix(in srgb, var(--ink, #1a1a1a) 72%, transparent);
    text-wrap: balance;
  }
  /* On a light page the pale elements (air, sun) need their deep colour
     mixed in to be seen; on a dark page the element colour stands on its
     own. */
  .mode-chip,
  .mode {
    --tint: color-mix(in srgb, var(--el) 70%, var(--el-deep));
  }
  .dark .mode-chip,
  .dark .mode {
    --tint: var(--el);
  }
  /* The chip is a block link, not text: it reads as a tile. */
  .mode-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 9.5rem;
    padding: 0.55rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--tint) 60%, transparent);
    background: color-mix(in srgb, var(--tint) 14%, transparent);
    color: var(--el-deep);
    font-weight: 700;
    text-decoration: none;
  }
  .dark .mode-chip {
    color: var(--ink, #f4f4f8);
    background: color-mix(in srgb, var(--tint) 22%, transparent);
  }
  .mode-chip:focus-visible {
    outline: 2px solid var(--tint);
    outline-offset: 2px;
  }
  .element {
    width: 1.5em;
    height: 1.5em;
    flex: none;
  }
  /* Where the 3 x 2 will not fit, each timing heads its own row of two
     chips: the direction words stay above, the timing words go between. */
  @container (width < 38rem) {
    .key {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .key thead th:first-of-type {
      grid-column: auto;
    }
    .key th[scope="row"] {
      grid-column: 1 / -1;
      justify-self: stretch;
      max-width: none;
      margin-top: 0.5rem;
      padding-right: 0;
      text-align: center;
    }
    .mode-chip {
      min-width: 0;
      padding-inline: 0.5rem;
    }
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
  /* Mode names in the book's serif, centered over the loop. */
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--seam);
    border: 1px solid var(--seam);
    border-radius: 0.75rem;
    overflow: hidden;
  }
  @container (min-width: 34rem) {
    .loop {
      grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
    }
    .counts {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
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
