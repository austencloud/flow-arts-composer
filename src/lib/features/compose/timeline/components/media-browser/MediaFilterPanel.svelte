<!--
  MediaFilterPanel.svelte - Advanced filter controls (difficulty, length, letter)
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { DifficultyLevel } from "$lib/shared/domain/models/sequence-parameters";
  import { DIFFICULTY_LEVELS } from "$lib/shared/domain/models/sequence-parameters";

  interface Props {
    currentLevel: DifficultyLevel | null;
    currentLength: number | null;
    currentLetter: string | null;
    hasActiveFilter: boolean;
    onLevelChange: (level: DifficultyLevel | null) => void;
    onLengthChange: (length: number | null) => void;
    onOpenLetterPicker: () => void;
    onClearFilters: () => void;
  }

  let {
    currentLevel,
    currentLength,
    currentLetter,
    hasActiveFilter,
    onLevelChange,
    onLengthChange,
    onOpenLetterPicker,
    onClearFilters,
  }: Props = $props();

  function decrementLength() {
    if (currentLength && currentLength > 1) {
      onLengthChange(currentLength - 1);
    }
  }

  function incrementLength() {
    onLengthChange((currentLength ?? 0) + 1);
  }
</script>

<div class="advanced-filters">
  <!-- Difficulty Row -->
  <div class="filter-row">
    <span class="filter-label">{t("sort_difficulty")}</span>
    <div class="filter-control">
      <button
        class="level-btn"
        class:active={currentLevel === null}
        onclick={() => onLevelChange(null)}
        title="All levels"
      >
        All
      </button>
      {#each [1, 2, 3, 4, 5] as level}
        {@const config = DIFFICULTY_LEVELS[level as DifficultyLevel]}
        <button
          class="level-btn level-{level}"
          class:active={currentLevel === level}
          style="--level-gradient: {config.gradient}; --level-shadow: {config.shadowColor};"
          onclick={() => onLevelChange(level as DifficultyLevel)}
          title="{config.name} - {config.description}"
        >
          {level}
        </button>
      {/each}
    </div>
  </div>

  <!-- Length Row -->
  <div class="filter-row">
    <span class="filter-label">{t("generator_length")}</span>
    <div class="filter-control">
      <button
        class="stepper-btn"
        onclick={() => onLengthChange(null)}
        class:active={currentLength === null}
      >
        Any
      </button>
      <button
        class="stepper-btn"
        onclick={decrementLength}
        disabled={!currentLength || currentLength <= 1}
        aria-label="Decrease sequence length"
      >
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>
      <span class="length-display">{currentLength ?? "–"}</span>
      <button
        class="stepper-btn"
        onclick={incrementLength}
        aria-label="Increase sequence length"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <!-- Letter Row -->
  <div class="filter-row">
    <span class="filter-label">{t("browse_chip_letter")}</span>
    <div class="filter-control">
      <button class="letter-select-btn" onclick={onOpenLetterPicker}>
        <i class="fas fa-font" aria-hidden="true"></i>
        <span>{currentLetter || "All"}</span>
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  {#if hasActiveFilter}
    <button class="clear-filters-compact" onclick={onClearFilters}>
      <i class="fas fa-times" aria-hidden="true"></i>
      Clear filters
    </button>
  {/if}
</div>

<style>
  .advanced-filters {
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filter-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 65px;
    flex-shrink: 0;
    font-weight: 600;
  }

  .filter-control {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }

  /* Level buttons */
  .level-btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-elevated-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .level-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .level-btn.active {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  /* Level-specific gradients when active */
  .level-btn.level-1.active,
  .level-btn.level-2.active,
  .level-btn.level-3.active,
  .level-btn.level-4.active,
  .level-btn.level-5.active {
    background: var(--level-gradient);
    border: 2px solid transparent;
    color: var(--theme-text, white);
    box-shadow:
      0 0 14px hsl(var(--level-shadow) / 0.4),
      0 0 28px hsl(var(--level-shadow) / 0.2);
    font-weight: 700;
  }

  /* Text color overrides for light backgrounds */
  .level-btn.level-1.active,
  .level-btn.level-3.active {
    color: black;
  }

  /* Stepper controls */
  .stepper-btn {
    padding: 6px 12px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-elevated-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    min-width: 36px;
  }

  .stepper-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .stepper-btn.active {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .stepper-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .length-display {
    min-width: 28px;
    text-align: center;
    font-size: var(--font-size-min);
    color: var(--theme-text);
    font-weight: 600;
  }

  /* Letter select button */
  .letter-select-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-elevated-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .letter-select-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .letter-select-btn i:first-child {
    font-size: var(--font-size-compact);
  }

  .letter-select-btn span {
    flex: 1;
    text-align: left;
  }

  .letter-select-btn i:last-child {
    font-size: var(--font-size-compact);
    opacity: 0.6;
  }

  .clear-filters-compact {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 12px;
    border: 1px solid var(--semantic-error, var(--semantic-error));
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 15%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    margin-top: 6px;
  }

  .clear-filters-compact:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 25%,
      transparent
    );
    border-color: var(--semantic-error, var(--semantic-error));
    box-shadow: 0 0 10px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 20%,
        transparent
      );
  }
</style>
