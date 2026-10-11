<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    getVisibleErrorToasts,
    getOverflowCount,
    dismissErrorToast,
    pauseErrorToast,
    resumeErrorToast,
  } from "../state/error-toast-state.svelte";

  const visibleToasts = $derived(getVisibleErrorToasts());
  const overflowCount = $derived(getOverflowCount());
</script>

<div
  class="toast-region"
  role="status"
  aria-live="polite"
  aria-label={t("notifications_title")}
>
  {#if overflowCount > 0}
    <div class="overflow-badge" aria-live="polite">
      {t("notifications_overflow", { count: overflowCount })}
    </div>
  {/if}

  {#each visibleToasts as toast (toast.id)}
    {@const isWarning = toast.severity === "warning"}
    <div
      class="toast"
      class:toast--warning={isWarning}
      class:toast--info={!isWarning}
      class:toast--paused={toast.paused}
      role="alert"
      aria-atomic="true"
      onmouseenter={() => pauseErrorToast(toast.id)}
      onmouseleave={() => resumeErrorToast(toast.id)}
    >
      <div class="toast-body">
        <span class="toast-icon" aria-hidden="true">
          {#if isWarning}
            <i class="fas fa-exclamation-triangle"></i>
          {:else}
            <i class="fas fa-info-circle"></i>
          {/if}
        </span>

        <span class="toast-message">{toast.message}</span>

        {#if isWarning}
          <span class="toast-logged" aria-label={t("notifications_error_logged")}>
            <i class="fas fa-check" aria-hidden="true"></i>
{t("notifications_logged")}
          </span>
        {/if}

        <button
          class="toast-close"
          aria-label={t("notifications_dismiss")}
          onclick={() => dismissErrorToast(toast.id)}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div
        class="toast-progress"
        aria-hidden="true"
        style="animation-duration: {toast.duration}ms; animation-play-state: {toast.paused
          ? 'paused'
          : 'running'};"
      ></div>
    </div>
  {/each}
</div>

<style>

  .toast-region {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    z-index: var(--z-toast);
    pointer-events: none;
    max-width: 380px;
    width: calc(100vw - 48px);
  }


  .overflow-badge {
    pointer-events: auto;
    align-self: flex-end;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    user-select: none;
  }


  .toast {
    pointer-events: auto;
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);

    /* Entrance animation */
    animation: toast-enter var(--duration-emphasis, 300ms) ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }

  /* Warning variant */
  .toast--warning {
    background: linear-gradient(
      135deg,
      rgba(180, 120, 40, 0.12) 0%,
      rgba(20, 18, 24, 0.92) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #fbbf24) 20%, transparent);
  }

  /* Info variant */
  .toast--info {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-info, #3b82f6) 8%, transparent) 0%,
      rgba(20, 18, 24, 0.92) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
  }


  .toast-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    /* leave 3px at the bottom for the progress bar */
    padding-bottom: 11px;
  }


  .toast-icon {
    flex-shrink: 0;
    font-size: 18px;
    line-height: 1;
  }

  .toast--warning .toast-icon {
    color: var(--semantic-warning, #fbbf24);
  }

  .toast--info .toast-icon {
    color: var(--semantic-info, #60a5fa);
  }


  .toast-message {
    flex: 1;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #fff);
    line-height: 1.4;
    min-width: 0;
    word-break: break-word;
  }


  .toast-logged {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.4);
    white-space: nowrap;
  }

  .toast-logged i {
    font-size: 10px;
    color: rgba(134, 239, 172, 0.7);
  }


  .toast-close {
    flex-shrink: 0;
    /* 44px touch target via negative margin trick */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: -12px -14px -12px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
    border-radius: 8px;
    transition:
      color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .toast-close:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.06);
  }

  .toast-close:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: -2px;
  }


  .toast-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    border-radius: 0 0 14px 14px;
    animation: deplete linear both;
    transform-origin: left;
  }

  .toast--warning .toast-progress {
    background: linear-gradient(
      90deg,
      var(--semantic-warning, #f59e0b),
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 75%, white)
    );
  }

  .toast--info .toast-progress {
    background: linear-gradient(
      90deg,
      var(--semantic-info, #3b82f6),
      color-mix(in srgb, var(--semantic-info, #3b82f6) 75%, white)
    );
  }

  @keyframes deplete {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast-progress {
      animation: none;
      width: 100%;
      opacity: 0.3;
    }
  }


  @keyframes toast-enter {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Mobile: center-bottom ─────────────────────────────────────────────── */

  @media (max-width: 600px) {
    .toast-region {
      right: 50%;
      transform: translateX(50%);
      bottom: 16px;
      width: calc(100vw - 32px);
      max-width: 420px;
    }
  }
</style>
