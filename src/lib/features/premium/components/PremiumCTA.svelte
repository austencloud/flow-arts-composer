<!--
  PremiumCTA - Call to action with price and subscribe button
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    price: number;
    period: string;
    isLoading?: boolean;
    disabled?: boolean;
    onSubscribe: () => void;
  }

  let {
    price,
    period,
    isLoading = false,
    disabled = false,
    onSubscribe,
  }: Props = $props();
</script>

<div class="cta">
  <div class="price-display">
    <span class="amount">{t('premium_cta_price_amount', { price })}</span>
    <span class="period">{t('premium_cta_price_period', { period })}</span>
  </div>
  <button
    class="subscribe-button"
    onclick={onSubscribe}
    disabled={isLoading || disabled}
  >
    {#if isLoading}
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{t('premium_cta_processing')}</span>
    {:else}
      <i class="fas fa-unlock" aria-hidden="true"></i>
      <span>{t('premium_cta_unlock')}</span>
    {/if}
  </button>
  <p class="note">{t('premium_cta_cancel_note')}</p>
</div>

<style>
  .cta {
    text-align: center;
    padding: var(--spacing-xl, 32px) var(--spacing-lg, 24px);
    background: var(
      --gradient-primary,
      linear-gradient(
        135deg,
        var(--theme-accent) 0%,
        var(--theme-accent-strong) 100%
      )
    );
    border-radius: 16px;
  }

  .price-display {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--spacing-xs, 4px);
    margin-bottom: var(--spacing-lg, 24px);
  }

  .amount {
    font-size: clamp(48px, 8vw, 64px);
    font-weight: 700;
    color: white;
    line-height: 1;
  }

  .period {
    font-size: clamp(18px, 3vw, 24px);
    color: rgba(255, 255, 255, 0.8);
  }

  .subscribe-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 16px) var(--spacing-2xl, 48px);
    min-height: var(--min-touch-target, 48px);
    background: white;
    color: var(--theme-accent);
    border: none;
    border-radius: 12px;
    font-size: var(--font-size-lg);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast, var(--duration-fast) ease);
    margin-bottom: var(--spacing-md, 16px);
  }

  .subscribe-button:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  .subscribe-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .subscribe-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .subscribe-button {
      transition: none;
    }

    .subscribe-button:hover:not(:disabled),
    .subscribe-button:active:not(:disabled) {
      transform: none;
    }
  }

  .note {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    margin: 0;
  }
</style>
