<!--
  MediaSortRow.svelte - Sort options and advanced filter toggle
-->
<script lang="ts">
  import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    currentSortMethod: BrowseSortMethod;
    sortDirection: "asc" | "desc";
    showFilters: boolean;
    onSortChange: (method: BrowseSortMethod) => void;
    onToggleFilters: () => void;
  }

  let {
    currentSortMethod,
    sortDirection,
    showFilters,
    onSortChange,
    onToggleFilters,
  }: Props = $props();

  const sortOptions = $derived([
    {
      id: BrowseSortMethod.ALPHABETICAL,
      label: t("sort_alphabetical"),
      icon: "fa-arrow-down-a-z",
    },
    {
      id: BrowseSortMethod.SEQUENCE_LENGTH,
      label: t("sort_length"),
      icon: "fa-ruler",
    },
    {
      id: BrowseSortMethod.DIFFICULTY_LEVEL,
      label: t("sort_difficulty"),
      icon: "fa-signal",
    },
    { id: BrowseSortMethod.DATE_ADDED, label: t("sort_recent"), icon: "fa-clock" },
  ]);
</script>

<div class="sort-row">
  {#each sortOptions as option}
    {@const isActive = currentSortMethod === option.id}
    <button
      class="sort-chip"
      class:active={isActive}
      onclick={() => onSortChange(option.id)}
      title={option.label}
    >
      <i class="fas {option.icon}" aria-hidden="true"></i>
      {#if isActive}
        <i
          class="fas {sortDirection === 'asc'
            ? 'fa-arrow-up'
            : 'fa-arrow-down'} direction-icon"
          aria-hidden="true"
        ></i>
      {/if}
    </button>
  {/each}

  <button
    class="advanced-toggle"
    class:active={showFilters}
    onclick={onToggleFilters}
    title={t("filter_advanced")}
    aria-label={t("filter_toggle_advanced")}
  >
    <i class="fas fa-sliders-h" aria-hidden="true"></i>
  </button>
</div>

<style>
  .sort-row {
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .sort-chip {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 10px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-elevated-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .sort-chip:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .sort-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .direction-icon {
    font-size: var(--font-size-compact);
    margin-left: 2px;
  }

  .advanced-toggle {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-elevated-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    transition: all var(--duration-normal) ease;
  }

  .advanced-toggle:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .advanced-toggle.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }
</style>
