<script lang="ts">

import { getDuetPersister } from "$lib/shared/3d/get-duet-persister";
  /**
   * DuetCreatorPanel
   *
   * UI for creating new duet sequences by pairing two library sequences.
   * Provides sequence selection, beat offset configuration, and positioning hints.
   */

  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
  import type { DuetPersister } from "../../services/duet-persister";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
  import type {
    DuetPositioning,
    CreateDuetInput,
  } from "../../domain/duet-sequence";

  interface Props {
    /** Called when duet is created successfully */
    onCreated: (duetId: string) => void;
    /** Called when user cancels */
    onCancel: () => void;
  }

  let { onCreated, onCancel }: Props = $props();

  // Form state
  let name = $state("");
  let description = $state("");
  let performer1SequenceId = $state<string | null>(null);
  let performer2SequenceId = $state<string | null>(null);
  let stepOffset = $state(0);
  let positioning = $state<DuetPositioning>("side-by-side");

  // UI state
  let sequences = $state<SequenceData[]>([]);
  let isLoadingSequences = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state("");
  let activeSelector = $state<"performer1" | "performer2" | null>(null);

  // Services
  let browseLoader: PublicSequencesLoader | null = null;
  let duetPersister: DuetPersister | null = null;

  // Derived
  const filteredSequences = $derived(
    sequences.filter((seq) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        stripWordNotation(seq.word).toLowerCase().includes(query) ||
        seq.name?.toLowerCase().includes(query) ||
        seq.author?.toLowerCase().includes(query)
      );
    })
  );

  const performer1Sequence = $derived(
    performer1SequenceId ? sequences.find((s) => s.id === performer1SequenceId) : null
  );

  const performer2Sequence = $derived(
    performer2SequenceId ? sequences.find((s) => s.id === performer2SequenceId) : null
  );

  const canSave = $derived(
    name.trim().length > 0 &&
      performer1SequenceId &&
      performer2SequenceId &&
      !isSaving
  );

  onMount(async () => {
    try {
      browseLoader = getBrowseLoader();
      duetPersister = getDuetPersister();
      await loadSequences();
    } catch (e) {
      error = "Failed to initialize";
      console.error("[DuetCreatorPanel] Init error:", e);
    }
  });

  async function loadSequences() {
    if (!browseLoader) return;

    isLoadingSequences = true;
    try {
      sequences = await browseLoader.loadSequenceMetadata();
    } catch (e) {
      error = "Failed to load sequences";
      console.error("[DuetCreatorPanel] Load error:", e);
    } finally {
      isLoadingSequences = false;
    }
  }

  function selectSequence(sequenceId: string) {
    if (activeSelector === "performer1") {
      performer1SequenceId = sequenceId;
    } else if (activeSelector === "performer2") {
      performer2SequenceId = sequenceId;
    }
    activeSelector = null;
    searchQuery = "";
  }

  async function handleSave() {
    if (!duetPersister || !performer1SequenceId || !performer2SequenceId) return;

    isSaving = true;
    error = null;

    try {
      const input: CreateDuetInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        performer1SequenceId,
        performer2SequenceId,
        stepOffset,
        positioning,
      };

      const duetId = await duetPersister.saveDuet(input);
      onCreated(duetId);
    } catch (e) {
      error = "Failed to save duet";
      console.error("[DuetCreatorPanel] Save error:", e);
    } finally {
      isSaving = false;
    }
  }

  function adjustOffset(delta: number) {
    stepOffset = Math.max(-10, Math.min(10, stepOffset + delta));
  }
</script>

<div class="duet-creator">
  <header class="header">
    <h2>{t('duet_create')}</h2>
    <button class="close-btn" onclick={onCancel} aria-label="Cancel and close" title="Cancel">
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>

  {#if activeSelector}
    <!-- Sequence Selector Mode -->
    <div class="sequence-selector">
      <div class="selector-header">
        <button
          class="back-btn"
          onclick={() => (activeSelector = null)}
          aria-label="Go back"
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <span>Select for Performer {activeSelector === "performer1" ? "1" : "2"}</span
        >
      </div>

      <div class="search-box">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="text"
          placeholder={t('duet_search_sequences')}
          bind:value={searchQuery}
        />
      </div>

      {#if isLoadingSequences}
        <div class="loading">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t('loading_data')}
        </div>
      {:else}
        <div class="sequence-list">
          {#each filteredSequences.slice(0, 50) as seq (seq.id)}
            <button
              class="sequence-item"
              class:selected={seq.id === performer1SequenceId ||
                seq.id === performer2SequenceId}
              onclick={() => selectSequence(seq.id)}
              aria-label={`Select sequence: ${seq.word || seq.name || "Untitled"}`}
              aria-pressed={seq.id === performer1SequenceId || seq.id === performer2SequenceId}
            >
              <span class="seq-word">{seq.word || seq.name || "Untitled"}</span>
              <span class="seq-meta">
                {#if seq.author}
                  <span class="author">{seq.author}</span>
                {/if}
                <span class="steps">{seq.steps?.length || 0} steps</span>
              </span>
            </button>
          {/each}
          {#if filteredSequences.length > 50}
            <p class="more-hint">
              Showing first 50 of {filteredSequences.length}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Main Form -->
    <div class="form-content">
      {#if error}
        <div class="error-banner">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          {error}
        </div>
      {/if}

      <!-- Name -->
      <div class="form-group">
        <label for="duet-name">{t('duet_name')}</label>
        <input
          id="duet-name"
          type="text"
          placeholder={t('duet_name_placeholder')}
          bind:value={name}
        />
      </div>

      <!-- Description -->
      <div class="form-group">
        <label for="duet-desc">{t('duet_description')}</label>
        <textarea
          id="duet-desc"
          placeholder={t('duet_desc_placeholder')}
          rows="2"
          bind:value={description}
        ></textarea>
      </div>

      <!-- Sequence Pickers -->
      <div class="sequence-pickers">
        <div class="picker-group">
          <span class="picker-label">{t('duet_performer1_sequence')}</span>
          <button
            class="picker-btn"
            class:has-selection={performer1Sequence}
            onclick={() => (activeSelector = "performer1")}
            aria-label={performer1Sequence ? `Performer 1: ${performer1Sequence.word || performer1Sequence.name || "Untitled"} - click to change` : "Select sequence for Performer 1"}
          >
            {#if performer1Sequence}
              <span class="selection-name">
                {performer1Sequence.word || performer1Sequence.name || "Untitled"}
              </span>
              <span class="selection-steps"
                >{performer1Sequence.steps?.length || 0} steps</span
              >
            {:else}
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>Select sequence</span>
            {/if}
          </button>
        </div>

        <div class="picker-group">
          <span class="picker-label">{t('duet_performer2_sequence')}</span>
          <button
            class="picker-btn"
            class:has-selection={performer2Sequence}
            onclick={() => (activeSelector = "performer2")}
            aria-label={performer2Sequence ? `Performer 2: ${performer2Sequence.word || performer2Sequence.name || "Untitled"} - click to change` : "Select sequence for Performer 2"}
          >
            {#if performer2Sequence}
              <span class="selection-name">
                {performer2Sequence.word || performer2Sequence.name || "Untitled"}
              </span>
              <span class="selection-steps"
                >{performer2Sequence.steps?.length || 0} steps</span
              >
            {:else}
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>Select sequence</span>
            {/if}
          </button>
        </div>
      </div>

      <!-- Beat Offset -->
      <div class="form-group">
        <span class="form-label">{t('character_beat_offset')} ({t('character_follower')})</span>
        <div class="offset-control">
          <button
            class="offset-btn"
            onclick={() => adjustOffset(-0.5)}
            disabled={stepOffset <= -10}
            aria-label="Decrease offset"
          >
            <i class="fas fa-minus" aria-hidden="true"></i>
          </button>
          <span class="offset-value">
            {stepOffset === 0
              ? "Synced"
              : `${stepOffset > 0 ? "+" : ""}${stepOffset}`}
          </span>
          <button
            class="offset-btn"
            onclick={() => adjustOffset(0.5)}
            disabled={stepOffset >= 10}
            aria-label="Increase offset"
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
        </div>
        <p class="help-text">Positive = Performer 2 starts later</p>
      </div>

      <!-- Positioning -->
      <div class="form-group">
        <span class="form-label">Positioning</span>
        <div class="positioning-options">
          <button
            class="pos-btn"
            class:active={positioning === "side-by-side"}
            onclick={() => (positioning = "side-by-side")}
            aria-label="Positioning: Side by Side"
            aria-pressed={positioning === "side-by-side"}
          >
            <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
            Side by Side
          </button>
          <button
            class="pos-btn"
            class:active={positioning === "face-to-face"}
            onclick={() => (positioning = "face-to-face")}
            aria-label="Positioning: Face to Face"
            aria-pressed={positioning === "face-to-face"}
          >
            <i class="fas fa-exchange-alt" aria-hidden="true"></i>
            Face to Face
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <button class="cancel-btn" onclick={onCancel} aria-label="Cancel">{t('action_cancel')}</button>
      <button data-save-shortcut class="save-btn" disabled={!canSave} onclick={handleSave} aria-label="Save duet">
        {#if isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t('action_saving')}
        {:else}
          <i class="fas fa-check" aria-hidden="true"></i>
          {t('duet_create')}
        {/if}
      </button>
    </footer>
  {/if}
</div>

<style>
  .duet-creator {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .header h2 {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  /* Form Content */
  .form-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-group input,
  .form-group textarea {
    padding: 0.625rem 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    resize: none;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--theme-accent, #64b5f6);
  }

  .help-text {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Sequence Pickers */
  .sequence-pickers {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .picker-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .picker-group span {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .picker-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .picker-btn:hover {
    border-color: var(--theme-accent, #64b5f6);
    color: var(--theme-text, #ffffff);
  }

  .picker-btn.has-selection {
    border-style: solid;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .selection-name {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .selection-steps {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Offset Control */
  .offset-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    padding: 0.25rem;
  }

  .offset-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .offset-btn:hover:not(:disabled) {
    background: var(--theme-accent, #64b5f6);
    color: var(--theme-on-accent, #000);
  }

  .offset-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .offset-value {
    flex: 1;
    text-align: center;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  /* Positioning Options */
  .positioning-options {
    display: flex;
    gap: 0.5rem;
  }

  .pos-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .pos-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .pos-btn.active {
    background: var(--theme-accent, #64b5f6);
    border-color: var(--theme-accent, #64b5f6);
    color: var(--theme-on-accent, #000);
  }

  .pos-btn i {
    font-size: 1.25rem;
  }

  /* Footer */
  .footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 10px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cancel-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
  }

  .cancel-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .save-btn {
    background: var(--theme-accent-strong, #7c3aed);
    border: none;
    color: white;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--theme-accent, #8b5cf6);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    border: 1px solid var(--semantic-error, #ef4444);
    border-radius: 8px;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm, 14px);
  }

  /* Sequence Selector */
  .sequence-selector {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .selector-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
    font-weight: 500;
  }

  .back-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .back-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .search-box input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    outline: none;
  }

  .search-box input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .sequence-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .sequence-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .sequence-item:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .sequence-item.selected {
    background: var(--theme-accent, #64b5f6);
    color: var(--theme-on-accent, #000);
  }

  .seq-word {
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
  }

  .sequence-item.selected .seq-word {
    color: var(--theme-on-accent, #000);
  }

  .seq-meta {
    display: flex;
    gap: 0.75rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .sequence-item.selected .seq-meta {
    color: color-mix(in srgb, var(--theme-on-accent, #000) 60%, transparent);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .more-hint {
    text-align: center;
    padding: 0.75rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
</style>
