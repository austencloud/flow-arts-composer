<!--
  QuickShareRow.svelte

  Always-visible quick share actions with Copy as the primary action.
  Used in SequencePanel and anywhere else quick sharing is needed.

  Features:
  - Copy (primary, highlighted)
  - Download
  - Native Share (if available)
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    isCopying?: boolean;
    copySuccess?: boolean;
    canNativeShare?: boolean;
    compact?: boolean;
    disabled?: boolean;
    onCopy?: () => void;
    onDownload?: () => void;
    onNativeShare?: () => void;
  }

  const {
    isCopying = false,
    copySuccess = false,
    canNativeShare = false,
    compact = false,
    disabled = false,
    onCopy = () => {},
    onDownload = () => {},
    onNativeShare = () => {},
  }: Props = $props();
</script>

<div class="quick-share-row" class:compact class:disabled>
  <!-- Copy - Primary action -->
  <button
    type="button"
    class="share-btn primary"
    class:success={copySuccess}
    onclick={onCopy}
    disabled={isCopying || disabled}
    aria-label={t("browse_copy_to_clipboard")}
  >
    {#if isCopying}
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    {:else if copySuccess}
      <i class="fas fa-check" aria-hidden="true"></i>
    {:else}
      <i class="fas fa-copy" aria-hidden="true"></i>
    {/if}
    <span
      >{copySuccess ? t("browse_copied") : disabled ? t("viewer_ui_preparing_link") : t("browse_copy")}</span
    >
  </button>

  <!-- Download -->
  <button
    type="button"
    class="share-btn"
    onclick={onDownload}
    {disabled}
    aria-label={t("browse_download_image")}
  >
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>{t("browse_download")}</span>
  </button>

  <!-- Native Share (if available) -->
  {#if canNativeShare}
    <button
      type="button"
      class="share-btn"
      onclick={onNativeShare}
      {disabled}
      aria-label={t("viewer_ui_share_externally")}
    >
      <i class="fas fa-share-alt" aria-hidden="true"></i>
      <span>{t("viewer_share")}</span>
    </button>
  {/if}
</div>

<style>
  .quick-share-row {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    flex-shrink: 0;
    margin: 0 16px;
  }

  .quick-share-row.compact {
    padding: 8px 12px;
    gap: 8px;
    margin: 0;
  }

  .share-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 24px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
  }

  .share-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-accent, #6366f1);
  }

  .share-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .share-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Primary button (Copy) */
  .share-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border-color: var(--theme-accent, #6366f1);
  }

  .share-btn.primary:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 30%,
      transparent
    );
  }

  /* Success state */
  .share-btn.success {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    border-color: var(--semantic-success, #22c55e);
    color: var(--semantic-success, #22c55e);
  }

  .share-btn i {
    font-size: 16px;
  }

  /* Compact variant */
  .quick-share-row.compact .share-btn {
    padding: 10px 14px;
    min-height: 44px;
    font-size: var(--font-size-compact, 12px);
    gap: 6px;
  }

  .quick-share-row.compact .share-btn i {
    font-size: 14px;
  }

  /* Mobile: horizontal scroll */
  @media (max-width: 400px) {
    .quick-share-row {
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
    }

    .share-btn {
      flex-shrink: 0;
      min-width: 100px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .share-btn {
      transition: none;
    }

    .share-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
