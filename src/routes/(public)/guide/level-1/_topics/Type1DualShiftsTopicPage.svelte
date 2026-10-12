<!--
  Type 1 Dual-Shifts as a Guide web page, on the topic template The Grid set
  (2026-10-10). The Dual-Shift definition opens the page; a centered 2 x 2
  key names the four modes by timing and direction in the lesson's words,
  each chip a link to that mode's Timing and Direction guide, the one place
  that teaches timing and direction (one explainer per concept); Split-Same
  and Tog-Same stand side by side, each under its own line on where it
  travels, each a start box and its four-count loop in its element's colour;
  Split-Opp and Tog-Opp follow under their shared line. The loops come from
  the shared Dual-Shifts record the print sheet also reads; the web page
  sets one sentence per line, as the book does, and keeps the book's modes,
  start-position and between-positions sentences for print only.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    DUAL_SHIFT_KEY,
    DUAL_SHIFT_MODE_GUIDES,
    DUAL_SHIFT_MODES,
    DUAL_SHIFT_MODES_BY_PAIR,
    DUAL_SHIFTS_WEB_COPY,
    dualShiftElement,
    dualShiftModeAt,
    dualShiftSteps,
    dualShiftsTopicHtml,
    dualShiftsTopicLines,
    plainLine,
    type DualShiftMode,
    type DualShiftModeId,
  } from "#lib/shared/guide-topics/dual-shifts-topic.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n.svelte.js";
  import { getElementImagePath } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import TopicHeader from "./TopicHeader.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  /** Austen's definition opens the page as its lede. */
  const lede = plainLine(dualShiftsTopicLines("intro")[0] ?? "");
  /** Where a Same mode travels, set above its own card. */
  const MODE_LEADS: Partial<Record<DualShiftModeId, TranslationKey>> = {
    "split-same": DUAL_SHIFTS_WEB_COPY.sameLeadSplit,
    "tog-same": DUAL_SHIFTS_WEB_COPY.sameLeadTog,
  };
  const TIMINGS = ["split", "tog"] as const;
  const DIRECTIONS = ["same", "opp"] as const;

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

  type Loop = {
    mode: DualShiftMode;
    start: StepData;
    counts: { step: StepData; pose: PictographData | null }[];
  };
  const loop = (mode: DualShiftMode): Loop => {
    const [start, ...counts] = dualShiftSteps(mode);
    return {
      mode,
      start: start!,
      counts: counts.map((step) => ({ step, pose: startPose(step) })),
    };
  };
  const LOOPS = {
    same: DUAL_SHIFT_MODES_BY_PAIR.same.map(loop),
    opp: DUAL_SHIFT_MODES_BY_PAIR.opp.map(loop),
  } as const;

  /**
   * Each loop plays once when its pair comes into view: count 1's hands
   * glide from their start points as its arrows fade in, then count 2, 3
   * and 4, so the loop reads as a path. Each then holds its finished
   * pictures, the book's view; a hover or tap replays it. Reduced motion
   * and print keep the finished pictures. The glide is the one
   * LessonPictographStage plays for a move.
   */
  const COUNT_MS = 1050;
  const LOOP_MS = COUNT_MS * 4;
  /** Milliseconds into each loop's play; absent = at rest, finished. */
  let elapsed = $state<Partial<Record<DualShiftModeId, number>>>({});
  const startedAt = new Map<DualShiftModeId, number>();
  let frame: number | null = null;
  let pairEls: Partial<Record<"same" | "opp", HTMLElement>> = $state({});
  /** A pair plays once its loops are in view and every count has drawn. */
  const inView = new Set<"same" | "opp">();
  const played = new Set<"same" | "opp">();
  const drawn = new Set<string>();
  let armed = false;

  function countProgress(id: DualShiftModeId, count: number): number | null {
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
      const ms = Math.min(LOOP_MS, Math.max(0, now - start));
      elapsed[id] = ms;
      if (ms >= LOOP_MS) startedAt.delete(id);
    }
    frame = startedAt.size > 0 ? requestAnimationFrame(tick) : null;
  }

  function play(ids: readonly DualShiftModeId[]) {
    const now = performance.now();
    for (const id of ids) {
      startedAt.set(id, now);
      elapsed[id] = 0;
    }
    frame ??= requestAnimationFrame(tick);
  }

  function replay(id: DualShiftModeId) {
    if (elapsed[id] === LOOP_MS) play([id]);
  }

  function playWhenReady(pair: "same" | "opp") {
    if (!armed || played.has(pair) || !inView.has(pair)) return;
    const loops = LOOPS[pair];
    if (!loops.every((l) => l.counts.every((c) => drawn.has(c.step.id))))
      return;
    played.add(pair);
    play(loops.map((l) => l.mode.id));
  }

  function onCountDrawn(pair: "same" | "opp", stepId: string) {
    drawn.add(stepId);
    playWhenReady(pair);
  }

  function settle() {
    startedAt.clear();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    elapsed = {};
  }

  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The loops wait at their start points until their pair is in view.
    armed = true;
    for (const mode of DUAL_SHIFT_MODES) elapsed[mode.id] = 0;
    const observers = (["same", "opp"] as const).flatMap((pair) => {
      const el = pairEls[pair];
      if (!el) return [];
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          inView.add(pair);
          playWhenReady(pair);
        },
        { threshold: 0.35 }
      );
      observer.observe(el);
      return [observer];
    });
    window.addEventListener("beforeprint", settle);
    return () => {
      for (const observer of observers) observer.disconnect();
      window.removeEventListener("beforeprint", settle);
      armed = false;
      settle();
    };
  });
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

{#snippet pair(name: "same" | "opp")}
  <div class="pair-wrap" bind:this={pairEls[name]}>
    <ul class="pair">
      {#each LOOPS[name] as { mode, start, counts } (mode.id)}
        <li class="slot">
          {#if MODE_LEADS[mode.id]}
            <p class="lead">{t(MODE_LEADS[mode.id]!)}</p>
          {/if}
          <!-- Replay is a pointer extra; every loop has already played on view. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div
            class="mode"
            style:--el={dualShiftElement(mode).accentColor}
            style:--el-deep={dualShiftElement(mode).darkComplement}
            aria-labelledby="dual-shift-{mode.id}"
            onpointerenter={() => replay(mode.id)}
            onclick={() => replay(mode.id)}
          >
            <h2 class="mode-name" id="dual-shift-{mode.id}">
              <img
                class="element"
                src={getElementImagePath(dualShiftElement(mode).element)}
                alt=""
              />
              {t(mode.name)}
            </h2>
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
                      countProgress(mode.id, n + 1),
                      pose,
                      () => onCountDrawn(name, step.id)
                    )}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<article class="dual-shifts-topic" class:dark={darkMode}>
  <TopicHeader {kicker} title={t("verified_level1_hm_type1_105")} {lede} />

  <section class="set">
    <p class="intro">{@html t(DUAL_SHIFTS_WEB_COPY.modesLead)}</p>

    <!-- The four modes as timing x direction, in the lesson's words; each
       chip opens that mode's Timing and Direction guide. -->
    <div class="key-wrap">
      <table class="key">
        <thead>
          <tr>
            <td></td>
            {#each DIRECTIONS as direction (direction)}
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
          {#each TIMINGS as timing (timing)}
            <tr>
              <th scope="row">
                <span class="axis">{t(DUAL_SHIFT_KEY.timing[timing].name)}</span
                >
                <span class="says">{t(DUAL_SHIFT_KEY.timing[timing].says)}</span
                >
              </th>
              {#each DIRECTIONS as direction (direction)}
                {@const mode = dualShiftModeAt(timing, direction)}
                <td>
                  <a
                    class="mode-chip"
                    href={DUAL_SHIFT_MODE_GUIDES[mode.id]}
                    style:--el={dualShiftElement(mode).accentColor}
                    style:--el-deep={dualShiftElement(mode).darkComplement}
                  >
                    <img
                      class="element"
                      src={getElementImagePath(dualShiftElement(mode).element)}
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

  {@render pair("same")}

  <section class="set">
    <p class="lead">{t(DUAL_SHIFTS_WEB_COPY.oppLead)}</p>
    {@render pair("opp")}
  </section>

  <aside class="remember">
    <p>{@html dualShiftsTopicHtml("notice")}</p>
    <p>{@html dualShiftsTopicHtml("practice")}</p>
  </aside>

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
  /* Wider than the text-led topic pages: four loops of five pictographs
     use the room a wide screen gives them, and the reading measures inside
     keep their own caps. */
  .dual-shifts-topic {
    max-width: 120rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 4cqw, 2.5rem) 2rem;
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
  /* One sentence per line, as the book sets it. */
  .lead .line {
    display: block;
  }
  /* A line and the pictures it introduces stay together. */
  .set {
    display: grid;
    gap: 0.85rem;
  }

  /* The 2 x 2 key: the four chips sit centered on the page, the timing
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
  /* On a light page the pale elements (air) need their deep colour mixed in
     to be seen; on a dark page the element colour stands on its own. */
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
  /* Where the 2 x 2 will not fit, each timing heads its own row of two
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

  /* A pair of modes: side by side where two loops fit, else stacked. */
  .pair-wrap {
    container-type: inline-size;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(0.75rem, 2cqw, 1.25rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @container (min-width: 60rem) {
    .pair {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* A slot: the mode's travel line, if it has one, over its card. */
  .slot {
    display: grid;
    gap: 0.85rem;
    align-content: start;
  }
  /* Each mode card wears its element: water, earth, fire or air, from the
     choreo-card palette, as a wash, a border and the name's colour. */
  .mode {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --seam: color-mix(in srgb, var(--tint) 45%, var(--ink, #1a1a1a) 10%);
    container-type: inline-size;
    display: grid;
    gap: 0.75rem;
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--tint) 55%, transparent);
    background: color-mix(in srgb, var(--tint) 12%, transparent);
  }
  .dark .mode {
    background: color-mix(in srgb, var(--tint) 16%, transparent);
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

  /* The start box leads in its own frame; the four counts fuse into one
     block with hairline seams (GuideStepStrip's shape). Narrow: the counts
     stack 2 x 2 beside the start; wide: all four in a row. */
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

  .remember {
    justify-self: center;
    max-width: 40rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
    display: grid;
    gap: 0.6rem;
    text-align: center;
  }
  .remember p {
    margin: 0;
    line-height: 1.55;
    text-wrap: balance;
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
