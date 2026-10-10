<!--
WordInputCard.svelte - Compact word input card for the generator grid
Empty = random generation. Typed word = spell that word.
Replaces the old GenerationModeCard (Freeform/Spell toggle).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getGreekSymbol } from "$lib/shared/keyboard/services/greek-key-mapper";
  import { onMount } from "svelte";
  import CardHeader from "./shared/CardHeader.svelte";
  import {
    uppercasePreservingGreek,
    insertAtCursor,
  } from "$lib/shared/keyboard/domain/greek-input-helpers";

  let {
    wordValue = "",
    onWordChange,
    onWordSubmit,
    disabled = false,
    color = "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)",
    shadowColor = "270deg 70% 55%",
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
    isMobile = false,
    onOpenOverlay,
  } = $props<{
    wordValue?: string;
    onWordChange?: (value: string) => void;
    onWordSubmit?: () => void;
    disabled?: boolean;
    color?: string;
    shadowColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    isMobile?: boolean;
    onOpenOverlay?: () => void;
  }>();

  onMount(() => {});

  const hasWord = $derived(wordValue.trim().length > 0);

  function handleFocus(event: FocusEvent) {
    if (isMobile && onOpenOverlay) {
      // Prevent the inline input from actually focusing on mobile - open the overlay instead
      (event.target as HTMLInputElement).blur();
      onOpenOverlay();
    }
  }

  function handleCardTap() {
    if (isMobile && onOpenOverlay) {
      onOpenOverlay();
    }
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const uppercased = uppercasePreservingGreek(target.value);
    if (target.value !== uppercased) {
      target.value = uppercased;
    }
    onWordChange?.(uppercased);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && wordValue.trim()) {
      event.preventDefault();
      onWordSubmit?.();
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
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="word-input-card"
  class:has-word={hasWord}
  class:mobile={isMobile}
  style="
    --card-bg: {color};
    --card-shadow-color: {shadowColor};
    animation-delay: {cardIndex * 60}ms;
  "
  onclick={handleCardTap}
  role={isMobile ? "button" : undefined}
  tabindex={isMobile ? 0 : undefined}
  aria-label={isMobile ? t("create_deep_enter_word_aria") : undefined}
>
  <CardHeader title={t("create_ui_word")} {headerFontSize} />

  <div class="input-row">
    <input
      name="generation-word"
      type="text"
      class="word-field"
      placeholder="A-Z"
      value={wordValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      {disabled}
      readonly={isMobile}
    />
  </div>
</div>

<style>
  .word-input-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--card-bg);
    border-radius: 20px;
    padding: 6px 8px 8px;
    gap: 2px;
    position: relative;
    overflow: hidden;
    transition: box-shadow var(--duration-emphasis) ease;
  }

  .word-input-card.mobile {
    cursor: pointer;
  }

  .word-input-card.mobile .word-field {
    cursor: pointer;
    pointer-events: none;
  }

  .input-row {
    display: flex;
    align-items: center;
    flex: 1;
    min-height: 0;
  }

  .word-field {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.2);
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 10px;
    color: white;
    font-size: var(--card-text-size, clamp(14px, 2vmin, 22px));
    font-weight: 700;
    letter-spacing: 1.5px;
    text-align: center;
    padding: 2px 6px;
    height: 100%;
    font-family: inherit;
    transition: border-color 150ms ease;
  }

  .word-field:focus:not(:focus-visible) {
    outline: none;
  }

  .word-field::placeholder {
    color: rgba(255, 255, 255, 0.35);
    font-weight: 500;
    letter-spacing: 2px;
  }

  .word-field:focus {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
    background: rgba(0, 0, 0, 0.3);
  }

  .word-field:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
    outline: 2px solid white;
    outline-offset: 1px;
  }

  .word-field:disabled {
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .word-input-card,
    .word-field {
      transition: none;
    }
  }
</style>
