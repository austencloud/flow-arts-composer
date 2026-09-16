<script lang="ts">
  /**
   * Reusable Level 2 turn-codex page: a portrait-reflowed grid of turn-annotated
   * pictographs under a "turns" header. The original artboards are landscape codex
   * sheets; we keep the 8-column × 4-row structure (preserving the VTG / type
   * grouping) and scale it to the portrait GuidePage width - the elegant reflow.
   * Cells render via PictographContainer with the TKA glyph suppressed; the letter
   * + turn digit is a dark print label below each cell, with an optional Same/Opp
   * dot. Turn arrows and end orientation come baked into `cell.data` (see
   * `codex-turns.ts`).
   *
   * Two header modes:
   *   - single: pass `subParts` → one centered type subheader (p17).
   *   - split:  pass `leftHeader` + `rightHeader` → two half-width headers with a
   *             vertical divider down the middle (p18: Type 2 | Type 3).
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  type Seg = { t: string; c?: string };
  export type CodexCell = {
    data: PictographData | null;
    letter: string;
    // Turn-digit display: explicit `sup` (red, high slot) / `sub` (blue, low slot)
    // take precedence; `slot` is the 1-turn shorthand kept for the Phase-2 pages.
    slot?: "high" | "low" | "both";
    sup?: string;
    sub?: string;
    dot?: "same" | "opp";
  };

  let {
    turnLabel,
    subParts,
    leftHeader,
    rightHeader,
    rows,
    names,
    cols = 8,
  }: {
    turnLabel: string;
    subParts?: Seg[];
    leftHeader?: Seg[];
    rightHeader?: Seg[];
    rows: CodexCell[][];
    names?: string[];
    cols?: number;
  } = $props();

  const S = 816 / 612;

  // N-column grid scaled to the portrait content width (26..586 = 560pt).
  const MARGIN = 26;
  const CONTENT = 560;
  const COL_PITCH = CONTENT / cols;
  const SIZE = Math.min(COL_PITCH - 6, 80);
  const colLeft = (i: number) => MARGIN + i * COL_PITCH + (COL_PITCH - SIZE) / 2;
  const colCenter = (i: number) => MARGIN + i * COL_PITCH + COL_PITCH / 2;

  const GRID_TOP = 128;
  const ROW_PITCH = 162;
  const rowTop = (r: number) => GRID_TOP + r * ROW_PITCH;
  const LABEL_DY = SIZE + 6;
  const split = !!(leftHeader && rightHeader);
  const DIVIDER_X = MARGIN + Math.floor(cols / 2) * COL_PITCH; // page midline
  const gridBottom = () => rowTop(rows.length - 1) + LABEL_DY + 22;

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: false,
    showPlacements: false,
    showReversals: false,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
</script>

<div class="codex-page">
  <!-- Header: big turn tuple. -->
  <div class="turn-label" style="top:{22 * S}px; font-size:{42 * S}px">{turnLabel}</div>

  {#if split}
    <div class="sub half" style="top:{84 * S}px; left:{MARGIN * S}px; width:{(4 * COL_PITCH) * S}px; font-size:{22 * S}px">
      {#each leftHeader as p, i (i)}<span style={p.c ? `color:${p.c}` : ""}>{p.t}</span>{/each}
    </div>
    <div class="sub half" style="top:{84 * S}px; left:{DIVIDER_X * S}px; width:{(4 * COL_PITCH) * S}px; font-size:{22 * S}px">
      {#each rightHeader as p, i (i)}<span style={p.c ? `color:${p.c}` : ""}>{p.t}</span>{/each}
    </div>
    <div class="vrule" style="left:{DIVIDER_X * S}px; top:{112 * S}px; height:{(gridBottom() - 112) * S}px"></div>
  {:else if subParts}
    <div class="sub" style="top:{84 * S}px; font-size:{24 * S}px">
      {#each subParts as p, i (i)}<span style={p.c ? `color:${p.c}` : ""}>{p.t}</span>{/each}
    </div>
  {/if}

  <!-- Row separators. -->
  {#each rows as _row, r (r)}
    {#if r > 0}
      <div class="rule" style="left:{MARGIN * S}px; top:{(rowTop(r) - 20) * S}px; width:{CONTENT * S}px"></div>
    {/if}
  {/each}

  {#each rows as row, r (r)}
    {#each row as cell, ci (ci)}
      {#if r === 0 && names?.[ci]}
        <div class="name" style="left:{colLeft(ci) * S}px; top:{(rowTop(0) - 16) * S}px; width:{SIZE * S}px">{names[ci]}</div>
      {/if}
      <div class="mini" style="left:{colLeft(ci) * S}px; top:{rowTop(r) * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
        {#if cell.data}
          <PictographContainer
            pictographData={cell.data}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            {...PICTO_FLAGS}
          />
        {/if}
      </div>
      <div class="cell-label" style="left:{colLeft(ci) * S}px; top:{(rowTop(r) + LABEL_DY) * S}px; width:{SIZE * S}px">
        <span class="tka">{cell.letter}</span
        >{#if cell.sup && cell.sub}<span class="oo"><span class="s1">{cell.sup}</span><span class="s2">{cell.sub}</span></span
        >{:else if cell.sup}<sup>{cell.sup}</sup
        >{:else if cell.sub}<sub>{cell.sub}</sub
        >{:else if cell.slot === "both"}<span class="oo"><span class="s1">1</span><span class="s2">1</span></span
        >{:else if cell.slot === "high"}<sup>1</sup>{:else}<sub>1</sub>{/if}
      </div>
      {#if cell.dot === "same"}
        <span class="dir-dot" style="left:{(colCenter(ci) - 4) * S}px; top:{(rowTop(r) + LABEL_DY - 5) * S}px"></span>
      {:else if cell.dot === "opp"}
        <span class="dir-dot" style="left:{(colCenter(ci) - 4) * S}px; top:{(rowTop(r) + LABEL_DY + 16) * S}px"></span>
      {/if}
    {/each}
  {/each}
</div>

<style>
  .codex-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .mini {
    position: absolute;
    box-sizing: border-box;
  }
  .turn-label {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.06em;
  }
  .sub {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    color: #141414;
  }
  .sub.half {
    right: auto;
  }
  .rule {
    position: absolute;
    height: 1px;
    background: #c4c4cc;
  }
  .vrule {
    position: absolute;
    width: 1.5px;
    background: #141414;
  }
  .name {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 11px;
    color: #3c3c46;
  }
  .cell-label {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 17px;
    line-height: 1;
  }
  .cell-label sup,
  .cell-label sub {
    font-size: 0.62em;
    color: #dc2626;
  }
  .cell-label sub {
    color: #2e3192;
  }
  .cell-label .oo {
    display: inline-flex;
    flex-direction: column;
    font-size: 0.5em;
    line-height: 0.9;
    vertical-align: middle;
  }
  .cell-label .oo .s1 {
    color: #dc2626;
  }
  .cell-label .oo .s2 {
    color: #2e3192;
  }
  .dir-dot {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #141414;
    transform: translateX(-50%);
  }
</style>
