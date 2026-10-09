<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  // A 404 passes its own heading and no retry: reloading a missing page
  // cannot help. Everything else keeps the initialization failure screen.
  let { error, onRetry, title } = $props<{
    error: string;
    onRetry?: () => void;
    title?: string;
  }>();

  // Services
  let hapticService: HapticFeedback;

  onMount(async () => {
    hapticService = getHapticFeedback();
  });

  // Handle retry with haptic feedback
  function handleRetry() {
    // Trigger selection haptic feedback for retry action
    hapticService?.trigger("selection");
    onRetry?.();
  }

  // Handle home navigation with haptic feedback
  function handleGoHome() {
    // Trigger navigation haptic feedback for home navigation
    hapticService?.trigger("selection");
    window.location.href = "/create";
  }

  // Extract error details if possible.
  // $derived.by, not $derived: $derived(fn) stores the FUNCTION, so the panel
  // rendered its own source text where the error message belongs.
  const errorDetails = $derived.by(() => {
    try {
      // Try to parse if it's a JSON error
      const parsed = JSON.parse(error);
      return parsed;
    } catch {
      // Return as plain string
      return { message: error };
    }
  });

  const displayMessage = $derived.by(() => {
    if (
      typeof errorDetails === "object" &&
      errorDetails &&
      "message" in errorDetails
    ) {
      return (errorDetails as { message: string }).message;
    }
    return error;
  });
</script>

<div class="error-screen">
  <div class="error-content glass-surface">
    <div class="error-icon">
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
        <path d="m15 9-6 6" stroke="currentColor" stroke-width="2" />
        <path d="m9 9 6 6" stroke="currentColor" stroke-width="2" />
      </svg>
    </div>

    <h1>{title ?? t("error_initialization_failed")}</h1>
    <p class="error-message">{displayMessage}</p>

    <div class="error-actions">
      {#if onRetry}
      <button class="btn btn-primary" onclick={handleRetry}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" />
          <path
            d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M8 16H3v5" stroke="currentColor" stroke-width="2" />
        </svg>
        {t("common_retry")}
      </button>
      {/if}

      <button class="btn btn-glass" onclick={handleGoHome}> {t("common_go_home")} </button>
    </div>

    <details class="error-details">
      <summary>{t("error_technical_details")}</summary>
      <pre class="error-stack">{error}</pre>
    </details>
  </div>
</div>

<style>
  .error-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--spacing-lg);
    background: var(--gradient-cosmic);
  }

  .error-content {
    max-width: 500px;
    padding: var(--spacing-2xl);
    text-align: center;
    color: var(--foreground);
  }

  .error-icon {
    color: var(--semantic-error);
    margin-bottom: var(--spacing-lg);
  }

  h1 {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: var(--spacing-md);
    color: var(--foreground);
  }

  .error-message {
    font-size: var(--font-size-base);
    color: var(--muted-foreground);
    margin-bottom: var(--spacing-xl);
    line-height: 1.6;
  }

  .error-actions {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
    margin-bottom: var(--spacing-xl);
  }

  .error-details {
    margin-top: var(--spacing-lg);
    text-align: left;
  }

  .error-details summary {
    cursor: pointer;
    padding: var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--muted-foreground);
    user-select: none;
  }

  .error-details summary:hover {
    color: var(--foreground);
  }

  .error-stack {
    background: rgba(0, 0, 0, 0.2);
    padding: var(--spacing-md);
    border-radius: 8px;
    font-size: var(--font-size-xs);
    color: var(--muted-foreground);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    margin-top: var(--spacing-sm);
  }

  /* Button overrides for error screen */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    min-width: 120px;
  }

  .btn svg {
    width: 16px;
    height: 16px;
  }
</style>
