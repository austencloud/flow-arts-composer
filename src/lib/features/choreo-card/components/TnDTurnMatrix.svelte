<script lang="ts">
  import type { Catalog } from "../domain/models/Catalog";
  import type { TnDTurnPatternOption } from "../services/deck-composer";
  import { parseTurnPattern } from "../domain/turn-pattern-parser";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TurnMatrixGrid from "./TurnMatrixGrid.svelte";

  interface Props {
    // Navigate mode (catalog browser): click a cell to open that catalog.
    catalogs?: Catalog[];
    onSelectCatalog?: (catalog: Catalog) => void;
    // Select mode (deck-releaser picker): multi-select turn patterns.
    patternOptions?: TnDTurnPatternOption[];
    selected?: Set<string>;
    onToggle?: (turnPattern: string) => void;
    onSetPatterns?: (patterns: Set<string>) => void;
  }

  const {
    catalogs = [],
    onSelectCatalog,
    patternOptions,
    selected,
    onToggle,
    onSetPatterns,
  }: Props = $props();

  const selectable = $derived(patternOptions != null);

  type CellKey = `${number},${number}`;

  interface SelectCell {
    turnPattern: string;
    count: number;
  }

  const catalogMap = $derived.by(() => {
    const map = new Map<CellKey, Catalog>();
    for (const catalog of catalogs) {
      const coord = parseTurnPattern(catalog.turnPattern);
      if (!coord) continue;
      map.set(`${coord.left},${coord.right}`, catalog);
    }
    return map;
  });

  const selectMap = $derived.by(() => {
    const map = new Map<CellKey, SelectCell>();
    for (const opt of patternOptions ?? []) {
      const coord = parseTurnPattern(opt.turnPattern);
      if (!coord) continue;
      map.set(`${coord.left},${coord.right}`, {
        turnPattern: opt.turnPattern,
        count: opt.sequenceCount,
      });
    }
    return map;
  });

  // ── Presets (select mode) ──
  function allPatterns(): Set<string> {
    return new Set((patternOptions ?? []).map((o) => o.turnPattern));
  }

  function filteredPatterns(pred: (left, right) => boolean): Set<string> {
    const out = new Set<string>();
    for (const opt of patternOptions ?? []) {
      const coord = parseTurnPattern(opt.turnPattern);
      if (coord && pred(coord.left, coord.right)) out.add(opt.turnPattern);
    }
    return out;
  }

  const presets = [
    {
      id: "all",
      label: "Select All",
      icon: "fa-check-double",
      build: () => allPatterns(),
    },
    {
      id: "whole",
      label: "Whole Turns",
      icon: "fa-circle",
      build: () =>
        filteredPatterns((b, r) => Number.isInteger(b) && Number.isInteger(r)),
    },
    {
      id: "matched",
      label: "Matched",
      icon: "fa-equals",
      build: () => filteredPatterns((b, r) => b === r),
    },
    {
      id: "matched-whole",
      label: "Matched Whole",
      icon: "fa-circle-dot",
      // Diagonal whole-turn cells only: 0|0, 1|1, 2|2, 3|3.
      build: () => filteredPatterns((b, r) => b === r && Number.isInteger(b)),
    },
    {
      id: "clear",
      label: "Clear",
      icon: "fa-xmark",
      build: () => new Set<string>(),
    },
  ] as const;
</script>

<TurnMatrixGrid ariaLabel="TnD turn combination matrix">
  {#snippet header()}
    {#if selectable}
      <div class="preset-bar">
        {#each presets as preset (preset.id)}
          <FilterChipBase
            label={preset.label}
            icon={"fas " + preset.icon}
            mode="action"
            chipColor={preset.id === "clear"
              ? "#f87171"
              : "var(--theme-accent)"}
            onclick={() => onSetPatterns?.(preset.build())}
          />
        {/each}
      </div>
    {/if}
  {/snippet}

  {#snippet cell(left, right)}
    {@const isSymmetric = left === right}
    {#if selectable}
      {@const c = selectMap.get(`${left},${right}`)}
      {#if c}
        {@const isSelected = selected?.has(c.turnPattern) ?? false}
        <button
          type="button"
          class="cell"
          class:symmetric={isSymmetric}
          class:selected={isSelected}
          role="gridcell"
          aria-selected={isSelected}
          aria-label="Left {left}, right {right}, {c.count} sequences{isSymmetric
            ? ' (matched)'
            : ''}{isSelected ? ', selected' : ''}"
          onclick={() => onToggle?.(c.turnPattern)}
        >
          <span class="turn-pair">
            <span class="turn-blue">{left}</span><span class="turn-sep">|</span
            ><span class="turn-red">{right}</span>
          </span>
          <span class="cell-count">{c.count}</span>
        </button>
      {:else}
        <div
          class="cell empty"
          role="gridcell"
          aria-label="No deck for left {left}, right {right}"
        ></div>
      {/if}
    {:else}
      {@const catalog = catalogMap.get(`${left},${right}`)}
      {#if catalog}
        <button
          type="button"
          class="cell"
          class:symmetric={isSymmetric}
          role="gridcell"
          aria-label="{catalog.totalSequences} sequences, left {left}, right {right}{isSymmetric
            ? ' (symmetric)'
            : ''}"
          onclick={() => onSelectCatalog?.(catalog)}
        >
          <span class="turn-pair">
            <span class="turn-blue">{left}</span><span class="turn-sep">|</span
            ><span class="turn-red">{right}</span>
          </span>
          <span class="cell-count">{catalog.totalSequences} seq</span>
        </button>
      {:else}
        <div
          class="cell empty"
          role="gridcell"
          aria-label="No deck for left {left}, right {right}"
        ></div>
      {/if}
    {/if}
  {/snippet}
</TurnMatrixGrid>

<style>
  .preset-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .cell {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 0.5cqi, 4px);
    border-radius: clamp(4px, 1cqi, 8px);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    color: var(--theme-text, #fff);
    font: inherit;
    padding: 0;
    transition:
      background 0.15s ease,
      transform 0.1s ease,
      box-shadow 0.15s ease;
    position: relative;
  }

  .cell:hover {
    background: rgba(183, 99, 205, 0.15);
    border-color: rgba(183, 99, 205, 0.3);
    transform: scale(1.06);
    z-index: 2;
    box-shadow: 0 4px 20px rgba(183, 99, 205, 0.25);
  }

  .cell:active {
    transform: scale(0.97);
  }

  .cell:focus-visible {
    outline: 2px solid rgba(183, 99, 205, 0.7);
    outline-offset: 1px;
    z-index: 3;
  }

  .cell.symmetric {
    background: rgba(183, 99, 205, 0.12);
    border-color: rgba(183, 99, 205, 0.25);
  }

  .cell.symmetric:hover {
    background: rgba(183, 99, 205, 0.22);
    border-color: rgba(183, 99, 205, 0.45);
    box-shadow: 0 4px 20px rgba(183, 99, 205, 0.35);
  }

  /* Selected state (select mode) — theme accent */
  .cell.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #b763cd) 22%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #b763cd) 60%,
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #b763cd) 40%, transparent);
  }

  .cell.selected:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #b763cd) 32%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #b763cd) 75%,
      transparent
    );
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--theme-accent, #b763cd) 30%, transparent);
  }

  .cell.selected .cell-count {
    color: color-mix(in srgb, var(--theme-accent, #b763cd) 80%, #fff);
  }

  .cell.empty {
    background: rgba(255, 255, 255, 0.015);
    border-color: rgba(255, 255, 255, 0.03);
    cursor: default;
  }

  .turn-pair {
    display: flex;
    align-items: baseline;
    gap: 0.12em;
    font-family:
      "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace;
    font-size: clamp(12px, 2.8cqi, 17px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .turn-blue {
    color: #60a5fa;
  }
  .turn-red {
    color: #f87171;
  }
  .turn-sep {
    color: rgba(255, 255, 255, 0.2);
    font-weight: 400;
  }

  .cell-count {
    font-size: clamp(9px, 1.9cqi, 12px);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.35);
    line-height: 1;
  }

  @media (max-width: 640px) {
    .cell-count {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
</style>
