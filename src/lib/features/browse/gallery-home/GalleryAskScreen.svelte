<!--
  GalleryAskScreen: Browse > Sequences opens by asking two things, how long
  and what it starts with (Austen's pick A, 2026-11-13). One screen, no
  scrolling: tap a length, tap a letter, and the main button counts the pile.

  Placement is Wren's (E:/tka-layout/state/briefs/browse-ask-placement.md):
  the ask area is a size container and picks one of four arrangements from
  its own width and height (stack, wide stack, sideways, desktop). The CSS
  below is lifted from Wren's drawing; only the class names are new.

  Composes, adds no filter logic:
  - values: the gallery catalog's `lengthValues` (createGalleryCatalog) and
    the pool's starting letters (`deriveStartingLetters`), counted by the
    engine's `getFilteredCount`, so each question's counts follow the other
    question's answer;
  - applying: the drill's filter bindings (`replace`, `toggleValue`), which
    also send `browse_filter_applied`;
  - Other: the desktop row's Length menu (GalleryFilterMenu) with this tile
    as its trigger, so every length opens in the length editor;
  - tiles and buttons: FilterChipBase; letters: TKAWordGlyph (fitToParent);
  - disabled letters: `valueDisabled`.
-->
<script lang="ts">
  import { formatNumber } from "#lib/shared/i18n/i18n-formatters.js";
  import { onDestroy, onMount, tick } from "svelte";
  import {
    FIRST_VIEW_WAIT_MS,
    holdBootScreen,
  } from "#lib/shared/application/services/boot-screen.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
  import type { BrowseFilterSurface } from "#lib/shared/analytics/browse-events.js";
  import { resolveStepCount } from "#lib/shared/browse/services/browse-sorter.js";
  import { createGalleryCatalog } from "./gallery-drill-catalog.svelte";
  import { createDrillFilterBindings } from "./drill-filter-bindings.svelte";
  import { deriveStartingLetters } from "./pick-representatives";
  import { valueDisabled } from "./gallery-value-editor";
  import GalleryFilterMenu from "./GalleryFilterMenu.svelte";
  import {
    answerTap,
    appliedAnswer,
    askButtonLabel,
    countsAreReady,
    isFewLetter,
    letterRows,
    pickLengthTiles,
    type AskQuestion,
    type LengthTile,
  } from "./gallery-ask";

  let {
    engine,
    focusQuestion = "length",
    surface = "ask",
    onShow,
    onMoreFilters,
  }: {
    engine: BrowseEngine;
    /** Which question's heading takes focus when the screen opens: an answer
     * button reopens the screen at its own question. */
    focusQuestion?: AskQuestion;
    /** "answer_button" when an answer button on the cards reopened it. */
    surface?: BrowseFilterSurface;
    /** Main button: show the cards. */
    onShow: () => void;
    /** Opens the existing filter surface with every other filter. */
    onMoreFilters: () => void;
  } = $props();

  const filters = createDrillFilterBindings(() => engine, {
    surface: () => surface,
  });

  const pool = $derived(engine.allSequences);
  const catalog = createGalleryCatalog({
    get pool() {
      return pool;
    },
    getCount: (type, value) => engine.getFilteredCount(type, value),
    onToggleLoop: undefined,
    activeLoopValues: undefined,
    onToggleFamily: undefined,
    activeFamilyValues: undefined,
    onToggleValue: undefined,
    get isValueApplied() {
      return filters.isValueApplied;
    },
    unifiedFilterChooser: false,
    showCollections: false,
    showMandala: false,
    collections: undefined,
    drillWidth: 0,
    fluidWideCanvas: false,
  });

  const appliedValue = (type: BrowseFilterType) =>
    appliedAnswer(engine.activeFilters, type);
  const chosenLengthRaw = $derived(appliedValue(BrowseFilterType.LENGTH));
  const chosenLength = $derived(
    chosenLengthRaw === null ? null : Number(chosenLengthRaw)
  );
  const chosenLetter = $derived(
    (appliedValue(BrowseFilterType.STARTING_LETTER) as string | null) ?? null
  );

  // Ranked by the whole pool so the tiles hold still while the letter answer
  // changes the live counts.
  const poolLengthCounts = $derived.by(() => {
    const counts = new Map<number, number>();
    for (const seq of pool) {
      const n = resolveStepCount(seq);
      if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return counts;
  });
  const lengthTiles = $derived(
    pickLengthTiles(catalog.lengthValues, poolLengthCounts, chosenLength)
  );
  const maxLengthCount = $derived(
    Math.max(1, ...lengthTiles.map((tile) => tile.count))
  );

  // Every starting letter in the pool, not only those with results under the
  // length answer: a letter at zero stays in its cell, disabled, so the grid
  // keeps its shape.
  const letters = $derived(
    deriveStartingLetters(pool).map((value) => ({
      value,
      count: engine.getFilteredCount(BrowseFilterType.STARTING_LETTER, value),
    }))
  );
  const rows = $derived(letterRows(letters));

  // No tiles or counts until the whole pile is in: a first page or saved
  // copy arrives early and the rest seconds later, and counts that change
  // under a finger are worse than a short wait.
  const loading = $derived(!engine.poolComplete);

  // When this is the visit's first view, the boot screen stays up until the
  // counts are on screen, so the screen arrives finished instead of as grey
  // placeholders. Taken here, not in onMount, so it is held before the screen
  // can leave; it is a no-op once the boot screen is gone, so opening the ask
  // screen later inside the app holds nothing. The hold may run to
  // FIRST_VIEW_WAIT_MS after `ready`, the limit the other first views use; past
  // that the screen leaves anyway. The engine starts with nothing loading
  // (the parent initialises it after this mounts), so the first `!loading` is
  // not the end: see countsAreReady.
  let releaseCountsHold = holdBootScreen(
    "browse-ask-counts",
    FIRST_VIEW_WAIT_MS
  );
  let loadSeen = false;
  $effect(() => {
    if (loading) loadSeen = true;
    if (countsAreReady(loading, loadSeen, pool.length)) {
      // After the real tiles reach the page, so the screen leaves on them.
      void tick().then(() => releaseCountsHold());
    }
  });
  onDestroy(() => releaseCountsHold());

  const answered = $derived(chosenLength !== null || chosenLetter !== null);
  const button = $derived(askButtonLabel(engine.resultCount, answered));
  const formatCount = (n: number) => formatNumber(n);
  const buttonText = $derived(
    loading
      ? t("browse_audit_counting_matches")
      : button.label.key === "browse_ask_show_one"
        ? t("browse_ask_show_one")
        : t(button.label.key, { count: formatCount(button.label.count) })
  );
  // Reserved width: the longest form at the pile's digit count, drawn hidden
  // under the live words so the button never changes size as N changes.
  const buttonGhost = $derived(
    t("browse_ask_show_all", {
      count: formatCount(pool.length || 8888).replace(/\d/g, "8"),
    })
  );

  function tapLength(value: number, label: string): void {
    const tap = answerTap(chosenLength, value);
    if (tap.action === "clear") {
      filters.toggleValue(
        BrowseFilterType.LENGTH,
        value,
        label,
        undefined,
        false
      );
    } else {
      filters.replace(BrowseFilterType.LENGTH, value, label);
    }
  }

  function tapLetter(value: string): void {
    const tap = answerTap(chosenLetter, value);
    if (tap.action === "clear") {
      filters.toggleValue(
        BrowseFilterType.STARTING_LETTER,
        value,
        value,
        undefined,
        false
      );
    } else {
      filters.replace(BrowseFilterType.STARTING_LETTER, value, value);
    }
  }

  function lengthLabel(tile: Extract<LengthTile, { kind: "length" }>): string {
    return (
      catalog.lengthValues.find((v) => v.value === tile.value)?.label ??
      `${tile.value} steps`
    );
  }

  let otherOpen = $state(false);

  // The glyph follows the letter cell it sits in (36 to 128px across the
  // arrangements). Measured off the first cell; every cell is the same size.
  let cellHeight = $state(0);
  let cellWidth = $state(0);
  const glyphHeight = $derived(
    Math.max(
      14,
      Math.round(Math.min(cellHeight * 0.48, cellWidth * 0.62, 56) || 20)
    )
  );

  const lengthHeadingId = $props.id();
  const letterHeadingId = `${lengthHeadingId}-letter`;
  let root = $state<HTMLElement | null>(null);

  // Focus lands on the question's heading as the screen opens, as the old
  // chooser's heading did (WCAG 2.4.3).
  onMount(() => {
    const id = focusQuestion === "letter" ? letterHeadingId : lengthHeadingId;
    const frame = requestAnimationFrame(() =>
      root?.querySelector<HTMLElement>(`[id="${id}"]`)?.focus()
    );
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="ask" bind:this={root}>
  <div
    class="ask-in"
    class:seven-rows={rows.length > 6}
    style:--rows={Math.max(6, rows.length)}
  >
    <div class="qs">
      <section class="q q-len" role="group" aria-labelledby={lengthHeadingId}>
        <h2 id={lengthHeadingId} tabindex="-1">{t("browse_ask_how_long")}</h2>
        <div class="lens">
          {#if loading}
            {#each { length: 8 } as _, i (i)}
              <span class="tile placeholder" aria-hidden="true"></span>
            {/each}
          {:else}
            {#each lengthTiles as tile (tile.kind === "length" ? tile.value : "other")}
              {#if tile.kind === "length"}
                {@const label = lengthLabel(tile)}
                {@const applied = chosenLength === tile.value}
                <div class="tile len">
                  <FilterChipBase
                    mode="toggle"
                    {label}
                    active={applied}
                    disabled={valueDisabled(tile.count, applied)}
                    ariaLabel={t("browse_ask_length_tile_aria", {
                      length: tile.value,
                      count: formatCount(tile.count),
                    })}
                    onclick={() => tapLength(tile.value, label)}
                  >
                    {#snippet labelSnippet()}
                      <span class="len-body">
                        <b class="len-num">{tile.value}</b>
                        <span class="len-bar" aria-hidden="true"
                          ><span
                            style:width="{(tile.count / maxLengthCount) * 100}%"
                          ></span></span
                        >
                        <i class="len-count">{formatCount(tile.count)}</i>
                      </span>
                    {/snippet}
                  </FilterChipBase>
                </div>
              {:else}
                <div class="tile len other">
                  <GalleryFilterMenu
                    {engine}
                    kind="length"
                    {surface}
                    bind:open={otherOpen}
                  >
                    {#snippet trigger()}
                      <FilterChipBase
                        mode="toggle"
                        label={t("browse_ask_other_lengths")}
                        active={tile.chosen !== null}
                        ariaLabel={tile.chosen !== null
                          ? t("browse_ask_length_tile_aria", {
                              length: tile.chosen,
                              count: formatCount(engine.resultCount),
                            })
                          : t("browse_ask_other_lengths_aria")}
                        onclick={() => (otherOpen = !otherOpen)}
                      >
                        {#snippet labelSnippet()}
                          <span
                            class="len-body"
                            class:word={tile.chosen === null}
                          >
                            <b class="len-num"
                              >{tile.chosen ?? t("browse_ask_other_lengths")}</b
                            >
                            <span class="len-bar" aria-hidden="true"
                              ><span
                                style:width="{(tile.count / maxLengthCount) *
                                  100}%"
                              ></span></span
                            >
                            <i class="len-count"
                              >{tile.chosen !== null
                                ? t("browse_ask_other_lengths")
                                : formatCount(tile.count)}</i
                            >
                          </span>
                        {/snippet}
                      </FilterChipBase>
                    {/snippet}
                  </GalleryFilterMenu>
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </section>

      <section class="q q-let" role="group" aria-labelledby={letterHeadingId}>
        <h2 id={letterHeadingId} tabindex="-1">
          {t("browse_ask_starts_with")}
        </h2>
        <div class="lets">
          {#if loading}
            {#each { length: 46 } as _, i (i)}
              <span class="tile placeholder" aria-hidden="true"></span>
            {/each}
          {:else}
            {#each rows as row, r (r)}
              {#each row as letter, i (letter.value)}
                {@const applied = chosenLetter === letter.value}
                {#if r === 0 && i === 0}
                  <div
                    class="tile let row-start"
                    class:few={isFewLetter(letter.count)}
                    bind:clientHeight={cellHeight}
                    bind:clientWidth={cellWidth}
                  >
                    {@render letterChip(letter, applied)}
                  </div>
                {:else}
                  <div
                    class="tile let"
                    class:row-start={i === 0}
                    class:few={isFewLetter(letter.count)}
                  >
                    {@render letterChip(letter, applied)}
                  </div>
                {/if}
              {/each}
            {/each}
          {/if}
        </div>
      </section>
    </div>

    <div class="actions">
      <span class="more-btn">
        <FilterChipBase
          mode="action"
          labelScale="readable"
          label={t("browse_ask_more_filters")}
          icon="fas fa-sliders"
          onclick={onMoreFilters}
        />
      </span>
      <span class="go-btn">
        <FilterChipBase
          mode="action"
          emphasis="solid"
          active
          labelScale="readable"
          label={buttonText}
          disabled={loading || button.disabled}
          onclick={onShow}
        >
          {#snippet labelSnippet()}
            <span class="go-label" aria-hidden="true">
              <span class="go-ghost">{buttonGhost}</span>
              <span class="go-live">{buttonText}</span>
            </span>
          {/snippet}
        </FilterChipBase>
      </span>
    </div>
  </div>
</div>

{#snippet letterChip(
  letter: { value: string; count: number },
  applied: boolean
)}
  <FilterChipBase
    mode="toggle"
    label={letter.value}
    active={applied}
    disabled={valueDisabled(letter.count, applied)}
    ariaLabel={t("browse_audit_letter_sequence_count", {
      letter: letter.value,
      count: formatCount(letter.count),
    })}
    onclick={() => tapLetter(letter.value)}
  >
    {#snippet labelSnippet()}
      <span class="let-body">
        <span class="let-glyph" style:height="{glyphHeight}px">
          <TKAWordGlyph
            word={letter.value}
            height={glyphHeight}
            darkMode
            fitToParent
          />
        </span>
        <i class="let-count">{formatCount(letter.count)}</i>
      </span>
    {/snippet}
  </FilterChipBase>
{/snippet}

<style>
  /* ---------- The ask area (Wren's placement, lifted) ----------
     One size container; four arrangements chosen by its own width and
     height. Row heights grow with the room (clamped), never the type. */
  .ask {
    flex: 1;
    min-height: 0;
    min-width: 0;
    height: 100%;
    container: ask / size;
  }
  .ask-in {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* 1. Stack (phones upright). One eight-column grid: a length tile spans
     two letter columns. Fixed height here: 10 pad + 2 x 28 headings + 12 +
     6 + the letter gaps + 64 action bar. */
  .qs {
    flex: 1;
    min-height: 0;
    display: grid;
    align-content: space-evenly;
    row-gap: 12px;
    --gut: 14px;
    --gap: 6px;
    --fixed: calc(148px + (var(--rows) - 1) * var(--gap));
    padding: 10px var(--gut) 0;
    --lr: clamp(
      36px,
      calc((100cqh - var(--fixed)) / (var(--rows) + 2.4)),
      64px
    );
    --nr: clamp(
      44px,
      calc((100cqh - var(--fixed) - var(--rows) * var(--lr)) / 2),
      96px
    );
  }
  .q {
    min-width: 0;
  }
  .q h2 {
    margin: 0 0 6px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-md, 16px);
    font-weight: 800;
    line-height: 22px;
  }
  .q h2:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .q h2:focus:not(:focus-visible) {
    outline: none;
  }
  .lens {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: var(--nr);
    gap: var(--gap);
  }
  .lets {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-auto-rows: var(--lr);
    gap: var(--gap);
  }
  .tile {
    display: grid;
    min-width: 0;
    min-height: 0;
  }
  .tile.row-start {
    grid-column-start: 1;
  }
  .tile.placeholder {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  /* FilterChipBase as a tile: fill the cell, square-ish corners, content
     centred. Its colours, selected tint, focus ring and disabled look stay
     the primitive's. */
  .tile :global(.filter-chip) {
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: 0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    align-content: center;
    overflow: hidden;
    white-space: normal;
  }

  .len-body {
    display: grid;
    place-items: center;
    align-content: center;
    min-width: 0;
  }
  .len-num {
    color: var(--theme-text, #fff);
    font-size: clamp(
      var(--font-size-base),
      calc(var(--nr) * 0.36),
      var(--font-size-3xl)
    );
    font-weight: 700;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }
  .len-body.word .len-num {
    font-size: clamp(
      var(--font-size-sm),
      calc(var(--nr) * 0.3),
      var(--font-size-base)
    );
    line-height: 1.15;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .len-count,
  .let-count {
    font-style: normal;
    font-size: var(--font-size-xs);
    line-height: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-variant-numeric: tabular-nums;
  }
  .len-bar {
    display: none;
  }

  .let-body {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    width: 100%;
    min-width: 0;
  }
  .let-glyph {
    display: flex;
    justify-content: center;
    width: calc(100% - 4px);
    min-width: 0;
  }
  .let-count {
    display: none;
  }
  /* Below the count threshold a letter with few sequences is only dimmer. */
  .tile.let.few :global(.filter-chip:not(.active) .let-glyph) {
    opacity: 0.55;
  }
  /* Letters carry their count once a row is 48 tall. */
  @container ask (min-height: 582px) {
    .let-count {
      display: block;
    }
    .tile.let.few :global(.filter-chip:not(.active) .let-glyph) {
      opacity: 1;
    }
  }

  .actions {
    flex: none;
    display: flex;
    gap: 8px;
    padding: 10px var(--gut, 14px);
    --gut: 14px;
  }
  .actions :global(.filter-chip) {
    height: 44px;
    border-radius: 12px;
    justify-content: center;
  }
  .more-btn {
    display: flex;
    flex: none;
  }
  .go-btn {
    display: flex;
    flex: 1;
    min-width: 0;
  }
  .go-btn :global(.filter-chip) {
    width: 100%;
  }
  /* Set on the label itself: the chip primitive sizes its own text at 14px
     with a more specific rule. Wren drew this button at 15px, weight 800. */
  .go-label {
    display: grid;
    min-width: 0;
    font-size: var(--font-size-sm);
    font-weight: 800;
  }
  /* Under 400 wide "More filters" and "Show all 8,888 sequences" cannot share
     the row (Wren: the primary never wraps). "More filters" becomes a 44px
     icon button; the chip keeps "More filters" as its accessible name. */
  @container ask (max-width: 399px) {
    .actions .more-btn :global(.filter-chip) {
      width: 44px;
      padding: 0;
      gap: 0;
    }
    .actions .more-btn :global(.chip-label) {
      display: none;
    }
  }
  .go-ghost,
  .go-live {
    grid-area: 1 / 1;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .go-ghost {
    visibility: hidden;
  }

  /* Fallback for a seventh letter row on the shortest phone: length tiles
     drop to 36 tall without their counts, tighter paddings and gaps. */
  @container ask (max-height: 539px) {
    .ask-in.seven-rows .qs {
      row-gap: 6px;
      padding-top: 6px;
      --gap: 4px;
      --fixed: calc(160px + (var(--rows) - 1) * var(--gap));
      --nr: clamp(
        36px,
        calc((100cqh - var(--fixed) - var(--rows) * var(--lr)) / 2),
        96px
      );
    }
    .ask-in.seven-rows .len-count {
      display: none;
    }
  }

  /* 2. Wide stack (Fold unfolded, tablet upright): lengths in one row, each
     over a letter column. */
  @container ask (min-width: 600px) {
    .qs {
      --gut: 20px;
      --gap: 8px;
      --fixed: calc(142px + (var(--rows) - 1) * var(--gap));
      --lr: clamp(
        40px,
        calc((100cqh - var(--fixed)) / (var(--rows) + 1.2)),
        88px
      );
      --nr: clamp(
        48px,
        calc(100cqh - var(--fixed) - var(--rows) * var(--lr)),
        110px
      );
    }
    .lens {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
    .actions {
      --gut: 20px;
    }
    .let-count {
      display: block;
    }
  }

  /* 3. Sideways phone (short and wide): lengths and the buttons in a left
     column, letters beside them. */
  @container ask (max-height: 479px) and (min-width: 480px) {
    .ask-in {
      display: grid;
      grid-template-columns: 184px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      column-gap: 16px;
      padding: 10px 14px;
    }
    .qs {
      display: contents;
      --gap: 6px;
      --lr: clamp(
        36px,
        calc((100cqh - 48px - (var(--rows) - 1) * var(--gap)) / var(--rows)),
        56px
      );
      --nr: clamp(40px, calc((100cqh - 164px) / 4), 64px);
    }
    .q-len {
      grid-column: 1;
      grid-row: 1;
    }
    .q-let {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .lens {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .actions {
      grid-column: 1;
      grid-row: 2;
      flex-direction: column;
      gap: 6px;
      padding: 12px 0 0;
    }
    /* The 184px column holds the longest label only at 12px with 8px sides. */
    .go-btn :global(.filter-chip) {
      padding: 0 8px;
    }
    .go-label {
      font-size: var(--font-size-xs);
    }
    .more-btn :global(.filter-chip) {
      width: 100%;
      height: 36px;
    }
    .let-count {
      display: block;
    }
  }

  /* 4. Desktop: lengths left as the length menu's rows (numeral, bar,
     count), letters right, buttons right-aligned and sized to their words. */
  @container ask (min-width: 1100px) and (min-height: 480px) {
    .ask-in {
      display: grid;
      grid-template-columns: 300px minmax(0, 1094px);
      grid-template-rows: auto auto;
      column-gap: 32px;
      padding: 24px 24px 0;
      justify-content: center;
      align-content: center;
    }
    .qs {
      display: contents;
      --gap: 10px;
      --lr: clamp(
        56px,
        calc((100cqh - 150px - (var(--rows) - 1) * var(--gap)) / var(--rows)),
        112px
      );
      /* Eight length rows as tall together as the letter block. */
      --nr: calc(
        (var(--rows) * var(--lr) + (var(--rows) - 1) * var(--gap) - 56px) / 8
      );
    }
    .q h2 {
      font-size: var(--font-size-lg, 20px);
      line-height: 28px;
      margin-bottom: 10px;
    }
    .q-len {
      grid-column: 1;
      grid-row: 1;
    }
    .q-let {
      grid-column: 2;
      grid-row: 1;
    }
    .lens {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .len :global(.filter-chip) {
      place-items: stretch;
      padding: 0 16px;
    }
    .len-body {
      grid-template-columns: 64px minmax(0, 1fr) auto;
      align-items: center;
      justify-items: start;
      column-gap: 12px;
      width: 100%;
      height: 100%;
    }
    .len-num,
    .len-body.word .len-num {
      font-size: var(--font-size-2xl);
      text-align: start;
    }
    .len-body.word .len-num {
      font-size: var(--font-size-base);
    }
    .len-count {
      font-size: var(--font-size-sm);
      line-height: 18px;
    }
    .len-bar {
      display: block;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
      overflow: hidden;
    }
    .len-bar > span {
      display: block;
      height: 100%;
      background: var(--theme-accent);
    }
    .let-count {
      display: block;
      font-size: var(--font-size-xs);
    }
    .actions {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-content: flex-end;
      padding: 16px 0 24px;
    }
    .go-btn {
      flex: none;
    }
    .actions :global(.filter-chip) {
      height: 48px;
      padding: 0 24px;
    }
    .go-btn :global(.filter-chip) {
      padding: 0 28px;
    }
    .go-label {
      font-size: var(--font-size-base);
    }
  }
</style>
