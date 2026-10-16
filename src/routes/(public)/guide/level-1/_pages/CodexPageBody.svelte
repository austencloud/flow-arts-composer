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
   * Online the Codex is its own page (/codex), so the reader shows a short
   * pointer there instead of a second, lesser copy. A letter scanned from the
   * printed sheet opens that letter on /codex.
   *
   * PRINT/BOOK SEAM: /print and /book share this manifest + BUILT registry with
   * the reader; this component discriminates via the sequence-click context
   * (only the reader provides it - getGuidePrintMode() && emitSequence === null
   * means print/book).
   */
  import { onMount } from "svelte";
  import {
    getGuideSequenceClick,
    getGuidePrintMode,
  } from "../_data/guide-data-context";
  import { registerCodexCellTrigger } from "../_data/guide-scan-intent";
  import { buildCanonicalLetterExplorerHref } from "../../../atlas/_components/codex-boards/letter-explorer-url";
  import CodexSheet from "../../../codex/_components/CodexSheet.svelte";
  import {
    SHEET1,
    SHEET2,
    type CodexSheetDef,
  } from "../../../codex/_data/codex-groups";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  let { sheet }: { sheet: CodexSheetDef } = $props();

  // The reader ALSO sets guide print mode (print STYLE + eager pictographs), so
  // getGuidePrintMode() can't tell reader from /print,/book. The sequence-click
  // context can: only the reader provides it.
  const printMode = getGuidePrintMode() && getGuideSequenceClick() === null;

  const LABELS_BY_ID: Map<string, string> = new Map(
    [SHEET1, SHEET2].flatMap((s) =>
      s.types.flatMap((type) =>
        type.boxes.flatMap((box) =>
          box.cells.map((cell) => [cell.id, cell.label] as const)
        )
      )
    )
  );

  // A scan of one printed letter lands on that letter in the Codex.
  function openScannedLetter(id: string): void {
    const label = LABELS_BY_ID.get(id);
    if (!label) return;
    window.location.assign(localHref(buildCanonicalLetterExplorerHref(label)));
  }

  onMount(() => {
    if (printMode) return;
    registerCodexCellTrigger(openScannedLetter);
    return () => registerCodexCellTrigger(null);
  });
</script>

{#if printMode}
  <div class="codex-page">
    <CodexSheet {sheet} embed />
  </div>
{:else}
  <div class="codex-page codex-pointer">
    <p class="lede">{tDynamic("guide_codex_intro")}</p>
    <a class="open" href={localHref("/codex")}>
      Open the Codex
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    </a>
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

  .open {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem 1.4rem;
    border-radius: 999px;
    background: #1a1a1a;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
  }

  .open:hover,
  .open:focus-visible {
    background: #333;
  }
</style>
