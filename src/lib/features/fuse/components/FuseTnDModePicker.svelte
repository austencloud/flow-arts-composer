<script lang="ts">
  import TnDModeGrid from "#lib/features/choreo-card/components/TnDModeGrid.svelte";
  import type { VtgMode } from "@tka/shape-domain";

  let {
    selected,
    disabled = false,
    size = "md",
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    size?: "md" | "sm";
    onpick: (mode: VtgMode) => void;
  } = $props();
</script>

<div class="mode-picker"><TnDModeGrid {selected} {disabled} {size} {onpick} /></div>

<style>
  .mode-picker {
    min-width: 0;
  }
</style>
