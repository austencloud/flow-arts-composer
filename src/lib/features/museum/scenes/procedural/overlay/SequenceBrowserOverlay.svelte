<script lang="ts">
  import { onMount } from "svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getBrowseThumbnailProvider } from "$lib/shared/browse/get-browse-thumbnail-provider";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
  import type { BrowseThumbnailProvider } from "$lib/shared/browse/services/browse-thumbnail-provider";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  interface Props {
    visible: boolean;
    onSelect: (sequenceId: string) => void;
    onClose: () => void;
  }

  let { visible, onSelect, onClose }: Props = $props();

  let sequences = $state<SequenceData[]>([]);
  let filteredSequences = $state<SequenceData[]>([]);
  let searchQuery = $state("");
  let isLoading = $state(false);
  let loadFailed = $state(false);
  let browseLoader: PublicSequencesLoader | null = $state(null);
  let thumbnailProvider: BrowseThumbnailProvider | null = $state(null);
  let searchInput: HTMLInputElement | null = $state(null);

  onMount(() => {
    browseLoader = getBrowseLoader();
    thumbnailProvider = getBrowseThumbnailProvider();
  });

  // Load sequences when overlay becomes visible
  $effect(() => {
    if (visible && browseLoader && sequences.length === 0 && !loadFailed) {
      loadSequences();
    }
  });

  // Focus search input when visible
  $effect(() => {
    if (visible && searchInput) {
      requestAnimationFrame(() => searchInput?.focus());
    }
  });

  // Filter sequences by search query
  $effect(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      filteredSequences = sequences;
    } else {
      filteredSequences = sequences.filter(
        (s) =>
          stripWordNotation(s.word).toLowerCase().includes(query) ||
          s.name?.toLowerCase().includes(query) ||
          s.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }
  });

  async function loadSequences() {
    if (!browseLoader) return;
    isLoading = true;
    loadFailed = false;
    try {
      sequences = await browseLoader.loadSequenceMetadata();
    } catch {
      sequences = [];
      loadFailed = true;
    } finally {
      isLoading = false;
    }
  }

  function getThumbnailUrl(seq: SequenceData): string | null {
    if (!thumbnailProvider || !seq.thumbnails?.length) return null;
    return thumbnailProvider.getThumbnailUrl(seq.id, seq.thumbnails[0]!);
  }

  function handleSelect(seq: SequenceData) {
    onSelect(seq.id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="overlay-panel" onclick={(e) => e.stopPropagation()}>
      <div class="overlay-header">
        <h2>Choose a Sequence</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="search-bar">
        <i class="fas fa-search search-icon"></i>
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          type="text"
          placeholder="Search by word or tag..."
          class="search-input"
        />
      </div>

      <div class="sequence-grid">
        {#if isLoading}
          <div class="loading-state">Loading sequences...</div>
        {:else if loadFailed}
          <div class="error-state">
            <span>Couldn't load sequences. Check your connection.</span>
            <button class="retry-btn" onclick={loadSequences}>Retry</button>
          </div>
        {:else if filteredSequences.length === 0}
          <div class="empty-state">
            {searchQuery ? "No sequences match your search" : "No sequences available"}
          </div>
        {:else}
          {#each filteredSequences as seq (seq.id)}
            {@const thumbUrl = getThumbnailUrl(seq)}
            <button class="sequence-card" onclick={() => handleSelect(seq)}>
              {#if thumbUrl}
                <img src={thumbUrl} alt={seq.word || seq.name} class="card-thumbnail" loading="lazy" />
              {:else}
                <div class="card-placeholder">
                  <i class="fas fa-image"></i>
                </div>
              {/if}
              <span class="card-label">{seq.word || seq.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-panel {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    width: min(90vw, 800px);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .overlay-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--theme-text, #ffffff);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    padding: 4px 8px;
    font-size: 18px;
  }

  .close-btn:hover {
    color: var(--theme-text, #ffffff);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .search-icon {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-min, 14px);
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .sequence-grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    align-content: start;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) var(--scrollbar-track, transparent);
  }

  .loading-state,
  .empty-state,
  .error-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px 20px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-min, 14px);
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .retry-btn {
    padding: 8px 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .retry-btn:hover {
    border-color: rgba(167, 139, 250, 0.5);
  }

  .sequence-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s;
    color: inherit;
    font: inherit;
  }

  .sequence-card:hover {
    border-color: rgba(167, 139, 250, 0.5);
  }

  .card-thumbnail {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .card-placeholder {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.2));
    font-size: 24px;
  }

  .card-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
</style>
