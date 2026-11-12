<script lang="ts">
  /**
   * CodexPageBody - one Codex sheet as one printable guide page.
   *
   * The Codex spans TWO letter-sized pages (Types 1-2 on sheet 1, Types 3-6 on
   * sheet 2), exactly like the original printed guide. Each sheet is authored to
   * fill one page, so each renders as its own manifest page (`codex`,
   * `codex-2`); GuideCodexPage / GuideCodexPage2 are thin wrappers that pass
   * SHEET1 / SHEET2.
   *
   * Paper keeps the sheets: /print and /book draw the static Double-Staff sheet.
   * Online the Codex is its own page (/codex). The web guide sends these two
   * addresses there; the in-app book reader keeps the page so its numbering
   * matches paper, and shows a short pointer instead of a second, lesser copy.
   *
   * PRINT/BOOK SEAM: /print and /book share this manifest + BUILT registry with
   * the reader; this component discriminates via the sequence-click context
   * (only the reader provides it - getGuidePrintMode() && emitSequence === null
   * means print/book).
   */
  import {
    getGuideSequenceClick,
    getGuidePrintMode,
  } from "../_data/guide-data-context";
  import CodexSheet from "../../../codex/_components/CodexSheet.svelte";
  import type { CodexSheetDef } from "../../../codex/_data/codex-groups";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  let { sheet }: { sheet: CodexSheetDef } = $props();

  // The reader ALSO sets guide print mode (print STYLE + eager pictographs), so
  // getGuidePrintMode() can't tell reader from /print,/book. The sequence-click
  // context can: only the reader provides it.
  const printMode = getGuidePrintMode() && getGuideSequenceClick() === null;
</script>

{#if printMode}
  <div class="codex-page">
    <CodexSheet {sheet} embed />
  </div>
{:else}
  <div class="codex-page codex-pointer">
    <p class="lede">{tDynamic("guide_codex_intro")}</p>
    <LinkChip href={localHref("/codex")}>{tDynamic("guide_hub_codex_action")}</LinkChip>
  </div>
{/if}

<style>
  /* Reserve the top zone for the page's calligraphic manifest title ("Codex"),
     which GuidePage paints as an absolute overlay (top:16px, height:64px). The
     sheet content would otherwise start at the page top and collide with it. */
  .codex-page {
    width: 100%;
    padding-top: 96px;
    box-sizing: border-box;
  }

  .codex-pointer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding-inline: 3rem;
    text-align: center;
  }

  .lede {
    max-width: 32rem;
    margin: 0;
    font-size: 1.15rem;
    line-height: 1.5;
  }

</style>
