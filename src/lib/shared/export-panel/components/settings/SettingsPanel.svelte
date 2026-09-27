<!--
  SettingsPanel.svelte

  Base wrapper for format-specific settings panels.
  Slides in from the right with header (title + close button) and content slot.

  Pattern matches AnimationSettingsSheet.svelte structure.

  Features:
  - Slide-in animation from right
  - Dark overlay background
  - Close button with auto-focus
  - Escape key to close
  - Focus trap (auto-focus on open, return focus on close)
  - Responsive (full width on mobile, right panel on desktop)

  Domain: Export Panel - Settings Panel Wrapper
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";

  let {
    isOpen = false,
    title = "Settings",
    onClose,
    children,
  }: {
    isOpen?: boolean;
    title?: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  let panelElement: HTMLDivElement | null = $state(null);
  let closeButtonElement: HTMLButtonElement | null = $state(null);
  let previousActiveElement: Element | null = null;

  // Store the previously focused element and focus close button when panel opens
  $effect(() => {
    if (isOpen && closeButtonElement) {
      previousActiveElement = document.activeElement;
      closeButtonElement.focus();
    }
  });

  // Return focus to previously focused element when panel closes
  $effect(() => {
    if (!isOpen && previousActiveElement instanceof HTMLElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  });

  // Get all focusable elements within the panel
  function getFocusableElements(): HTMLElement[] {
    if (!panelElement) return [];
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(panelElement.querySelectorAll<HTMLElement>(selector));
  }

  // Handle keyboard events (Escape to close, Tab for focus trap)
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
      onClose?.();
      return;
    }

    // Focus trap: cycle through focusable elements
    if (event.key === "Tab" && isOpen) {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  // Handle backdrop click (close on click outside panel)
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  }
</script>

{#if isOpen}
  <div
    class="settings-backdrop"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
  >
    <div class="settings-panel" bind:this={panelElement}>
      <!-- Header -->
      <div class="settings-header">
        <h2 id="settings-title" class="settings-title">{title}</h2>
        <button
          class="close-button"
          bind:this={closeButtonElement}
          onclick={onClose}
          aria-label={t("export_ui_close_settings")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Content (slotted) -->
      <div class="settings-content">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: color-mix(in srgb, #000 50%, transparent);
    z-index: 200;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    width: clamp(320px, 40vw, 600px);
    max-width: 100vw;
    height: 100%;
    background: var(--theme-panel-bg);
    border-left: 1px solid var(--theme-stroke);
    box-shadow: -4px 0 24px color-mix(in srgb, #000 50%, transparent);
    animation: slideIn var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .settings-title {
    font-size: clamp(18px, 4cqi, 20px);
    font-weight: 700;
    color: var(--theme-text, white);
    margin: 0;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .close-button i {
    font-size: var(--font-size-lg);
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 24px;
  }

  /* Slide-in animation */
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  /* Mobile optimization */
  @media (max-width: 768px) {
    .settings-panel {
      width: 100%;
    }

    .settings-header {
      padding: 16px 20px;
    }

    .settings-content {
      padding: 20px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .settings-panel {
      animation: none;
    }
  }
</style>
