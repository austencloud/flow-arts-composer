<script lang="ts">
  import { loadCatalogs } from "#lib/features/choreo-card/services/catalog-loader.js";
  import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
  import { parseTurnPattern } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";
  import { TND_FAMILY_KEYS, TND_FAMILY_LABELS } from "#lib/features/choreo-card/state/catalog-browse-types.js";
  import { TND_BY_FAMILY, type TnDElement } from "#lib/features/choreo-card/domain/tnd-element.js";

  interface CatalogEntry {
    catalog: Catalog;
    family: string;
    sequenceCount: number;
  }

  type AxisKey = 'family' | 'turnPattern' | 'reversalPattern' | 'collection' | 'loopType' | 'gridMode' | 'stepCount';

  interface AxisDef {
    label: string;
    extract: (e: CatalogEntry) => string;
  }

  const AXES: Record<AxisKey, AxisDef> = {
    family: {
      label: 'TnD Family',
      extract: (e) => e.family,
    },
    turnPattern: {
      label: 'Turn Pattern',
      extract: (e) => {
        const coord = parseTurnPattern(e.catalog.turnPattern);
        if (!coord) return e.catalog.turnPattern || 'none';
        if (coord.left === coord.right) return `${coord.left}T`;
        return `${coord.left}|${coord.right}`;
      },
    },
    reversalPattern: {
      label: 'Reversal Pattern',
      extract: (e) => e.catalog.reversalPattern || 'continuous',
    },
    collection: {
      label: 'Collection',
      extract: (e) => e.catalog.collection,
    },
    loopType: {
      label: 'LOOP Type',
      extract: (e) => e.catalog.loopType || 'none',
    },
    gridMode: {
      label: 'Grid Mode',
      extract: (e) => e.catalog.gridMode,
    },
    stepCount: {
      label: 'Step Count',
      extract: (e) => String(e.catalog.stepCount),
    },
  };

  function explodeCatalogs(catalogs: Catalog[]): CatalogEntry[] {
    const entries: CatalogEntry[] = [];
    for (const catalog of catalogs) {
      if (catalog.collection === 'TnD') {
        const families = catalog.families ?? [];
        if (families.length === 0) continue;
        for (const fam of families) {
          if (fam.id === 'unknown') continue;
          const familyKey = TND_FAMILY_KEYS.find(k => fam.id.toLowerCase().includes(k)) ?? fam.id;
          entries.push({
            catalog,
            family: familyKey,
            sequenceCount: fam.sequenceIds.length,
          });
        }
      } else {
        entries.push({
          catalog,
          family: catalog.loopType || catalog.collection,
          sequenceCount: catalog.totalSequences,
        });
      }
    }
    return entries;
  }

  let rawCatalogs: Catalog[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let rowAxis: AxisKey = $state('family');
  let colAxis: AxisKey = $state('reversalPattern');
  let detailCell: { row: string; col: string; entries: CatalogEntry[] } | null = $state(null);

  const allEntries = $derived(explodeCatalogs(rawCatalogs));

  const entries = $derived.by(() => {
    const familyActive = rowAxis === 'family' || colAxis === 'family';
    const loopTypeActive = rowAxis === 'loopType' || colAxis === 'loopType';

    return allEntries.filter(e => {
      if (familyActive && e.catalog.collection !== 'TnD') return false;
      if (loopTypeActive && e.catalog.collection !== 'LOOPs') return false;
      return true;
    });
  });

  const rowDef = $derived(AXES[rowAxis]);
  const colDef = $derived(AXES[colAxis]);

  const rowValues = $derived.by(() => {
    const vals = new Set<string>();
    for (const e of entries) vals.add(rowDef.extract(e));
    return [...vals].sort();
  });

  const colValues = $derived.by(() => {
    const vals = new Set<string>();
    for (const e of entries) vals.add(colDef.extract(e));
    return [...vals].sort();
  });

  const matrix = $derived.by(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const e of entries) {
      const key = `${rowDef.extract(e)}::${colDef.extract(e)}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  });

  const maxSeqCount = $derived.by(() => {
    let max = 0;
    for (const arr of matrix.values()) {
      const seqs = arr.reduce((s, e) => s + e.sequenceCount, 0);
      if (seqs > max) max = seqs;
    }
    return max;
  });

  function cellEntries(row: string, col: string): CatalogEntry[] {
    return matrix.get(`${row}::${col}`) ?? [];
  }

  function cellSeqCount(entries: CatalogEntry[]): number {
    return entries.reduce((s, e) => s + e.sequenceCount, 0);
  }

  function heatLevel(seqCount: number): number {
    if (seqCount === 0 || maxSeqCount === 0) return 0;
    return Math.ceil((seqCount / maxSeqCount) * 4);
  }

  function getElementForValue(axis: AxisKey, value: string): TnDElement | undefined {
    if (axis !== 'family') return undefined;
    return TND_BY_FAMILY[value];
  }

  function formatLabel(axis: AxisKey, value: string): string {
    if (axis === 'family') return TND_FAMILY_LABELS[value] ?? value;
    return value;
  }

  function openDetail(row: string, col: string) {
    const ents = cellEntries(row, col);
    if (ents.length === 0) return;
    detailCell = { row, col, entries: ents };
  }

  $effect(() => {
    loadCatalogs()
      .then((result) => {
        rawCatalogs = result;
        loading = false;
      })
      .catch((e) => {
        error = String(e);
        loading = false;
      });
  });
</script>

<svelte:head>
  <title>Multi-Axis Deck Picker</title>
</svelte:head>

<div class="page">
  <div class="toolbar">
    <h1>Deck Picker</h1>

    <div class="axis-group">
      <label class="axis-label">
        <span class="axis-tag row-tag">Rows</span>
        <select bind:value={rowAxis}>
          {#each Object.entries(AXES) as [key, def] (key)}
            <option value={key}>{def.label}</option>
          {/each}
        </select>
      </label>

      <span class="axis-sep">&times;</span>

      <label class="axis-label">
        <span class="axis-tag col-tag">Cols</span>
        <select bind:value={colAxis}>
          {#each Object.entries(AXES) as [key, def] (key)}
            <option value={key}>{def.label}</option>
          {/each}
        </select>
      </label>
    </div>

    <span class="stats">
      {entries.reduce((s, e) => s + e.sequenceCount, 0)} sequences &middot; {rawCatalogs.length} catalogs &middot; {rowValues.length}&times;{colValues.length} grid
    </span>
  </div>

  {#if loading}
    <div class="status">Loading catalogs...</div>
  {:else if error}
    <div class="status error">{error}</div>
  {:else}
    <div class="grid-scroll">
      <div
        class="matrix-grid"
        role="grid"
        aria-label="Catalog matrix: {rowDef.label} × {colDef.label}"
        style="grid-template-columns: minmax(100px, auto) repeat({colValues.length}, minmax(52px, 1fr));
               grid-template-rows: auto repeat({rowValues.length}, minmax(44px, 1fr));"
      >
        <!-- Corner -->
        <div class="header-cell corner" role="presentation">
          <span class="corner-row">{rowDef.label}</span>
          <span class="corner-sep">/</span>
          <span class="corner-col">{colDef.label}</span>
        </div>

        <!-- Column headers -->
        {#each colValues as cv (cv)}
          {@const el = getElementForValue(colAxis, cv)}
          <div
            class="header-cell col-header"
            role="columnheader"
            style={el ? `color: ${el.accentColor}` : ''}
          >
            {#if el}
              <img src={el.iconPath} alt="" class="axis-icon" />
            {/if}
            {formatLabel(colAxis, cv)}
          </div>
        {/each}

        <!-- Rows -->
        {#each rowValues as rv (rv)}
          {@const el = getElementForValue(rowAxis, rv)}
          <div
            class="header-cell row-header"
            role="rowheader"
            style={el ? `color: ${el.accentColor}` : ''}
          >
            {#if el}
              <img src={el.iconPath} alt="" class="axis-icon" />
            {/if}
            {formatLabel(rowAxis, rv)}
          </div>

          {#each colValues as cv (cv)}
            {@const ents = cellEntries(rv, cv)}
            {@const seqs = cellSeqCount(ents)}
            {#if ents.length > 0}
              <button
                type="button"
                class="cell heat-{heatLevel(seqs)}"
                role="gridcell"
                aria-label="{seqs} sequences at {formatLabel(rowAxis, rv)} × {formatLabel(colAxis, cv)}"
                onclick={() => openDetail(rv, cv)}
              >
                <span class="cell-count">{seqs}</span>
                <span class="cell-seq">{ents.length} {ents.length === 1 ? 'catalog' : 'catalogs'}</span>
              </button>
            {:else}
              <div class="cell empty" role="gridcell" aria-label="No catalogs at {rv} × {cv}"></div>
            {/if}
          {/each}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Detail panel -->
  {#if detailCell}
    <div class="detail-panel">
      <div class="detail-header">
        <h2>{detailCell.row} &times; {detailCell.col}</h2>
        <button type="button" class="close-btn" onclick={() => { detailCell = null; }}>&times;</button>
      </div>
      <p class="detail-count">{cellSeqCount(detailCell.entries)} sequences in {detailCell.entries.length} {detailCell.entries.length === 1 ? 'catalog' : 'catalogs'}</p>
      <div class="detail-list">
        {#each detailCell.entries as entry (entry.catalog.id + '::' + entry.family)}
          {@const entryEl = TND_BY_FAMILY[entry.family]}
          <div class="detail-item">
            <span class="detail-name">{entry.catalog.name || entry.catalog.canonicalName}</span>
            {#if entryEl}
              <img src={entryEl.iconPath} alt="" class="detail-icon" />
            {/if}
            <span class="detail-family" style={entryEl ? `color: ${entryEl.accentColor}` : ''}>
              {TND_FAMILY_LABELS[entry.family] ?? entry.family}
            </span>
            <span class="detail-meta">{entry.sequenceCount} seq</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    width: 100vw;
    height: 100vh;
    background: #0f1117;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 12px 24px;
    background: #16181f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .toolbar h1 {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin: 0;
  }

  .axis-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .axis-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .axis-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .row-tag { background: rgba(96, 165, 250, 0.2); color: #60a5fa; }
  .col-tag { background: rgba(248, 113, 113, 0.2); color: #f87171; }

  .axis-sep {
    color: rgba(255, 255, 255, 0.2);
    font-size: 14px;
  }

  select {
    padding: 6px 10px;
    background: #1e2029;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #e0e0e0;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  select:focus { outline: none; border-color: rgba(183, 99, 205, 0.5); }

  .stats {
    margin-left: auto;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .status {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
  }

  .status.error { color: #f87171; }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    padding: 24px;
  }

  .matrix-grid {
    display: grid;
    gap: 2px;
    width: fit-content;
    min-width: 100%;
  }

  .header-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .corner {
    font-size: 10px;
    gap: 3px;
    justify-content: flex-end;
    text-align: right;
    position: sticky;
    left: 0;
    top: 0;
    z-index: 3;
    background: #0f1117;
  }

  .corner-row { color: #60a5fa; }
  .corner-sep { color: rgba(255, 255, 255, 0.15); }
  .corner-col { color: #f87171; }

  .col-header {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #0f1117;
    border-bottom: 1px solid rgba(248, 113, 113, 0.12);
  }

  .row-header {
    position: sticky;
    left: 0;
    z-index: 2;
    background: #0f1117;
    justify-content: flex-end;
    text-align: right;
    border-right: 1px solid rgba(96, 165, 250, 0.12);
  }

  .axis-icon {
    width: 18px;
    height: 18px;
    margin-right: 4px;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    font: inherit;
    color: #e0e0e0;
    padding: 4px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  }

  .cell:hover {
    background: rgba(183, 99, 205, 0.18);
    border-color: rgba(183, 99, 205, 0.3);
    transform: scale(1.04);
    z-index: 1;
    box-shadow: 0 4px 16px rgba(183, 99, 205, 0.2);
  }

  .cell:active { transform: scale(0.97); }

  .cell:focus-visible {
    outline: 2px solid rgba(183, 99, 205, 0.7);
    outline-offset: 1px;
    z-index: 3;
  }

  .cell.empty {
    background: rgba(255, 255, 255, 0.015);
    border-color: rgba(255, 255, 255, 0.02);
    cursor: default;
  }

  .cell.heat-1 { background: rgba(183, 99, 205, 0.06); }
  .cell.heat-2 { background: rgba(183, 99, 205, 0.12); }
  .cell.heat-3 { background: rgba(183, 99, 205, 0.20); }
  .cell.heat-4 { background: rgba(183, 99, 205, 0.30); border-color: rgba(183, 99, 205, 0.2); }

  .cell-count {
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .cell-seq {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.3);
    line-height: 1;
  }

  /* Detail panel */
  .detail-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 320px;
    height: 100vh;
    background: #16181f;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    padding: 20px;
    overflow-y: auto;
    z-index: 10;
    animation: slide-in 0.15s ease;
  }

  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .detail-header h2 {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    font-family: inherit;
  }

  .close-btn:hover { color: #fff; }

  .detail-count {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 12px;
  }

  .detail-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    font-size: 12px;
  }

  .detail-name { color: rgba(255, 255, 255, 0.8); flex: 1; }
  .detail-icon { width: 14px; height: 14px; flex-shrink: 0; }
  .detail-family { color: rgba(183, 99, 205, 0.6); font-size: 10px; }
  .detail-meta { color: rgba(255, 255, 255, 0.35); font-variant-numeric: tabular-nums; }

  @media (prefers-reduced-motion: reduce) {
    .cell { transition: none; }
    .detail-panel { animation: none; }
  }
</style>
