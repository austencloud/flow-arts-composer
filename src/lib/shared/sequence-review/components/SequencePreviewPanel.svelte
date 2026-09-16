<script lang="ts">
  /**
   * Sequence Preview Panel
   *
   * Reusable panel for displaying a sequence with beat grid.
   * Core component for any sequence review workflow.
   */
  import type { BaseSequenceEntry } from "../domain/models/review-models";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import CopyForAIButton from "$lib/shared/foundation/ui/CopyForAIButton.svelte";
  import type { Snippet } from "svelte";

  interface Props {
    sequence: BaseSequenceEntry | null;
    parsedSteps: StepData[];
    startPlacement: StartPlacementData | null;
    showStartPlacement: boolean;
    manualColumnCount: number | null;
    onShowStartPlacementChange: (value: boolean) => void;
    onColumnCountChange: (value: number | null) => void;
    onStepClick?: (stepNumber: number) => void;
    highlightedSteps?: Map<number, { bg: string; border: string }>;
    interactive?: boolean;
    getCopyData?: () => string;
    /** Slot for header actions (delete, etc.) */
    headerActions?: Snippet;
    /** Slot for metadata badges */
    metaBadges?: Snippet;
  }

  let {
    sequence,
    parsedSteps,
    startPlacement,
    showStartPlacement,
    manualColumnCount,
    onShowStartPlacementChange,
    onColumnCountChange,
    onStepClick,
    highlightedSteps,
    interactive = false,
    getCopyData,
    headerActions,
    metaBadges,
  }: Props = $props();

  // Get authoritative grid mode
  const authoritativeGridMode = $derived.by(() => {
    if (!sequence) return "diamond";
    const metaGridMode = (
      sequence.fullMetadata?.sequence?.[0] as { gridMode?: string }
    )?.gridMode;
    return metaGridMode || sequence.gridMode || "diamond";
  });

  // Available column options based on sequence length
  const availableColumnOptions = $derived.by(() => {
    if (!sequence) return [];
    const length = sequence.sequenceLength;
    const options = [2, 3, 4, 5, 6, 8, 10, 12];
    return options.filter((col) => col <= length);
  });

  // Smart default column count based on sequence length
  const smartDefaultColumns = $derived.by(() => {
    if (!sequence) return null;
    const length = sequence.sequenceLength;

    // Intelligent fallback based on sequence length factors
    if (length === 16) return 4;
    if (length === 12) return 4;
    if (length === 8) return 4;
    if (length % 4 === 0 && length / 4 >= 2) return length / 4;
    if (length % 3 === 0 && length / 3 >= 2) return length / 3;
    if (length % 2 === 0 && length / 2 >= 2 && length / 2 <= 8)
      return length / 2;

    return null;
  });

  const effectiveColumnCount = $derived(
    manualColumnCount ?? smartDefaultColumns
  );
</script>

<div class="sequence-preview">
  <!-- Header -->
  <div class="sequence-header">
    <h2 class="sequence-word">{sequence?.word || "No sequence"}</h2>

    <div class="header-actions">
      {#if headerActions}
        {@render headerActions()}
      {/if}
      {#if getCopyData}
        <CopyForAIButton
          getData={getCopyData}
          ariaLabel="Copy sequence data"
          variant="icon-only"
          size="lg"
          idleIcon="fa-copy"
          class="action-btn"
        />
      {/if}
    </div>
  </div>

  <!-- Metadata row -->
  {#if sequence}
    <div class="meta-row">
      <span class="meta-item">{sequence.sequenceLength} steps</span>
      <span
        class="meta-item grid-mode"
        class:box={authoritativeGridMode === GridMode.BOX ||
          authoritativeGridMode === "box"}
      >
        {authoritativeGridMode === GridMode.BOX ||
        authoritativeGridMode === "box"
          ? "BOX"
          : "DIAMOND"}
      </span>
      {#if metaBadges}
        {@render metaBadges()}
      {/if}
    </div>
  {/if}

  <!-- Step Grid -->
  {#if parsedSteps.length > 0}
    <div class="step-grid-section">
      <!-- Grid controls -->
      <div class="grid-controls">
        <button
          class="control-chip"
          class:active={showStartPlacement}
          onclick={() => onShowStartPlacementChange(!showStartPlacement)}
        >
          Start Pos
        </button>
        <span class="control-divider"></span>
        <span class="control-label">Columns:</span>
        <div class="chip-group">
          <button
            class="control-chip"
            class:active={manualColumnCount === null}
            onclick={() => onColumnCountChange(null)}
          >
            Auto{manualColumnCount === null && effectiveColumnCount !== null
              ? ` (${effectiveColumnCount})`
              : ""}
          </button>
          {#each availableColumnOptions as colCount}
            <button
              class="control-chip"
              class:active={manualColumnCount === colCount}
              onclick={() => onColumnCountChange(colCount)}
            >
              {colCount}
            </button>
          {/each}
        </div>
      </div>

      <div class="step-grid-wrapper" class:interactive>
        {#await import("$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte") then mod}
          <mod.default
            steps={parsedSteps}
            startPlacement={showStartPlacement ? startPlacement : null}
            {onStepClick}
            manualColumnCount={effectiveColumnCount}
            {highlightedSteps}
            heightSizingRowThreshold={20}
          />
        {/await}
      </div>
    </div>
  {:else}
    <div class="no-data">No step data available</div>
  {/if}
</div>

<style>
  .sequence-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-glass);
    border-radius: 12px;
    padding: var(--spacing-lg);
    overflow: hidden;
  }

  .sequence-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
    flex-shrink: 0;
  }

  .sequence-word {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-xs);
  }

  /* Global for child component styling */
  :global(.action-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    background: var(--surface-color);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: var(--transition-fast);
  }

  :global(.action-btn:hover) {
    background: var(--surface-hover);
    color: var(--foreground);
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    flex-shrink: 0;
  }

  .meta-item {
    padding: 2px var(--spacing-sm);
    background: var(--surface-color);
    border-radius: 4px;
    font-size: var(--font-size-xs);
    color: var(--muted-foreground);
  }

  .meta-item.grid-mode {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
  }

  .meta-item.grid-mode.box {
    background: rgba(234, 179, 8, 0.2);
    color: #fde047;
  }

  .step-grid-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .grid-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .control-label {
    font-size: var(--font-size-xs);
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .control-divider {
    width: 1px;
    height: 16px;
    background: var(--theme-stroke);
  }

  .chip-group {
    display: flex;
    gap: 4px;
  }

  .control-chip {
    padding: 6px 12px;
    background: var(--surface-color);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 6px;
    color: var(--muted-foreground);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: var(--transition-micro);
  }

  .control-chip:hover {
    background: var(--surface-hover);
    color: var(--foreground);
  }

  .control-chip.active {
    background: rgba(99, 102, 241, 0.25);
    border-color: var(--primary-color);
    color: var(--foreground);
  }

  .step-grid-wrapper {
    flex: 1;
    min-height: 0;
    background: var(--surface-dark);
    border-radius: 12px;
    padding: var(--spacing-md);
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-grid-wrapper.interactive {
    border: 2px solid rgba(99, 102, 241, 0.3);
    cursor: pointer;
  }

  .no-data {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-dark);
    border-radius: 12px;
    color: var(--muted);
    font-size: var(--font-size-sm);
  }
</style>
