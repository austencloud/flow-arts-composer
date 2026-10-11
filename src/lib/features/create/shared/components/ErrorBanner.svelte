<!--
	ErrorBanner.svelte

	A reusable error banner component extracted from ConstructTab.
	Displays error messages with dismiss and optional retry actions.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  const {
    message,
    onDismiss,
    onRetry,
  }: {
    message: string;
    onDismiss?: () => void;
    onRetry?: () => void;
  } = $props();

  function handleDismiss() {
    onDismiss?.();
  }

  function handleRetry() {
    onRetry?.();
  }
</script>

<div class="error-banner" data-testid="error-banner">
  <p>❌ {message}</p>
  <div class="actions">
    {#if onRetry}
      <button type="button" class="retry" onclick={handleRetry}
        >{t("action_retry")}</button
      >
    {/if}
    <button type="button" onclick={handleDismiss}
      >{t("create_ui_dismiss")}</button
    >
  </div>
</div>

<style>
  .error-banner {
    flex-shrink: 0;
    background: var(--destructive) / 10;
    color: var(--destructive);
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--destructive) / 20;
  }

  .error-banner p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    gap: var(--spacing-xs);
  }

  .error-banner button {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--destructive);
    color: var(--destructive-foreground);
    border: none;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font-size: var(--font-size-xs);
  }

  .error-banner button:hover {
    opacity: 0.9;
  }

  .error-banner button:focus-visible {
    outline: 2px solid var(--destructive-foreground, #ffffff);
    outline-offset: 2px;
  }

  .retry {
    background: transparent;
    color: var(--destructive);
    border: 1px solid currentColor;
  }
</style>
