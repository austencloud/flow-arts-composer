<script lang="ts">
  import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
  import { arrangementBeatAt } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
  import CellCanvas from "#lib/shared/media-composition/components/ArrangementCellCanvas.svelte";

  let {
    snapshot,
    sourceTimeSeconds,
    playing = false,
    exporting = false,
    exportSize = null,
  }: {
    snapshot: ArrangementSnapshot;
    sourceTimeSeconds: number;
    playing?: boolean;
    exporting?: boolean;
    /** The pixel size this layer fills in the exported file. */
    exportSize?: { width: number; height: number } | null;
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
