<!--
  MobileInputToolbar - Keyboard-aware toolbar for mobile text input

  Shows above the virtual keyboard when a textarea is focused on mobile.
  Provides a Done button to dismiss the keyboard, and a snippet slot for
  consumer-specific left-side content (e.g. submit button, voice input).

  Uses:
  - VirtualKeyboard API (Chrome Android) for keyboard-inset-height
  - visualViewport API (iOS Safari) as fallback
  - CSS env() variables for positioning
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { type Snippet } from "svelte";
  import { createKeyboardInset } from "#lib/shared/mobile/utils/keyboard-inset.svelte.js";

  let {
    visible = false,
    disabled = false,
    doneLabel,
    onDone,
    onKeyboardHeightChange,
    leftContent,
  } = $props<{
    visible: boolean;
    disabled?: boolean;
    doneLabel?: string;
    onDone: () => void;
    onKeyboardHeightChange?: (height: number) => void;
    leftContent?: Snippet;
  }>();

  // Shared virtual-keyboard detection (VirtualKeyboard API / visualViewport).
  // The toolbar is conditionally rendered, so detection can stay active for its
  // whole lifetime.
  const kb = createKeyboardInset();

  // Notify parent when keyboard height changes. Add toolbar height (~60px) to
  // the keyboard height for the total bottom inset consumers should reserve.
  $effect(() => {
    const totalHeight = kb.height > 0 ? kb.height + 60 : 0;
    onKeyboardHeightChange?.(totalHeight);
  });

  // Compute bottom position using CSS env() with JS fallback.
  const toolbarStyle = $derived.by(() => {
    // If VirtualKeyboard API is active, CSS env() will handle it
    if (kb.hasVirtualKeyboardAPI) {
      return "";
    }
    // For iOS Safari, use calculated keyboard height
    if (kb.height > 0) {
      return `bottom: ${kb.height}px`;
    }
    return "";
  });

  // Don't show toolbar in simulated mobile mode (Chrome DevTools) - there's no keyboard
  const shouldShow = $derived(visible && kb.isVisible && !kb.isSimulatedMobile);
</script>

{#if shouldShow}
  <div
    class="mobile-input-toolbar"
    class:has-virtual-keyboard-api={kb.hasVirtualKeyboardAPI}
    style={toolbarStyle}
    role="toolbar"
    aria-label={t("shared_controls_input_actions")}
  >
    <div class="toolbar-content">
      {#if leftContent}
        <div class="toolbar-left">
          {@render leftContent()}
        </div>
      {/if}

      <div class="toolbar-right">
        <button
          type="button"
          class="done-button"
          onclick={onDone}
          {disabled}
          aria-label={doneLabel ?? t("shared_controls_done")}
        >
          <span class="done-text">{doneLabel ?? t("shared_controls_done")}</span
          >
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mobile-input-toolbar {
    position: fixed;
    left: 0;
    right: 0;
    z-index: var(--z-tooltip);

    /* Default: use CSS env() for VirtualKeyboard API browsers */
    bottom: calc(env(keyboard-inset-height, 0px));

    /* Visual design */
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    /* Safe area for notched devices */
    padding-bottom: env(safe-area-inset-bottom, 0px);

    /* Animation */
    animation: slideUp 150ms ease-out;
  }

  /* When VirtualKeyboard API is available, trust CSS env() completely */
  .mobile-input-toolbar.has-virtual-keyboard-api {
    bottom: env(keyboard-inset-height, 0px);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toolbar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    gap: 12px;
    max-width: 100%;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .done-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    min-height: 44px;

    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;

    color: var(--theme-text, white);
    font-size: 15px;
    font-weight: 600;

    cursor: pointer;
    transition: all 150ms ease;

    /* Ensure touch target */
    touch-action: manipulation;
  }

  .done-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .done-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .done-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .done-text {
    font-weight: 600;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .mobile-input-toolbar {
      animation: none;
    }

    .done-button {
      transition: none;
    }
  }
</style>
