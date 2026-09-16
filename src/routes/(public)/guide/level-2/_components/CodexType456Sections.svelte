<script lang="ts">
  /**
   * Shared Level 2 codex page for the symmetric N|N Type 4/5/6 sheets (old p22 at
   * turns=1, old p34 at turns=2). Three stacked sections (Type 4 Dash, Type 5
   * Dual-Dash, Type 6 Static), each with a Same row (dot above) and an Opp row (dot
   * below); Φ/Ψ/α/β use Same/Opp, Λ/Λ-/Γ use Open/Close. Both hands take `turns`.
   *
   * Accuracy-pass flag: exact per-cell Same/Opp vs Open/Close assignment and the
   * dual-hand open/close combinatorics are approximated - confirm vs the artboard.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { codexRelData, codexOpenCloseData } from "../_data/codex-turns";

  let { turnLabel, turns }: { turnLabel: string; turns: number } = $props();

  const S = 816 / 612;
  const SIZE = 54;
  const COL = 92;
  const X0 = 122;
  const digit = String(turns);

  type Cell = { data: PictographData | null; letter: string; dot: "same" | "opp"; oc?: "open" | "close" };
  const rel = (letter: string, dot: "same" | "opp"): Cell => ({ data: codexRelData(letter, turns, turns, dot), letter, dot });
  const occ = (letter: string, disp: string, kind: "open" | "close", dot: "same" | "opp", label: boolean): Cell => ({
    data: codexOpenCloseData(letter, turns, turns, kind),
    letter: disp,
    dot,
    oc: label ? kind : undefined,
  });

  type Row = { y: number; cells: Cell[] };
  type Section = { header: { t: string; c?: string }[]; hy: number; rows: Row[]; thinY: number; heavyY?: number };

  const GREEN = "#2f9e44";
  const TEAL = "#22b8cf";
  const ORANGE = "#e8590c";

  const sections: Section[] = [
    {
      header: [{ t: "Type 4 - " }, { t: "Dash", c: GREEN }],
      hy: 54,
      thinY: 168,
      heavyY: 262,
      rows: [
        { y: 86, cells: [rel("Φ", "same"), rel("Ψ", "same"), occ("Λ", "Λ", "open", "same", false), occ("Λ", "Λ", "close", "same", false)] },
        { y: 184, cells: [rel("Φ", "opp"), rel("Ψ", "opp"), occ("Λ", "Λ", "open", "opp", true), occ("Λ", "Λ", "close", "opp", true)] },
      ],
    },
    {
      header: [{ t: "Type 5 - " }, { t: "Dual", c: TEAL }, { t: "-Dash", c: GREEN }],
      hy: 278,
      thinY: 392,
      heavyY: 486,
      rows: [
        { y: 310, cells: [rel("Φ-", "same"), rel("Ψ-", "same"), occ("Λ-", "Λ-", "open", "same", false)] },
        { y: 408, cells: [rel("Φ-", "opp"), rel("Ψ-", "opp"), occ("Λ-", "Λ-", "open", "opp", true), occ("Λ-", "Λ-", "close", "opp", true)] },
      ],
    },
    {
      header: [{ t: "Type 6 - " }, { t: "Static", c: ORANGE }],
      hy: 502,
      thinY: 616,
      rows: [
        { y: 534, cells: [rel("α", "same"), rel("β", "same"), occ("γ", "Γ", "open", "same", false)] },
        { y: 632, cells: [rel("α", "opp"), rel("β", "opp"), occ("γ", "Γ", "open", "opp", true), occ("γ", "Γ", "close", "opp", true)] },
      ],
    },
  ];

  const colLeft = (i: number) => X0 + i * COL + (COL - SIZE) / 2;
  const colCenter = (i: number) => X0 + i * COL + COL / 2;

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

<div class="s-page">
  <div class="turn" style="top:{22 * S}px; font-size:{28 * S}px">{turnLabel}</div>

  {#each sections as sec, si (si)}
    <div class="th" style="left:{34 * S}px; top:{sec.hy * S}px">
      {#each sec.header as p, i (i)}<span style={p.c ? `color:${p.c}` : ""}>{p.t}</span>{/each}
    </div>
    <div class="rule thin" style="left:{34 * S}px; top:{sec.thinY * S}px; width:{544 * S}px"></div>
    {#if sec.heavyY}
      <div class="rule heavy" style="left:{22 * S}px; top:{sec.heavyY * S}px; width:{568 * S}px"></div>
    {/if}

    {#each sec.rows as row (row.y)}
      {#each row.cells as cell, ci (ci)}
        <div class="mini" style="left:{colLeft(ci) * S}px; top:{row.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
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
        <div class="cl" style="left:{colLeft(ci) * S}px; top:{(row.y + SIZE + 5) * S}px; width:{SIZE * S}px">
          <span class="tka">{cell.letter}</span><span class="oo"><span class="s1">{digit}</span><span class="s2">{digit}</span></span
          >{#if cell.oc}<span class="oc">{cell.oc}</span>{/if}
        </div>
        {#if cell.dot === "same"}
          <span class="dir-dot" style="left:{(colCenter(ci) - 5) * S}px; top:{(row.y + SIZE) * S}px"></span>
        {:else}
          <span class="dir-dot" style="left:{(colCenter(ci) - 5) * S}px; top:{(row.y + SIZE + 21) * S}px"></span>
        {/if}
      {/each}
    {/each}
  {/each}
</div>

<style>
  .s-page {
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
    left: 0;
    right: 0;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .th {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 20px;
    color: #141414;
  }
  .rule {
    position: absolute;
    background: #141414;
  }
  .rule.thin {
    height: 1px;
    background: #c4c4cc;
  }
  .rule.heavy {
    height: 2.5px;
  }
  .cl {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 15px;
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
