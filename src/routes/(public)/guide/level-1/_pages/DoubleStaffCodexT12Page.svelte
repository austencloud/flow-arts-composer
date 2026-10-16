<script lang="ts">
  /**
   * Double Staff codex, Types 1–2 - body page (manifest `bl-double-staff`),
   * proof p19 / artboard "1.1 - Base Letters - Double Staff, Type 1-2".
   *
   * Pure reuse: the printable Double-Staff Codex (guide/codex, SHEET1) already
   * reproduces this artboard box-for-box (see the codex parity route) - the
   * guide page just embeds it (`embed` drops the codex's own sheet chrome +
   * title; GuidePage paints the manifest title). One source of truth for the
   * codex content, two frames.
   */
  import CodexSheet from "../../../codex/_components/CodexSheet.svelte";
  import { SHEET1 } from "../../../codex/_data/codex-groups";
</script>

<div class="codex-page">
  <CodexSheet sheet={SHEET1} embed />
</div>

<style>
  /* Flows inside GuidePage's padded content area; clears the absolute title. */
  .codex-page {
    padding: 1in 0.55in 0;
  }

  /* guide.css globally pins .size-sm wrappers to 120px (chapter-page sizing);
     inside the codex embed the cell (CodexCell .picto, 64px) must own sizing. */
  .codex-page :global(.guide-pictograph.size-sm .pictograph-wrapper) {
    width: 100%;
    height: auto;
  }

  /* Body pages render full-bleed; the codex's 64px reference cells leave a third
     of the sheet empty - scale toward the artboard's larger cells. */
  .codex-page :global(.codex-cell .picto) {
    max-width: 86px;
  }
</style>
