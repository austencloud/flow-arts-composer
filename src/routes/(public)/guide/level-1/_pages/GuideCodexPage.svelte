<script lang="ts">
  /**
   * GuideCodexPage - Codex page 1 (manifest `codex`): Double Staff, Types 1-2.
   * Thin wrapper over CodexPageBody, which owns all the print/reader/scan logic.
   * Page 2 (Types 3-6) is GuideCodexPage2 (manifest `codex-2`).
   *
   * The two-page split (2026-07-12) replaced the earlier single-page-with-nested-
   * scroll layout: each printed guide sheet is authored to fill one letter-sized
   * page, so each renders as its own manifest page - matching the original guide
   * and letting the reader flip between them instead of scrolling inside one.
   */
  import CodexPageBody from "./CodexPageBody.svelte";
  import { SHEET1 } from "../../../codex/_data/codex-groups";
</script>

<CodexPageBody sheet={SHEET1} />
