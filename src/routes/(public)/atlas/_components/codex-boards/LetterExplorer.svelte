<!--
  The letter explorer: every variation of one letter, with the turns and
  transforms the board has, plus Invert. One column: the controls, the
  variations, then where the letter is used. The variations are pictures, not
  choices; every control changes all of them at once, and they move the way
  the Composer's step grid moves (the shared pictograph edit clock).

  On a screen with room the variations are laid out to fit the dialog with
  nothing scrolling, and the dialog shrinks around them (LetterCodex sizes it
  to its content). A screen too small for that keeps four across and scrolls.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PictographTypeFrame from "#lib/shared/pictograph/shared/components/PictographTypeFrame.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    HandSide,
    MotionType,
    type RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import {
    generateSequenceRoutePath,
    UnencodableMotionError,
  } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { buildGalleryLetterHref } from "#lib/shared/browse/navigation/gallery-letter-link.js";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import CodexBoardControls from "./CodexBoardControls.svelte";
  import { fanOutDeck, type Box } from "./codex-fan";
  import {
    fitVariationColumns,
    scrollVariationColumns,
  } from "./variation-columns";
  import { type ExplorerTransformOp } from "./letter-explorer-transforms";

  let {
    label,
    tileKey,
    variations,
    selectedIndex,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    transformed,
    isLoading,
    loadError,
    learningMatches,
    learningError,
    composerHref,
    headerHeight,
    onTurnsChange,
    onRotationChange,
    onResetTurns,
    onTransform,
    onResetTransforms,
    onRetry,
    onLearningRetry,
    onCopyLink,
    propType,
    fan = null,
    onFanDone,
  }: {
    /** The letter the variations now draw (Invert changes it). */
    label: string;
    /** Stable per letter and grid, so each picture keeps its slot when edited. */
    tileKey: string;
    variations: PictographData[];
    /** The variation the clicked board cell draws: the deck's top card and
     *  the one Continue in Composer opens. */
    selectedIndex: number;
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    transformed: boolean;
    isLoading: boolean;
    loadError: boolean;
    learningMatches: readonly SequenceData[];
    learningError: boolean;
    composerHref: string | null;
    /** The dialog header's height, for the fit below it. */
    headerHeight: number;
    onTurnsChange: (hand: HandSide, delta: number) => void;
    onRotationChange: (hand: HandSide, direction: RotationDirection) => void;
    onResetTurns: () => void;
    onTransform: (op: ExplorerTransformOp) => void;
    onResetTransforms: () => void;
    onRetry: () => void;
    onLearningRetry: () => void;
    onCopyLink: () => void;
    /** The prop drawn in every picture; omitted draws staffs, as the board does. */
    propType?: PropType;
    /** Fan the variations out from this viewport rect (the clicked board
     *  cell) once they are laid out. A new key plays it again. */
    fan?: { origin: Box; key: number } | null;
    onFanDone?: () => void;
  } = $props();

  // Every variation of a letter shares its motion types, so the first one
  // says whether a hand's turns can take a rotation (dash and static only).
  function canRotate(motion: { motionType?: MotionType } | undefined): boolean {
    return (
      motion?.motionType === MotionType.DASH ||
      motion?.motionType === MotionType.STATIC
    );
  }
  const leftCanRotate = $derived(canRotate(variations[0]?.motions?.left));
  const rightCanRotate = $derived(canRotate(variations[0]?.motions?.right));

  // ── Fit ────────────────────────────────────────────────────────────────
  // The dialog may grow to the viewport cap BaseModal gives it (modal-tokens
  // .css, "fit"); the variations get what the header, controls and links
  // leave. Rows stay full (variation-columns.ts), and cells stop at maxCell
  // so a letter with few variations gets a small dialog, not huge pictures.
  const GAP = 10.4; // 0.65rem, the grid gap below
  const PAD = 16; // 1rem, .explorer padding and gap
  const MIN_FIT_CELL = 104;
  const MIN_SCROLL_CELL = 88;
  const PHONE = 520; // modal-tokens.css mobile breakpoint
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  // 240px, growing with tall screens so a 4K dialog is not a postage stamp.
  const maxCell = $derived(Math.max(240, Math.round(viewportHeight * 0.18)));
  let toolbarHeight = $state(0);
  let footerHeight = $state(0);
  const measured = $derived(
    viewportWidth > 0 && toolbarHeight > 0 && footerHeight > 0
  );

  const layout = $derived.by(() => {
    if (!measured || variations.length === 0) return null;
    const dialogWidth =
      viewportWidth <= PHONE ? viewportWidth - 32 : viewportWidth * 0.94;
    const dialogHeight = Math.min(viewportHeight * 0.9, viewportHeight - 32);
    const width = dialogWidth - 2 * PAD - 2;
    const height =
      dialogHeight - headerHeight - toolbarHeight - footerHeight - 4 * PAD - 2;
    const fit = fitVariationColumns(
      variations.length,
      width,
      height,
      GAP,
      maxCell
    );
    if (fit && fit.cell >= MIN_FIT_CELL) return { ...fit, fitted: true };
    // Too little height to fit: the dialog scrolls, through as few rows as
    // keep the pictures readable.
    const columns = scrollVariationColumns(
      variations.length,
      width,
      GAP,
      MIN_SCROLL_CELL
    );
    const cell = Math.floor(
      Math.min(maxCell, (width - (columns - 1) * GAP) / columns)
    );
    return { columns, cell, fitted: false };
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
    if (!grid || !layout || headerHeight === 0) {
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

  const galleryHref = $derived(buildGalleryLetterHref(label));
  // A card link is optional; the dialog is not. A card with a motion the
  // encoder cannot represent is left out instead of throwing during render.
  const learningLinks = $derived(
    learningMatches.flatMap((sequence) => {
      try {
        return [{ sequence, href: generateSequenceRoutePath(sequence) }];
      } catch (error) {
        if (!(error instanceof UnencodableMotionError)) throw error;
        console.warn(
          "[LetterExplorer] Leaving out a card link that cannot be encoded.",
          { sequenceId: sequence.id, field: error.field, value: error.value }
        );
        return [];
      }
    })
  );
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<div class="explorer" class:fitted={layout?.fitted}>
  <div class="toolbar" bind:clientHeight={toolbarHeight}>
    <CodexBoardControls
      {leftTurns}
      {rightTurns}
      {leftRotation}
      {rightRotation}
      {leftCanRotate}
      {rightCanRotate}
      {transformed}
      {onTurnsChange}
      {onRotationChange}
      {onTransform}
      onInvert={() => onTransform("invert")}
      {onResetTransforms}
      {onResetTurns}
    />
  </div>

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
      role="list"
      aria-label={`${label} variations`}
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

  <div class="footer" bind:clientHeight={footerHeight}>
    <div class="links">
      {#if learningLinks.length > 0}
        <span class="links-label">In TKA 1</span>
        {#each learningLinks as { sequence, href } (sequence.id)}
          <LinkChip {href}>
            {simplifyRepeatedWord(sequence.word || sequence.name)}
          </LinkChip>
        {/each}
      {:else if learningError}
        <FilterChipBase
          mode="action"
          size="sm"
          label="Retry TKA 1 cards"
          icon="fas fa-rotate-right"
          onclick={onLearningRetry}
        />
      {/if}
      <LinkChip href={galleryHref}>Find in Gallery</LinkChip>
    </div>
    <div class="actions">
      <button class="action secondary" type="button" onclick={onCopyLink}>
        <i class="fa-solid fa-link" aria-hidden="true"></i>
        Copy link
      </button>
      {#if composerHref}
        <a class="action primary" href={composerHref}>
          Continue in Composer
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </a>
      {/if}
    </div>
  </div>
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 0 1rem 1rem;
    --pictograph-border: none;
  }

  .toolbar :global(.board-controls) {
    padding: 0;
  }

  .variation-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
    justify-content: center;
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

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
  }

  .links,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .links-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 44px;
    padding: 0.55rem 0.95rem;
    border-radius: 11px;
    font-family: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }

  .action.secondary {
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .action.primary {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    color: #fff;
    background: color-mix(in srgb, var(--theme-accent) 82%, #111 18%);
  }

  .action:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (max-width: 520px) {
    .explorer {
      padding: 0 0.75rem 0.75rem;
    }

    .actions,
    .action {
      width: 100%;
    }

    .action {
      flex: 1 1 0;
    }
  }
</style>
