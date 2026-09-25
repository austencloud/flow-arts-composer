<!--
WordInput.svelte - Text input for word entry

Features:
- Text input with placeholder
- Button to toggle letter palette
- Backspace/clear functionality
- Haptic feedback on button interactions
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getGreekSymbol } from "$lib/shared/keyboard/services/greek-key-mapper";
  import {
    uppercasePreservingGreek,
    insertAtCursor,
  } from "$lib/shared/keyboard/domain/greek-input-helpers";

  let {
    value = "",
    onInput,
    disabled = false,
    onFocusChange,
    onSubmit,
  }: {
    value: string;
    onInput: (value: string) => void;
    disabled?: boolean;
    /** Called when input focus state changes */
    onFocusChange?: (focused: boolean) => void;
    /** Called when user presses Enter to submit */
    onSubmit?: () => void;
  } = $props();

  const haptic = getHapticFeedback();

  function handleFocus() {
    onFocusChange?.(true);
  }

  function handleBlur() {
    // Small delay to allow clicking on palette buttons before hiding
    setTimeout(() => {
      onFocusChange?.(false);
    }, 150);
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    // Uppercase Latin but preserve Greek lowercase (α, β, γ, etc.)
    const uppercased = uppercasePreservingGreek(target.value);
    if (target.value !== uppercased) {
      target.value = uppercased;
    }
    onInput(uppercased);
  }

  function handleClear() {
    haptic.trigger("selection");
    onInput("");
  }

  function handleBackspace() {
    if (value.length > 0) {
      haptic.trigger("selection");
      onInput(value.slice(0, -1));
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && value.trim() && !disabled) {
      event.preventDefault();
      onSubmit?.();
      return;
    }

    // Skip Greek mapping when modifiers held (Shift+1 = !, Ctrl+1 = shortcut)
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
      return;

    // Skip numpad keys when NumLock is off
    if (event.code.startsWith("Numpad") && !event.getModifierState("NumLock"))
      return;

    const symbol = getGreekSymbol(event.code);
    if (!symbol) return;

    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const cursor = input.selectionStart ?? value.length;
    const result = insertAtCursor(value, symbol, cursor);
    const uppercased = uppercasePreservingGreek(result.value);

    // Update the input element and notify parent
    input.value = uppercased;
    input.setSelectionRange(result.cursor, result.cursor);
    onInput(uppercased);
    haptic.trigger("selection");
  }
</script>

<div class="word-input-container">
  <div class="input-wrapper">
    <input
      type="text"
      class="word-input"
      placeholder={t("create_ui_type_your_word")}
      {value}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      onblur={handleBlur}
      {disabled}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />

    <div class="input-actions">
      {#if value.length > 0}
        <button
          class="action-button"
          onclick={handleBackspace}
          title={t("create_ui_backspace")}
          aria-label={t("create_ui_delete_last_character")}
          {disabled}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"
            />
          </svg>
        </button>

        <button
          class="action-button"
          onclick={handleClear}
          title={t("browse_clear_all")}
          aria-label={t("create_ui_clear_all_text")}
          {disabled}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .word-input-container {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-xs, 4px);

    /* Inherit scale from parent spell-panel */
    --scale: var(--spell-scale, 1);
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    gap: calc(var(--settings-spacing-sm, 8px) * var(--scale));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: calc(var(--settings-radius-md, 12px) * var(--scale));
    padding: calc(var(--settings-spacing-sm, 8px) * var(--scale));
    transition: border-color var(--duration-normal) ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--theme-accent, #6366f1);
  }

  .word-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--theme-text, #ffffff);
    font-size: calc(var(--font-size-lg, 18px) * var(--scale));
    font-family: inherit;
    padding: calc(var(--settings-spacing-sm, 8px) * var(--scale));
    outline: none;
    min-width: 0;
  }

  .word-input::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .word-input:disabled {
    opacity: 0.5;
  }

  .input-actions {
    display: flex;
    gap: calc(var(--settings-spacing-xs, 4px) * var(--scale));
    flex-shrink: 0;
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(48px * var(--scale));
    height: calc(48px * var(--scale));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: calc(var(--settings-radius-sm, 8px) * var(--scale));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .action-button svg {
    width: calc(20px * var(--scale));
    height: calc(20px * var(--scale));
  }

  .action-button:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .input-wrapper {
      transition: none;
    }

    .action-button {
      transition: none;
    }
  }
</style>
