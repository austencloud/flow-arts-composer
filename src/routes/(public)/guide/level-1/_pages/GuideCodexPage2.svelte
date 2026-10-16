<script lang="ts">
  /**
   * GuideCodexPage2 - Codex page 2 (manifest `codex-2`): Types 3-6.
   * Thin wrapper over CodexPageBody (page 1 is GuideCodexPage). See that
   * component and CodexPageBody for the print/reader/scan wiring.
   */
  import CodexPageBody from "./CodexPageBody.svelte";
  import { SHEET2 } from "../../../codex/_data/codex-groups";
</script>

<CodexPageBody sheet={SHEET2} />
