<!--
NavigationSidebar - Advanced Browse Navigation

Provides sophisticated navigation sections matching desktop functionality:
- Favorites section with quick access
- Date-based navigation (Recently Added)
- Length-based grouping
- Letter-based organization
- Difficulty level sections
- Author groupings

Follows Svelte 5 runes + microservices architecture.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
    import type {
    BrowseNavigationConfig,
    BrowseNavigationItem,
  } from "../domain/models/navigation-models";
  import type { HapticFeedback } from "../../../../../shared/application/services/haptic-feedback";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // ✅ PURE RUNES: Props using modern Svelte 5 runes
  const {
    sections = [],
    onSectionToggle = () => {},
    onItemClick = () => {},
    isCollapsed = false,
    onToggleCollapse: _onToggleCollapse = () => {},
  } = $props<{
    sections?: BrowseNavigationConfig[];
    onSectionToggle?: (sectionId: string) => void;
    onItemClick?: (sectionId: string, itemId: string) => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
  }>();

  // Services
  let hapticService: HapticFeedback | null = $state(null);

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Handle section header click
  function handleSectionClick(section: BrowseNavigationConfig) {
    hapticService?.trigger("selection");
    onSectionToggle(section.id);
  }

  function handleItemClick(
    section: BrowseNavigationConfig,
    item: BrowseNavigationItem
  ) {
    hapticService?.trigger("selection");
    onItemClick(section.id, item.id);
  }

  // Note: Section titles already include emojis from Navigator
  // No need for additional icon function

  // Format item count for display
  function formatCount(count: number): string {
    if (count === 0) return "";
    if (count === 1) return "(1)";
    return `(${count})`;
  }

  // Arrow key navigation for letter grid (WCAG AAA keyboard accessibility)
  function handleLetterGridKeydown(
    event: KeyboardEvent,
    section: BrowseNavigationConfig,
    currentIndex: number
  ) {
    const items = section.items;
    const columns = 6; // Grid has 6 columns
    let newIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
        newIndex = currentIndex + 1;
        break;
      case "ArrowLeft":
        newIndex = currentIndex - 1;
        break;
      case "ArrowDown":
        newIndex = currentIndex + columns;
        break;
      case "ArrowUp":
        newIndex = currentIndex - columns;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "End":
        newIndex = items.length - 1;
        break;
      default:
        return; // Don't prevent default for other keys
    }

    // Clamp to valid range
    if (newIndex >= 0 && newIndex < items.length) {
      event.preventDefault();
      // Focus the new item
      const gridEl = (event.target as HTMLElement).closest(".letter-grid");
      const buttons = gridEl?.querySelectorAll(".letter-item");
      (buttons?.[newIndex] as HTMLElement)?.focus();
    }
  }
</script>

<div class="navigation-sidebar" class:collapsed={isCollapsed}>
  <!-- Navigation Sections -->
  {#if !isCollapsed}
    <div class="navigation-sections">
      {#each sections as section (section.id)}
        <div
          class="navigation-section"
          class:has-items={section.items.length > 0}
        >
          <!-- Section Header -->
          <button
            class="section-header"
            class:expanded={section.isExpanded}
            onclick={() => handleSectionClick(section)}
            disabled={section.items.length === 0}
          >
            <div class="section-header-content">
              <span class="section-title">{section.title}</span>
              <span class="section-count"
                >{formatCount(section.totalCount)}</span
              >
            </div>

            {#if section.items.length > 0}
              <div
                class="section-expand-icon"
                class:rotated={section.isExpanded}
              >
                ▶
              </div>
            {/if}
          </button>

          <!-- Section Items -->
          {#if section.isExpanded && section.items.length > 0}
            <div class="section-items" transition:slide={{ duration: 200 }}>
              {#if section.type === "letter"}
                <!-- Special grid layout for letters with arrow key navigation -->
                <div class="letter-grid" role="grid" aria-label={t('browse_filter_by_starting_letter')}>
                  {#each section.items as item, index (item.id)}
                    <button
                      class="letter-item"
                      class:active={item.isActive}
                      onclick={() => handleItemClick(section, item)}
                      onkeydown={(e) => handleLetterGridKeydown(e, section, index)}
                      title={t('browse_letter_sequences', { letter: item.label, count: String(item.count) })}
                      aria-label={t('browse_letter_sequences', { letter: item.label, count: String(item.count) })}
                      tabindex={index === 0 ? 0 : -1}
                    >
                      <span class="letter-label">{item.label}</span>
                      <span class="letter-count" aria-hidden="true">{item.count}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <!-- Standard vertical layout for other sections -->
                {#each section.items as item (item.id)}
                  <button
                    class="navigation-item"
                    class:active={item.isActive}
                    onclick={() => handleItemClick(section, item)}
                  >
                    <span class="item-label">{item.label}</span>
                    <span class="item-count">{formatCount(item.count)}</span>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Footer Stats -->
    {#if sections.length > 0}
      {@const totalSequences = sections.reduce(
        (sum: number, section: BrowseNavigationConfig) =>
          sum + section.totalCount,
        0
      )}
      {@const expandedCount = sections.filter(
        (s: BrowseNavigationConfig) => s.isExpanded
      ).length}
      <div class="sidebar-footer">
        <div class="footer-stats">
          <div class="stat-item">
            <span class="stat-label">{t('browse_total_sequences')}:</span>
            <span class="stat-value">{totalSequences}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{t('browse_sections')}:</span>
            <span class="stat-value">{expandedCount}/{sections.length}</span>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .navigation-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-right: var(--glass-border);
    backdrop-filter: blur(10px);
    overflow: hidden;
    transition: width var(--transition-normal);
  }

  .navigation-sidebar.collapsed {
    width: 60px;
  }

  /* Navigation Sections */
  .navigation-sections {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm) 0;
  }

  .navigation-section {
    margin-bottom: var(--spacing-xs);
  }

  .navigation-section:not(.has-items) {
    opacity: 0.5;
  }

  /* Section Header */
  .section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    color: white;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .section-header:not(:disabled):hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .section-header:disabled {
    cursor: default;
  }

  .section-header.expanded {
    background: var(--theme-card-bg);
  }

  .section-header-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
  }

  .section-title {
    flex: 1;
  }

  .section-count {
    font-size: var(--font-size-xs);
    color: var(--theme-text-dim);
    font-weight: 400;
  }

  .section-expand-icon {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    transform: rotate(0deg);
    transition: transform var(--transition-fast);
  }

  .section-expand-icon.rotated {
    transform: rotate(90deg);
  }

  /* Section Items */
  .section-items {
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke);
  }

  .navigation-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-lg);
    min-height: var(--min-touch-target); /* WCAG AA touch target */
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .navigation-item:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .navigation-item:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
    color: white;
  }

  .navigation-item.active {
    background: rgba(var(--primary-color-rgb), 0.2);
    color: var(--primary-color);
    border-left: 2px solid var(--primary-color);
  }

  .item-label {
    flex: 1;
  }

  .item-count {
    font-size: var(--font-size-xs);
    color: var(--theme-text-dim);
    font-weight: 400;
  }

  .navigation-item.active .item-count {
    color: rgba(var(--primary-color-rgb), 0.8);
  }

  /* Letter Grid Layout */
  .letter-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--spacing-xs);
    padding: var(--spacing-sm);
  }

  .letter-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xs);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--min-touch-target); /* WCAG AA touch target */
    min-width: var(--min-touch-target);
    aspect-ratio: 1;
  }

  .letter-item:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .letter-item:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: white;
  }

  .letter-item.active {
    background: rgba(var(--primary-color-rgb), 0.2);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .letter-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1;
  }

  .letter-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    font-weight: 400;
    margin-top: 2px;
  }

  .letter-item.active .letter-count {
    color: rgba(var(--primary-color-rgb), 0.8);
  }

  /* Footer */
  .sidebar-footer {
    flex-shrink: 0;
    padding: var(--spacing-md);
    border-top: var(--glass-border);
    background: rgba(0, 0, 0, 0.2);
  }

  .footer-stats {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-xs);
  }

  .stat-label {
    color: var(--theme-text-dim);
  }

  .stat-value {
    color: white;
    font-weight: 500;
  }

  /* Custom scrollbar */
  .navigation-sections::-webkit-scrollbar {
    width: 6px;
  }

  .navigation-sections::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .navigation-sections::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .navigation-sections::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .navigation-sidebar {
      display: none;
    }
  }
</style>
