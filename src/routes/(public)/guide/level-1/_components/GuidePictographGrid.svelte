<script lang="ts">
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import GuidePictograph from "./GuidePictograph.svelte";

  interface GridRow {
    label: string;
    sublabel?: string;
    cells: Array<{ data?: PictographData | null; label?: string; pngFallback?: string }>;
  }

  let {
    rows,
    columnHeaders,
    pictographSize = "sm",
    showArrows = true,
    propType,
  }: {
    rows: GridRow[];
    columnHeaders?: string[];
    pictographSize?: "sm" | "md" | "lg";
    showArrows?: boolean;
    propType?: PropType;
  } = $props();

  const columnCount = $derived(
    columnHeaders?.length ?? (rows[0]?.cells.length ?? 0)
  );

  const gridTemplateColumns = $derived(
    `160px repeat(${columnCount}, 1fr)`
  );
</script>

<div
  class="guide-pictograph-grid"
  style:grid-template-columns={gridTemplateColumns}
>
  {#if columnHeaders}
    <div class="column-header"></div>
    {#each columnHeaders as header}
      <div class="column-header">{header}</div>
    {/each}
  {/if}

  {#each rows as row}
    <div class="row-label">
      {row.label}
      {#if row.sublabel}
        <span class="row-sublabel">{row.sublabel}</span>
      {/if}
    </div>
    {#each row.cells as cell}
      <GuidePictograph
        data={cell.data}
        pngFallback={cell.pngFallback}
        label={cell.label}
        size={pictographSize}
        bordered
        {showArrows}
        {propType}
      />
    {/each}
  {/each}
</div>

<style>
  .guide-pictograph-grid {
    display: grid;
    gap: 12px 16px;
    align-items: center;
    justify-items: center;
    margin: 1.5rem 0;
  }

  .column-header {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
    padding-bottom: 4px;
  }

  .row-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--theme-text, #fff);
    text-align: right;
    padding-right: 8px;
    justify-self: end;
  }

  .row-sublabel {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
</style>
