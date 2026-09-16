<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import type { SheetCell } from "../../services/sheet-row-planner";
  import type { ChoreoSheetLayout } from "../../domain/types/choreo-sheet";
  import { SHEET_CELL_VISIBILITY } from "../../services/sheet-cell-config";

  let {
    cell,
    layout,
    visible,
    isBreak = false,
    isSeparator = false,
    isActCurrent = false,
    isActPlayed = false,
    showHandPoints = false,
    selectedSequenceId = null,
    onSelectSequence,
    onRemoveSequence,
  }: {
    cell: SheetCell;
    layout: ChoreoSheetLayout;
    visible: boolean;
    isBreak?: boolean;
    isSeparator?: boolean;
    isActCurrent?: boolean;
    isActPlayed?: boolean;
    showHandPoints?: boolean;
    selectedSequenceId?: string | null;
    onSelectSequence?: (sequenceId: string) => void;
    onRemoveSequence?: (sequenceId: string) => void;
  } = $props();

  const selection = getSequenceSelection();
</script>

<div
  class="cell"
  class:tka-seq-cell={!cell.isBlank && !!cell.sequenceId}
  class:blank={cell.isBlank}
  class:act-current={isActCurrent}
  class:act-played={isActPlayed}
  class:is-hovered={cell.sequenceId
    ? selection?.isHovered(cell.sequenceId)
    : false}
  class:is-selected={cell.sequenceId
    ? selection?.isSelected(cell.sequenceId)
    : false}
  class:break={isBreak}
  class:separator={isSeparator}
>
  {#if !cell.isBlank && cell.sequenceId && onSelectSequence}
    <SelectionHit
      groupId={cell.sequenceId}
      isGroupStart={cell.isSequenceStart}
      label="Select this sequence"
      onselect={(id) => onSelectSequence?.(id)}
    />
  {/if}
  {#if isBreak}
    <span class="cell-break-label"
      ><i class="fa-solid fa-link-slash" aria-hidden="true"></i> break</span
    >
  {/if}
  {#if cell.isSequenceStart && selectedSequenceId === cell.sequenceId && onRemoveSequence}
    <button
      type="button"
      class="block-remove"
      onclick={(event) => {
        event.stopPropagation();
        onRemoveSequence?.(cell.sequenceId!);
      }}
    >
      <i class="fa-solid fa-trash" aria-hidden="true"></i> Remove
    </button>
  {/if}
  {#if cell.step && visible}
    <PictographContainer
      pictographData={cell.step}
      disableTransitions={true}
      printMode={true}
      darkMode={false}
      showGrid={SHEET_CELL_VISIBILITY.showGrid}
      showTKA={SHEET_CELL_VISIBILITY.showTKA}
      showReversals={SHEET_CELL_VISIBILITY.showReversals}
      showNonRadialPoints={SHEET_CELL_VISIBILITY.showNonRadialPoints}
      showTnD={SHEET_CELL_VISIBILITY.showTnD}
      showElemental={SHEET_CELL_VISIBILITY.showElemental}
      showPlacements={SHEET_CELL_VISIBILITY.showPlacements}
      stepNumberOverride={layout.showStepNumbers}
      {showHandPoints}
    />
  {/if}
</div>

<style>
  .cell {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--print-border);
    border-radius: 3px;
    box-sizing: border-box;
  }
  .cell.blank {
    background: transparent;
    border-color: var(--print-border-faint);
  }
  .cell.separator {
    border-left: 2px solid var(--print-border-strong);
  }
  .cell.break {
    border-left: 3px solid var(--theme-danger);
  }
  .cell.act-current {
    z-index: 10;
    outline: 2px solid var(--semantic-warning);
    outline-offset: -1px;
    box-shadow:
      inset 0 0 0 1px
        color-mix(in srgb, var(--semantic-warning) 55%, transparent),
      0 0 10px 2px color-mix(in srgb, var(--semantic-warning) 45%, transparent);
  }
  .cell.act-played {
    opacity: 0.55;
  }
  .block-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--theme-danger);
    color: var(--theme-text-inverse);
    font-size: var(--font-size-compact);
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .cell-break-label {
    position: absolute;
    top: 1px;
    left: 1px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--theme-danger);
    color: var(--theme-text-inverse);
    font-size: var(--font-size-compact);
    font-weight: 700;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
</style>
