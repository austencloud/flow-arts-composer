<script lang="ts">
  import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
  import { arrangementBeatAt } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
  import CellCanvas from "#lib/shared/media-composition/components/ArrangementCellCanvas.svelte";

  let {
    snapshot,
    sourceTimeSeconds,
    playing = false,
    exporting = false,
  }: {
    snapshot: ArrangementSnapshot;
    sourceTimeSeconds: number;
    playing?: boolean;
    exporting?: boolean;
  } = $props();

  const beat = $derived(arrangementBeatAt(snapshot, sourceTimeSeconds));
  const cells = $derived(
    snapshot.cells.filter(
      (cell) =>
        cell.row < snapshot.gridRows &&
        cell.col < snapshot.gridCols &&
        (cell.layers.length > 0 || cell.mediaType !== "animation")
    )
  );
</script>

<div
  class="arrangement-surface"
  data-arrangement-surface
  data-arrangement-cell-count={cells.length}
  style:grid-template-columns={`repeat(${snapshot.gridCols}, minmax(0, 1fr))`}
  style:grid-template-rows={`repeat(${snapshot.gridRows}, minmax(0, 1fr))`}
>
  {#each cells as cell (cell.id)}
    <div
      class="arrangement-cell"
      data-media-type={cell.mediaType}
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
        onSelect={() => undefined}
      />
    </div>
  {/each}
</div>

<style>
  .arrangement-surface {
    display: grid;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #101018;
  }
  .arrangement-cell {
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
</style>
