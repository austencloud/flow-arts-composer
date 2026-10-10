<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import ShapeMatrixGrid from "./ShapeMatrixGrid.svelte";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "../services/shape-matrix-flowers";
  import { applyFilter } from "../domain/filter-flower-axis";
  import { matrixFiltersForSize } from "../domain/matrix-size-preset";

  // Bounded live preview: Small size only (1:1 band, 16 tiles). The full
  // 144-cell matrix lives at the destination, not here (spec Phase 4).
  const filters = matrixFiltersForSize("small");

  let data = $state<ShapeMatrixData | null>(null);
  let err = $state("");

  const rowAxis = $derived(
    data ? applyFilter(data.axis, filters.left, false) : []
  );
  const colAxis = $derived(
    data ? applyFilter(data.axis, filters.right, false) : []
  );

  onMount(async () => {
    try {
      data = await loadShapeMatrix();
    } catch (e) {
      err = String(e);
    }
  });
</script>

<!-- Reserved-height stage: the async engine load never shifts the page around
     it (no-layout-shift.md). Clicking a tile jumps straight to the full
     matrix rather than opening a drill inline. The teaser's job is to prove
     the grid is live and point at the destination. -->
<div class="teaser-stage">
  {#if err}
    <p class="teaser-status err">{err}</p>
  {:else if !data}
    <p class="teaser-status">{t("shape_engine_building_flowers")}</p>
  {:else}
    <ShapeMatrixGrid
      {data}
      {rowAxis}
      {colAxis}
      maxCellPx={72}
      onselect={() => {
        goto("/shape-engine");
      }}
    />
  {/if}
</div>

<style>
  .teaser-stage {
    height: min(60vw, 26rem);
    max-width: 26rem;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
  }
  .teaser-status {
    display: grid;
    place-items: center;
    height: 100%;
    color: oklch(0.72 0.012 270);
    background: var(--theme-panel-bg, #0a0f14);
  }
  .teaser-status.err {
    color: var(--semantic-error, #fb8a8a);
  }
</style>
