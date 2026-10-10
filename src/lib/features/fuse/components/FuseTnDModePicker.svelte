<script lang="ts">
  import TnDModeGrid from "#lib/features/choreo-card/components/TnDModeGrid.svelte";
  import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

  let {
    selected,
    disabled = false,
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    onpick: (mode: VtgMode) => void;
  } = $props();
</script>

<div class="mode-picker"><TnDModeGrid {selected} {disabled} {onpick} /></div>

<style>
  .mode-picker {
    min-width: 0;
  }
</style>
