<!--
  SequenceBrowser.svelte - Simple sequence browser for Train module

  Uses Library service instead of Browse to avoid dependency issues.
-->
<script lang="ts">

import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  interface Props {
    show?: boolean;
    onSelect?: (sequence: SequenceData) => void;
    onClose?: () => void;
  }

  let { show = false, onSelect, onClose }: Props = $props();

  // Services
  const libraryService = getLibraryRepository();

  // State
  let sequences = $state<SequenceData[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state("");

  // Filtered sequences
  const filteredSequences = $derived.by(() => {
    if (!searchQuery.trim()) return sequences;

    const query = searchQuery.toLowerCase();
    return sequences.filter(
      (seq) =>
        stripWordNotation(seq.word).toLowerCase().includes(query) ||
        seq.name?.toLowerCase().includes(query)
    );
  });

  async function loadSequences() {
    try {
      isLoading = true;
      error = null;

      const loaded = await libraryService.getSequences();
      sequences = loaded;
    } catch (err) {
      console.error("Failed to load sequences:", err);
      error = err instanceof Error ? err.message : t('train_load_sequences_failed');
    } finally {
      isLoading = false;
    }
  }

  function handleSelect(sequence: SequenceData) {
    onSelect?.(sequence);
  }

  // Load sequences when drawer is opened
  $effect(() => {
    if (show && sequences.length === 0 && !isLoading) {
      loadSequences();
    }
  });
</script>

<Drawer isOpen={show} onclose={onClose}>
  <div class="sequence-browser">
    <header class="browser-header">
      <h2>{t('train_select_sequence')}</h2>
      <button class="close-button" onclick={onClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Search -->
    <div class="search-bar">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="text"
        placeholder={t('train_search_sequences')}
        bind:value={searchQuery}
      />
    </div>

    <!-- Content -->
    <div class="browser-content">
      {#if isLoading}
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <p>{t('train_loading_sequences')}</p>
        </div>
      {:else if error}
        <div class="error-state">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <p>{error}</p>
          <button onclick={loadSequences}>{t('train_retry')}</button>
        </div>
      {:else if filteredSequences.length === 0}
        <div class="empty-state">
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          <p>
            {searchQuery
              ? t('train_no_sequences_match')
              : t('train_no_sequences')}
          </p>
        </div>
      {:else}
        <div class="sequences-grid">
          {#each filteredSequences as sequence (sequence.id)}
            <button
              class="sequence-card"
              onclick={() => handleSelect(sequence)}
            >
              <div class="sequence-info">
                <h3>{sequence.word || sequence.name || t('train_untitled')}</h3>
                <div class="sequence-meta">
                  <span
                    ><i class="fas fa-drum" aria-hidden="true"></i>
                    {t('train_step_count', { count: sequence.steps?.length || 0 })}</span
                  >
                  {#if sequence.author}
                    <span
                      ><i class="fas fa-user" aria-hidden="true"></i>
                      {sequence.author}</span
                    >
                  {/if}
                </div>
              </div>
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Drawer>

<style>
  .sequence-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
    color: var(--theme-text, white);
  }

  .browser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .browser-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .close-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 8px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .close-button:hover {
    background: var(--theme-stroke);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .search-bar i {
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-text, white);
    font-size: 1rem;
  }

  .search-bar input::placeholder {
    color: color-mix(in srgb, var(--theme-text, white) 40%, transparent);
  }

  .browser-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 1rem;
    text-align: center;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .loading-state i,
  .error-state i,
  .empty-state i {
    font-size: 3rem;
    color: var(--theme-stroke-strong);
  }

  .error-state button {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    border: none;
    border-radius: 8px;
    color: var(--theme-text, white);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .error-state button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
  }

  .sequences-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sequence-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-normal);
    text-align: left;
  }

  .sequence-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 40%,
      transparent
    );
    transform: translateX(4px);
  }

  .sequence-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sequence-info h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .sequence-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .sequence-meta span {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .sequence-card > i {
    color: var(--theme-stroke-strong);
    transition: all var(--duration-normal);
  }

  .sequence-card:hover > i {
    color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 80%,
      transparent
    );
    transform: translateX(4px);
  }
</style>
