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

<div class="mode-picker" class:sm={size === "sm"}><TnDModeGrid {selected} {disabled} {size} {onpick} /></div>

<style>
  .mode-picker {
    min-width: 0;
  }

  /* Both words of a choice are read whole in every language: a name too long
     for its line takes a second one, and its row grows with it. The chosen
     mark is the small one the drill's phone chips use, in the corner above
     the direction word, so it covers neither. */
  .mode-picker.sm :global(.mode-grid.sm .relationship-choice) {
    gap: 5px;
    height: auto;
    padding: 2px 6px;
  }

  .mode-picker.sm :global(.mode-grid.sm .relationship-choice .choice-icon) {
    width: 1.375rem;
    height: 1.375rem;
  }

  .mode-picker.sm :global(.mode-grid.sm .choice-copy) {
    padding-inline-end: 10px;
  }

  .mode-picker.sm :global(.mode-grid.sm .choice-copy strong) {
    overflow: visible;
    line-height: 1.2;
    white-space: normal;
  }

  .mode-picker.sm :global(.mode-grid.sm .relationship-choice .choice-check) {
    top: 0.15rem;
    inset-inline-end: 0.15rem;
    width: 0.85rem;
    height: 0.85rem;
    margin-top: 0;
    box-shadow: 0 0 0 1.5px var(--theme-panel-bg, #101721);
    font-size: calc(var(--font-size-compact, 0.75rem) * 2 / 3);
  }
</style>
