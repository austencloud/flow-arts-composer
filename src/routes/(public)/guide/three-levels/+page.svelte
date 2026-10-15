<!--
  /guide/three-levels — WITHDRAWN 2026-10-15 while it is rethought.

  It went out in v0.48.0 before it was ready. Production prerenders the
  "being written" note (noindex) and the page is off the Guide hub, the Guide
  contents and the sitemap. A local dev server still shows the draft below.
-->
<script lang="ts">
  /**
   * /guide/three-levels: one of Gage DeMello's Eight Step patterns read at
   * three levels, its code (the name), its TKA word, and a VTG reading of
   * every beat, linked so a letter and its beat light up together. The
   * playing beat lights them too. Then one pair of codes that spell the same
   * word, to show what the letters leave to the turns.
   *
   * Every reading is built at prerender from the transcription by
   * #lib/shared/guide-topics/three-levels-topic.ts.
   * Spec: docs/superpowers/specs/2026-10-14-three-levels-guide-page-design.md
   */
  import { dev } from "$app/environment";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import PatternPlayer from "./_components/PatternPlayer.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    EIGHT_STEP_SOURCE_HREF,
    THREE_LEVELS_PATTERNS,
    type HandReading,
    type ThreeLevelsPattern,
    type VtgBeat,
  } from "#lib/shared/guide-topics/three-levels-topic.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let selectedCode = $state<string>(THREE_LEVELS_PATTERNS[0]);
  const selected = $derived(
    data.patterns.find((p) => p.pattern.name.code === selectedCode) ??
      data.patterns[0]!
  );
  const pattern = $derived(selected.pattern);

  // The beat lit across the three levels: the one being pointed at, else the
  // one playing. Both reset when the pattern changes.
  let pointedBeat = $state<number | null>(null);
  let liveStep = $state(0);
  const activeBeat = $derived(
    pointedBeat ?? (liveStep >= 1 ? Math.floor(liveStep) : 0)
  );
  let seek: ((step: number) => void) | null = null;

  function choose(code: string) {
    selectedCode = code;
    pointedBeat = null;
    liveStep = 0;
  }

  const cells = $derived(
    Array.from({ length: pattern.repeats }, (_, cell) =>
      pattern.cell.map((letter, i) => ({
        letter,
        beat: cell * pattern.cell.length + i + 1,
      }))
    )
  );

  const pickerOptions = $derived(
    data.patterns.map(({ pattern: p }) => ({
      value: p.name.code,
      label: `${p.name.code} ${p.cell.join("")}`,
    }))
  );
  const cellOf = (code: string) =>
    data.patterns
      .find((p) => p.pattern.name.code === code)
      ?.pattern.cell.join("") ?? "";

  let pickerWidth = $state(0);

  const hand = (h: HandReading) => `${h.ratio} ${h.spin}`;
  // "blue {blue} against red {red}", split around the two hand readings so
  // each can carry its hand's ink in any word order.
  const BLUE_SLOT = "⟦blue⟧";
  const RED_SLOT = "⟦red⟧";
  const handsTemplate = $derived(
    t("guide_three_levels_vtg_hands", { blue: BLUE_SLOT, red: RED_SLOT })
      .split(new RegExp(`(${BLUE_SLOT}|${RED_SLOT})`))
      .filter(Boolean)
  );

  // The pair shows one cell each, and marks the hand reading that differs.
  const pairCell = (p: ThreeLevelsPattern) => p.beats.slice(0, p.cell.length);
  const differs = (beat: VtgBeat, side: "blue" | "red") => {
    const [a, b] = data.pair.map((x) => x.pattern.beats[beat.beat - 1]!);
    return hand(a![side]) !== hand(b![side]);
  };
</script>

<svelte:head>
  {#if !dev}
    <title>Being written · The Kinetic Alphabet Guide</title>
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

{#if !dev}
  <UnderConstruction
    title="Being written"
    eyebrow="The Guide"
    icon="fa-pen-nib"
    note="This page is still being written. The rest of the Guide is here."
    destinations={[
      { label: "The Guide", href: "/guide", icon: "fa-book-open" },
    ]}
  />
{:else}
  <GuideSeo
    title={t("guide_three_levels_seo_title")}
    description={t("guide_three_levels_seo_description")}
    path="/guide/three-levels"
    datePublished="2026-10-15"
    partOf={{ name: t("guide_three_levels_part_of"), path: "/guide" }}
    breadcrumbs={[
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guide" },
      { name: t("guide_three_levels_title"), path: "/guide/three-levels" },
    ]}
  />

  {#snippet vtgLine(beat: VtgBeat, mark?: (side: "blue" | "red") => boolean)}
    <span class="vtg-group">{beat.group}</span>
    <span class="vtg-hands"
      >{#each handsTemplate as part, i (i)}{#if part === BLUE_SLOT}<span
            class="hand blue"
            class:differs={mark?.("blue")}>{hand(beat.blue)}</span
          >{:else if part === RED_SLOT}<span
            class="hand red"
            class:differs={mark?.("red")}>{hand(beat.red)}</span
          >{:else}{part}{/if}{/each}</span
    >
    {#if beat.hybrid}<span class="vtg-hybrid"
        >{t("guide_three_levels_hybrid")}</span
      >{/if}
  {/snippet}

  <GuideShell>
    <article class="levels-guide guide-page-route">
      <header class="intro">
        <h1>{t("guide_three_levels_title")}</h1>
        <p class="lede">{t("guide_three_levels_lede")}</p>
        <p class="thesis">{t("guide_three_levels_thesis")}</p>
      </header>

      <section class="stage" aria-label={t("guide_three_levels_title")}>
        <div class="picker" bind:clientWidth={pickerWidth}>
          <SegmentedControl
            options={pickerOptions}
            value={selectedCode}
            onchange={choose}
            semantics="radiogroup"
            ariaLabel={t("guide_three_levels_picker_label")}
            columns={pickerWidth > 0 && pickerWidth < 520 ? 3 : undefined}
          >
            {#snippet optionContent(code: string)}
              <span class="option-code">{code}</span>
              <span class="option-word">{cellOf(code)}</span>
            {/snippet}
          </SegmentedControl>
          <p class="credit">
            {t("guide_three_levels_credit")}
            <LinkChip size="inline" href={EIGHT_STEP_SOURCE_HREF}
              >{t("guide_three_levels_source_link")}</LinkChip
            >
          </p>
        </div>

        <div class="stage-body">
          <div class="canvas-column">
            {#key selectedCode}
              <PatternPlayer
                record={selected.record}
                label={t("guide_three_levels_player_label", {
                  code: selectedCode,
                })}
                onStepChange={(step) => (liveStep = step)}
                onSeekRef={(fn) => (seek = fn)}
              />
            {/key}
            <p class="hint">{t("guide_three_levels_hint")}</p>
          </div>

          <div class="levels">
            <section class="level" aria-labelledby="level-name">
              <h2 id="level-name" class="level-label">
                {t("guide_three_levels_level_name")}
              </h2>
              <p class="code">{pattern.name.code}</p>
              <p class="decode">
                {t("guide_three_levels_decode", {
                  column: pattern.name.column,
                  relationship: pattern.name.relationship,
                  row: pattern.name.row,
                  capping: pattern.name.capping,
                  continual: pattern.name.continual,
                })}
              </p>
              <p class="note">
                {t("guide_three_levels_name_note", { total: data.chartSize })}
              </p>
            </section>

            <section class="level" aria-labelledby="level-word">
              <h2 id="level-word" class="level-label">
                {t("guide_three_levels_level_word")}
              </h2>
              <div class="word">
                {#each cells as cell, c (c)}
                  <span class="cell">
                    {#each cell as { letter, beat } (beat)}
                      <button
                        type="button"
                        class="letter"
                        class:active={activeBeat === beat}
                        aria-current={activeBeat === beat ? "step" : undefined}
                        aria-label="{t('guide_three_levels_beat', {
                          n: beat,
                        })}: {letter}"
                        onpointerenter={() => (pointedBeat = beat)}
                        onpointerleave={() => (pointedBeat = null)}
                        onfocus={() => (pointedBeat = beat)}
                        onblur={() => (pointedBeat = null)}
                        onclick={() => seek?.(beat)}>{letter}</button
                      >
                    {/each}
                  </span>
                {/each}
              </div>
              <p class="note">
                {t("guide_three_levels_word_note", {
                  length: pattern.cell.length,
                  repeats: pattern.repeats,
                })}
              </p>
            </section>

            <section class="level" aria-labelledby="level-vtg">
              <h2 id="level-vtg" class="level-label">
                {t("guide_three_levels_level_vtg")}
              </h2>
              <ol class="vtg-rows">
                {#each pattern.beats as beat (beat.beat)}
                  <li
                    class:cell-start={beat.beat > 1 &&
                      (beat.beat - 1) % pattern.cell.length === 0}
                  >
                    <button
                      type="button"
                      class="vtg-row"
                      class:active={activeBeat === beat.beat}
                      aria-current={activeBeat === beat.beat
                        ? "step"
                        : undefined}
                      onpointerenter={() => (pointedBeat = beat.beat)}
                      onpointerleave={() => (pointedBeat = null)}
                      onfocus={() => (pointedBeat = beat.beat)}
                      onblur={() => (pointedBeat = null)}
                      onclick={() => seek?.(beat.beat)}
                    >
                      <span class="vtg-beat"
                        ><span class="sr-only"
                          >{t("guide_three_levels_beat", {
                            n: beat.beat,
                          })}</span
                        ><span aria-hidden="true">{beat.beat}</span></span
                      >
                      <span class="vtg-letter">{beat.letter}</span>
                      <span class="vtg-text">{@render vtgLine(beat)}</span>
                    </button>
                  </li>
                {/each}
              </ol>
              <p class="note">{t("guide_three_levels_vtg_note")}</p>
            </section>
          </div>
        </div>
      </section>

      <section class="stop" aria-labelledby="stop-heading">
        <div class="stop-intro">
          <h2 id="stop-heading">{t("guide_three_levels_stop_title")}</h2>
          <p>
            {t("guide_three_levels_stop_body", {
              a: data.pair[0]!.pattern.name.code,
              b: data.pair[1]!.pattern.name.code,
              total: data.chartSize,
              words: data.distinctWords,
            })}
          </p>
        </div>
        <div class="pair">
          {#each data.pair as { record, pattern: p } (p.name.code)}
            <figure class="pair-item">
              <PatternPlayer
                {record}
                label={t("guide_three_levels_player_label", {
                  code: p.name.code,
                })}
              />
              <figcaption>
                <span class="pair-heading">
                  <span class="pair-code">{p.name.code}</span>
                  <span class="pair-word">{p.cell.join("")} ×{p.repeats}</span>
                </span>
                <ol class="vtg-rows compact">
                  {#each pairCell(p) as beat (beat.beat)}
                    <li class="vtg-row static">
                      <span class="vtg-letter">{beat.letter}</span>
                      <span class="vtg-text"
                        >{@render vtgLine(beat, (side) =>
                          differs(beat, side)
                        )}</span
                      >
                    </li>
                  {/each}
                </ol>
              </figcaption>
            </figure>
          {/each}
        </div>
      </section>

      <footer class="exits">
        <h2>{t("guide_three_levels_exits_title")}</h2>
        <div class="links">
          <LinkChip href={localHref("/guide/level-1/permutations")}
            >{t("guide_three_levels_exit_loops")}</LinkChip
          >
          <LinkChip href={localHref("/guide/codex")}
            >{t("guide_nav_codex")}</LinkChip
          >
          <LinkChip href={localHref("/guide/ratios")}
            >{t("guide_hub_ratios_title")}</LinkChip
          >
        </div>
      </footer>
    </article>
  </GuideShell>
{/if}

<style>
  .levels-guide {
    width: 100%;
    min-width: 0;
    max-width: 1180px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 6vw, 72px);
    --blue-ink: color-mix(
      in oklab,
      var(--dm-motion-blue, #3575e2) 72%,
      var(--theme-text)
    );
    --red-ink: color-mix(
      in oklab,
      var(--dm-motion-red, #ed1c24) 72%,
      var(--theme-text)
    );
  }
  /* guide.css centres every h1 on the hub's grid; this page reads left. */
  .levels-guide h1 {
    text-align: left;
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .levels-guide h2 {
    margin: 0;
  }
  .levels-guide p {
    margin: 0;
    line-height: 1.6;
  }
  /* guide.css dims every paragraph; the readings themselves are full ink. */
  .levels-guide .lede,
  .levels-guide .thesis,
  .levels-guide .code,
  .levels-guide .decode {
    color: var(--theme-text);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .lede {
    max-width: 64ch;
    font-size: 1.125rem;
  }
  .thesis {
    font-family: var(--font-serif, Georgia, serif);
    font-size: 1.25rem;
    font-style: italic;
  }

  /* ── Stage: picker, then the player beside the three levels ─────────── */
  .stage {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(16px, 2.5vw, 24px);
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    max-width: 760px;
  }
  .option-code {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .option-word {
    font-family: var(--font-serif, Georgia, serif);
    letter-spacing: 0.04em;
  }
  .picker :global(.segment-label) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .credit {
    font-size: 0.875rem;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
  }

  .stage-body {
    display: grid;
    grid-template-columns: clamp(260px, 36cqw, 420px) minmax(0, 1fr);
    column-gap: clamp(24px, 4cqw, 48px);
    row-gap: 24px;
    align-items: start;
  }
  .canvas-column {
    position: sticky;
    top: calc(var(--marketing-header-h, 64px) + 16px);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .hint {
    font-size: 0.875rem;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
  }
  /* Wide displays: text keeps its measure; the player gets the extra room. */
  @media (min-width: 1800px) {
    .levels-guide {
      max-width: 1560px;
    }
    .stage-body {
      grid-template-columns: clamp(260px, 40cqw, 640px) minmax(0, 1fr);
    }
  }
  @container (max-width: 640px) {
    .stage-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .canvas-column {
      position: static;
      width: min(100%, 360px);
      margin-inline: auto;
    }
  }

  .levels {
    display: flex;
    flex-direction: column;
    gap: clamp(20px, 3cqw, 28px);
    min-width: 0;
  }
  .level {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    padding-block-start: clamp(16px, 2cqw, 20px);
    border-block-start: 1px solid var(--theme-stroke);
  }
  .level:first-child {
    padding-block-start: 0;
    border-block-start: none;
  }
  .level-label {
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
  }
  .note {
    max-width: 62ch;
    font-size: 0.9375rem;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
  }

  .code {
    font-size: clamp(2.25rem, 5cqw, 3rem);
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .decode {
    max-width: 62ch;
  }

  /* The word, letters grouped into the cell it repeats. */
  .word {
    display: flex;
    flex-wrap: wrap;
    gap: 8px clamp(12px, 2cqw, 20px);
  }
  .cell {
    display: inline-flex;
    gap: 2px;
  }
  .letter {
    min-width: 44px;
    min-height: 48px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: inherit;
    font-family: var(--font-serif, Georgia, serif);
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .letter:hover {
    background: var(--theme-card-bg);
  }

  /* VTG: every beat, one row each. */
  .vtg-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .vtg-rows > li.cell-start {
    margin-block-start: 10px;
  }
  .vtg-row {
    width: 100%;
    min-height: 44px;
    display: grid;
    grid-template-columns: 1.75rem 1.75rem minmax(0, 1fr);
    align-items: baseline;
    column-gap: 10px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.9375rem;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .vtg-row:hover {
    background: var(--theme-card-bg);
  }
  .vtg-row.static {
    cursor: default;
    grid-template-columns: 1.75rem minmax(0, 1fr);
    padding: 6px 0;
    min-height: 0;
  }
  .vtg-row.static:hover {
    background: none;
  }
  .vtg-beat {
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .vtg-letter {
    font-family: var(--font-serif, Georgia, serif);
    font-size: 1.125rem;
    font-weight: 700;
  }
  .vtg-group {
    font-weight: 600;
    margin-inline-end: 0.5em;
  }
  .hand.blue {
    color: var(--blue-ink);
  }
  .hand.red {
    color: var(--red-ink);
  }
  .vtg-hybrid {
    margin-inline-start: 0.5em;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
    font-style: italic;
  }
  .hand.differs {
    font-weight: 700;
    background: color-mix(in oklab, currentColor 14%, transparent);
    border-radius: 4px;
    padding: 0 0.25em;
  }

  /* The lit beat: the whole letter or row, with aria-current as its
     non-colour cue. */
  .letter.active,
  .vtg-row.active {
    background: color-mix(
      in oklab,
      var(--theme-accent, #8b6cff) 18%,
      transparent
    );
    border-color: color-mix(
      in oklab,
      var(--theme-accent, #8b6cff) 55%,
      transparent
    );
  }
  .letter:focus-visible,
  .vtg-row:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  /* ── Where letters stop ────────────────────────────────────────────── */
  .stop {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(20px, 3vw, 32px);
  }
  .stop-intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .stop-intro p {
    max-width: 64ch;
    color: var(--theme-text-dim, oklch(0.72 0.01 270));
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(20px, 4cqw, 48px);
  }
  @container (max-width: 640px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .pair-item {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 2cqw, 20px);
  }
  .pair-item > :global(.pattern-player) {
    width: min(100%, 360px);
  }
  figcaption {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .pair-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.75em;
  }
  .pair-code {
    font-size: 1.5rem;
    font-weight: 700;
  }
  .pair-word {
    font-family: var(--font-serif, Georgia, serif);
    font-size: 1.25rem;
    letter-spacing: 0.04em;
  }

  .exits {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
  }

  @media (prefers-reduced-motion: reduce) {
    .letter,
    .vtg-row {
      transition: none;
    }
  }
</style>
