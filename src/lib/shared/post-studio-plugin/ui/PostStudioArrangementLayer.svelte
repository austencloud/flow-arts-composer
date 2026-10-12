<script lang="ts">
  import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
  import { arrangementBeatAt } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
  import CellCanvas from "#lib/shared/media-composition/components/ArrangementCellCanvas.svelte";
  import {
    cellAtPosition,
    openCells,
    type ArrangementEditingMarks,
  } from "./post-arrangement-hit";

  let {
    snapshot,
    sourceTimeSeconds,
    playing = false,
    exporting = false,
    exportSize = null,
    editing = null,
  }: {
    snapshot: ArrangementSnapshot;
    sourceTimeSeconds: number;
    playing?: boolean;
    exporting?: boolean;
    /** The pixel size this layer fills in the exported file. */
    exportSize?: { width: number; height: number } | null;
    /**
     * What to mark while the item is in hand in the editor: the selected
     * cell, the open cells, a drag's drop target. The canvas owns the pointer
     * and decides; this layer only draws. Null while playing back or exporting.
     */
    editing?: ArrangementEditingMarks | null;
  } = $props();

  let boxWidth = $state(0);
  let boxHeight = $state(0);
  // Each cell's canvas rasterizes at its layout size. In the preview a 2x2
  // grid's cells are a couple of hundred pixels wide, and the file stretched
  // them to fill 540-pixel cells, so every arrangement exported soft. While
  // exporting, the grid lays out at the file's size and is shrunk to the box,
  // which looks the same on screen and gives the export full-size rasters.
  // Other cell types are captured from the DOM at the file's scale already.
  const exportScale = $derived.by(() => {
    if (!exporting || !exportSize || boxWidth <= 0 || boxHeight <= 0) return 1;
    if (cells.some((cell) => cell.mediaType !== "animation")) return 1;
    const pixelRatio =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    return Math.max(
      1,
      exportSize.width / pixelRatio / boxWidth,
      exportSize.height / pixelRatio / boxHeight
    );
  });

  const beat = $derived(arrangementBeatAt(snapshot, sourceTimeSeconds));
  const cells = $derived(
    snapshot.cells.filter(
      (cell) =>
        cell.row < snapshot.gridRows &&
        cell.col < snapshot.gridCols &&
        (cell.layers.length > 0 || cell.mediaType !== "animation")
    )
  );
  /** Positions with nothing in them, drawn as targets only while editing. */
  const open = $derived(editing ? openCells(snapshot) : []);
  /** The cell a dragged cell would swap with, with its span. */
  const drop = $derived.by(() => {
    const target = editing?.dropTarget;
    if (!target) return null;
    const cell = cellAtPosition(snapshot, target);
    return {
      col: (cell?.col ?? target.col) + 1,
      row: (cell?.row ?? target.row) + 1,
      colSpan: cell
        ? Math.max(1, Math.min(cell.colSpan, snapshot.gridCols - cell.col))
        : 1,
      rowSpan: cell
        ? Math.max(1, Math.min(cell.rowSpan, snapshot.gridRows - cell.row))
        : 1,
    };
  });
</script>

<div
  class="arrangement-box"
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
>
  <div
    class="arrangement-surface"
    data-arrangement-surface
    data-arrangement-cell-count={cells.length}
    style:grid-template-columns={`repeat(${snapshot.gridCols}, minmax(0, 1fr))`}
    style:grid-template-rows={`repeat(${snapshot.gridRows}, minmax(0, 1fr))`}
    style:width={exportScale > 1 ? `${boxWidth * exportScale}px` : undefined}
    style:height={exportScale > 1 ? `${boxHeight * exportScale}px` : undefined}
    style:transform={exportScale > 1 ? `scale(${1 / exportScale})` : undefined}
  >
    {#each cells as cell (cell.id)}
      {@const selected = editing?.selectedCellId === cell.id}
      <div
        class="arrangement-cell"
        class:selected
        class:lifted={editing?.draggingCellId === cell.id}
        data-media-type={cell.mediaType}
        data-arrangement-cell={cell.id}
        data-arrangement-cell-selected={selected ? "true" : undefined}
        style:grid-column={`${cell.col + 1} / span ${Math.min(cell.colSpan, snapshot.gridCols - cell.col)}`}
        style:grid-row={`${cell.row + 1} / span ${Math.min(cell.rowSpan, snapshot.gridRows - cell.row)}`}
      >
        <CellCanvas
          {cell}
          cellIndex={cell.row * snapshot.gridCols + cell.col}
          currentStep={beat}
          isPlaying={true}
          animationPlaying={playing && !exporting}
          virtualTimeMs={sourceTimeSeconds * 1000}
          skipStartPlacement={snapshot.skipStartPlacement}
          gridAppearance={snapshot.appearance}
          onSelect={() => undefined}
        />
        {#if selected}
          <!-- A corner tab beside the ring, so the pick reads without colour. -->
          <span class="cell-tab" aria-hidden="true"></span>
        {/if}
      </div>
    {/each}
    {#if editing}
      {#each open as slot (slot.key)}
        {@const selected =
          slot.cellId !== null && editing.selectedCellId === slot.cellId}
        <div
          class="arrangement-open"
          class:selected
          data-arrangement-cell={slot.cellId ?? undefined}
          data-arrangement-cell-selected={selected ? "true" : undefined}
          style:grid-column={`${slot.col + 1} / span ${slot.colSpan}`}
          style:grid-row={`${slot.row + 1} / span ${slot.rowSpan}`}
        >
          <span class="open-label">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Add sequence
          </span>
          {#if selected}
            <span class="cell-tab" aria-hidden="true"></span>
          {/if}
        </div>
      {/each}
      {#if drop}
        <div
          class="arrangement-drop"
          aria-hidden="true"
          style:grid-column={`${drop.col} / span ${drop.colSpan}`}
          style:grid-row={`${drop.row} / span ${drop.rowSpan}`}
        ></div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .arrangement-box {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .arrangement-surface {
    display: grid;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #101018;
    transform-origin: 0 0;
  }
  .arrangement-cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .arrangement-surface :global(.cell-canvas) {
    border-radius: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }
  .arrangement-surface :global(.cell-index),
  .arrangement-surface :global(.layer-count),
  .arrangement-surface :global(.media-type-badge),
  .arrangement-surface :global(.empty-cell) {
    display: none;
  }

  /* Editing marks. None of these move or fade: a drag's marks keep up with
     the pointer, and a pick is shown the moment it is made. */

  /* The selected cell: a full ring inside its edges, dark line outside the
     accent so it holds on any cell. */
  .arrangement-cell.selected::after,
  .arrangement-open.selected::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    box-shadow:
      inset 0 0 0 3px var(--theme-accent, #d4813a),
      inset 0 0 0 5px rgb(0 0 0 / 0.55);
    pointer-events: none;
  }
  .cell-tab {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
    width: 1.25rem;
    height: 1.25rem;
    background: var(--theme-accent, #d4813a);
    clip-path: polygon(0 0, 100% 0, 0 100%);
    pointer-events: none;
  }
  /* The cell in hand while its ghost follows the pointer. */
  .arrangement-cell.lifted {
    opacity: 0.4;
  }
  /* A position with no sequence: a dashed target that says what a tap does.
     The words go once the cell is too small to hold them. */
  .arrangement-open {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    border: 2px dashed rgb(255 255 255 / 0.35);
    color: rgb(255 255 255 / 0.75);
    container-type: size;
  }
  .open-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
  }
  @container (max-width: 96px) {
    .open-label {
      display: none;
    }
  }
  /* Where a dragged cell lands if let go now. */
  .arrangement-drop {
    position: relative;
    z-index: 4;
    box-shadow:
      inset 0 0 0 3px var(--theme-text, #fff),
      inset 0 0 0 5px rgb(0 0 0 / 0.55);
    background: rgb(255 255 255 / 0.14);
    pointer-events: none;
  }
</style>
