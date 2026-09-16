<script lang="ts">
  /**
   * Codex 2/0 Type 2/3 + 2|0·0|2 Type 4/5/6 - Level 2 body page 27 (manifest
   * `codex-2-0-t23-456`), faithful to old p27. Same 4-quadrant layout as p19 but
   * with two turns:
   *   TL Type 2 2/0 (`²`), TR Type 3 2/0 (`²`),
   *   BL Type 4 2/0 (`²`) then 0/2 (`₂`), BR Type 5 2/0 then Type 6 static 2/0.
   * Self-titled.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { codexSlotData, codexOpenCloseData } from "../_data/codex-turns";

  const S = 816 / 612;
  const SIZE = 64;
  const COL = 68;

  type Cell = { data: PictographData | null; letter: string; slot: "high" | "low"; oc?: "open" | "close" };
  const hi = (letter: string): Cell => ({ data: codexSlotData(letter, "high", 2), letter, slot: "high" });
  const lo = (letter: string): Cell => ({ data: codexSlotData(letter, "low", 2), letter, slot: "low" });
  const oc = (letter: string, hiT: number, loT: number, disp: string, kind: "open" | "close"): Cell => ({
    data: codexOpenCloseData(letter, hiT, loT, kind),
    letter: disp,
    slot: hiT > 0 ? "high" : "low",
    oc: kind,
  });

  type RowDef = { x0: number; y: number; cells: Cell[] };
  const rowDefs: RowDef[] = [
    // TL - Type 2, 2/0
    { x0: 22, y: 138, cells: [hi("W"), hi("X"), hi("Y"), hi("Z")] },
    { x0: 22, y: 268, cells: [hi("Σ"), hi("Δ"), hi("Θ"), hi("Ω")] },
    // TR - Type 3, 2/0
    { x0: 314, y: 138, cells: [hi("W-"), hi("X-"), hi("Y-"), hi("Z-")] },
    { x0: 314, y: 268, cells: [hi("Σ-"), hi("Δ-"), hi("Θ-"), hi("Ω-")] },
    // BL - Type 4, 2/0 then 0/2
    { x0: 22, y: 452, cells: [hi("Φ"), hi("Ψ"), oc("Λ", 2, 0, "Λ", "open"), oc("Λ", 2, 0, "Λ", "close")] },
    { x0: 22, y: 606, cells: [lo("Φ"), lo("Ψ"), oc("Λ", 0, 2, "Λ", "open"), oc("Λ", 0, 2, "Λ", "close")] },
    // BR - Type 5, 2/0 then Type 6 static
    { x0: 314, y: 452, cells: [hi("Φ-"), hi("Ψ-"), oc("Λ-", 2, 0, "Λ-", "open"), oc("Λ-", 2, 0, "Λ-", "close")] },
    { x0: 314, y: 606, cells: [hi("α"), hi("β"), oc("γ", 2, 0, "Γ", "open"), oc("γ", 2, 0, "Γ", "close")] },
  ];

  const colLeft = (x0: number, i: number) => x0 + i * COL + (COL - SIZE) / 2;

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

  const PURPLE = "#7048b6";
  const GREEN = "#2f9e44";
  const TEAL = "#22b8cf";
  const ORANGE = "#e8590c";
</script>

<div class="q-page">
  <!-- Top headers + big 2/0 turn label. -->
  <div class="th" style="left:{20 * S}px; top:{96 * S}px; width:{280 * S}px">Type 2 - <span style="color:{PURPLE}">Shift</span></div>
  <div class="turn" style="left:{246 * S}px; top:{86 * S}px; width:{120 * S}px">2 / 0</div>
  <div class="th" style="left:{312 * S}px; top:{96 * S}px; width:{280 * S}px">Type 3 - <span style="color:{GREEN}">Cross</span><span style="color:{PURPLE}">-Shift</span></div>

  <!-- Bottom headers + mid 0/2 label. -->
  <div class="th" style="left:{20 * S}px; top:{410 * S}px; width:{280 * S}px">Type 4 - <span style="color:{GREEN}">Dash</span></div>
  <div class="th" style="left:{312 * S}px; top:{410 * S}px; width:{280 * S}px">Type 5 - <span style="color:{TEAL}">Dual</span><span style="color:{GREEN}">-Dash</span></div>
  <div class="turn small" style="left:{100 * S}px; top:{560 * S}px; width:{120 * S}px">0 / 2</div>
  <div class="th" style="left:{312 * S}px; top:{560 * S}px; width:{280 * S}px">Type 6 - <span style="color:{ORANGE}">Static</span></div>

  <!-- Heavy dividers. -->
  <div class="vheavy" style="left:{306 * S}px; top:{110 * S}px; height:{662 * S}px"></div>
  <div class="hheavy" style="left:{20 * S}px; top:{398 * S}px; width:{572 * S}px"></div>

  {#each rowDefs as row, ri (ri)}
    {#each row.cells as cell, ci (ci)}
      <div class="mini" style="left:{colLeft(row.x0, ci) * S}px; top:{row.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
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
      <div class="cl" style="left:{colLeft(row.x0, ci) * S}px; top:{(row.y + SIZE + 5) * S}px; width:{SIZE * S}px">
        <span class="tka">{cell.letter}</span>{#if cell.slot === "high"}<sup>2</sup>{:else}<sub>2</sub>{/if}{#if cell.oc}<span class="oc">{cell.oc}</span>{/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .q-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .mini {
    position: absolute;
    box-sizing: border-box;
  }
  .th {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 20px;
    color: #141414;
  }
  .turn {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 30px;
    letter-spacing: 0.05em;
  }
  .turn.small {
    font-size: 26px;
  }
  .vheavy {
    position: absolute;
    width: 2.5px;
    background: #141414;
  }
  .hheavy {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }
  .cl {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
  }
  .cl sup {
    font-size: 0.62em;
    color: #dc2626;
  }
  .cl sub {
    font-size: 0.62em;
    color: #2e3192;
  }
  .oc {
    font-style: italic;
    font-weight: 400;
    font-size: 0.6em;
    margin-left: 1px;
  }
</style>
