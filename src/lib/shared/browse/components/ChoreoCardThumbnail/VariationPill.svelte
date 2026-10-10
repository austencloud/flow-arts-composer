<!--
VariationPill.svelte

Chip showing "X/Y" for sequences with variations. Tapping cycles to the next
one with a smooth crossfade.

The shell (touch target, glass surface, states, light mode) belongs to
CardChip; this owns only the counter and the cycling intent. Positioning
belongs to the card's chip row.
-->
<script lang="ts">
  import CardChip from "./CardChip.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  const {
    currentIndex = 0,
    totalCount = 1,
    onCycle = () => {},
  }: {
    currentIndex: number;
    totalCount: number;
    onCycle: () => void;
  } = $props();
</script>

{#if totalCount > 1}
  <CardChip
    label={tDynamic("browse_results_next_variation", {
      current: currentIndex + 1,
      total: totalCount,
    })}
    title={tDynamic("browse_results_other_versions")}
    onActivate={onCycle}
  >
    {currentIndex + 1}/{totalCount}
  </CardChip>
{/if}
