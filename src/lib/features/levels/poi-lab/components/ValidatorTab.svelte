<script lang="ts">

import { getPoiSequenceValidator } from "#lib/features/levels/poi-lab/get-poi-sequence-validator.js";
  /**
   * Validator Tab - Validate sequences for poi legality
   *
   * Accepts a sequence word input and validates each pictograph
   * and transition for poi physics constraints.
   */

  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import type { PoiValidationResult } from "../domain/poi-models";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

  // Services
  const sequenceValidator = getPoiSequenceValidator();

  // State
  let sequenceInput = $state("");
  let isValidating = $state(false);
  let validationResult = $state<{
    isValid: boolean;
    stepResults: Array<{
      letter: string;
      stepIndex: number;
      isValid: boolean;
      violations: readonly { message: string }[];
    }>;
    transitionViolations: readonly { message: string }[];
  } | null>(null);
  let error = $state<string | null>(null);

  async function validateSequence() {
    if (!sequenceInput.trim()) {
      error = t('poi_lab_error_empty_input');
      validationResult = null;
      return;
    }

    isValidating = true;
    error = null;
    validationResult = null;

    try {
      // Parse input into recognized TKA letters (drops any non-letter chars)
      const knownLetters = new Set<string>(Object.values(Letter));
      const letters = sequenceInput
        .toUpperCase()
        .split("")
        .filter((c): c is Letter => knownLetters.has(c));

      if (letters.length === 0) {
        error = t('poi_lab_error_no_letters');
        isValidating = false;
        return;
      }

      // Fetch pictographs for each letter
      const pictographs: PictographData[] = [];
      for (const letter of letters) {
        const pictograph = await letterQueryHandler.getPictographByLetter(letter, GridMode.DIAMOND);
        if (pictograph) {
          pictographs.push(pictograph);
        }
      }

      if (pictographs.length === 0) {
        error = t('poi_lab_error_no_pictographs');
        isValidating = false;
        return;
      }

      // Validate the sequence
      const result = sequenceValidator.validateSequence(pictographs);

      // Build detailed result
      const stepResults = pictographs.map((p, i) => {
        const beatValidation = sequenceValidator.validatePictograph(p);
        return {
          letter: p.letter || letters[i] || "?",
          stepIndex: i + 1,
          isValid: beatValidation.isValid,
          violations: beatValidation.violations,
        };
      });

      // Extract transition violations (those not tied to a specific beat)
      const transitionViolations = result.violations.filter(
        (v: { message: string }) => v.message.includes("transition") || v.message.includes("reversal")
      );

      validationResult = {
        isValid: result.isValid,
        stepResults,
        transitionViolations,
      };
    } catch (e) {
      error = e instanceof Error ? e.message : t('poi_lab_error_validation_failed');
    } finally {
      isValidating = false;
    }
  }

  function clearValidation() {
    sequenceInput = "";
    validationResult = null;
    error = null;
  }

  // Example sequences for quick testing
  const examples = [
    { label: "CAT", word: "CAT" },
    { label: "DOG", word: "DOG" },
    { label: "SPIN", word: "SPIN" },
    { label: "FLOW", word: "FLOW" },
  ];
</script>

<div class="validator-tab">
  <div class="input-section">
    <h3>{t('poi_lab_validator_title')}</h3>
    <p class="description">
      {t('poi_lab_validator_description')}
    </p>

    <div class="input-row">
      <input
        type="text"
        bind:value={sequenceInput}
        placeholder={t('poi_lab_validator_placeholder')}
        class="sequence-input"
        onkeydown={(e) => e.key === "Enter" && validateSequence()}
        aria-label={t('poi_lab_validator_input_label')}
      />
      <button
        class="validate-btn"
        onclick={validateSequence}
        disabled={isValidating || !sequenceInput.trim()}
      >
        {#if isValidating}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-check-double" aria-hidden="true"></i>
        {/if}
        {t('poi_lab_validate_button')}
      </button>
      {#if validationResult || error}
        <button class="clear-btn" onclick={clearValidation} aria-label={t('poi_lab_clear_button')}>
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </div>

    <div class="examples">
      <span class="examples-label">{t('poi_lab_try_label')}</span>
      {#each examples as ex}
        <button
          class="example-chip"
          onclick={() => {
            sequenceInput = ex.word;
            validateSequence();
          }}
        >
          {ex.label}
        </button>
      {/each}
    </div>
  </div>

  {#if error}
    <div class="error-message" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      {error}
    </div>
  {/if}

  {#if validationResult}
    <div class="results-section themed-scrollbar">
      <div class="overall-result" class:valid={validationResult.isValid} class:invalid={!validationResult.isValid}>
        <div class="result-icon">
          {#if validationResult.isValid}
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-times-circle" aria-hidden="true"></i>
          {/if}
        </div>
        <div class="result-text">
          <span class="result-title">
            {validationResult.isValid ? t('poi_lab_result_valid') : t('poi_lab_result_invalid')}
          </span>
          <span class="result-subtitle">
            {t('poi_lab_steps_analyzed', { count: String(validationResult.stepResults.length) })}
          </span>
        </div>
      </div>

      <!-- Beat-by-beat results -->
      <div class="beat-results">
        <h4>{t('poi_lab_beat_analysis')}</h4>
        <div class="steps-grid">
          {#each validationResult.stepResults as beat}
            <div class="step-card" class:valid={beat.isValid} class:invalid={!beat.isValid}>
              <div class="beat-header">
                <span class="beat-number">{t('poi_lab_beat_number', { beat: String(beat.stepIndex) })}</span>
                <span class="beat-letter">{beat.letter}</span>
                <span class="beat-status">
                  {#if beat.isValid}
                    <i class="fas fa-check" aria-hidden="true"></i>
                  {:else}
                    <i class="fas fa-times" aria-hidden="true"></i>
                  {/if}
                </span>
              </div>
              {#if !beat.isValid && beat.violations.length > 0}
                <div class="beat-violations">
                  {#each beat.violations as v}
                    <span class="violation">{v.message}</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Transition violations -->
      {#if validationResult.transitionViolations.length > 0}
        <div class="transition-results">
          <h4>{t('poi_lab_transition_issues')}</h4>
          <div class="transition-list">
            {#each validationResult.transitionViolations as v}
              <div class="transition-violation">
                <i class="fas fa-exchange-alt" aria-hidden="true"></i>
                {v.message}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else if !error && !isValidating}
    <div class="empty-state">
      <i class="fas fa-clipboard-check" aria-hidden="true"></i>
      <p>{t('poi_lab_empty_state')}</p>
    </div>
  {/if}
</div>

<style>
  .validator-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .input-section {
    flex-shrink: 0;
    padding-bottom: 1rem;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .description {
    margin: 0 0 1rem;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .sequence-input {
    flex: 1;
    padding: 0.75rem 1rem;
    min-height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-family: monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .sequence-input::placeholder {
    color: var(--theme-text-secondary, #666);
    text-transform: none;
    letter-spacing: normal;
  }

  .sequence-input:focus {
    outline: none;
    border-color: var(--theme-accent, #22d3ee);
  }

  .validate-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    min-height: var(--min-touch-target);
    border: none;
    border-radius: 8px;
    background: var(--theme-accent, #22d3ee);
    color: var(--text-on-accent, #000);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .validate-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 85%, #000);
  }

  .validate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .validate-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-secondary, #888);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .clear-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
  }

  .clear-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .examples {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .examples-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }

  .example-chip {
    padding: 0.375rem 0.75rem;
    min-height: 36px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    background: transparent;
    color: var(--theme-text-secondary, #888);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  @media (pointer: coarse) {
    .example-chip {
      min-height: 44px;
      padding: 0.5rem 1rem;
    }
  }

  .example-chip:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .example-chip:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
    margin-bottom: 1rem;
  }

  .results-section {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .overall-result {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-radius: 12px;
  }

  .overall-result.valid {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .overall-result.invalid {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
  }

  .result-icon {
    font-size: 2rem;
  }

  .overall-result.valid .result-icon {
    color: var(--semantic-success, #22c55e);
  }

  .overall-result.invalid .result-icon {
    color: var(--semantic-error, #ef4444);
  }

  .result-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .result-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .result-subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }

  .beat-results h4,
  .transition-results h4 {
    margin: 0 0 0.75rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .step-card {
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .step-card.valid {
    border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .step-card.invalid {
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
  }

  .beat-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .beat-number {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }

  .beat-letter {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    font-family: monospace;
    color: var(--theme-text, #fff);
  }

  .beat-status {
    margin-left: auto;
    font-size: 0.875rem;
  }

  .step-card.valid .beat-status {
    color: var(--semantic-success, #22c55e);
  }

  .step-card.invalid .beat-status {
    color: var(--semantic-error, #ef4444);
  }

  .beat-violations {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
  }

  .beat-violations .violation {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    line-height: 1.3;
  }

  .transition-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .transition-violation {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-compact, 12px);
  }

  .transition-violation i {
    margin-top: 0.125rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 2rem;
    flex: 1;
    color: var(--theme-text-secondary, #888);
  }

  .empty-state i {
    font-size: 2.5rem;
    opacity: 0.3;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .validate-btn,
    .clear-btn,
    .example-chip {
      transition: none;
    }

    .validate-btn i.fa-spin {
      animation: none;
    }
  }
</style>
