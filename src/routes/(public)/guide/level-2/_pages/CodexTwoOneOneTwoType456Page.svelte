<script lang="ts">
  /**
   * Codex 2/1 + 1/2 - Type 4/5/6 - Level 2 body page 31 (manifest
   * `codex-21-12-t456`), faithful to old p31. Four quadrants split by a heavy H+V
   * divider, each a Same row (dot above) + Opp row (dot below):
   *   TL Type 4 (Dash) 2/1     TR Type 5 (Dual-Dash) 2/1
   *   BL Type 4 (Dash) 1/2     BR Type 6 (Static) 2/1
   * Φ/Ψ/α/β use Same/Opp; Λ/Λ-/Γ use dual open/close, labeled o/c and c/o.
   *
   * Accuracy-pass flag: dual-hand open/close combinatorics (o/c vs c/o) and the exact
   * Same/Opp direction mapping are approximated - confirm vs the artboard.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { codexRelData, codexOpenCloseData } from "../_data/codex-turns";

  const S = 816 / 612;
  const SIZE = 50;
  const COL = 62;

  type Cell = { data: PictographData | null; letter: string; sup: string; sub: string; oc?: string; dot: "same" | "opp" };
  const rel = (letter: string, hi: number, lo: number, dot: "same" | "opp"): Cell => ({
    data: codexRelData(letter, hi, lo, dot),
    letter,
    sup: String(hi),
    sub: String(lo),
    dot,
  });
  const occ = (
    letter: string,
    disp: string,
    hi: number,
    lo: number,
    kind: "open" | "close",
    ocLabel: string,
    dot: "same" | "opp"
  ): Cell => ({
    data: codexOpenCloseData(letter, hi, lo, kind),
    letter: disp,
    sup: String(hi),
    sub: String(lo),
    oc: ocLabel,
    dot,
  });

  // left half = Type 4/5 (top) or Type 4 (bottom); right half = Type 5/6.
  const t4 = (hi: number, lo: number, dot: "same" | "opp"): Cell[] => [
    rel("Φ", hi, lo, dot),
    rel("Ψ", hi, lo, dot),
    occ("Λ", "Λ", hi, lo, "open", "o/c", dot),
    occ("Λ", "Λ", hi, lo, "close", "c/o", dot),
  ];
  const t5 = (hi: number, lo: number, dot: "same" | "opp"): Cell[] => [
    rel("Φ-", hi, lo, dot),
    rel("Ψ-", hi, lo, dot),
    occ("Λ-", "Λ-", hi, lo, "open", "o/c", dot),
    occ("Λ-", "Λ-", hi, lo, "close", "c/o", dot),
  ];
  const t6 = (hi: number, lo: number, dot: "same" | "opp"): Cell[] => [
    rel("α", hi, lo, dot),
    rel("β", hi, lo, dot),
    occ("γ", "Γ", hi, lo, "open", "o/c", dot),
    occ("γ", "Γ", hi, lo, "close", "c/o", dot),
  ];

  type RowDef = { y: number; side: string; left: Cell[]; right: Cell[] };
  const rows: RowDef[] = [
    { y: 100, side: "Same", left: t4(2, 1, "same"), right: t5(2, 1, "same") },
    { y: 200, side: "Opp", left: t4(2, 1, "opp"), right: t5(2, 1, "opp") },
    { y: 360, side: "Same", left: t4(1, 2, "same"), right: t6(2, 1, "same") },
    { y: 460, side: "Opp", left: t4(1, 2, "opp"), right: t6(2, 1, "opp") },
  ];

  const LX = 76;
  const RX = 350;
  const cellX = (x0: number, i: number) => x0 + i * COL;

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

  const GREEN = "#2f9e44";
  const TEAL = "#22b8cf";
  const ORANGE = "#e8590c";
</script>

<div class="q-page">
  <div class="turn" style="left:{246 * S}px; top:{34 * S}px; width:{120 * S}px">2 / 1</div>
  <div class="th" style="left:{LX * S}px; top:{64 * S}px">Type 4 - <span style="color:{GREEN}">Dash</span></div>
  <div class="th" style="left:{RX * S}px; top:{64 * S}px">Type 5 - <span style="color:{TEAL}">Dual</span><span style="color:{GREEN}">-Dash</span></div>

  <div class="turn small" style="left:{120 * S}px; top:{318 * S}px; width:{120 * S}px">1 / 2</div>
  <div class="th" style="left:{RX * S}px; top:{322 * S}px">Type 6 - <span style="color:{ORANGE}">Static</span></div>

  <div class="vheavy" style="left:{338 * S}px; top:{88 * S}px; height:{450 * S}px"></div>
  <div class="hheavy" style="left:{16 * S}px; top:{292 * S}px; width:{580 * S}px"></div>

  {#each rows as row (row.y)}
    <div class="side" style="left:{8 * S}px; top:{(row.y + 24) * S}px">{row.side}</div>
    {#each [...row.left.map((c) => ({ c, x0: LX })), ...row.right.map((c) => ({ c, x0: RX }))] as entry, idx (idx)}
      {@const i = idx % 4}
      {@const cell = entry.c}
      <div class="mini" style="left:{cellX(entry.x0, i) * S}px; top:{row.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
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
      <div class="cl" style="left:{cellX(entry.x0, i) * S}px; top:{(row.y + SIZE + 4) * S}px; width:{SIZE * S}px">
        <span class="tka">{cell.letter}</span><span class="oo"><span class="s1">{cell.sup}</span><span class="s2">{cell.sub}</span></span
        >{#if cell.oc}<span class="oc">{cell.oc}</span>{/if}
      </div>
      {#if cell.dot === "same"}
        <span class="dir-dot" style="left:{(cellX(entry.x0, i) + SIZE / 2) * S}px; top:{(row.y + SIZE - 2) * S}px"></span>
      {:else}
        <span class="dir-dot" style="left:{(cellX(entry.x0, i) + SIZE / 2) * S}px; top:{(row.y + SIZE + 18) * S}px"></span>
      {/if}
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
  .turn {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 28px;
    letter-spacing: 0.05em;
  }
  .turn.small {
    font-size: 24px;
  }
  .th {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 18px;
    color: #141414;
  }
  .side {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #3c3c46;
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
    font-size: 14px;
    line-height: 1;
  }
  .oo {
    display: inline-flex;
    flex-direction: column;
    font-size: 0.5em;
    line-height: 0.9;
    vertical-align: middle;
  }
  .oo .s1 {
    color: #dc2626;
  }
  .oo .s2 {
    color: #2e3192;
  }
  .oc {
    font-style: italic;
    font-weight: 400;
    font-size: 0.55em;
    margin-left: 1px;
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
