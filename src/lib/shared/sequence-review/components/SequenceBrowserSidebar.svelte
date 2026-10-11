<script lang="ts">
  /**
   * Sequence Browser Sidebar
   *
   * Reusable sidebar for browsing and jumping between sequences.
   * Uses generics and slots to support different review workflows.
   */
  import type {
    BaseSequenceEntry,
    ReviewStatus,
    FilterOption,
  } from "../domain/models/review-models";
  import FontAwesomeIcon from "#lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import type { Snippet } from "svelte";

  interface Props<T extends BaseSequenceEntry> {
    sequences: T[];
    currentSequenceId: string | null;
    filterMode: string;
    filterOptions: FilterOption[];
    onSelectSequence: (id: string) => void;
    onFilterChange: (mode: string) => void;
    getStatus: (seq: T) => ReviewStatus;
    getSecondaryLabel?: (seq: T) => string;
    title?: string;
    emptyMessage?: string;
    /** Slot for custom content in sequence card */
    cardExtra?: Snippet<[T]>;
  }

  let {
    sequences,
    currentSequenceId,
    filterMode,
    filterOptions,
    onSelectSequence,
    onFilterChange,
    getStatus,
    getSecondaryLabel,
    title = "Sequences",
    emptyMessage = "No sequences in this view",
    cardExtra,
  }: Props<BaseSequenceEntry> = $props();
</script>

<aside class="sequence-browser-sidebar">
  <div class="sidebar-header">
    <h2 class="sidebar-title">{title}</h2>
    <span class="sequence-count">{sequences.length}</span>
  </div>

  <div class="filter-tabs">
    {#each filterOptions as option}
      <button
        class="filter-tab"
        class:active={filterMode === option.id}
        onclick={() => onFilterChange(option.id)}
      >
        {#if option.icon}
          <FontAwesomeIcon icon={option.icon} size="0.85em" />
        {/if}
        {option.label}
        {#if option.count !== undefined}
          <span class="count-badge">{option.count}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="sequence-list themed-scrollbar">
    {#each sequences as seq}
      {@const status = getStatus(seq)}
      {@const secondaryLabel = getSecondaryLabel?.(seq) ?? ""}
      {@const isCurrent = seq.id === currentSequenceId}
      <button
        class="sequence-item"
        class:current={isCurrent}
        onclick={() => onSelectSequence(seq.id)}
      >
        <div class="thumbnail-container">
          {#if seq.thumbnails?.[0]}
            <img
              src={seq.thumbnails[0]}
              alt={seq.word}
              class="sequence-thumbnail"
            />
          {:else}
            <div class="thumbnail-placeholder">
              <FontAwesomeIcon icon="image" size="2em" color="var(--muted)" />
            </div>
          {/if}
        </div>
        <div class="sequence-details">
          <div class="sequence-item-header">
            <span class="sequence-word"><TKAWordGlyph word={seq.word} height={13} darkMode /></span>
            <FontAwesomeIcon
              icon={status.icon}
              size="0.85em"
              color={status.color}
            />
          </div>
          <div class="sequence-info-row">
            {#if secondaryLabel}
              <div class="sequence-designation">{secondaryLabel}</div>
            {/if}
            <div class="sequence-meta">
              {seq.sequenceLength} steps · {seq.gridMode?.toUpperCase() ||
                "DIAMOND"}
            </div>
            {#if cardExtra}
              {@render cardExtra(seq)}
            {/if}
          </div>
        </div>
      </button>
    {/each}

    {#if sequences.length === 0}
      <div class="empty-list">
        <FontAwesomeIcon icon="inbox" size="2em" color="var(--muted)" />
        <p>{emptyMessage}</p>
      </div>
    {/if}
  </div>
</aside>

<style>
  .sequence-browser-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-glass);
    border-right: 1px solid var(--theme-stroke);
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .sidebar-title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .sequence-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--spacing-xs);
    background: rgba(99, 102, 241, 0.2);
    border-radius: 6px;
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: #a5b4fc;
  }

  .filter-tabs {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--surface-dark);
    border-bottom: 1px solid var(--theme-stroke);
    flex-wrap: wrap;
  }

  .filter-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: transparent;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--muted-foreground);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-fast);
    min-width: fit-content;
  }

  .filter-tab:hover {
    background: var(--surface-color);
    color: var(--foreground);
  }

  .filter-tab.active {
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(99, 102, 241, 0.4);
    color: var(--foreground);
  }

  .count-badge {
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: var(--font-size-compact);
  }

  .sequence-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--spacing-md);
    align-content: start;
  }

  .sequence-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
    background: var(--surface-color);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: var(--transition-fast);
    overflow: hidden;
  }

  .thumbnail-container {
    width: 100%;
    aspect-ratio: 1;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid var(--theme-stroke);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sequence-thumbnail {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: var(--spacing-sm);
  }

  .thumbnail-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .sequence-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--spacing-sm);
  }

  .sequence-info-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sequence-item:hover {
    background: var(--surface-hover);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
  }

  .sequence-item.current {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .sequence-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sequence-word {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--foreground);
  }

  .sequence-designation {
    font-size: var(--font-size-xs);
    color: var(--muted-foreground);
    font-weight: 500;
  }

  .sequence-meta {
    font-size: var(--font-size-xs);
    color: var(--muted);
  }

  .empty-list {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xl);
    color: var(--muted);
  }

  .empty-list p {
    margin: 0;
    font-size: var(--font-size-sm);
  }
</style>
