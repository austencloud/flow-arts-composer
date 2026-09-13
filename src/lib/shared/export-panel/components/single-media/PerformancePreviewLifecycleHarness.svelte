<!--
  Harness for PerformancePreview.svelte.test.ts: supplies the export panel state
  the preview reads from context, and lets a test unmount the preview mid-flight
  to exercise its camera teardown.
-->
<script lang="ts">
  import { createExportPanelState } from "../../state/export-panel-state.svelte";
  import PerformancePreview from "./PerformancePreview.svelte";

  createExportPanelState();

  let mounted = $state(true);
</script>

<button onclick={() => (mounted = false)}>Close preview</button>

{#if mounted}
  <PerformancePreview />
{/if}
