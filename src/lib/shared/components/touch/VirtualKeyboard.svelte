<!--
  VirtualKeyboard.svelte - Custom TKA Virtual Keyboard

  Features:
  - Logical groups based on TKA Codex (6-6-6-4...)
  - Semantic Color Coding by Letter Type (Dual-Tone Synthesis for Type 1)
  - Context-Aware Validation: Disables keys that break position continuity
  - Header-based management (Clear / Display / Close)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { fly, fade } from "svelte/transition";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import {
    getLastLetter,
    getValidNextLetters,
    getLetterType,
  } from "../../pictograph/tka-glyph/services/letter-domain-service";

  interface Props {
    isOpen: boolean;
    value?: string;
    resultCount?: number;
    searchMode?: "standard" | "spelled";
    onKey: (key: string) => void;
    onBackspace: () => void;
    onClose: () => void;
    onClear: () => void;
    onModeToggle?: (mode: "standard" | "spelled") => void;
  }

  let {
    isOpen = $bindable(false),
    value = "",
    resultCount = 0,
    searchMode = "standard",
    onKey,
    onBackspace,
    onClose,
    onClear,
    onModeToggle,
  }: Props = $props();

  // State
  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  /**
   * Determine if a character is valid given the current input
   */
  const validNextLetters = $derived.by(() => {
    if (searchMode === "spelled") return null; // All valid in spelled mode

    const lastLetter = getLastLetter(value);
    if (!lastLetter) return null; // All valid for first entry

    return getValidNextLetters(lastLetter);
  });

  function isKeyDisabled(char: string): boolean {
    if (!validNextLetters) return false;
    // Special handling for '-' modifier: always enabled if there's text
    if (char === "-") return value.length === 0;
    return !validNextLetters.includes(char);
  }

  const ALPHA_ROWS = [
    ["A", "B", "C", "D", "E", "F"], // Row 1
    ["G", "H", "I", "J", "K", "L"], // Row 2
    ["M", "N", "O", "P", "Q", "R"], // Row 3
    ["S", "T", "U", "V"], // Row 4
    ["W", "X", "Y", "Z"], // Row 5
    ["Σ", "Δ", "Θ", "Ω"], // Row 6
    ["Φ", "Ψ", "Λ"], // Row 7
  ];

  const STATIC_CHARS = ["α", "β", "γ"];

  function handleKey(key: string, event: MouseEvent) {
    if (isKeyDisabled(key)) return;
    event.preventDefault();
    hapticService?.trigger("selection");
    onKey(key);
  }

  function handleBackspace(event: MouseEvent) {
    event.preventDefault();
    hapticService?.trigger("selection");
    onBackspace();
  }

  function handleAction(fn: () => void, event: MouseEvent) {
    event.preventDefault();
    hapticService?.trigger("selection");
    fn();
  }

  function handleInternalClose() {
    isOpen = false;
    onClose();
  }
</script>

<Drawer
  bind:isOpen
  placement="bottom"
  showHandle={true}
  trapFocus={false}
  preventScroll={false}
  closeOnBackdrop={true}
  autoFocus={false}
  class="virtual-keyboard-drawer"
  backdropClass="keyboard-backdrop"
  onclose={onClose}
>
  <div
    class="virtual-keyboard-content"
    role="region"
    aria-label={t("shared_keyboard_label")}
  >
    <div class="keyboard-header">
      <div class="header-left">
        <button
          class="header-action-btn clear-btn"
          onmousedown={(e) => handleAction(onClear, e)}
          type="button"
        >
          {t("browse_clear")}
        </button>
      </div>

      <div class="header-center">
        {#if value}
          <div class="notation-display" transition:fade={{ duration: 150 }}>
            {value}
          </div>
        {:else}
          <span class="keyboard-title">{t("browse_keyboard_title")}</span>
        {/if}
        {#if value}
          <div
            class="result-badge"
            class:none={resultCount === 0}
            transition:fly={{ y: -10, duration: 200 }}
          >
            {t("shared_keyboard_matches", { count: resultCount })}
          </div>
        {/if}
      </div>

      <div class="header-right">
        <!-- Search Mode Toggle (only when caller supports mode switching) -->
        {#if onModeToggle}
          <button
            class="mode-toggle"
            class:spelled={searchMode === "spelled"}
            onmousedown={(e) =>
              handleAction(
                () =>
                  onModeToggle?.(
                    searchMode === "standard" ? "spelled" : "standard"
                  ),
                e
              )}
            type="button"
            title={t("shared_keyboard_toggle_mode")}
          >
            <i class="fas {searchMode === 'standard' ? 'fa-link' : 'fa-font'}"
            ></i>
            <span
              >{searchMode === "standard"
                ? t("shared_keyboard_name")
                : t("shared_keyboard_spell")}</span
            >
          </button>
        {/if}

        <button
          class="header-action-btn close-btn"
          onmousedown={(e) => handleAction(handleInternalClose, e)}
          aria-label={t("common_close")}
          type="button"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <div class="keyboard-scroll-area">
      <div class="keyboard-inner-content">
        {#each ALPHA_ROWS as row}
          <div class="keyboard-row">
            {#each row as char}
              {@const type = getLetterType(char)}
              {@const disabled = isKeyDisabled(char)}
              <button
                type="button"
                class="key type-{type}-key"
                class:disabled
                onmousedown={(e) => handleKey(char, e)}
              >
                {char}
              </button>
            {/each}
          </div>
        {/each}

        <!-- Final Row: [Dash] [α] [β] [γ] [Backspace] -->
        <div class="keyboard-row modifier-row">
          <button
            type="button"
            class="key control-key dash-btn"
            class:disabled={isKeyDisabled("-")}
            onmousedown={(e) => handleKey("-", e)}
          >
            -
          </button>

          {#each STATIC_CHARS as char}
            {@const disabled = isKeyDisabled(char)}
            <button
              type="button"
              class="key type-6-key"
              class:disabled
              onmousedown={(e) => handleKey(char, e)}
            >
              {char}
            </button>
          {/each}

          <button
            type="button"
            class="key control-key backspace-btn"
            onmousedown={(e) => handleBackspace(e)}
            aria-label={t("create_ui_backspace")}
          >
            <i class="fas fa-backspace"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</Drawer>

<style>
  :global(.virtual-keyboard-drawer) {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #12121c) 94%,
      black
    ) !important;
    backdrop-filter: blur(30px) saturate(200%) !important;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1)) !important;
    box-shadow: 0 -10px 60px rgba(0, 0, 0, 0.8) !important;
    max-height: 75vh !important;
  }

  /* The keyboard is a live search tool — the grid behind IS the feedback.
     A dimming backdrop hid the results while typing. */
  :global(.drawer-overlay.keyboard-backdrop) {
    background: transparent !important;
    backdrop-filter: none !important;
  }

  .virtual-keyboard-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }

  .keyboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 16px;
    flex-shrink: 0;
  }

  .header-left,
  .header-right {
    width: 100px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .header-right {
    justify-content: flex-end;
  }

  .header-action-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .clear-btn {
    color: #f87171;
  }

  .mode-toggle {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
  }

  .mode-toggle.spelled {
    background: rgba(16, 185, 129, 0.15);
    border-color: #10b981;
    color: #10b981;
  }

  .header-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }

  .notation-display {
    font-family: var(--font-mono, monospace);
    font-size: 20px;
    font-weight: 700;
    color: var(--theme-accent);
    padding: 2px 16px;
    background: rgba(99, 102, 241, 0.1);
    border-radius: 20px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .keyboard-title {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-weight: 800;
  }

  .result-badge {
    margin-top: 4px;
    background: var(--theme-accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 10px;
    border-radius: 10px;
    font-variant-numeric: tabular-nums;
  }

  .result-badge.none {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
  }

  .keyboard-scroll-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px;
  }

  .keyboard-inner-content {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .keyboard-row {
    display: flex;
    justify-content: center;
    gap: 6px;
  }

  .key {
    width: 48px;
    /* 44px design-system touch floor — narrow the keys to fit rows, never
       shorten them below the floor. */
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    color: var(--theme-text, white);
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    transition: all 0.1s ease;
  }

  .key:active:not(.disabled) {
    transform: scale(0.92);
    filter: brightness(1.2);
  }

  .key.disabled {
    opacity: 0.15;
    cursor: not-allowed;
    filter: grayscale(1);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.05));
    pointer-events: none;
  }

  /* Type 1: Dual-Shift (Blue + Purple Synthesis) */
  .type-1-key {
    background: linear-gradient(
      135deg,
      rgba(54, 195, 255, 0.08),
      rgba(111, 45, 168, 0.08)
    );
    border-image: linear-gradient(135deg, #36c3ff, #6f2da8) 1;
    border-width: 1px;
    border-style: solid;
    color: #36c3ff;
  }
  .type-1-key:active:not(.disabled) {
    background: linear-gradient(
      135deg,
      rgba(54, 195, 255, 0.2),
      rgba(111, 45, 168, 0.2)
    );
  }

  /* Type 2: Shift (Purple) */
  .type-2-key {
    border-color: #6f2da8;
    color: #a78bfa;
  }
  .type-2-key:active:not(.disabled) {
    background: rgba(111, 45, 168, 0.2);
  }

  /* Type 4: Dash (Green) */
  .type-4-key {
    border-color: #26e600;
    color: #26e600;
  }
  .type-4-key:active:not(.disabled) {
    background: rgba(38, 230, 0, 0.2);
  }

  /* Type 6: Static (Orange) */
  .type-6-key {
    border-color: #eb7d00;
    color: #f97316;
  }
  .type-6-key:active:not(.disabled) {
    background: rgba(235, 125, 0, 0.2);
  }

  .control-key {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.15));
    width: 64px;
  }
  .backspace-btn {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
  }

  .dash-btn {
    font-size: 28px;
    font-weight: 900;
    color: var(--theme-accent);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent);
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
  }
  .dash-btn:active:not(.disabled) {
    background: rgba(99, 102, 241, 0.2);
  }

  @media (max-width: 600px) {
    .key {
      width: 42px;
      height: 44px;
      font-size: 16px;
      border-radius: 8px;
    }
    .control-key {
      width: 56px;
    }
    /* Border-image and border-radius fix */
    .type-1-key {
      border-image: none;
      border-color: #36c3ff;
      border-radius: 8px;
    }
  }

  @media (max-width: 400px) {
    .key {
      width: 38px;
      height: 44px;
    }
    .keyboard-row {
      gap: 5px;
    }
    .control-key {
      width: 48px;
    }
  }
</style>
