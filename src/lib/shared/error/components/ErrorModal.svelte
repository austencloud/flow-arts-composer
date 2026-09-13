<!--
  ErrorModal - Global error display component

  Place this once at the app root. It listens to error state and displays
  a modal when errors occur, with options to dismiss or report as a bug.

  Wide two-column layout on desktop, single column on mobile.
-->
<script lang="ts">

import { onDestroy } from "svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { getCurrentError, dismissError } from "../state/error-state.svelte";
  import type { ErrorHandler } from '$lib/shared/application/services/error-handler'
  import {
    buildErrorCopyText,
    formatParamLabel,
    formatParamValue,
  } from "../domain/error-report-text";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/focus-trap";

  let userComment = $state("");
  let isReporting = $state(false);
  let copied = $state(false);
  let modalElement = $state<HTMLDivElement | null>(null);
  let copyResetTimeout: ReturnType<typeof setTimeout> | undefined;

  // Trap focus inside the alertdialog while it's open: focus moves to the
  // dialog container on open, Tab is trapped within, everything else goes
  // inert, and focus returns to the trigger on close.
  const focusTrap = new FocusTrap({
    focusContainerOnInitial: true,
    inertExclusions: [],
  });

  $effect(() => {
    if (!modalElement) return;
    focusTrap.activate(modalElement);
    return () => focusTrap.deactivate();
  });

  onDestroy(() => {
    clearTimeout(copyResetTimeout);
  });

  const error = $derived(getCurrentError());

  const additionalData = $derived(
    error?.context.additionalData &&
      Object.keys(error.context.additionalData).length > 0
      ? error.context.additionalData
      : null,
  );

  const hasParams = $derived(
    !!(error?.context.module || error?.context.action || additionalData),
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildErrorCopyText(error));
      copied = true;
      clearTimeout(copyResetTimeout);
      copyResetTimeout = setTimeout(() => (copied = false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  const severityConfig: Record<
    string,
    { icon: string; color: string; bg: string; title: string }
  > = {
    info: {
      icon: "fa-info-circle",
      color: "var(--semantic-info)",
      bg: "rgba(59, 130, 246, 0.15)",
      title: "Notice",
    },
    warning: {
      icon: "fa-exclamation-triangle",
      color: "var(--semantic-warning)",
      bg: "rgba(245, 158, 11, 0.15)",
      title: "Warning",
    },
    error: {
      icon: "fa-times-circle",
      color: "var(--semantic-error)",
      bg: "rgba(239, 68, 68, 0.15)",
      title: "Error",
    },
    critical: {
      icon: "fa-skull-crossbones",
      color: "var(--semantic-error)",
      bg: "rgba(220, 38, 38, 0.2)",
      title: "Critical Error",
    },
  };

  function getConfig(severity: string) {
    return severityConfig[severity] ?? severityConfig.error!;
  }

  function handleDismiss() {
    userComment = "";
    dismissError();
  }

  async function handleReportBug() {
    if (!error) return;

    isReporting = true;
    try {
      const errorService = getErrorHandler() ?? undefined;
      if (!errorService) {
        toast.error("Unable to submit bug report - service unavailable");
        return;
      }

      const feedbackId = await errorService.reportBug(
        error.id,
        userComment || undefined,
      );

      if (feedbackId) {
        toast.success("Bug report submitted. Thank you!");
        handleDismiss();
      } else {
        toast.error("Failed to submit bug report. Please try again.");
      }
    } catch (err) {
      console.error("Error reporting bug:", err);
      toast.error("Failed to submit bug report");
    } finally {
      isReporting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && error) {
      handleDismiss();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if error}
  {@const config = getConfig(error.severity)}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="error-overlay" onclick={handleDismiss} role="presentation">
    <div
      bind:this={modalElement}
      class="error-modal"
      class:has-params={hasParams}
      style="--error-color: {config.color}; --error-bg: {config.bg}"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") handleDismiss();
        e.stopPropagation();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-title"
      aria-describedby="error-message"
      tabindex="-1"
    >
      <!-- Header spans full width -->
      <div class="error-header">
        <div class="error-icon-wrapper">
          <i class="fas {config.icon} error-icon" aria-hidden="true"></i>
        </div>
        <h2 id="error-title" class="error-title">{config.title}</h2>
        <button class="copy-button" onclick={handleCopy}>
          <i
            class="fas {copied ? 'fa-check' : 'fa-copy'}"
            aria-hidden="true"
          ></i>
          {copied ? "Copied" : "Copy all"}
        </button>
        <button
          class="close-button"
          onclick={handleDismiss}
          aria-label="Dismiss error"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Two-column body on wide screens -->
      <div class="error-body">
        <!-- Left column: what was I doing -->
        {#if hasParams}
          <div class="error-left">
            <p class="error-message" id="error-message">{error.message}</p>
            <div class="params-grid">
              {#if error.context.module}
                <span class="param-label">Module</span>
                <span class="param-value">{error.context.module}</span>
              {/if}
              {#if error.context.action}
                <span class="param-label">Action</span>
                <span class="param-value">{error.context.action}</span>
              {/if}
              {#if additionalData}
                {#each Object.entries(additionalData) as [key, value]}
                  {@const display = formatParamValue(value)}
                  {#if display !== "-"}
                    <span class="param-label">{formatParamLabel(key)}</span>
                    <span class="param-value">{display}</span>
                  {/if}
                {/each}
              {/if}
            </div>
          </div>
        {/if}

        <!-- Right column (or only column if no params): error details + report -->
        <div class="error-right">
          {#if !hasParams}
            <p class="error-message" id="error-message">{error.message}</p>
          {/if}

          {#if error.technicalDetails || error.stack}
            <div class="technical-details">
              {#if error.technicalDetails}
                <p class="detail-text">{error.technicalDetails}</p>
              {/if}
              {#if error.stack}
                <pre class="stack-trace">{error.stack}</pre>
              {/if}
            </div>
          {/if}

          {#if error.reportable}
            <div class="report-section">
              <label class="report-label" for="error-comment"
                >What were you trying to do?</label
              >
              <textarea
                id="error-comment"
                class="comment-input"
                placeholder="e.g. I was generating a 16-step circular sequence..."
                bind:value={userComment}
                rows="3"
              ></textarea>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer spans full width -->
      <div class="error-actions">
        <button class="action-button dismiss-button" onclick={handleDismiss}>
          Dismiss
        </button>
        {#if error.reportable}
          <button
            class="action-button report-button"
            onclick={handleReportBug}
            disabled={isReporting}
            aria-busy={isReporting}
          >
            {#if isReporting}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              Reporting...
            {:else}
              <i class="fas fa-bug" aria-hidden="true"></i>
              Report Bug
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .error-overlay {
    position: fixed;
    inset: 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    animation: fadeIn var(--duration-normal) ease-out;
    padding: 24px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .error-modal {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 48px);
    background: linear-gradient(145deg, #1e1e2e 0%, #181825 100%);
    border: 1px solid var(--error-color);
    border-radius: 16px;
    box-shadow:
      0 0 30px rgba(0, 0, 0, 0.5),
      0 0 60px var(--error-bg);
    width: 100%;
    max-width: 480px;
    animation: slideUp var(--duration-normal) ease-out;
    overflow: hidden;
  }

  /* When there are params to show, go wide on desktop */
  .error-modal.has-params {
    max-width: 1100px;
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


  .error-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: var(--error-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .error-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--error-bg);
    border-radius: 8px;
    border: 1px solid var(--error-color);
    flex-shrink: 0;
  }

  .error-icon {
    font-size: var(--font-size-lg);
    color: var(--error-color);
  }

  .error-title {
    flex: 1;
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--error-color);
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .copy-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  /* ── Body: two-column on wide, stacked on narrow ── */

  .error-body {
    display: flex;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    flex-direction: column;
    gap: 0;
  }

  .has-params .error-body {
    flex-direction: row;
  }

  .error-left {
    flex: 0 0 38%;
    min-width: 0;
    padding: 24px;
    border-right: 1px solid var(--theme-stroke);
  }

  .error-right {
    flex: 1;
    min-width: 0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }


  .error-message {
    margin: 0 0 16px;
    font-size: var(--font-size-base, 15px);
    font-weight: 500;
    line-height: 1.4;
    color: var(--theme-text);
  }


  .params-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px 16px;
    font-size: var(--font-size-sm);
    align-items: baseline;
  }

  .param-label {
    color: var(--theme-text-dim);
    overflow-wrap: anywhere;
  }

  .param-value {
    color: var(--theme-text);
    font-weight: 500;
    word-break: break-word;
  }

  /* ── Technical details (always visible on desktop) ── */

  .technical-details {
    padding: 14px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
    border: 1px solid var(--theme-stroke);
  }

  .detail-text {
    margin: 0 0 8px;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    font-weight: 500;
  }

  .stack-trace {
    margin: 0;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    font-family: "Fira Code", "Consolas", monospace;
    font-size: var(--font-size-compact);
    line-height: 1.4;
    color: var(--theme-text-dim);
    overflow-x: auto;
    max-height: 300px;
    white-space: pre-wrap;
    word-break: break-all;
  }


  .report-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .report-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .comment-input {
    width: 100%;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-family: inherit;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    resize: vertical;
    min-height: 60px;
  }

  .comment-input::placeholder {
    color: var(--theme-text-dim);
  }

  .comment-input:focus {
    outline: none;
    border-color: var(--error-color);
  }


  .error-actions {
    display: flex;
    flex-shrink: 0;
    gap: 12px;
    padding: 16px 20px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke);
  }

  .action-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border: none;
    border-radius: 10px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .dismiss-button {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .dismiss-button:hover {
    background: var(--theme-card-hover-bg);
    color: white;
  }

  .report-button {
    background: var(--error-color);
    color: white;
  }

  .report-button:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .report-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ── Mobile: stack columns, bottom sheet ── */

  @media (max-width: 700px) {
    .error-overlay {
      padding: 12px;
      align-items: flex-end;
    }

    .error-modal,
    .error-modal.has-params {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      max-height: min(90dvh, calc(100dvh - 24px));
    }

    .has-params .error-body {
      flex-direction: column;
    }

    .error-left {
      flex-basis: auto;
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--theme-stroke);
      max-height: none;
      padding: 16px;
    }

    .error-right {
      max-height: none;
      padding: 16px;
    }

    .error-header {
      padding: 14px 16px;
    }

    .error-actions {
      padding: 14px 16px;
      padding-bottom: max(14px, env(safe-area-inset-bottom));
    }

    .action-button {
      padding: 14px 16px;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .error-overlay {
      animation: none;
    }
    .error-modal {
      animation: none;
    }
  }
</style>
