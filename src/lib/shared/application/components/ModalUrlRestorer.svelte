<!--
  ModalUrlRestorer.svelte

  Redirects legacy ?modal=sequence URLs to the /sequence/[id] route.
  Preserves deep linking by resolving the sequence and navigating to the route.

  Legacy URL formats handled:
  - ?modal=sequence&id=seq_xxx  → /sequence/seq_xxx
  - ?modal=spotlight&id=seq_xxx → /sequence/seq_xxx

  This component should be placed at the app root level (in +layout.svelte).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

import { getDeepLinkResolver } from "#lib/shared/application/get-deep-link-resolver.js";
  import { onMount, onDestroy } from "svelte";
  import {
    getModalUrlState,
    clearModalUrlState,
  } from "../state/ui/modal-url-state.svelte";
  import type { DeepLinkError } from "../services/types";
  import { openSequenceViewer } from "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  // Error state for failed deep links
  let loadError = $state<DeepLinkError>(null);
  let isLoading = $state(false);

  // Focus management for accessibility
  let errorContainerRef = $state<HTMLDivElement | null>(null);

  // Track if we've attempted restoration
  let restorationAttempted = $state(false);

  // Focus error container when error appears (accessibility)
  $effect(() => {
    if (loadError && errorContainerRef) {
      errorContainerRef.focus();
    }
  });

  // Redirect legacy modal URLs on mount
  let redirectTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    redirectTimer = setTimeout(() => {
      redirectLegacyUrl();
    }, 100);
  });

  onDestroy(() => {
    if (redirectTimer !== null) {
      clearTimeout(redirectTimer);
    }
  });

  async function redirectLegacyUrl() {
    if (restorationAttempted) return;
    restorationAttempted = true;

    const state = getModalUrlState();

    if (!state.modal || !state.sequenceId) {
      return;
    }

    isLoading = true;
    loadError = null;

    // Resolve the sequence to cache it for the route
    const deepLinkResolver = getDeepLinkResolver();
    const result = await deepLinkResolver.resolve(state.sequenceId);

    isLoading = false;

    if (!result.sequence) {
      console.warn("[ModalUrlRestorer] Could not resolve sequence:", result.error);
      loadError = result.error;
      return;
    }

    // Clear the legacy modal URL params
    clearModalUrlState();

    // Navigate to sequence viewer (drawer on mobile, route on desktop)
    openSequenceViewer(result.sequence, {
      source: "url_restore",
      returnPath: window.location.pathname,
      returnLabel: t("action_back"),
    });
  }

  function dismissError() {
    loadError = null;
    clearModalUrlState();
  }
</script>

<!-- Loading state for deep link resolution -->
{#if isLoading}
  <div class="deep-link-overlay">
    <div class="deep-link-loading" role="status" aria-live="polite">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>{t('sequence_loading')}</p>
    </div>
  </div>
{/if}

<!-- Error state for failed deep links -->
{#if loadError}
  <div class="deep-link-overlay">
    <div
      class="deep-link-error"
      role="alert"
      aria-live="assertive"
      tabindex="-1"
      bind:this={errorContainerRef}
    >
      {#if loadError === "not_found"}
        <i class="fas fa-unlink error-icon" aria-hidden="true"></i>
        <h2>{t('sequence_not_found_title')}</h2>
        <p>{t('sequence_unavailable_private')}</p>
      {:else if loadError === "network"}
        <i class="fas fa-wifi error-icon" aria-hidden="true"></i>
        <h2>{t('connection_error_title')}</h2>
        <p>{t('connection_retry_body')}</p>
      {:else}
        <i class="fas fa-exclamation-triangle error-icon" aria-hidden="true"></i>
        <h2>{t('loading_failed_title')}</h2>
        <p>{t('sequence_load_failed_body')}</p>
      {/if}
      <button class="dismiss-button" onclick={dismissError}>
        {t('action_go_back')}
      </button>
    </div>
  </div>
{/if}

<style>
  .deep-link-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-priority);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
  }

  .deep-link-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--theme-text, #ffffff);
  }

  .deep-link-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    max-width: 320px;
    text-align: center;
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    outline: none;
  }

  .error-icon {
    font-size: 3rem;
    color: var(--semantic-error, #ef4444);
    opacity: 0.8;
  }

  .deep-link-error h2 {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
  }

  .deep-link-error p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
  }

  .dismiss-button {
    margin-top: 0.5rem;
    padding: 0.75rem 1.5rem;
    min-width: 120px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .dismiss-button:hover {
    opacity: 0.9;
  }

  .dismiss-button:active {
    opacity: 0.8;
  }
</style>
