<!--
  One type's letters on their own screen, in the largest square cells that
  hold all of them (typeCellGrid), each with its transition caption above
  it. The cells draw the board's current data, so a rotated board shows
  rotated letters here. Tapping a cell opens its Letter screen, dealt from
  the cell (codex-fan.ts).
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { flipDuration } from "#lib/shared/transitions/motion.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { CODEX_TYPE_BANDS } from "../../atlas/_components/codex-boards/codex-letters";
  import type { CodexExplorerState } from "../../atlas/_components/codex-boards/codex-explorer-state.svelte";
  import { codexTypeLabel, transitionFor } from "../_data/codex-groups";
  import { typeCellGrid } from "../_data/codex-fit";
  import type { CodexScreen } from "../_data/codex-screen";
  import CodexScreenFrame from "./CodexScreenFrame.svelte";
  import CodexEditSummary from "./CodexEditSummary.svelte";
  import CodexCell from "./CodexCell.svelte";

  let {
    codex,
    type,
    propType,
    summary,
    onResetAll,
    onGo,
    onBack,
  }: {
    codex: CodexExplorerState;
    type: number;
    propType?: PropType;
    summary: string | null;
    onResetAll: () => void;
    onGo: (screen: CodexScreen, options?: { push: boolean }) => void;
    onBack: () => void;
  } = $props();

  const GAP = 10;
  /** The transition caption over each cell: 0.75rem at line-height 1.1,
   *  plus the cell's 2px gap (CodexCell, codex-dark.css). */
  const CAPTION = 16;
  const MAX_CELL = 320;

  const band = $derived(
    CODEX_TYPE_BANDS.find((b) => b.type.n === type) ?? CODEX_TYPE_BANDS[0]!
  );
  // Every cell carries its own caption here: on a grid of single cells a
  // group's shared header has no box to sit over.
  const cells = $derived(
    band.boxes.flatMap((tagged) =>
      tagged.box.cells.map((cell) => ({ ...cell, top: transitionFor(cell.id) }))
    )
  );
  const transitions = $derived(
    [...new Set(cells.map((cell) => cell.top).filter(Boolean))].join(" · ")
  );

  let areaWidth = $state(0);
  let areaHeight = $state(0);
  const grid = $derived(
    typeCellGrid(cells.length, areaWidth, areaHeight - 8, GAP, CAPTION, MAX_CELL)
  );

  function open(id: string): void {
    codex.select(id);
    // select() has just pushed the letter's entry; the screen rides on it.
    onGo({ kind: "letter", type, letter: codex.info.label }, { push: false });
  }
</script>

<CodexScreenFrame
  title={codexTypeLabel(band.type)}
  subtitle={transitions}
  {onBack}
  backLabel="Codex"
>
  {#snippet actions()}
    <FilterChipBase
      mode="action"
      size="md"
      label="Adjust"
      icon="fas fa-sliders"
      onclick={() => onGo({ kind: "adjust", type, letter: null })}
    />
  {/snippet}

  <CodexEditSummary text={summary} onReset={onResetAll} />
  <div
    class="area"
    bind:clientWidth={areaWidth}
    bind:clientHeight={areaHeight}
    onpointerdowncapture={codex.notePress}
    onkeydowncapture={codex.notePress}
  >
    {#if grid}
      <div
        class="cells"
        role="list"
        aria-label={codexTypeLabel(band.type)}
        style:--codex-picto-size={`${grid.cell}px`}
        style:grid-template-columns={`repeat(${grid.columns}, ${grid.cell}px)`}
        style:gap={`${GAP}px`}
      >
        {#each cells as cell (cell.id)}
          <div
            class="cell"
            role="listitem"
            animate:flip={{ duration: flipDuration() }}
          >
            <CodexCell
              {cell}
              theme="dark"
              showName={false}
              showTransition
              {propType}
              showGlyph={codex.visibility.showGlyph}
              showGrid={codex.visibility.showGrid}
              showTKA={codex.visibility.showTKA}
              showPlacements={codex.visibility.showPlacements}
              showReversals={codex.visibility.showReversals}
              showNonRadialPoints={codex.visibility.showNonRadialPoints}
              dataOverride={codex.boardData?.(cell.id)}
              onSelect={open}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
</CodexScreenFrame>

<style>
  .area {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding-bottom: 8px;
    box-sizing: border-box;
  }

  .cells {
    position: relative;
    display: grid;
    justify-content: center;
    --pictograph-type-frame-width: 0px;
    --codex-cell-frame: 1px solid var(--codex-cell-border);
    --selection-selected-transform: none;
  }

  .cell {
    display: flex;
    justify-content: center;
    min-width: 0;
  }
</style>
