<!--
  Type 1 Dual-Shifts as a Guide web page, on the topic template The Grid set
  (2026-10-10). The Dual-Shift definition opens the page; Split-Same and
  Tog-Same stand side by side, each a start box and its four-count loop with
  its name and travel word attached; the book's turn to moving between α and
  β leads Split-Opp and Tog-Opp in the same shape. Every sentence and every
  loop comes from the shared Dual-Shifts record the print sheet also reads.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import { describePictograph } from "#lib/shared/pictograph/shared/domain/utils/pictograph-description.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    DUAL_SHIFT_MODES,
    DUAL_SHIFT_MODES_BY_PAIR,
    dualShiftSteps,
    dualShiftsTopicHtml,
    dualShiftsTopicLines,
    plainLine,
    type DualShiftMode,
    type DualShiftModeId,
  } from "#lib/shared/guide-topics/dual-shifts-topic.js";
  import TopicHeader from "./TopicHeader.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  /** Austen's intro: the first sentence is the lede, the rest the intro. */
  const introLines = dualShiftsTopicLines("intro");
  const lede = plainLine(introLines[0] ?? "");
  const introRest = introLines.slice(1).join(" ");

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
    counts: { step: StepData; pose: PictographData | null; label: string }[];
  };
  const loop = (mode: DualShiftMode): Loop => {
    const [start, ...counts] = dualShiftSteps(mode);
    return {
      mode,
      start: start!,
      counts: counts.map((step) => ({
        step,
        pose: startPose(step),
        label: describePictograph(step as unknown as PictographData),
      })),
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

  function countProgress(id: DualShiftModeId, count: number): number | null {
    const ms = elapsed[id];
    if (ms === undefined) return null;
    const linear = Math.min(1, Math.max(0, (ms - (count - 1) * COUNT_MS) / COUNT_MS));
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

  function settle() {
    startedAt.clear();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    elapsed = {};
  }

  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The loops wait at their start points until their pair is in view.
    for (const mode of DUAL_SHIFT_MODES) elapsed[mode.id] = 0;
    const observers = (["same", "opp"] as const).flatMap((pair) => {
      const el = pairEls[pair];
      if (!el) return [];
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          play(DUAL_SHIFT_MODES_BY_PAIR[pair].map((mode) => mode.id));
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
      settle();
    };
  });
</script>

{#snippet pictograph(
  step: StepData,
  isStart: boolean,
  progress: number | null,
  pose: PictographData | null
)}
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
        <!-- Replay is a pointer extra; every loop has already played on view. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <li
          class="mode"
          aria-labelledby="dual-shift-{mode.id}"
          onpointerenter={() => replay(mode.id)}
          onclick={() => replay(mode.id)}
        >
          <header class="mode-head">
            <h2 id="dual-shift-{mode.id}">{t(mode.name)}</h2>
            <span class="travel">{mode.travel}</span>
          </header>
          <div class="loop">
            <div class="cell start" role="img" aria-label={describePictograph(start as unknown as PictographData)}>
              {@render pictograph(start, true, null, null)}
            </div>
            <div class="counts">
              {#each counts as { step, pose, label }, n (step.id)}
                <div class="cell" role="img" aria-label={label}>
                  {@render pictograph(step, false, countProgress(mode.id, n + 1), pose)}
                </div>
              {/each}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<article class="dual-shifts-topic" class:dark={darkMode}>
  <TopicHeader {kicker} title={t("verified_level1_hm_type1_105")} {lede} />

  <p class="intro">{@html introRest}</p>

  {@render pair("same")}

  <p class="lead">{@html dualShiftsTopicHtml("betweenPositions")}</p>

  {@render pair("opp")}

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
  .dual-shifts-topic {
    max-width: 90rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 4cqw, 2.5rem) 2rem;
    display: grid;
    gap: clamp(1.5rem, 3cqw, 2.5rem);
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
  .mode {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --seam: color-mix(in srgb, var(--ink, #1a1a1a) 16%, transparent);
    container-type: inline-size;
    display: grid;
    gap: 0.75rem;
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--ink, #1a1a1a) 14%, transparent);
    background: color-mix(in srgb, var(--ink, #1a1a1a) 4%, transparent);
  }
  .mode-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  /* Mode names in the book's serif, as on the reflow pages. */
  .dual-shifts-topic .mode-head h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.5rem, 4.5cqw, 2rem);
    font-weight: 700;
    line-height: 1.1;
  }
  .travel {
    font-size: clamp(0.95rem, 2.6cqw, 1.15rem);
    color: color-mix(in srgb, var(--ink, #1a1a1a) 70%, transparent);
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
  .cell {
    aspect-ratio: 1;
    overflow: hidden;
    background: #fff;
  }
  .dark .cell {
    background: #121214;
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
