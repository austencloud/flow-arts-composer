<!--
Sort & Jump Sheet - Mobile Bottom Sheet Version

Touch-friendly interface for changing sort method and jumping to sections
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { NavigationSection } from "#lib/features/browse/shared/domain/types/browse-types.js";
  import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";

  let {
    currentSortMethod,
    availableSections,
    onSortMethodChange,
    onSectionClick,
  } = $props<{
    currentSortMethod: BrowseSortMethod;
    availableSections: NavigationSection[];
    onSortMethodChange: (method: BrowseSortMethod) => void;
    onSectionClick: (sectionId: string) => void;
  }>();

  let hapticService: HapticFeedback | undefined;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function handleSortChange(method: string) {
    hapticService?.trigger("selection");
    onSortMethodChange(method);
  }

  function handleSectionClick(sectionId: string) {
    hapticService?.trigger("selection");
    onSectionClick(sectionId);
  }

  const sortOptions = [
    {
      id: "alphabetical",
      label: "Alphabetical",
      icon: "fa-sort-alpha-down",
      description: "A to Z",
    },
    {
      id: "difficulty",
      label: "Difficulty",
      icon: "fa-signal",
      description: "Easy to Hard",
    },
    {
      id: "length",
      label: "Length",
      icon: "fa-ruler",
      description: "Shortest to Longest",
    },
    {
      id: "recent",
      label: "Recently Added",
      icon: "fa-clock",
      description: "Newest First",
    },
  ];
</script>

<div class="sort-jump-sheet">
  <!-- Sort Methods Section -->
  <div class="section">
    <div class="section-header">
      <i class="fas fa-sort" aria-hidden="true"></i>
      <h3>{t("train_sort_by")}</h3>
    </div>
    <div class="sort-options">
      {#each sortOptions as option}
        <button
          class="option-button"
          class:active={currentSortMethod === option.id}
          onclick={() => handleSortChange(option.id)}
          type="button"
        >
          <div class="option-icon">
            <i class="fas {option.icon}" aria-hidden="true"></i>
          </div>
          <div class="option-content">
            <div class="option-label">{option.label}</div>
            <div class="option-description">{option.description}</div>
          </div>
          {#if currentSortMethod === option.id}
            <div class="check-icon">
              <i class="fas fa-check" aria-hidden="true"></i>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Quick Jump Section -->
  {#if availableSections && availableSections.length > 0}
    <div class="section">
      <div class="section-header">
        <i class="fas fa-rocket" aria-hidden="true"></i>
        <h3>{t("browse_ui_quick_jump")}</h3>
      </div>
      <div class="jump-sections">
        {#each availableSections as section}
          <button
            class="jump-button"
            onclick={() => handleSectionClick(section.id)}
            type="button"
          >
            <span class="jump-label">{section.label}</span>
            <span class="jump-count">{section.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .sort-jump-sheet {
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding: 8px 0;
  }

  /* Section */
  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
  }

  .section-header h3 {
    margin: 0;
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  /* Sort Options */
  .sort-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .option-button {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
  }

  .option-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .option-button.active {
    background: color-mix(in srgb, var(--semantic-info) 15%, transparent);
    border-color: color-mix(in srgb, var(--semantic-info) 40%, transparent);
  }

  .option-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-hover-bg);
    border-radius: 10px;
    font-size: var(--font-size-lg);
    color: var(--theme-text-dim);
    flex-shrink: 0;
  }

  .option-button.active .option-icon {
    background: color-mix(in srgb, var(--semantic-info) 30%, transparent);
    color: var(--semantic-info);
  }

  .option-content {
    flex: 1;
    min-width: 0;
  }

  .option-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    margin-bottom: 2px;
  }

  .option-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .check-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--semantic-info);
    font-size: var(--font-size-base);
    flex-shrink: 0;
  }

  /* Jump Sections */
  .jump-sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .jump-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .jump-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
  }

  .jump-button:active {
    transform: translateY(0);
  }

  .jump-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
    text-align: center;
  }

  .jump-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    padding: 2px 8px;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-radius: 10px;
  }

  /* Touch feedback */
  .option-button:active {
    transform: scale(0.98);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .option-button,
    .jump-button {
      transition: none;
    }

    .jump-button:hover {
      transform: none;
    }
  }
</style>
