<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    CardFooter,
    DeckReleaseCard,
  } from "../../domain/models/DeckRelease";
  import type { CardPair } from "../../services/types";
  import PrintPreviewPages from "../print-preview/PrintPreviewPages.svelte";
  import PrintPreviewToolbar from "../print-preview/PrintPreviewToolbar.svelte";
  import CardInspectModal from "../CardInspectModal.svelte";
  import CopyForAIButton from "$lib/shared/foundation/ui/CopyForAIButton.svelte";
  import DeckPropSwitcher from "./DeckPropSwitcher.svelte";
  import type { CardSizeId, PaperSizeId } from "../../domain/card-sizes";
  import type { TnDElement } from "../../domain/tnd-element";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
  import FilterRuleStrip from "$lib/shared/browse/components/FilterRuleStrip.svelte";

  interface Props {
    cards: DeckReleaseCard[];
    sequences: SequenceData[];
    theme: string;
    leftPropType?: PropType;
    rightPropType?: PropType;
    nextDeckNumber: number;
    /** The deck's own number (reference # for generated, release # for released).
     *  Titles an unnamed deck so it reads "Deck #007", never a stale name. */
    refNumber?: number;
    deckName?: string;
    /** Concise recipe line shown centered in the preview's top margin, mirroring
     *  the exported PDF sheet. */
    deckSummary?: string;
    /** Gallery rule that produced the deck. Review shows the same grouped rule
     *  sentence as the canonical Gallery workspace, without edit controls. */
    galleryFilterSpec?: SmartFilterSpec | null;
    onSwapCard: (index: number) => void;
    /** Remove a card from the deck (LOOP decks only). Passed the sequence so the
     *  tab can resolve its real index regardless of the current sort. */
    onRemoveCard?: (sequence: SequenceData) => void;
    /** Show the Remove action in the card inspect modal (LOOP decks). */
    allowRemove?: boolean;
    onRedraw: () => void;
    /** Re-query the gallery and replace the on-screen deck (gallery decks). */
    onRefresh?: () => void;
    onRelease: () => void;
    onBack: () => void;
    /** Provided when viewing a released deck: commit an inline name edit. */
    onRename?: (name: string) => void;
    isReleasing: boolean;
    readOnly?: boolean;
    footers?: CardFooter[];
    onContextMenu?: (
      x: number,
      y: number,
      rerender: () => void,
      sequence?: SequenceData
    ) => void;
    brokenLoopCount?: number;
    /** Reroll only makes sense for randomly-rolled decks (LOOP). TnD is a finite,
     *  deterministic enumeration, so the redraw button is hidden for it. */
    showRedraw?: boolean;
    /** Show the deck prop switcher in the header (TnD/Gallery decks — they have no
     *  canonical prop; the switcher sets the live prop and re-renders). */
    showPropSwitcher?: boolean;
    /** Show the Refresh-from-gallery action (gallery decks). */
    showRefresh?: boolean;
    cardSize: CardSizeId;
    paperSize: PaperSizeId;
    copies: number;
    groupByElement: boolean;
    groupByLetter: boolean;
    includeHowToRead: boolean;
    /** Builds the markdown deck bundle for the Copy-for-AI button. */
    getAiSummary: () => string;
    sortedSequences: SequenceData[];
    sortedFooters: CardFooter[];
    cardTitles?: string[];
    qrUrls?: (string | undefined)[];
    cardProfile?: "sequence" | "hand-path";
    tndElements: (TnDElement | undefined)[];
    copiesPresets: number[];
    copiesAnnotate: (n: number) => { blanks: number; perfect: boolean } | null;
    isRendering: boolean;
    renderProgress: number;
    renderTotal: number;
    rerenderKey: number;
    sideFilter: "fronts" | "backs" | null;
    onCardSizeChange: (s: CardSizeId) => void;
    onPaperSizeChange: (s: PaperSizeId) => void;
    onCopiesChange: (n: number) => void;
    onGroupByElementChange: (on: boolean) => void;
    onGroupByLetterChange: (on: boolean) => void;
    onRerender: () => void;
    onPairPreparerReady: (prepare: (() => Promise<CardPair[]>) | null) => void;
    onRenderStateChange: (s: {
      isRendering: boolean;
      progress: number;
      total: number;
    }) => void;
  }

  let {
    cards,
    sequences,
    theme,
    leftPropType,
    rightPropType,
    nextDeckNumber,
    refNumber = 0,
    deckName = "",
    deckSummary = "",
    galleryFilterSpec = null,
    onSwapCard,
    onRemoveCard,
    allowRemove = false,
    onRedraw,
    onRefresh,
    onRelease,
    onBack,
    onRename,
    isReleasing,
    readOnly = false,
    footers,
    onContextMenu,
    brokenLoopCount = 0,
    showRedraw = true,
    showPropSwitcher = false,
    showRefresh = false,
    cardSize,
    paperSize,
    copies,
    groupByElement,
    groupByLetter,
    includeHowToRead,
    getAiSummary,
    sortedSequences,
    sortedFooters,
    cardTitles = [],
    qrUrls,
    cardProfile = "sequence",
    tndElements,
    copiesPresets,
    copiesAnnotate,
    isRendering,
    renderProgress,
    renderTotal,
    rerenderKey,
    sideFilter,
    onCardSizeChange,
    onPaperSizeChange,
    onCopiesChange,
    onGroupByElementChange,
    onGroupByLetterChange,
    onRerender,
    onPairPreparerReady,
    onRenderStateChange,
  }: Props = $props();

  // Editable mirror of the deckName prop. A reassignable $derived shows the
  // current prop, lets the input override it while typing (bind:value), and
  // resets to the prop when it changes externally — no prop→state sync effect.
  let nameDraft = $derived(deckName);

  function commitName() {
    const t = nameDraft.trim();
    if (t && t !== deckName) {
      onRename?.(t);
    } else {
      nameDraft = deckName;
    }
  }

  function handleNameKey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    else if (e.key === "Escape") {
      nameDraft = deckName;
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  let inspectedSequence = $state<SequenceData | null>(null);
  let inspectedFrontImageUrl = $state<string | null>(null);
  let inspectedRerender = $state<(() => Promise<string | null>) | null>(null);

  const distribution = $derived.by(() => {
    const dist: Record<number, number> = {};
    for (const sequence of sortedSequences) {
      const stepCount = sequence.steps?.length ?? 0;
      dist[stepCount] = (dist[stepCount] ?? 0) + 1;
    }
    return Object.entries(dist)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([step, count]) => ({ step: Number(step), count }));
  });

  // One clean line: a single step length collapses to "4-step"; a mix lists
  // each length with its count.
  const stepSummary = $derived(
    distribution.length === 1
      ? `${distribution[0]!.step}-step`
      : distribution.map((d) => `${d.step}-step ×${d.count}`).join("  ·  ")
  );
  const contentCardCount = $derived(sortedSequences.length);
  const isHandPathDeck = $derived(cardProfile === "hand-path");

  function handleCardClick(
    sequence: SequenceData,
    frontImageUrl?: string,
    rerender?: () => Promise<string | null>
  ) {
    inspectedFrontImageUrl = frontImageUrl ?? null;
    inspectedRerender = rerender ?? null;
    inspectedSequence = sequence;
  }

  function handleSwapInspected() {
    if (!inspectedSequence) return;
    const idx = sequences.findIndex((s) => s.id === inspectedSequence!.id);
    if (idx >= 0) {
      onSwapCard(idx);
      inspectedSequence = null;
      inspectedFrontImageUrl = null;
    }
  }

  function handleRemoveInspected() {
    if (!inspectedSequence || !onRemoveCard) return;
    onRemoveCard(inspectedSequence);
    inspectedSequence = null;
    inspectedFrontImageUrl = null;
    inspectedRerender = null;
  }
</script>

<div class="review-step">
  <div class="review-header">
    <button type="button" class="back-btn" onclick={onBack}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      {readOnly ? "Back to Composer" : "Back"}
    </button>

    <div class="deck-info">
      {#if onRename}
        <input
          class="deck-name-input"
          type="text"
          bind:value={nameDraft}
          onblur={commitName}
          onkeydown={handleNameKey}
          maxlength="60"
          aria-label="Deck name (click to edit)"
          title="Click to rename"
        />
      {:else}
        <h2 class="deck-number" class:placeholder={!deckName}>
          {deckName || `Deck #${String(refNumber).padStart(3, "0")}`}
        </h2>
      {/if}
      <div class="deck-meta">
        <!-- Printed count follows the optional insert so the header, preview,
             and export panel always describe the same physical deck. -->
        <span
          class="meta-cards"
          title={includeHowToRead
            ? `${contentCardCount} ${isHandPathDeck ? "reference" : "sequence"} cards + 1 How to Read card`
            : `${contentCardCount} ${isHandPathDeck ? "reference" : "sequence"} cards`}
          >{contentCardCount + (includeHowToRead ? 1 : 0)} cards</span
        >
        {#if stepSummary}
          <span class="meta-sep" aria-hidden="true">·</span>
          <span class="meta-steps">{stepSummary}</span>
        {/if}
        {#if brokenLoopCount > 0}
          <span class="meta-sep" aria-hidden="true">·</span>
          <span
            class="meta-broken"
            title="These cards' turns don't return the prop to its start orientation. Redraw to reroll."
          >
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            {brokenLoopCount} break loop
          </span>
        {/if}
      </div>
    </div>

    <div class="action-buttons">
      {#if showPropSwitcher}
        <DeckPropSwitcher />
      {/if}
      <CopyForAIButton
        getData={getAiSummary}
        variant="icon-text"
        size="sm"
        idleIcon="fa-robot"
        ariaLabel="Copy deck info for AI"
        labels={{ idle: "Copy for AI" }}
        useToast
      />
      {#if !readOnly && showRedraw}
        <button
          type="button"
          class="redraw-btn"
          onclick={onRedraw}
          disabled={isReleasing}
        >
          <i class="fas fa-dice" aria-hidden="true"></i>
          Redraw
        </button>
      {/if}
      {#if showRefresh && onRefresh}
        <button
          type="button"
          class="redraw-btn"
          onclick={onRefresh}
          disabled={isReleasing}
          title="Re-query your gallery for current matches"
        >
          <i class="fas fa-rotate" aria-hidden="true"></i>
          Refresh
        </button>
      {/if}
    </div>
  </div>

  {#if galleryFilterSpec}
    <div class="gallery-rule-band" aria-label="Gallery recipe">
      <span class="gallery-rule-source">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        Built from Gallery
      </span>
      {#if galleryFilterSpec.filters.length > 0 || galleryFilterSpec.searchQuery?.trim()}
        <FilterRuleStrip
          filters={galleryFilterSpec.filters}
          connectives={galleryFilterSpec.connectives}
          searchQuery={galleryFilterSpec.searchQuery}
          interactive={false}
        />
      {:else}
        <span class="gallery-rule-empty">All library sequences</span>
      {/if}
    </div>
  {/if}

  <PrintPreviewToolbar
    {cardSize}
    {paperSize}
    totalCards={contentCardCount}
    {isRendering}
    {renderProgress}
    {renderTotal}
    {onCardSizeChange}
    {onPaperSizeChange}
    {onRerender}
    {copies}
    {onCopiesChange}
    {copiesPresets}
    {copiesAnnotate}
    groupByElement={isHandPathDeck ? undefined : groupByElement}
    onGroupByElementChange={isHandPathDeck ? undefined : onGroupByElementChange}
    groupByLetter={isHandPathDeck ? undefined : groupByLetter}
    onGroupByLetterChange={isHandPathDeck ? undefined : onGroupByLetterChange}
  />

  <div class="preview-area">
    <PrintPreviewPages
      sequences={sortedSequences}
      {cardSize}
      {paperSize}
      {theme}
      {leftPropType}
      {rightPropType}
      {rerenderKey}
      {copies}
      {groupByElement}
      {sideFilter}
      footers={sortedFooters}
      {cardTitles}
      {qrUrls}
      {cardProfile}
      {tndElements}
      isLoading={false}
      includeStartPlacement={true}
      deckMode={true}
      deckNumber={refNumber}
      includeInsertCard={includeHowToRead}
      displayMode="sheets"
      deckId={String(nextDeckNumber).padStart(3, "0")}
      deckName={`LOOP Deck #${nextDeckNumber}`}
      {deckSummary}
      onCardClick={isHandPathDeck ? undefined : handleCardClick}
      onCardContextMenu={!isHandPathDeck && onContextMenu
        ? (x, y, rerender, sequence) => onContextMenu(x, y, rerender, sequence)
        : undefined}
      {onPairPreparerReady}
      {onRenderStateChange}
    />
  </div>
</div>

{#if inspectedSequence}
  <CardInspectModal
    sequence={inspectedSequence}
    frontImageUrl={inspectedFrontImageUrl}
    {leftPropType}
    {rightPropType}
    includeStartPlacement={true}
    onContextMenu={onContextMenu
      ? (x, y, _rerender) => {
          onContextMenu(
            x,
            y,
            () => {
              if (inspectedRerender) {
                inspectedRerender().then((newUrl) => {
                  if (newUrl) inspectedFrontImageUrl = newUrl;
                });
              }
            },
            inspectedSequence ?? undefined
          );
        }
      : undefined}
    onClose={() => {
      inspectedSequence = null;
      inspectedFrontImageUrl = null;
      inspectedRerender = null;
    }}
  >
    {#snippet extraActions()}
      {#if !readOnly}
        <button
          class="copy-btn swap-btn"
          onclick={handleSwapInspected}
          aria-label="Swap card"
        >
          <i class="fas fa-random"></i> Swap Card
        </button>
      {/if}
      {#if allowRemove}
        <button
          class="copy-btn remove-btn"
          onclick={handleRemoveInspected}
          aria-label="Remove this card from the deck"
        >
          <i class="fas fa-trash"></i> Remove
        </button>
      {/if}
    {/snippet}
  </CardInspectModal>
{/if}

<style>
  .review-step {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    container-type: inline-size;
  }

  .review-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-wrap: wrap;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    min-height: 44px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: 14px;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .back-btn:hover {
    transform: translateX(-2px);
    background: var(--theme-card-hover-bg);
  }

  .back-btn:active {
    transform: translateX(-2px) scale(0.98);
  }

  .deck-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .deck-number {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--theme-text, #fff);
    text-align: center;
  }

  /* Unnamed draft: dim + italic so the placeholder reads as "not yet named"
     rather than an actual deck title. */
  .deck-number.placeholder {
    font-weight: 600;
    font-style: italic;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .deck-name-input {
    display: block;
    width: 100%;
    max-width: 460px;
    margin: 0;
    padding: 4px 12px;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-align: center;
    color: var(--theme-text, #fff);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: text;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .deck-name-input:hover {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .deck-name-input:focus {
    outline: none;
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent, #8b5cf6);
  }

  .deck-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .meta-cards {
    font-weight: 700;
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    font-variant-numeric: tabular-nums;
  }

  .meta-sep {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .meta-steps {
    font-weight: 600;
  }

  .meta-broken {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: var(--semantic-warning, #fbbf24);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .gallery-rule-band {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 0.65rem 1rem;
    padding: 0.55rem 1rem;
    flex: 0 0 auto;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.58));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .gallery-rule-source {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--theme-accent, #f59e0b);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.035em;
    white-space: nowrap;
  }

  .gallery-rule-empty {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: 0.8rem;
  }

  .redraw-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .redraw-btn:hover:not(:disabled) {
    transform: translateY(var(--hover-lift-sm, -1px));
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .redraw-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .redraw-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .preview-area {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: clamp(8px, 0.8vw, 16px);
  }

  .swap-btn {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .swap-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 25%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 50%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .remove-btn {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 32%,
      transparent
    );
    color: var(--semantic-error, #f87171);
  }

  .remove-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 26%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 55%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  @media (min-width: 2600px) {
    .review-header {
      gap: 20px;
      padding: 16px 24px;
    }

    .back-btn,
    .redraw-btn {
      min-height: var(--min-touch-target, 52px);
      padding-inline: 20px;
      font-size: var(--font-size-min, 16px);
    }

    .deck-number,
    .deck-name-input {
      font-size: 30px;
    }

    .deck-meta {
      font-size: var(--font-size-min, 16px);
    }

    .gallery-rule-band {
      gap: 0.8rem 1.25rem;
      padding: 0.7rem 1.5rem;
    }
  }

  @container (max-width: 48rem) {
    .review-header {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: center;
    }

    .back-btn {
      grid-column: 1;
      grid-row: 1;
    }

    .deck-info {
      grid-column: 2;
      grid-row: 1;
    }

    .action-buttons {
      display: grid;
      grid-column: 1 / -1;
      grid-row: 2;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .action-buttons :global(button) {
      width: 100%;
      min-width: 0;
    }

    /* Gallery owns three header actions. Let Refresh take a full second row
       instead of forcing the entire review surface wider than a phone. */
    .action-buttons > .redraw-btn:nth-child(3) {
      grid-column: 1 / -1;
    }

    .gallery-rule-band {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn,
    .deck-name-input,
    .redraw-btn {
      transition: none;
    }
  }
</style>
