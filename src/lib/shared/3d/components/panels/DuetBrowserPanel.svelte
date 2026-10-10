<script lang="ts">

import { getDuetPersister } from "#lib/shared/3d/get-duet-persister.js";
  /**
   * DuetBrowserPanel
   *
   * Browse and select saved duet sequences for dual-avatar playback.
   * Supports view toggle between individual sequences and duets.
   */

  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { DuetPersister } from "../../services/duet-persister";
  import type {
    DuetSequence,
    DuetSequenceWithData,
  } from "../../domain/duet-sequence";

  type ViewMode = "sequences" | "duets";

  interface Props {
    /** Current view mode */
    viewMode?: ViewMode;
    /** Called when a duet is selected for playback */
    onSelectDuet: (duet: DuetSequenceWithData) => void;
    /** Called when user wants to create a new duet */
    onCreateDuet: () => void;
    /** Called when view mode changes */
    onViewModeChange?: (mode: ViewMode) => void;
  }

  let {
    viewMode = "duets",
    onSelectDuet,
    onCreateDuet,
    onViewModeChange,
  }: Props = $props();

  let duets = $state<DuetSequence[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let duetPersister: DuetPersister | null = null;

  onMount(async () => {
    try {
      duetPersister = getDuetPersister();
      await loadDuets();
    } catch (e) {
      error = "Failed to initialize duet browser";
      console.error("[DuetBrowserPanel] Init error:", e);
    }
  });

  async function loadDuets() {
    if (!duetPersister) return;

    isLoading = true;
    error = null;
    try {
      duets = await duetPersister.getAllDuets();
    } catch (e) {
      error = "Failed to load duets";
      console.error("[DuetBrowserPanel] Load error:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleSelectDuet(duet: DuetSequence) {
    if (!duetPersister) return;

    try {
      const resolved = await duetPersister.resolveDuetSequences(duet);
      if (resolved) {
        onSelectDuet(resolved);
      } else {
        error = "Could not load sequence data for this duet";
      }
    } catch (e) {
      error = "Failed to load duet";
      console.error("[DuetBrowserPanel] Select error:", e);
    }
  }

  async function handleDeleteDuet(duet: DuetSequence, event: MouseEvent) {
    event.stopPropagation();
    if (!duetPersister) return;

    if (!confirm(`Delete "${duet.name}"?`)) return;

    try {
      await duetPersister.deleteDuet(duet.id);
      await loadDuets();
    } catch (e) {
      error = "Failed to delete duet";
      console.error("[DuetBrowserPanel] Delete error:", e);
    }
  }

  function handleViewModeChange(mode: ViewMode) {
    onViewModeChange?.(mode);
  }

  function formatOffset(offset: number): string {
    if (offset === 0) return "Synced";
    const sign = offset > 0 ? "+" : "";
    return `${sign}${offset} step${Math.abs(offset) !== 1 ? "s" : ""}`;
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="duet-browser">
  <!-- View Mode Toggle -->
  <div class="view-toggle">
    <button
      class="toggle-btn"
      class:active={viewMode === "sequences"}
      onclick={() => handleViewModeChange("sequences")}
      aria-label="View sequences"
      aria-pressed={viewMode === "sequences"}
    >
      <i class="fas fa-film" aria-hidden="true"></i>
      Sequences
    </button>
    <button
      class="toggle-btn"
      class:active={viewMode === "duets"}
      onclick={() => handleViewModeChange("duets")}
      aria-label="View duets"
      aria-pressed={viewMode === "duets"}
    >
      <i class="fas fa-users" aria-hidden="true"></i>
      Duets
    </button>
  </div>

  <!-- Create Duet Button -->
  {#if viewMode === "duets"}
    <button class="create-btn" onclick={onCreateDuet} aria-label="Create new duet">
      <i class="fas fa-plus" aria-hidden="true"></i>
      {t('duet_create')}
    </button>
  {/if}

  <!-- Content -->
  <div class="content">
    {#if isLoading}
      <div class="loading">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{t('loading_data')}</span>
      </div>
    {:else if error}
      <div class="error">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
        <button class="retry-btn" onclick={loadDuets} aria-label="Retry loading duets">Retry</button>
      </div>
    {:else if viewMode === "duets"}
      {#if duets.length === 0}
        <div class="empty-state">
          <i class="fas fa-users" aria-hidden="true"></i>
          <p>{t('empty_no_duets')}</p>
          <p class="hint">{t('empty_create_duet')}</p>
        </div>
      {:else}
        <div class="duet-list">
          {#each duets as duet (duet.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="duet-card"
              onclick={() => handleSelectDuet(duet)}
              role="button"
              tabindex="0"
            >
              <div class="duet-header">
                <span class="duet-name">{duet.name}</span>
                <button
                  class="delete-btn"
                  onclick={(e) => handleDeleteDuet(duet, e)}
                  aria-label={`Delete duet: ${duet.name}`}
                  title="Delete duet"
                >
                  <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
              </div>

              <div class="duet-info">
                <div class="sequence-pair">
                  <span class="performer-label">{t('duet_p1')}</span>
                  <span class="sequence-id" title={duet.performer1SequenceId}>
                    {duet.performer1SequenceId.slice(0, 8)}...
                  </span>
                </div>
                <div class="sequence-pair">
                  <span class="performer-label">{t('duet_p2')}</span>
                  <span class="sequence-id" title={duet.performer2SequenceId}>
                    {duet.performer2SequenceId.slice(0, 8)}...
                  </span>
                </div>
              </div>

              <div class="duet-meta">
                <span class="offset" class:synced={duet.stepOffset === 0}>
                  <i class="fas fa-clock" aria-hidden="true"></i>
                  {formatOffset(duet.stepOffset)}
                </span>
                <span class="positioning">
                  <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
                  {duet.positioning}
                </span>
                <span class="date">
                  {formatDate(duet.createdAt)}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="sequences-placeholder">
        <p>{t('duet_sequence_browser')}</p>
        <p class="hint">{t('duet_switch_manage')}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .duet-browser {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
  }

  /* View Toggle */
  .view-toggle {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .toggle-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .toggle-btn:hover {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .toggle-btn.active {
    background: var(--theme-accent, #64b5f6);
    color: var(--theme-on-accent, #000);
  }

  /* Create Button */
  .create-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-accent-strong, #7c3aed);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .create-btn:hover {
    background: var(--theme-accent, #8b5cf6);
    transform: translateY(-1px);
  }

  /* Content Area */
  .content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Loading & Error States */
  .loading,
  .error,
  .empty-state,
  .sequences-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .loading i,
  .empty-state i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .error {
    color: var(--semantic-error, #ef4444);
  }

  .error i {
    font-size: 1.5rem;
  }

  .hint {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .retry-btn {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  /* Duet List */
  .duet-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .duet-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .duet-card:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .duet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .duet-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .delete-btn {
    padding: 0.25rem 0.375rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 0.75rem;
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-fast) ease;
  }

  .duet-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--semantic-error, #ef4444);
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
  }

  .duet-info {
    display: flex;
    gap: 1rem;
  }

  .sequence-pair {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--font-size-compact, 12px);
  }

  .performer-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-weight: 500;
  }

  .sequence-id {
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
    font-family: monospace;
  }

  .duet-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .duet-meta i {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .offset.synced {
    color: var(--semantic-success, #4caf50);
  }

  .date {
    margin-left: auto;
  }
</style>
