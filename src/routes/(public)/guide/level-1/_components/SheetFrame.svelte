<script lang="ts">
  /**
   * The print-faithful frame. Absolute-positions each GuideBlock at its `sheet`
   * pt hint (× S) over the 816×1056 GuidePage sheet - reproducing the original
   * hand-authored page. The single-source counterpart to FlowFrame; both render
   * the same GuideBlock[]. See the reflow spec.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { GuideBlock } from "../_data/guide-content-blocks";

  let { content }: { content: GuideBlock[] } = $props();

  const S = 816 / 612; // pt → px (4/3), identical to the original pages
</script>

<div class="sheet-frame">
  {#each content as block, i (i)}
    {#if (block.kind === "heading" || block.kind === "prose" || block.kind === "glyphImage") && !block.sheet}
      <!-- Flow-only block (no pt hint): the sheet omits it. The page title lives
           here - GuidePage paints the calligraphic .guide-title, so the content's
           top-level heading is flow-only to avoid a duplicate title on the sheet. -->
    {:else if block.kind === "heading"}
      <div
        class="run sub"
        style:left="{(block.sheet?.x ?? 0) * S}px"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:width={block.sheet?.w ? `${block.sheet.w * S}px` : undefined}
        style:font-size="{(block.sheet?.h ?? 22) * S}px"
        style:text-align={block.sheet?.align ?? "center"}
      >
        {block.text}
      </div>
    {:else if block.kind === "prose"}
      <p
        class="para"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:font-size="{(block.sheet?.fontSize ?? block.sheet?.h ?? 15) * S}px"
        style:line-height="{(block.sheet?.lineHeight ?? block.sheet?.h ?? 18) * S}px"
        style:text-align={block.sheet?.align ?? "center"}
      >
        {@html block.html}
      </p>
    {:else if block.kind === "glyphImage"}
      <img
        class="glyph"
        src={block.src}
        alt={block.alt}
        style:left="{((block.sheet?.x ?? 304) - block.heightPt / 2) * S}px"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:height="{block.heightPt * S}px"
      />
    {:else if block.kind === "rule"}
      <div
        class="rule"
        style:left="{block.sheet.x * S}px"
        style:top="{block.sheet.y * S}px"
        style:width="{(block.sheet.w ?? 0) * S}px"
      ></div>
    {:else if block.kind === "pictographGroup" && block.grid}
      {#each block.items as pos, n (pos.id ?? n)}
        <div
          class="mini"
          style:left="{(block.grid.cols[n % block.grid.cols.length] ?? 0) * S}px"
          style:top="{(block.grid.rows[block.grid.rowFor[n] ?? 0] ?? 0) * S}px"
          style:width="{block.grid.cell * S}px"
          style:height="{block.grid.cell * S}px"
        >
          <PictographContainer
            pictographData={pos}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.HAND}
            rightPropTypeOverride={PropType.HAND}
            showGrid={true}
            showTKA={true}
            showPlacements={false}
            showReversals={false}
            showTnD={false}
            showElemental={false}
            showNonRadialPoints={false}
            showHandPoints={true}
            darkMode={false}
            printMode={true}
            disableTransitions={true}
          />
        </div>
      {/each}
    {:else if block.kind === "printOnly"}
      <div class="print-only" style:left="{block.sheet.x * S}px" style:top="{block.sheet.y * S}px">
        {@html block.sheetHtml}
      </div>
    {/if}
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet - coords map straight to pt×S.
     Mirrors the original HandPositionsPage.svelte's .hand-positions/.run/.para/.mini/.glyph/.rule
     (now HandPlacementsPage.svelte, single-source via hand-placements.content.ts). */
  .sheet-frame {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .run {
    position: absolute;
    font-family: var(--guide-display);
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .run.sub {
    font-weight: 600;
  }
  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    color: #141414;
    font-family: "Times New Roman", Times, Georgia, serif;
  }
  .para :global(.cR) {
    color: #cc2127;
  }
  .para :global(.cB) {
    color: #2e3192;
  }
  .para :global(.lg) {
    display: inline-block;
    width: 1.6em;
  }
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }
  .glyph {
    position: absolute;
    width: auto;
  }
  .rule {
    position: absolute;
    height: 1px;
    background: #bcbcc6;
  }
  .print-only {
    position: absolute;
  }
</style>
