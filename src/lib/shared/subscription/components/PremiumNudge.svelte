<script lang="ts">
  import type { NudgeConfig } from "../services/types";

  interface Props {
    nudge: NudgeConfig;
    preview?: boolean;
    onContinueWithout?: () => void;
    onDismiss?: () => void;
  }

  let {
    nudge,
    preview = false,
    onContinueWithout,
    onDismiss,
  }: Props = $props();

  function handleGoPremium() {
    window.dispatchEvent(
      new CustomEvent("navigate-module", { detail: { moduleId: "premium" } })
    );
    onDismiss?.();
  }

  function handleContinueWithout() {
    onContinueWithout?.();
    onDismiss?.();
  }
</script>

<div class="nudge-callout" role="status" aria-label="Premium feature">
  <div class="nudge-header">
    <i class="fas fa-crown nudge-icon" aria-hidden="true"></i>
    {#if preview}
      <span class="nudge-benefit">
        {nudge.premiumBenefit} - this will be a Premium feature. For now, it's on
        the house.
      </span>
    {:else}
      <span class="nudge-benefit">{nudge.premiumBenefit}</span>
    {/if}
  </div>
  {#if preview}
    <div class="nudge-actions">
      <button class="nudge-secondary" onclick={() => onDismiss?.()}
        >Got it</button
      >
    </div>
  {:else}
    <div class="nudge-actions">
      <button class="nudge-cta" onclick={handleGoPremium}>Go Premium</button>
      {#if onContinueWithout}
        <button class="nudge-secondary" onclick={handleContinueWithout}>
          Continue without
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .nudge-callout {
    --premium-gold: #fbbf24;
    --premium-gold-contrast: #1a1a2e;
    background: var(--theme-card-bg, rgba(30, 30, 45, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    padding: 0.75rem 1rem;
    max-width: 280px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    animation: nudge-in var(--duration-fast) var(--ease-standard-out);
  }

  @keyframes nudge-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nudge-callout {
      animation: none;
    }
  }

  .nudge-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
  }

  .nudge-icon {
    color: var(--premium-gold);
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .nudge-benefit {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .nudge-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .nudge-cta {
    background: var(--premium-gold);
    color: var(--premium-gold-contrast);
    border: none;
    border-radius: var(--radius-sm, 6px);
    padding: 0.375rem 0.75rem;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .nudge-cta:hover {
    opacity: 0.9;
  }

  .nudge-secondary {
    background: none;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    padding: 0.375rem 0.5rem;
  }

  .nudge-secondary:hover {
    color: var(--theme-text, #ffffff);
  }
</style>
