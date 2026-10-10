<!--
FavoritesFilterChip.svelte - Toggle chip for favorites filter.
Turns pink when active.
-->
<script lang="ts">
  import FilterChipBase from "./FilterChipBase.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    active: boolean;
    onToggle: (active: boolean) => void;
  }

  let { active, onToggle }: Props = $props();

  function handleClick() {
    onToggle(!active);
  }
</script>

<FilterChipBase
  label={t('browse_filter_favorites')}
  icon="fas fa-heart"
  {active}
  chipColor="#ec4899"
  mode="toggle"
  ghostKind="browse-filter"
  onclick={handleClick}
/>
