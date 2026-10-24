<!--
  Every variation of one letter, as pictures laid out to fill the box the
  host gives (width by height), with the deck fanned from the clicked board
  cell and a shimmer in each slot until its picture is drawn. The dialog
  (LetterExplorer) and the Letter screen (/codex drill-down) both draw these,
  so the two never show different pictures.

  Rows stay full (variation-columns.ts). Below minFitCell the grid stops
  fitting: "scroll" keeps as few rows as stay readable and lets the host
  scroll (the dialog on a short screen); "pan" draws one row that pans
  sideways inside this box (the Letter screen, which never scrolls).
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PictographTypeFrame from "#lib/shared/pictograph/shared/components/PictographTypeFrame.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { fanOutDeck, type Box } from "./codex-fan";
  import {
    fitVariationColumns,
    scrollVariationColumns,
    tallVariationColumnChoices,
    variationColumnChoices,
  } from "./variation-columns";

  let {
    label,
    tileKey,
    variations,
    selectedIndex,
    propType,
    fan = null,
    onFanDone,
    width,
    height,
    overflow = "scroll",
    minFitCell = 104,
    maxCell,
    isLoading,
    loadError,
    onRetry,
  }: {
    /** The letter the variations now draw (Invert changes it). */
    label: string;
    /** Stable per letter and grid, so each picture keeps its slot when edited. */
    tileKey: string;
    variations: PictographData[];
    /** The variation the clicked board cell draws: the deck's top card. */
    selectedIndex: number;
    /** The prop drawn in every picture; omitted draws staffs, as the board does. */
    propType?: PropType;
    /** Fan the variations out from this viewport rect (the clicked board
     *  cell) once they are laid out. A new key plays it again. */
    fan?: { origin: Box; key: number } | null;
    onFanDone?: () => void;
    /** The box the grid may fill, in px; 0 until the host has measured it.
     *  The dialog passes what its header, toolbar and footer leave; a screen
     *  passes its content area. */
    width: number;
    height: number;
    overflow?: "scroll" | "pan";
    minFitCell?: number;
    /** Cells stop growing here. Omitted, 240px, growing with tall screens so
     *  a 4K dialog is not a postage stamp. */
    maxCell?: number;
    isLoading: boolean;
    loadError: boolean;
    onRetry: () => void;
  } = $props();

  // ── Fit ────────────────────────────────────────────────────────────────
  const GAP = 10.4; // 0.65rem, the grid gap below
  const MIN_SCROLL_CELL = 88;
  let viewportHeight = $state(0);
  const cellCap = $derived(
    maxCell ?? Math.max(240, Math.round(viewportHeight * 0.18))
  );

  const layout = $derived.by(() => {
    if (width <= 0 || height <= 0 || variations.length === 0) return null;
    const fit = fitVariationColumns(
      variations.length,
      width,
      height,
      GAP,
      cellCap,
      // A screen of its own (the Letter screen) may also go two across.
      overflow === "pan"
        ? tallVariationColumnChoices(variations.length)
        : variationColumnChoices(variations.length)
    );
    if (fit && fit.cell >= minFitCell) {
      return { ...fit, fitted: true, panning: false };
    }
    if (overflow === "pan") {
      // One row, as tall as the box allows, panning sideways inside it.
      const cell = Math.floor(Math.min(cellCap, height));
      return {
        columns: variations.length,
        cell,
        fitted: false,
        panning: true,
      };
    }
    // Too little height to fit: the host scrolls, through as few rows as
    // keep the pictures readable.
    const columns = scrollVariationColumns(
      variations.length,
      width,
      GAP,
      MIN_SCROLL_CELL
    );
    const cell = Math.floor(
      Math.min(cellCap, (width - (columns - 1) * GAP) / columns)
    );
    return { columns, cell, fitted: false, panning: false };
  });

  // ── Deck ───────────────────────────────────────────────────────────────
  // The deck fans out once the cards have their final layout. Until then the
  // cards are hidden so they never flash in their slots first.
  let variationGrid = $state<HTMLElement | null>(null);
  let fannedKey = $state<number | null>(null);
  let stopFan: (() => void) | null = null;
  const awaitingFan = $derived(fan !== null && fan.key !== fannedKey);

  function settleFan(key: number): void {
    fannedKey = key;
    onFanDone?.();
  }

  $effect(() => {
    if (!fan || fan.key === fannedKey) return;
    const { key, origin } = fan;
    // Give up rather than hide the cards if they never lay out.
    const giveUp = setTimeout(() => settleFan(key), 2000);
    const grid = variationGrid;
    if (!grid || !layout) {
      return () => clearTimeout(giveUp);
    }
    const unclip = layout.fitted;
    const frame = requestAnimationFrame(() => {
      clearTimeout(giveUp);
      stopFan?.();
      fannedKey = key;
      stopFan = fanOutDeck(grid, origin, {
        selectedIndex,
        unclip,
        onDone: () => {
          stopFan = null;
          onFanDone?.();
        },
      });
    });
    return () => {
      clearTimeout(giveUp);
      cancelAnimationFrame(frame);
    };
  });

  onDestroy(() => stopFan?.());

  // A picture shimmers in its slot until its first drawing is ready.
  let readyTiles = $state<ReadonlySet<string>>(new Set());
  function markReady(key: string): void {
    if (readyTiles.has(key)) return;
    readyTiles = new Set(readyTiles).add(key);
  }
</script>

<svelte:window bind:innerHeight={viewportHeight} />

{#if loadError}
  <div class="load-state" role="alert">
    <span>The variations did not load.</span>
    <FilterChipBase
      mode="action"
      size="sm"
      label="Try again"
      icon="fas fa-rotate-right"
      onclick={onRetry}
    />
  </div>
{:else if isLoading}
  <div class="load-state" role="status" aria-label="Loading variations">
    <ShimmerBlock width="100%" height="100%" borderRadius="0" />
  </div>
{:else if variations.length === 0}
  <div class="load-state">No variations recorded.</div>
{:else}
  <div
    bind:this={variationGrid}
    class="variation-grid"
    class:awaiting-fan={awaitingFan || !layout}
    class:panning={layout?.panning}
    role="list"
    aria-label={`${label} variations`}
    data-variation-cell={layout?.cell}
    style:grid-template-columns={layout
      ? `repeat(${layout.columns}, ${layout.cell}px)`
      : undefined}
  >
    {#each variations as pictograph, index (`${tileKey}-${index}`)}
      {@const key = `${tileKey}-${index}`}
      <div class="tile" role="listitem" data-variation-index={index}>
        <div class="variation-picture">
          <PictographTypeFrame letter={pictograph.letter}>
            <div class="drawing">
              <PictographContainer
                pictographData={pictograph}
                transitionKey={`codex-${key}`}
                themeOverride="dark"
                showGrid
                showTKA
                showReversals={false}
                showNonRadialPoints={pictograph.motions?.left?.gridMode ===
                  GridMode.BOX}
                showHandPoints={false}
                showTnD={false}
                showElemental={false}
                showPropTnD={false}
                showPlacements={false}
                showHandColorKey={false}
                stepNumberOverride={false}
                leftPropTypeOverride={propType ?? PropType.STAFF}
                rightPropTypeOverride={propType ?? PropType.STAFF}
                onReady={() => markReady(key)}
              />
              {#if !readyTiles.has(key)}
                <div
                  class="tile-shimmer"
                  out:opaqueFade={{ duration: DURATION.fast }}
                >
                  <ShimmerBlock width="100%" height="100%" borderRadius="0" />
                </div>
              {/if}
            </div>
          </PictographTypeFrame>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .variation-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
    justify-content: center;
  }

  /* One row wider than its box: it pans sideways inside the box, which is
     the only thing that moves (the page never scrolls). */
  .variation-grid.panning {
    justify-content: start;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .tile {
    min-width: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .variation-picture {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .drawing {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .tile-shimmer {
    position: absolute;
    inset: 0;
    display: grid;
  }

  /* The deck (codex-fan.ts): cards wait unseen for their first frame, then
     each flies on its own compositor layer, made up front rather than on
     the first animated frame. */
  .variation-grid.awaiting-fan .tile {
    opacity: 0;
  }

  .variation-grid:global(.fanning) .tile {
    will-change: transform;
  }

  .load-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    min-height: 12rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-sm, 0.875rem);
    text-align: center;
  }

  .load-state[role="status"] {
    display: grid;
  }
</style>
