<!--
LetterPalette.svelte - Greek letter click-to-insert palette

Displays all available Greek letters organized by category.
Clicking a letter inserts it into the word input.
Haptic feedback on letter selection.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    GREEK_LETTER_PALETTE,
    GREEK_LETTER_DISPLAY,
  } from "#lib/shared/create/domain/spell-constants.js";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";

  let {
    onSelect,
  }: {
    onSelect: (letter: string) => void;
  } = $props();

  const haptic = getHapticFeedback();

  // Get display label for a letter
  function getDisplayLabel(letter: Letter): string {
    return GREEK_LETTER_DISPLAY[letter] || letter;
  }

  // Handle letter click
  function handleLetterClick(letter: Letter) {
    haptic.trigger("selection");
    onSelect(letter);
  }

  // Categories with labels
  const categories = [
    { key: "shift", label: "Shift", letters: GREEK_LETTER_PALETTE.shift },
    {
      key: "crossShift",
      label: "Cross-Shift",
      letters: GREEK_LETTER_PALETTE.crossShift,
    },
    { key: "dash", label: "Dash", letters: GREEK_LETTER_PALETTE.dash },
    {
      key: "dualDash",
      label: "Dual-Dash",
      letters: GREEK_LETTER_PALETTE.dualDash,
    },
    { key: "static", label: "Static", letters: GREEK_LETTER_PALETTE.static },
  ];
</script>

<div class="letter-palette">
  <div class="palette-header">
    <h4>{t("create_ui_greek_letters")}</h4>
    <span class="hint">{t("create_ui_click_to_insert")}</span>
  </div>

  <div
    class="categories"
    role="group"
    aria-label={t("create_ui_greek_letter_categories")}
  >
    {#each categories as category}
      <div
        class="category"
        role="group"
        aria-labelledby="category-{category.key}"
      >
        <h5 id="category-{category.key}" class="category-label">
          {category.label}
        </h5>
        <div class="letter-grid">
          {#each category.letters as letter}
            <button
              class="letter-button"
              onclick={() => handleLetterClick(letter)}
              title={letter}
              aria-label={t("create_insert_letter", { letter })}
            >
              {getDisplayLabel(letter)}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .letter-palette {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 8px);
  }

  .palette-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: var(--settings-spacing-xs, 4px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .palette-header h4 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 16px);
  }

  .category {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-xs, 4px);
  }

  .category-label {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .letter-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--settings-spacing-xs, 4px);
  }

  .letter-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0 var(--settings-spacing-sm, 8px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-sm, 8px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-lg, 18px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .letter-button:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-accent, #6366f1);
    transform: translateY(-1px);
  }

  .letter-button:active {
    transform: translateY(0);
  }

  .letter-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .letter-button {
      transition: none;
    }

    .letter-button:hover,
    .letter-button:active {
      transform: none;
    }
  }
</style>
