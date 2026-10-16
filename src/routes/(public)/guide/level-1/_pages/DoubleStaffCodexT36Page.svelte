<script lang="ts">
  /**
   * Double Staff codex, Types 3–6 - body page (manifest `bl-double-staff-36`),
   * proof p20 / artboard "1.1 - Base Letters - Double Staff, Type 3-6".
   *
   * Pure reuse of the printable codex's SHEET2 (see DoubleStaffCodexT12Page).
   */
  import CodexSheet from "../../../codex/_components/CodexSheet.svelte";
  import { SHEET2 } from "../../../codex/_data/codex-groups";
</script>

<div class="codex-page">
  <CodexSheet sheet={SHEET2} embed />
</div>

<style>
  .codex-page {
    padding: 1in 0.55in 0;
  }

  /* See DoubleStaffCodexT12Page - restore CodexCell-owned sizing under guide.css. */
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
