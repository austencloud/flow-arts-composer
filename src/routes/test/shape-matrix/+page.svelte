<script lang="ts">
  import { onMount } from "svelte";
  import { loadShapeMatrix, type ShapeMatrixData } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
  import ShapeMatrixGrid from "#lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ShapeMatrixDrillModal from "#lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte";
  import ShapeMatrixFilters from "#lib/features/lab/vtg-lab/components/ShapeMatrixFilters.svelte";
  import { applyFilter, defaultMatrixFilters, type MatrixFilters } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
  import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";

  let data = $state<ShapeMatrixData | null>(null);
  let err = $state("");
  let pair = $state<{ left: Flower; right: Flower } | null>(null);
  let open = $state(false);

  let filters = $state<MatrixFilters>(defaultMatrixFilters());

  const rowAxis = $derived(data ? applyFilter(data.axis, filters.left, filters.collapse) : []);
  const colAxis = $derived(data ? applyFilter(data.axis, filters.right, filters.collapse) : []);
  const cellCount = $derived(rowAxis.length * colAxis.length);

  onMount(async () => {
    try {
      data = await loadShapeMatrix();
    } catch (e) {
      err = String(e);
    }
  });
</script>

<svelte:head><title>Shape Matrix · Lab</title></svelte:head>

<div class="page">
  <header>
    <h1>Shape Matrix</h1>
    <span>blue flower × red flower — click a cell for the TKA realizations</span>
    {#if data}<span class="count">{cellCount} cells</span>{/if}
  </header>
  {#if err}
    <p class="err">{err}</p>
  {:else if !data}
    <p class="loading">Building flowers…</p>
  {:else}
    <ShapeMatrixFilters {filters} onchange={(f) => (filters = f)} />
    <ShapeMatrixGrid {data} {rowAxis} {colAxis} onselect={(p) => { pair = p; open = true; }} />
  {/if}
</div>

{#if data}
  <ShapeMatrixDrillModal {open} {pair} {data} onClose={() => (open = false)} />
{/if}

<style>
  .page {
    display: grid;
    grid-template-rows: auto auto 1fr;
    height: 100dvh;
    background: #0a0f14;
    color: #e8eef4;
  }
  header {
    display: flex;
    gap: 12px;
    align-items: baseline;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  header h1 {
    font-size: 15px;
    margin: 0;
    letter-spacing: 0.01em;
  }
  header span {
    color: rgba(255, 255, 255, 0.82); /* AAA on dark */
    font-size: 12.5px;
  }
  header .count {
    margin-left: auto;
    color: #5fe0f2; /* AAA cyan on dark */
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .err {
    color: #fb8a8a;
    padding: 16px;
  }
  .loading {
    color: rgba(255, 255, 255, 0.82);
    padding: 16px;
  }
</style>
