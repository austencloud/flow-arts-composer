<!--
  SpellInputToolbar - Keyboard-aware toolbar for word input on touch devices

  Shows above the virtual keyboard when input is focused.
  Provides Done button to dismiss keyboard so user can see settings.
  Haptic feedback on button interactions.

  Uses:
  - VirtualKeyboard API (Chrome Android 94+) for keyboard-inset-height
  - visualViewport API (iOS Safari) as fallback
  - CSS env() variables for positioning
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  let {
    visible = false,
    disabled = false,
    word = "",
    showGenerate = false,
    canGenerate = false,
    isGenerating = false,
    onDone,
    onGenerate,
    onKeyboardHeightChange,
  } = $props<{
    visible: boolean;
    disabled?: boolean;
    word?: string;
    /** Show Generate button (only when layout is collapsed) */
    showGenerate?: boolean;
    canGenerate?: boolean;
    isGenerating?: boolean;
    onDone: () => void;
    onGenerate?: () => void;
    onKeyboardHeightChange?: (height: number) => void;
  }>();

  // The VirtualKeyboard API (Chrome on Android) isn't in TypeScript's built-in
  // DOM types yet, so we describe just the pieces we rely on: the flag that
  // lets us position this toolbar ourselves instead of the browser resizing
  // the page, and the keyboard's on-screen rectangle for measuring its height.
  interface VirtualKeyboard extends EventTarget {
    overlaysContent: boolean;
    readonly boundingRect: DOMRect;
  }

  type NavigatorWithVirtualKeyboard = Navigator & {
    virtualKeyboard: VirtualKeyboard;
  };

  const haptic = getHapticFeedback();

  let keyboardHeight = $state(0);
  let isKeyboardVisible = $state(false);

  // Track if VirtualKeyboard API is available (Chrome Android)
  let hasVirtualKeyboardAPI = $state(false);

  // Track if we're in a simulated mobile environment (Chrome DevTools)
  // In this case, touch is detected but no actual keyboard exists
  let isSimulatedMobile = $state(false);

  // Debounce timer for keyboard height updates
  let keyboardDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStableHeight = 0;
  let pendingHeight = 0;

  onMount(() => {
    if (!browser) return;

    // Detect Chrome DevTools mobile simulation:
    // - Touch is indicated (maxTouchPoints > 0 or ontouchstart exists)
    // - But no VirtualKeyboard API AND visualViewport matches window.innerHeight
    //   (meaning no keyboard can push the viewport)
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const hasVKApi = "virtualKeyboard" in navigator;
    const viewportMatchesWindow =
      window.visualViewport &&
      Math.abs(window.visualViewport.height - window.innerHeight) < 10;

    // If touch is detected but neither keyboard API is available/working,
    // we're likely in Chrome DevTools simulation
    if (hasTouch && !hasVKApi && viewportMatchesWindow) {
      // Check if this is likely a desktop browser simulating mobile
      // Real mobile devices would have VirtualKeyboard API (Chrome) or
      // visualViewport that differs from innerHeight when keyboard is up
      const userAgent = navigator.userAgent.toLowerCase();
      const isLikelyDesktopBrowser =
        !userAgent.includes("mobile") &&
        !userAgent.includes("android") &&
        !userAgent.includes("iphone") &&
        !userAgent.includes("ipad");

      if (isLikelyDesktopBrowser) {
        isSimulatedMobile = true;
        // In simulated mode, we won't show the toolbar since there's no keyboard
        return;
      }
    }

    // Try VirtualKeyboard API first (Chrome Android 94+)
    if ("virtualKeyboard" in navigator) {
      hasVirtualKeyboardAPI = true;
      const vk = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;

      // Opt-in to manual keyboard handling
      vk.overlaysContent = true;

      vk.addEventListener("geometrychange", handleVirtualKeyboardChange);
    } else if (window.visualViewport) {
      // Fallback: visualViewport API (iOS Safari, older Chrome)
      window.visualViewport.addEventListener(
        "resize",
        handleVisualViewportResize
      );
      window.visualViewport.addEventListener(
        "scroll",
        handleVisualViewportResize
      );
    }
  });

  onDestroy(() => {
    if (!browser) return;

    if (keyboardDebounceTimer) {
      clearTimeout(keyboardDebounceTimer);
    }

    if (hasVirtualKeyboardAPI && "virtualKeyboard" in navigator) {
      const vk = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
      vk.removeEventListener("geometrychange", handleVirtualKeyboardChange);
    }

    if (window.visualViewport) {
      window.visualViewport.removeEventListener(
        "resize",
        handleVisualViewportResize
      );
      window.visualViewport.removeEventListener(
        "scroll",
        handleVisualViewportResize
      );
    }
  });

  function handleVirtualKeyboardChange(event: Event) {
    const vk = event.target as VirtualKeyboard;
    const rect = vk.boundingRect;
    const newHeight = rect.height;

    if (keyboardDebounceTimer) {
      clearTimeout(keyboardDebounceTimer);
    }

    pendingHeight = newHeight;

    keyboardDebounceTimer = setTimeout(() => {
      const heightDiff = Math.abs(pendingHeight - lastStableHeight);

      // Require at least 150px for keyboard detection - real keyboards are 200-400px
      if (pendingHeight > 150) {
        if (heightDiff > 20 || !isKeyboardVisible) {
          keyboardHeight = pendingHeight;
          isKeyboardVisible = true;
          lastStableHeight = pendingHeight;
        }
      } else {
        if (isKeyboardVisible) {
          keyboardHeight = 0;
          isKeyboardVisible = false;
          lastStableHeight = 0;
        }
      }
    }, 50);
  }

  function handleVisualViewportResize() {
    if (!window.visualViewport) return;

    const viewportHeight = window.visualViewport.height;
    const windowHeight = window.innerHeight;
    const calculatedHeight =
      windowHeight - viewportHeight - window.visualViewport.offsetTop;

    if (keyboardDebounceTimer) {
      clearTimeout(keyboardDebounceTimer);
    }

    keyboardDebounceTimer = setTimeout(() => {
      const heightDiff = Math.abs(calculatedHeight - lastStableHeight);

      // Require at least 150px for keyboard detection - this filters out
      // small viewport changes from address bar hiding, DevTools docking, etc.
      // Real mobile keyboards are typically 200-400px tall
      if (calculatedHeight > 150) {
        if (heightDiff > 20 || !isKeyboardVisible) {
          keyboardHeight = calculatedHeight;
          isKeyboardVisible = true;
          lastStableHeight = calculatedHeight;
        }
      } else {
        if (isKeyboardVisible) {
          keyboardHeight = 0;
          isKeyboardVisible = false;
          lastStableHeight = 0;
        }
      }
    }, 50);
  }

  // Notify parent when keyboard height changes
  $effect(() => {
    const toolbarHeight = 60;
    const totalHeight = keyboardHeight > 0 ? keyboardHeight + toolbarHeight : 0;
    onKeyboardHeightChange?.(totalHeight);
  });

  // Compute bottom position using CSS env() with JS fallback
  const toolbarStyle = $derived.by(() => {
    if (hasVirtualKeyboardAPI) {
      return "";
    }
    if (keyboardHeight > 0) {
      return `bottom: ${keyboardHeight}px`;
    }
    return "";
  });

  // Don't show toolbar in simulated mobile mode (Chrome DevTools) - there's no keyboard
  const shouldShow = $derived(
    visible && isKeyboardVisible && !isSimulatedMobile
  );

  function handleDone() {
    haptic.trigger("selection");
    onDone();
  }

  function handleGenerate() {
    haptic.trigger("selection");
    onGenerate?.();
  }
</script>

{#if shouldShow}
  <div
    class="spell-input-toolbar"
    class:has-virtual-keyboard-api={hasVirtualKeyboardAPI}
    style={toolbarStyle}
    role="toolbar"
    aria-label={t("create_ui_word_input_actions")}
  >
    <div class="toolbar-content">
      <div class="toolbar-left">
        {#if word}
          <span class="word-preview"
            ><TKAWordGlyph {word} height={16} darkMode /></span
          >
        {:else}
          <span class="word-hint">{t("create_ui_type_your_word")}</span>
        {/if}
      </div>

      <div class="toolbar-right">
        {#if showGenerate && onGenerate}
          <button
            type="button"
            class="generate-button"
            onmousedown={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            ontouchstart={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            disabled={disabled || !canGenerate || isGenerating}
            aria-label={t("create_ui_generate_sequence")}
          >
            {#if isGenerating}
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-magic" aria-hidden="true"></i>
            {/if}
            <span>{t("generator_button")}</span>
          </button>
        {/if}

        <button
          type="button"
          class="done-button"
          onclick={handleDone}
          {disabled}
          aria-label={t("create_ui_done_dismiss_keyboard")}
        >
          <span class="done-text">{t("train_filter_done")}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .spell-input-toolbar {
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

  .spell-input-toolbar.has-virtual-keyboard-api {
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
    min-width: 0;
    flex: 1;
  }

  .word-preview {
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .word-hint {
    font-size: 14px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-style: italic;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .generate-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);

    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 8px;

    color: white;
    font-size: 15px;
    font-weight: 600;

    cursor: pointer;
    transition: all 150ms ease;
    touch-action: manipulation;
  }

  .generate-button:hover:not(:disabled) {
    background: var(--theme-accent-hover, #4f46e5);
  }

  .generate-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .generate-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .generate-button i {
    font-size: 14px;
  }

  .done-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);

    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;

    color: var(--theme-text, white);
    font-size: 15px;
    font-weight: 600;

    cursor: pointer;
    transition: all 150ms ease;
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
    .spell-input-toolbar {
      animation: none;
    }

    .done-button,
    .generate-button {
      transition: none;
    }
  }
</style>
