<!--
Toast.svelte - Simple toast notification for validation messages

Shows at the bottom center of screen, auto-dismisses after 3 seconds
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  // Props
  const { message = "", onDismiss } = $props<{
    message: string;
    onDismiss?: () => void;
  }>();
</script>

{#if message}
  <div class="toast-container">
    <div class="toast" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span class="toast-message">{message}</span>
      {#if onDismiss}
        <button
          class="toast-close"
          onclick={onDismiss}
          type="button"
          aria-label={t("create_ui_dismiss")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 80px; /* Above the button panel */
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    background: hsl(var(--destructive));
    color: hsl(var(--destructive-foreground));
    border-radius: 8px;
    box-shadow: 0 4px 16px var(--theme-shadow);
    pointer-events: auto;
    animation: slide-up var(--duration-emphasis) ease-out;
    min-width: 280px;
    max-width: 90vw;
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toast-message {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .toast-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: 4px;
    transition: background var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  .toast-close:hover {
    background: var(--theme-card-hover-bg);
  }

  .toast-close:active {
    background: var(--theme-stroke-strong);
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .toast-container {
      bottom: 70px;
      left: var(--spacing-md);
      right: var(--spacing-md);
      transform: none;
    }

    .toast {
      min-width: auto;
      max-width: none;
    }

    .toast-message {
      font-size: var(--font-size-xs);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
