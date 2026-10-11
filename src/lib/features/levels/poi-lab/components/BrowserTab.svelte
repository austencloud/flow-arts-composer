<script lang="ts">

import { getPoiSequenceValidator } from "#lib/features/levels/poi-lab/get-poi-sequence-validator.js";
  /**
   * Browser Tab - Browse community sequences with poi validation
   *
   * Loads public sequences from Firestore and validates them for poi legality.
   * Poi physics are about momentum continuity - validation requires full step data.
   *
   * Uses PropAwareThumbnail for consistent thumbnail display.
   */

  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PoiValidationResult } from "../domain/poi-models";
  import ChoreoCardThumbnail from "#lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";

  // State
  let allSequences: SequenceData[] = $state([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedFilter = $state<"all" | "valid" | "invalid">("all");
  let currentPage = $state(0);
  const perPage = 24;

  // Services - use browseLoader for community sequences
  const browseLoader = getBrowseLoader();
  const sequenceValidator = getPoiSequenceValidator();

  // Get user's prop settings for prop-aware thumbnails
  const propSettings = $derived({
    leftPropType: settingsService.settings.leftPropType,
    rightPropType: settingsService.settings.rightPropType,
  });

  // Extended validation result with pending state for sequences without step data
  type ExtendedValidationResult = PoiValidationResult & {
    stepViolations: Map<number, string[]>;
    isPending: boolean; // true if steps not yet loaded
  };

  // Validation results cache
  const validationCache = new Map<string, ExtendedValidationResult>();

  function validateSequence(seq: SequenceData): ExtendedValidationResult {
    if (validationCache.has(seq.id)) {
      return validationCache.get(seq.id)!;
    }

    // Check if sequence has step data - community sequences may not have it initially
    if (!seq.steps || seq.steps.length === 0) {
      const pendingResult: ExtendedValidationResult = {
        isValid: true, // Assume valid until proven otherwise
        violations: [],
        stepViolations: new Map(),
        isPending: true, // Flag that this needs full data to validate
      };
      validationCache.set(seq.id, pendingResult);
      return pendingResult;
    }

    // Convert steps to pictograph format for validation
    const pictographs = seq.steps.map((step) => ({
      ...step,
      id: step.id ?? `${seq.id}-beat-${step.stepNumber}`,
    }));

    // Validate the sequence
    const result = sequenceValidator.validateSequence(pictographs);

    // Group violations by beat index
    const stepViolations = new Map<number, string[]>();
    for (const violation of result.violations) {
      const beatMatch = violation.message.match(/Beat (\d+)/i);
      if (beatMatch) {
        const stepNum = parseInt(beatMatch[1]!, 10);
        if (!stepViolations.has(stepNum)) {
          stepViolations.set(stepNum, []);
        }
        stepViolations.get(stepNum)!.push(violation.message);
      } else {
        if (!stepViolations.has(-1)) {
          stepViolations.set(-1, []);
        }
        stepViolations.get(-1)!.push(violation.message);
      }
    }

    const fullResult: ExtendedValidationResult = { ...result, stepViolations, isPending: false };
    validationCache.set(seq.id, fullResult);
    return fullResult;
  }

  // Get beat count (handles community sequences with empty steps array)
  function getStepCount(seq: SequenceData): number {
    return seq.steps?.length || seq.sequenceLength || 0;
  }

  // Filtered and paginated
  const filtered = $derived.by(() => {
    if (selectedFilter === "all") return allSequences;
    if (selectedFilter === "valid") {
      return allSequences.filter((s) => validateSequence(s).isValid);
    }
    return allSequences.filter((s) => !validateSequence(s).isValid);
  });

  const totalPages = $derived(Math.ceil(filtered.length / perPage));
  const paginated = $derived(filtered.slice(currentPage * perPage, (currentPage + 1) * perPage));

  // Counts - includes pending (sequences without step data yet)
  const counts = $derived.by(() => {
    let valid = 0;
    let invalid = 0;
    let pending = 0;
    for (const seq of allSequences) {
      const result = validateSequence(seq);
      if (result.isPending) {
        pending++;
      } else if (result.isValid) {
        valid++;
      } else {
        invalid++;
      }
    }
    return { all: allSequences.length, valid, invalid, pending };
  });

  // Single-select filter options for the SegmentedControl.
  // (No icons: SegmentedControl renders icon OR label, and the words are clearer.)
  const filterOptions = $derived<
    { value: "all" | "valid" | "invalid"; label: string; count: number }[]
  >([
    { value: "all", label: t('poi_lab_filter_all'), count: counts.all },
    { value: "valid", label: t('poi_lab_filter_valid'), count: counts.valid },
    { value: "invalid", label: t('poi_lab_filter_invalid'), count: counts.invalid },
  ]);

  // Load sequences on mount - from community (Firestore)
  onMount(async () => {
    try {
      // Load community sequences - these have thumbnails but steps are loaded on-demand
      const all = await browseLoader.loadSequenceMetadata();
      allSequences = all;
      isLoading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load sequences";
      isLoading = false;
    }
  });

  // Reset page on filter change
  $effect(() => {
    selectedFilter;
    currentPage = 0;
  });

  function prevPage() {
    if (currentPage > 0) currentPage--;
  }

  function nextPage() {
    if (currentPage < totalPages - 1) currentPage++;
  }

  // Expanded sequence detail
  let expandedId = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }
</script>

<div class="browser-tab">
  {#if isLoading}
    <div class="loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {t('poi_lab_loading_sequences')}
    </div>
  {:else if error}
    <div class="error" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <p>{error}</p>
      <button class="retry-btn" onclick={() => location.reload()}>
        <i class="fas fa-redo" aria-hidden="true"></i>
        {t('poi_lab_retry')}
      </button>
    </div>
  {:else}
    <div class="header-section">
      <h3>{t('poi_lab_browser_title')}</h3>
      <p class="description">
        {t('poi_lab_browser_description')}
      </p>
    </div>

    <!-- Filter (single-select) -->
    <nav class="filter-chips">
      <SegmentedControl
        options={filterOptions}
        value={selectedFilter}
        onchange={(v) => (selectedFilter = v)}
        color="accent"
        size="sm"
      />
    </nav>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="pagination">
        <button
          class="page-btn"
          onclick={prevPage}
          disabled={currentPage === 0}
          aria-label={t('poi_lab_prev_page')}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="page-info">
          {t('poi_lab_page_info', { current: String(currentPage + 1), total: String(totalPages) })}
          <span class="showing">({t('poi_lab_sequence_count', { count: String(filtered.length) })})</span>
        </span>
        <button
          class="page-btn"
          onclick={nextPage}
          disabled={currentPage >= totalPages - 1}
          aria-label={t('poi_lab_next_page')}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    {/if}

    <!-- Sequence grid -->
    {#if paginated.length === 0}
      <div class="empty-state">
        <i class="fas fa-database" aria-hidden="true"></i>
        <p>{t('poi_lab_no_sequences')}</p>
      </div>
    {:else}
      <div class="sequence-grid themed-scrollbar">
        {#each paginated as sequence (sequence.id)}
          {@const validation = validateSequence(sequence)}
          <div
            class="card-wrapper"
            class:valid={!validation.isPending && validation.isValid}
            class:invalid={!validation.isPending && !validation.isValid}
          >
            <ChoreoCardThumbnail
              {sequence}
              leftPropType={propSettings.leftPropType}
              rightPropType={propSettings.rightPropType}
              onPrimaryAction={() => toggleExpand(sequence.id)}
            />

            <!-- Validation badge overlay - only show if not pending -->
            {#if !validation.isPending}
              <div class="validation-badge" class:valid={validation.isValid} class:invalid={!validation.isValid}>
                {#if validation.isValid}
                  <i class="fas fa-check" aria-hidden="true"></i>
                {:else}
                  <span class="violation-count">{validation.violations.length}</span>
                  <i class="fas fa-times" aria-hidden="true"></i>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Detail drawer OUTSIDE grid -->
      {#if expandedId}
        {@const expandedSeq = paginated.find((s) => s.id === expandedId)}
        {#if expandedSeq}
          {@const validation = validateSequence(expandedSeq)}
          {@const stepCount = getStepCount(expandedSeq)}
          <div class="detail-drawer">
            <div class="drawer-header">
              <span class="sequence-word">{expandedSeq.word || expandedSeq.name || t('poi_lab_untitled')}</span>
              <span class="step-count">{t('poi_lab_beat_count', { count: String(stepCount) })}</span>
            </div>
            {#if validation.isPending}
              <div class="pending-message">
                <i class="fas fa-hourglass-half" aria-hidden="true"></i>
                {t('poi_lab_pending_validation')}
              </div>
            {:else if validation.isValid}
              <div class="valid-message">
                <i class="fas fa-check-circle" aria-hidden="true"></i>
                {t('poi_lab_poi_legal')}
              </div>
            {:else}
              <div class="violations-list">
                {#each validation.violations as violation}
                  <div class="violation-item">
                    <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                    {violation.message}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {/if}

    <!-- Bottom pagination -->
    {#if totalPages > 1}
      <div class="pagination bottom">
        <button class="page-btn" onclick={prevPage} disabled={currentPage === 0}>
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
          {t('poi_lab_previous')}
        </button>
        <span class="page-info">{t('poi_lab_page_info', { current: String(currentPage + 1), total: String(totalPages) })}</span>
        <button class="page-btn" onclick={nextPage} disabled={currentPage >= totalPages - 1}>
          {t('poi_lab_next')}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .browser-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header-section {
    flex-shrink: 0;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .description {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
    line-height: 1.5;
  }

  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-text-secondary, #888);
  }

  .error {
    flex-direction: column;
    color: var(--semantic-error, #ef4444);
  }

  .error p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.625rem 1.25rem;
    min-height: 44px;
    border: 1px solid var(--semantic-error, #ef4444);
    border-radius: 8px;
    background: transparent;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
  }

  .retry-btn:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
  }

  @media (pointer: coarse) {
    .retry-btn {
      min-height: var(--min-touch-target);
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 2rem;
    color: var(--theme-text-secondary, #888);
  }

  .empty-state i {
    font-size: 2.5rem;
    opacity: 0.4;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .filter-chips {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0 0 1rem;
    flex-shrink: 0;
  }

  .pagination.bottom {
    padding: 1rem 0 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .page-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    min-height: 40px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  @media (pointer: coarse) {
    .page-btn {
      min-height: var(--min-touch-target);
      padding: 0.625rem 1rem;
    }
  }

  .page-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .page-info {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }

  .page-info .showing {
    opacity: 0.7;
  }

  /* Responsive grid using CSS auto-fit */
  .sequence-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--spacing-md, 12px);
    align-items: start;
    align-content: start;
    padding: 0.25rem;
  }

  @media (min-width: 1400px) {
    .sequence-grid {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
  }

  @media (max-width: 480px) {
    .sequence-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
  }

  /* Card wrapper - adds validation styling around SequenceCard */
  .card-wrapper {
    position: relative;
    border-radius: 8px;
  }

  .card-wrapper.valid {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
  }

  .card-wrapper.invalid {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
  }

  /* Validation badge overlay */
  .validation-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .validation-badge.valid {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 90%, transparent);
    color: #fff;
  }

  .validation-badge.invalid {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
    color: #fff;
  }

  .violation-count {
    min-width: 1.25rem;
    text-align: center;
  }

  /* Detail drawer - full width below the grid */
  .detail-drawer {
    flex-shrink: 0;
    padding: 1rem;
    margin-top: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .sequence-word {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    font-family: monospace;
    letter-spacing: 0.05em;
    color: var(--theme-text, #fff);
  }

  .step-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }

  .valid-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 10%, transparent);
    color: var(--semantic-success, #22c55e);
    font-size: var(--font-size-min, 14px);
  }

  .pending-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--semantic-warning, #eab308) 10%, transparent);
    color: var(--semantic-warning, #eab308);
    font-size: var(--font-size-min, 14px);
  }

  .violations-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .violation-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }

  .violation-item i {
    margin-top: 0.125rem;
    flex-shrink: 0;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .page-btn,
    .retry-btn {
      transition: none;
    }

    .loading i {
      animation: none;
    }
  }
</style>
