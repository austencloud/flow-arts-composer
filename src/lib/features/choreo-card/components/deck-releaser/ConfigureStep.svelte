<script lang="ts">
  import type { StepCountWeight } from "../../domain/models/DeckRelease";
  import type {
    CatalogSourceSummary,
    TnDFamilyOption,
    TnDTurnPatternOption,
  } from "../../services/deck-composer";
  import TnDTurnMatrix from "../TnDTurnMatrix.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import TnDFamilyCards from "./TnDFamilyCards.svelte";
  import TransformPanel from "./TransformPanel.svelte";
  import LoopBentoBoard from "./LoopBentoBoard.svelte";
  import GalleryComposeBoard from "./GalleryComposeBoard.svelte";
  import DeckPropSwitcher from "./DeckPropSwitcher.svelte";
  import type { ResolvedReversalPattern } from "../../domain/reversal-transform";
  import type {
    VariationConfig,
    StartOriMode,
  } from "../../services/deck-variation";
  import type { GalleryDeckSelection } from "../../services/gallery-deck-source";

  type DeckMode = "loop" | "tnd" | "gallery";

  interface Props {
    deckMode: DeckMode;
    weights: StepCountWeight[];
    totalCards: number;
    notes: string;
    sourceSummaries: CatalogSourceSummary[];
    selectedSliceTypes: Set<"halved" | "quartered">;
    tndFamilies: TnDFamilyOption[];
    selectedTnDFamilies: Set<string>;
    tndTurnPatterns: TnDTurnPatternOption[];
    selectedTnDTurnPatterns: Set<string>;
    tndCardCount: number;
    selectedTurnPatternCount: number;
    onModeChange: (mode: DeckMode) => void;
    onWeightChange: (stepCount: number, weight: number) => void;
    onTotalCardsChange: (total: number) => void;
    onNotesChange: (notes: string) => void;
    onSliceTypeToggle: (sliceType: "halved" | "quartered") => void;
    onTnDFamilyToggle: (familyId: string) => void;
    onSelectAllFamilies: () => void;
    onClearFamilies: () => void;
    onTnDTurnPatternToggle: (tp: string) => void;
    onTnDTurnPatternsSet: (patterns: Set<string>) => void;
    onDraw: (gallerySelection?: GalleryDeckSelection) => void;
    isLoading: boolean;
    variationConfig: VariationConfig;
    onVariationConfigChange: (config: VariationConfig) => void;
    startOriModes: Set<StartOriMode>;
    onToggleStartOriMode: (mode: StartOriMode) => void;
    gridModes: Set<"diamond" | "box">;
    onToggleGridMode: (mode: "diamond" | "box") => void;
    /** Deck-wide reversal pattern (built in the strip). Absent → no reversal. */
    reversalPattern?: ResolvedReversalPattern | null;
    onReversalChange?: (pattern: ResolvedReversalPattern) => void;
    /** Live-generation in progress + count (LOOP mode). */
    isGenerating?: boolean;
    genProgress?: number;
    /** Production-identical public-data seam for the visual harness. */
    galleryPreviewSource?: "community";
  }

  let {
    deckMode,
    weights,
    totalCards,
    notes,
    sourceSummaries,
    selectedSliceTypes,
    tndFamilies,
    selectedTnDFamilies,
    tndTurnPatterns,
    selectedTnDTurnPatterns,
    tndCardCount,
    selectedTurnPatternCount,
    onModeChange,
    onWeightChange,
    onTotalCardsChange,
    onNotesChange,
    onSliceTypeToggle,
    onTnDFamilyToggle,
    onSelectAllFamilies,
    onClearFamilies,
    onTnDTurnPatternToggle,
    onTnDTurnPatternsSet,
    onDraw,
    isLoading,
    variationConfig,
    onVariationConfigChange,
    startOriModes,
    onToggleStartOriMode,
    gridModes,
    onToggleGridMode,
    reversalPattern = null,
    onReversalChange,
    isGenerating = false,
    genProgress = 0,
    galleryPreviewSource,
  }: Props = $props();

  // Per-family card projection mirrors buildTnDCards' enumeration: each family's
  // entries already span the selected grid modes (a (seed × grid) pair per entry,
  // from getTnDFamilyOptions), so grid is NOT a separate multiplier here — only
  // turn patterns × start-orientation registers multiply on top of the entries.
  const familyMultiplier = $derived(
    selectedTurnPatternCount * Math.max(1, startOriModes.size)
  );

  // LOOP draws live and TnD needs at least one card. Gallery owns its action
  // and account gate inside GalleryComposeBoard.
  const canDraw = $derived(deckMode === "tnd" ? tndCardCount > 0 : true);

  const drawLabel = $derived(
    deckMode === "tnd"
      ? `Compose ${tndCardCount} cards`
      : deckMode === "gallery"
        ? `Compose up to ${totalCards} cards`
        : `Generate ${totalCards} cards`
  );

  // Live-generation progress for the spinner label.
  const loadingLabel = $derived(
    isGenerating
      ? `Generating ${genProgress}/${totalCards}…`
      : "Loading Pools..."
  );

  const sourceDescription = $derived(
    deckMode === "loop"
      ? "Generate a fresh run, then shape its length, level, motion, and variation mix."
      : deckMode === "tnd"
        ? "Choose the motion families and turn patterns that belong in this edition."
        : "Use the Gallery drill-down, then send the visible order to Review."
  );

  const actionTitle = $derived(
    deckMode === "tnd"
      ? `${tndCardCount.toLocaleString()} cards selected`
      : deckMode === "gallery"
        ? `Up to ${totalCards.toLocaleString()} library cards`
        : `${totalCards.toLocaleString()} fresh cards`
  );

  const actionDetail = $derived(
    deckMode === "tnd"
      ? "The full matching set will be composed."
      : deckMode === "gallery"
        ? "Newest matching sequences are drawn first."
        : "A new seeded deck will be generated."
  );
</script>

<div class="configure-step" class:gallery-mode={deckMode === "gallery"}>
  <header class="workspace-header">
    <div class="title-block">
      <span class="eyebrow">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        Deck releaser
      </span>
      <h2 class="step-title">
        {deckMode === "gallery"
          ? "Build from your library"
          : "Compose your catalog"}
      </h2>
      <p class="source-description">{sourceDescription}</p>
    </div>

    <nav class="release-progress" aria-label="Deck release progress">
      <span class="progress-step is-current" aria-current="step">
        <span class="step-number">1</span>
        <span class="step-copy">
          <small>Current</small>
          <strong>Compose</strong>
        </span>
      </span>
      <i class="fas fa-chevron-right progress-arrow" aria-hidden="true"></i>
      <span class="progress-step">
        <span class="step-number">2</span>
        <span class="step-copy">
          <small>Next</small>
          <strong>Review</strong>
        </span>
      </span>
      <i class="fas fa-chevron-right progress-arrow" aria-hidden="true"></i>
      <span class="progress-step">
        <span class="step-number">3</span>
        <span class="step-copy">
          <small>Finish</small>
          <strong>Release</strong>
        </span>
      </span>
    </nav>
  </header>

  <section
    class="command-panel"
    class:gallery-mode={deckMode === "gallery"}
    aria-label="Deck setup"
  >
    <div class="control-group source-control">
      <span class="control-label" id="card-source-label">Card source</span>
      <div class="mode-toggle">
        <SegmentedControl
          options={[
            { value: "loop", label: "LOOP" },
            { value: "tnd", label: "TnD" },
            { value: "gallery", label: "Gallery" },
          ]}
          value={deckMode}
          onchange={(v) => onModeChange(v)}
          color="accent"
          size="sm"
          semantics="radiogroup"
          ariaLabelledby="card-source-label"
        />
      </div>
      <span class="control-help"
        >Switching sources keeps each recipe ready to return to.</span
      >
    </div>

    <label class="control-group notes-field" for="edition-notes">
      <span class="control-label">Edition notes</span>
      <input
        id="edition-notes"
        type="text"
        class="notes-input"
        value={notes}
        placeholder="Fire Drums 2026"
        oninput={(e) => onNotesChange((e.target as HTMLInputElement).value)}
      />
      <span class="control-help">Shown with the saved deck recipe.</span>
    </label>

    {#if deckMode !== "loop"}
      <!-- LOOP decks pick the prop via the bento Prop tile; TnD + Gallery have no
           such tile, so surface the switcher in the setup panel. -->
      <div class="control-group prop-field">
        <span class="control-label">Deck prop</span>
        <DeckPropSwitcher />
        <span class="control-help">Applies to every rendered card.</span>
      </div>
    {/if}
  </section>

  {#snippet catalogCompletion()}
    <section class="catalog-footer" aria-labelledby="catalog-completion-title">
      <div class="catalog-summary" id="draw-action-summary">
        <span class="catalog-icon"
          ><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i></span
        >
        <span class="catalog-copy">
          <span class="catalog-kicker" id="catalog-completion-title"
            >Next: Review</span
          >
          <strong>{actionTitle}</strong>
          <span class="catalog-detail">{actionDetail}</span>
        </span>
      </div>

      <div class="catalog-action">
        <ActionButton
          label={drawLabel}
          busyLabel={loadingLabel}
          icon={isLoading || isGenerating
            ? "fa-spinner fa-spin"
            : "fa-arrow-right"}
          color="theme"
          fullWidth
          busy={isLoading || isGenerating}
          disabled={isLoading || isGenerating || !canDraw}
          onclick={onDraw}
          ariaDescribedBy="draw-action-summary"
        />
      </div>
    </section>
  {/snippet}

  <div class="board-shell">
    {#if deckMode === "tnd"}
      <div class="board tnd-board">
        <section class="area-families">
          <span class="area-label">Families</span>
          <TnDFamilyCards
            families={tndFamilies}
            selected={selectedTnDFamilies}
            multiplier={familyMultiplier}
            onToggle={onTnDFamilyToggle}
            onSelectAll={onSelectAllFamilies}
            onClear={onClearFamilies}
            columns={2}
          />
        </section>

        <section class="area-matrix">
          <span class="area-label">Turn patterns</span>
          <TnDTurnMatrix
            patternOptions={tndTurnPatterns}
            selected={selectedTnDTurnPatterns}
            onToggle={onTnDTurnPatternToggle}
            onSetPatterns={onTnDTurnPatternsSet}
          />
        </section>

        <section class="area-transform">
          <TransformPanel
            {startOriModes}
            {onToggleStartOriMode}
            {gridModes}
            {onToggleGridMode}
            {reversalPattern}
            onReversalChange={(p) => onReversalChange?.(p)}
          />
        </section>
      </div>
    {:else if deckMode === "gallery"}
      <GalleryComposeBoard
        onCompose={onDraw}
        {isLoading}
        previewSource={galleryPreviewSource}
      />
    {:else}
      <LoopBentoBoard
        {weights}
        {totalCards}
        {sourceSummaries}
        {selectedSliceTypes}
        {variationConfig}
        {startOriModes}
        {gridModes}
        {reversalPattern}
        {onWeightChange}
        {onTotalCardsChange}
        {onSliceTypeToggle}
        {onVariationConfigChange}
        {onToggleStartOriMode}
        {onToggleGridMode}
        {onReversalChange}
      />
    {/if}
  </div>

  {#if deckMode !== "gallery"}
    {@render catalogCompletion()}
  {/if}
</div>

<style>
  .configure-step {
    --composer-radius: 18px;
    display: flex;
    flex-direction: column;
    gap: clamp(16px, 1.35vw, 28px);
    width: calc(100% - clamp(16px, 3vw, 64px));
    max-width: 196rem;
    min-height: 100%;
    margin: 0 auto;
    padding: clamp(16px, 2vw, 36px) 0 clamp(24px, 3vw, 52px);
    box-sizing: border-box;
    /* The board reflows against THIS pane's width (sidebar + released-decks rail
       eat ~600px of viewport), so layout decisions use container queries, not
       viewport media queries that misjudge the available room. */
    container-type: inline-size;
    container-name: configure;
  }

  .workspace-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: clamp(16px, 2vw, 32px);
  }

  .title-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  :global(html.deck-motion-source)
    .configure-step
    :global(*:not(.title-block):not(.command-panel):not(.board-shell)) {
    view-transition-name: none !important;
  }

  :global(html.deck-motion-source) .title-block {
    view-transition-name: deck-releaser-source-title;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .step-title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: clamp(24px, 2.25cqw, 40px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }

  .source-description {
    max-width: 58rem;
    min-height: 1.5em;
    margin: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
  }

  .release-progress {
    display: flex;
    align-items: center;
    gap: clamp(8px, 0.8cqw, 14px);
    flex: 0 0 auto;
    padding: 10px 12px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.96));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    color: var(--theme-text, #fff);
  }

  .progress-step {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    opacity: 0.48;
  }

  .progress-step.is-current {
    opacity: 1;
  }

  .step-number {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.11));
    border-radius: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 12px);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .progress-step.is-current .step-number {
    background: var(--theme-accent, #8b5cf6);
    border-color: transparent;
    color: var(--theme-text-on-accent, #fff);
    box-shadow: 0 8px 20px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 24%, transparent);
  }

  .step-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .step-copy small {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.48));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }

  .step-copy strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.25;
  }

  .progress-arrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .catalog-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 16%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent);
    color: var(--theme-accent, #8b5cf6);
  }

  .catalog-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .catalog-kicker {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .catalog-copy strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
    line-height: 1.35;
  }

  .command-panel {
    display: grid;
    grid-template-columns: minmax(17rem, 1.1fr) minmax(17rem, 1fr) auto;
    gap: clamp(14px, 1.25vw, 24px);
    align-items: stretch;
    width: 100%;
    padding: clamp(16px, 1.4vw, 24px);
    box-sizing: border-box;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.96));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--composer-radius);
  }

  :global(html.deck-motion-source) .command-panel {
    view-transition-name: deck-releaser-command;
  }

  .command-panel.gallery-mode {
    align-items: center;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--theme-panel-bg) 72%, transparent);
    border-radius: 0.35rem;
    box-shadow: none;
  }

  .command-panel.gallery-mode .control-group {
    justify-content: center;
    gap: 0.35rem;
  }

  .command-panel.gallery-mode .control-help {
    display: none;
  }

  .configure-step.gallery-mode {
    gap: clamp(0.75rem, 1cqw, 1.25rem);
  }

  .configure-step.gallery-mode .release-progress {
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .configure-step.gallery-mode .step-number {
    border-radius: 50%;
    box-shadow: none;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
    padding-inline: clamp(0px, 0.4vw, 8px);
  }

  .source-control {
    padding-inline-start: 0;
  }

  .prop-field {
    min-width: 12rem;
    padding-inline-end: 0;
  }

  .mode-toggle {
    width: min(100%, 30rem);
  }

  .control-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .control-help {
    min-height: 1.35em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.48));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .notes-input {
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 14px;
    box-sizing: border-box;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    outline: none;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .notes-input:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
  }

  .notes-input:focus-visible {
    border-color: var(--theme-accent, #8b5cf6);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent);
  }

  .notes-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .board-shell {
    min-width: 0;
    width: 100%;
  }

  :global(html.deck-motion-source) .board-shell {
    view-transition-name: deck-releaser-source;
  }

  /* TnD board: Families | hero Turn-Pattern matrix | Transform rail.
     The LOOP board is its own component (LoopComposeBoard). */
  .board {
    display: grid;
    gap: 24px;
    align-items: start;
    width: 100%;
  }

  .tnd-board {
    grid-template-columns: minmax(240px, 0.82fr) minmax(0, 1.4fr) minmax(
        320px,
        0.95fr
      );
    grid-template-areas: "families matrix transform";
  }

  .area-matrix {
    grid-area: matrix;
  }

  /* Families + Transform stretch to the tall matrix's height so their content
     can distribute in the leftover space (cards centre, axes spread evenly). */
  .area-families {
    grid-area: families;
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }
  .area-families > :global(.family-cards) {
    flex: 1 1 auto;
  }

  .area-transform {
    grid-area: transform;
    align-self: stretch;
    display: flex;
    flex-direction: column;
  }
  .area-transform > :global(.transform) {
    flex: 1 1 auto;
  }

  .area-label {
    display: block;
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .catalog-footer {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(22rem, 36rem);
    align-items: center;
    gap: clamp(16px, 2vw, 32px);
    width: 100%;
    padding: clamp(18px, 1.55cqw, 28px);
    box-sizing: border-box;
    background:
      radial-gradient(
        circle at 92% 50%,
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 14%, transparent),
        transparent 32%
      ),
      linear-gradient(
        112deg,
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 7%, transparent),
        transparent 48%
      ),
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #8b5cf6) 24%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
    border-radius: var(--composer-radius);
    box-shadow: inset 0 1px 0
      color-mix(in srgb, var(--theme-text, #fff) 4%, transparent);
  }

  .catalog-footer::before {
    position: absolute;
    top: -1px;
    left: clamp(18px, 1.55cqw, 28px);
    width: clamp(5rem, 9cqw, 9rem);
    height: 2px;
    background: var(--theme-accent, #8b5cf6);
    border-radius: 999px;
    content: "";
  }

  .catalog-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .catalog-detail {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .catalog-action {
    width: 100%;
    min-width: 0;
  }

  /* TnD board: below the 3-up threshold, stack hero matrix → families →
     transform in one column (stretch no longer needed). The LOOP board owns
     its own responsive collapse in LoopComposeBoard. */
  @container configure (max-width: 1080px) {
    .tnd-board {
      grid-template-columns: 1fr;
      grid-template-areas:
        "matrix"
        "families"
        "transform";
    }

    .area-families,
    .area-transform {
      align-self: auto;
    }

    .command-panel {
      grid-template-columns: minmax(16rem, 1fr) minmax(16rem, 1fr);
    }

    .prop-field {
      grid-column: 1 / -1;
    }
  }

  /* Narrow pane: single column, everything flows vertically. */
  @container configure (max-width: 840px) {
    .board {
      grid-template-columns: 1fr;
    }

    .workspace-header {
      align-items: flex-start;
    }

    .release-progress {
      flex: 0 1 auto;
    }

    .command-panel {
      grid-template-columns: 1fr;
    }

    .prop-field {
      grid-column: auto;
    }

    .mode-toggle {
      width: 100%;
    }

    .catalog-footer {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
  }

  @container configure (max-width: 520px) {
    .workspace-header {
      flex-direction: column;
    }

    .release-progress {
      width: 100%;
      box-sizing: border-box;
      gap: 4px;
      justify-content: space-between;
      padding: 8px;
    }

    .progress-step {
      gap: 6px;
    }

    .step-number {
      width: 30px;
      height: 30px;
    }

    .step-copy small {
      display: none;
    }

    .source-description {
      min-height: 3em;
    }

    .catalog-icon {
      display: none;
    }
  }

  @container configure (min-width: 160rem) {
    .command-panel {
      padding: 30px;
    }

    .release-progress,
    .catalog-footer {
      padding: 20px;
    }

    .catalog-icon {
      width: 52px;
      height: 52px;
      border-radius: 15px;
    }

    .step-number {
      width: 44px;
      height: 44px;
      border-radius: 13px;
    }

    .catalog-footer {
      grid-template-columns: minmax(0, 1fr) minmax(32rem, 48rem);
    }
  }

  @media (min-width: 2600px) {
    .configure-step {
      --composer-radius: 24px;
      --font-size-compact: 15px;
      --font-size-min: 18px;
    }

    .step-title {
      font-size: 3rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notes-input {
      transition: none;
    }
  }
</style>
