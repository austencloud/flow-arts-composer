<!--
  WordInputOverlay - Focused word input for mobile devices

  Opens as a fullscreen overlay when user taps the word card on mobile.
  Prevents the virtual keyboard from covering the Generate button.
  Uses shared MobileInputToolbar for keyboard-aware Done button.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { pushState as svelteKitPushState } from "$app/navigation";
  import { onMount } from "svelte";
  import { getGreekSymbol } from "$lib/shared/keyboard/services/greek-key-mapper";
  import MobileInputToolbar from "$lib/shared/components/MobileInputToolbar.svelte";
  import {
    uppercasePreservingGreek,
    insertAtCursor,
  } from "$lib/shared/keyboard/domain/greek-input-helpers";

  let {
    wordValue = "",
    onWordChange,
    onClose,
  } = $props<{
    wordValue?: string;
    onWordChange?: (value: string) => void;
    onClose: () => void;
  }>();

  let inputElement = $state<HTMLInputElement | null>(null);
  let isInputFocused = $state(false);

  onMount(() => {
    // Auto-focus after a brief delay to let the overlay animate in
    requestAnimationFrame(() => {
      inputElement?.focus();
    });

    // Close overlay on browser back button
    function handlePopState() {
      onClose();
    }
    // Push a history entry so back button closes overlay instead of navigating
    svelteKitPushState("", { wordInputOverlay: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const uppercased = uppercasePreservingGreek(target.value);
    if (target.value !== uppercased) {
      target.value = uppercased;
    }
    onWordChange?.(uppercased);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
      return;
    if (event.code.startsWith("Numpad") && !event.getModifierState("NumLock"))
      return;

    const symbol = getGreekSymbol(event.code);
    if (!symbol) return;

    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const cursor = input.selectionStart ?? wordValue.length;
    const result = insertAtCursor(wordValue, symbol, cursor);
    const uppercased = uppercasePreservingGreek(result.value);

    input.value = uppercased;
    input.setSelectionRange(result.cursor, result.cursor);
    onWordChange?.(uppercased);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleDone() {
    inputElement?.blur();
    onClose();
  }

  function handleClear() {
    onWordChange?.("");
    inputElement?.focus();
  }
</script>

<div class="overlay-backdrop" onclick={handleBackdropClick} role="presentation">
  <div class="overlay-card">
    <div class="overlay-header">
      <span class="overlay-title">{t("create_ui_spell_a_word")}</span>
      <button
        class="close-btn"
        onclick={onClose}
        aria-label={t("action_close")}
        type="button"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="input-container">
      <input
        bind:this={inputElement}
        name="generation-word"
        type="text"
        class="word-field"
        placeholder="A-Z"
        value={wordValue}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={() => (isInputFocused = true)}
        onblur={() => (isInputFocused = false)}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      {#if wordValue.trim()}
        <button
          class="clear-btn"
          onclick={handleClear}
          aria-label={t("create_ui_clear_word")}
          type="button"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </div>

    <button
      class="confirm-btn"
      type="button"
      onclick={handleDone}
      aria-label={t("create_ui_confirm_word")}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>{t("action_confirm")}</span>
    </button>
  </div>
</div>

<MobileInputToolbar visible={isInputFocused} onDone={handleDone} />

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--theme-backdrop, rgba(0, 0, 0, 0.6));
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    animation: fadeIn 150ms ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .overlay-card {
    width: min(90%, 400px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: slideDown 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .overlay-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: 0.3px;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text, white);
    cursor: pointer;
    font-size: 16px;
    transition: all 150ms ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .close-btn:active {
    transform: scale(0.95);
  }

  .input-container {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .word-field {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 14px;
    color: var(--theme-text, white);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 3px;
    text-align: center;
    padding: 14px 16px;
    font-family: inherit;
    transition: border-color 150ms ease;
  }

  .word-field:focus {
    border-color: var(--theme-accent, #4a9eff);
    outline: none;
    background: var(--theme-shadow-strong, rgba(0, 0, 0, 0.4));
  }

  .word-field:focus-visible {
    outline: 2px solid var(--theme-text, white);
    outline-offset: 2px;
  }

  .word-field::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-weight: 500;
    letter-spacing: 4px;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    font-size: 16px;
    transition: all 100ms ease;
  }

  .clear-btn:hover {
    background: var(--theme-card-hover-bg, rgba(0, 0, 0, 0.4));
    color: var(--theme-text, white);
  }

  .clear-btn:active {
    transform: scale(0.92);
  }

  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    min-height: 48px;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    border: none;
    border-radius: 14px;
    color: white;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 150ms ease;
    touch-action: manipulation;
  }

  .confirm-btn:hover {
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    transform: translateY(-1px);
  }

  .confirm-btn:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-backdrop,
    .overlay-card {
      animation: none;
    }
    .close-btn,
    .clear-btn,
    .word-field,
    .confirm-btn {
      transition: none;
    }
  }
</style>
