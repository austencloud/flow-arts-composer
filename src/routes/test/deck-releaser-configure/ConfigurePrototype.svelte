<script lang="ts">
  /**
   * ConfigurePrototype — redesigned "Compose Your Catalog". Composes redesigned
   * components (not just rearranged blocks):
   *   - TnDTurnMatrix  — the hero source picker (unchanged, container-scaled)
   *   - TnDFamilyCards — elemental source picker + Select all/none
   *   - TransformPanel — unified Start × Grid × Reversal with a live ×multiplier
   *
   * Settled layout: three columns — Families | hero Turn-Pattern matrix |
   * Transform rail. Collapses to a single column on a narrow pane via container
   * query (a dedicated narrow layout is a separate spec).
   */
  import TnDTurnMatrix from "#lib/features/choreo-card/components/TnDTurnMatrix.svelte";
  import TnDFamilyCards from "#lib/features/choreo-card/components/deck-releaser/TnDFamilyCards.svelte";
  import TransformPanel from "#lib/features/choreo-card/components/deck-releaser/TransformPanel.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import LoopComposeBoard from "#lib/features/choreo-card/components/deck-releaser/LoopComposeBoard.svelte";
  import type { TnDFamilyOption, TnDTurnPatternOption } from "#lib/features/choreo-card/services/deck-composer.js";
  import type { ResolvedReversalPattern } from "#lib/features/choreo-card/domain/reversal-transform.js";
  import type { StartOriMode, VariationConfig } from "#lib/features/choreo-card/services/deck-variation.js";
  import type { StepCountWeight } from "#lib/features/choreo-card/domain/models/DeckRelease.js";

  interface SourceSummary {
    sliceType: "halved" | "quartered";
    catalogCount: number;
    sequenceCount: number;
  }

  interface Props {
    deckMode: "loop" | "tnd";
    notes: string;
    onModeChange: (m: "loop" | "tnd") => void;
    onNotesChange: (n: string) => void;
    tndFamilies: TnDFamilyOption[];
    selectedTnDFamilies: Set<string>;
    onTnDFamilyToggle: (id: string) => void;
    onSelectAllFamilies: () => void;
    onClearFamilies: () => void;
    selectedTurnPatternCount: number;
    tndCardCount: number;
    tndTurnPatterns: TnDTurnPatternOption[];
    selectedTnDTurnPatterns: Set<string>;
    onTnDTurnPatternToggle: (tp: string) => void;
    onTnDTurnPatternsSet: (s: Set<string>) => void;
    startOriModes: Set<StartOriMode>;
    onToggleStartOriMode: (m: StartOriMode) => void;
    gridModes: Set<"diamond" | "box">;
    onToggleGridMode: (m: "diamond" | "box") => void;
    reversalPattern: ResolvedReversalPattern | null;
    onReversalChange: (p: ResolvedReversalPattern) => void;
    onDraw: () => void;
    weights: StepCountWeight[];
    totalCards: number;
    sources: SourceSummary[];
    selectedSlices: Set<"halved" | "quartered">;
    variationConfig: VariationConfig;
    onTotalChange: (n: number) => void;
    onSliceToggle: (s: "halved" | "quartered") => void;
    onWeightChange: (stepCount: number, weight: number) => void;
    onVariationChange: (c: VariationConfig) => void;
  }

  let {
    deckMode,
    notes,
    onModeChange,
    onNotesChange,
    tndFamilies,
    selectedTnDFamilies,
    onTnDFamilyToggle,
    onSelectAllFamilies,
    onClearFamilies,
    selectedTurnPatternCount,
    tndCardCount,
    tndTurnPatterns,
    selectedTnDTurnPatterns,
    onTnDTurnPatternToggle,
    onTnDTurnPatternsSet,
    startOriModes,
    onToggleStartOriMode,
    gridModes,
    onToggleGridMode,
    reversalPattern,
    onReversalChange,
    onDraw,
    weights,
    totalCards,
    sources,
    selectedSlices,
    variationConfig,
    onTotalChange,
    onSliceToggle,
    onWeightChange,
    onVariationChange,
  }: Props = $props();

  // Two-up: each row is one motion family, columns are Same | Opp.
  const familyColumns = 2;

  const drawCount = $derived(deckMode === "tnd" ? tndCardCount : totalCards);
  const drawLabel = $derived(deckMode === "tnd" ? "TnD Cards" : "Cards");
</script>

<div class="prototype">
  <header class="head">
    <h2 class="title"><i class="fas fa-sliders-h" aria-hidden="true"></i> Compose Your Catalog</h2>
    <div class="mode-toggle">
      <SegmentedControl
        options={[
          { value: "loop", label: "LOOP" },
          { value: "tnd", label: "TnD" },
        ]}
        value={deckMode}
        onchange={(v) => onModeChange(v)}
        color="accent"
        size="sm"
      />
    </div>
    <input
      class="notes"
      type="text"
      value={notes}
      placeholder="Edition notes…"
      oninput={(e) => onNotesChange((e.target as HTMLInputElement).value)}
    />
  </header>

  {#if deckMode === "loop"}
    <LoopComposeBoard
      {weights}
      {totalCards}
      sourceSummaries={sources}
      selectedSliceTypes={selectedSlices}
      {variationConfig}
      {startOriModes}
      {gridModes}
      {reversalPattern}
      {onWeightChange}
      onTotalCardsChange={onTotalChange}
      onSliceTypeToggle={onSliceToggle}
      onVariationConfigChange={onVariationChange}
      {onToggleStartOriMode}
      {onToggleGridMode}
      {onReversalChange}
    />
  {:else}
    <div class="board">
      <section class="area-matrix">
        <span class="area-label">Turn Patterns</span>
        <TnDTurnMatrix
          patternOptions={tndTurnPatterns}
          selected={selectedTnDTurnPatterns}
          onToggle={onTnDTurnPatternToggle}
          onSetPatterns={onTnDTurnPatternsSet}
        />
      </section>

      <section class="area-families">
        <span class="area-label">Families</span>
        <TnDFamilyCards
          families={tndFamilies}
          selected={selectedTnDFamilies}
          multiplier={selectedTurnPatternCount}
          onToggle={onTnDFamilyToggle}
          onSelectAll={onSelectAllFamilies}
          onClear={onClearFamilies}
          columns={familyColumns}
        />
      </section>

      <section class="area-transform">
        <TransformPanel
          {startOriModes}
          {onToggleStartOriMode}
          {gridModes}
          {onToggleGridMode}
          {reversalPattern}
          {onReversalChange}
        />
      </section>
    </div>
  {/if}

  <button type="button" class="draw" disabled={drawCount === 0} onclick={onDraw}>
    <i class="fas fa-dice" aria-hidden="true"></i> Draw {drawCount.toLocaleString()} {drawLabel}
  </button>
</div>

<style>
  .prototype {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 20px 24px;
    box-sizing: border-box;
    container-type: inline-size;
    container-name: proto;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .title i {
    color: var(--theme-accent, #8b5cf6);
  }

  .mode-toggle {
    margin-left: auto;
    width: 200px;
  }

  .notes {
    flex: 1 1 260px;
    min-width: 200px;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: 14px;
    outline: none;
  }

  .notes:focus {
    border-color: var(--theme-accent, #8b5cf6);
  }

  /* ── Board: Families | hero matrix | Transform rail ── */
  .board {
    display: grid;
    gap: 24px;
    align-items: start;
    grid-template-columns: minmax(240px, 0.82fr) minmax(0, 1.4fr) minmax(320px, 0.95fr);
    grid-template-areas: "families matrix transform";
  }

  .area-matrix {
    grid-area: matrix;
  }
  .area-families {
    grid-area: families;
    display: flex;
    flex-direction: column;
    /* Stretch to the tall matrix's height so the cards centre in the leftover
       space while the header + All/None stay pinned to the top. */
    align-self: stretch;
  }
  /* The cards component fills the column so its grid can centre vertically. */
  .area-families > :global(.family-cards) {
    flex: 1 1 auto;
  }
  .area-transform {
    grid-area: transform;
    /* Stretch to the tall matrix's height and let the panel fill it, so its
       three axes can distribute with equal space down the rail. */
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
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .draw {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 52px;
    padding: 14px 28px;
    background: var(--theme-accent, #8b5cf6);
    border: none;
    border-radius: 12px;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }

  .draw:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Narrow pane: every variant collapses to one column. */
  @container proto (max-width: 860px) {
    .board {
      grid-template-columns: 1fr;
      grid-template-areas:
        "matrix"
        "families"
        "transform";
    }
  }
</style>
