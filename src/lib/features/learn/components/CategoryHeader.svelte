<script lang="ts">
  import type { ConceptCategory } from "../domain/types";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  let {
    category,
    completedCount = 0,
    totalCount = 0,
    premiumGated = false,
  } = $props<{
    category: ConceptCategory;
    completedCount?: number;
    totalCount?: number;
    premiumGated?: boolean;
  }>();
</script>

<header class="category-heading">
  <h3>{tDynamic(`learn_category_${category}`)}</h3>
  <span class="count">{tDynamic("learn_category_completed", { completed: completedCount, total: totalCount })}</span>
  {#if premiumGated}<span class="premium">{tDynamic("learn_card_premium")}</span>{/if}
</header>

<style>
  .category-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 650;
    color: var(--theme-text);
  }
  .count,
  .premium {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
