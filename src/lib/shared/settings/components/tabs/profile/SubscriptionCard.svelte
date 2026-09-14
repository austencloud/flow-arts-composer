<!--
  SubscriptionCard - Premium subscription management for ProfileTab
  Single $10/mo tier
-->
<script lang="ts">
  import { getSubscriptionInfo, onSubscriptionChange, createPortalSession } from "$lib/shared/subscription/services/subscription-manager";
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import type { SubscriptionInfo } from "../../../../subscription/services/types";
  import type { HapticFeedback } from "../../../../application/services/haptic-feedback";

  interface Props {
    hapticService?: HapticFeedback | null;
  }

  let { hapticService = null }: Props = $props();

  // State
  let subscriptionInfo = $state<SubscriptionInfo | null>(null);
  let isLoading = $state(false);
  let unsubscribeListener: (() => void) | null = null;

  // Computed
  const isSubscribed = $derived(
    subscriptionInfo?.status === "active" ||
      subscriptionInfo?.status === "trialing"
  );

  const formattedBillingDate = $derived(
    subscriptionInfo?.currentPeriodEnd
      ? subscriptionInfo.currentPeriodEnd.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null
  );

  onMount(async () => {
    // Initial load
    subscriptionInfo = await getSubscriptionInfo();

    // Subscribe to changes
    unsubscribeListener = onSubscriptionChange((info) => {
      subscriptionInfo = info;
    });
  });

  onDestroy(() => {
    unsubscribeListener?.();
  });

  function handleLearnMore() {
    hapticService?.trigger("selection");
    // Navigate to premium module using SvelteKit client-side routing
    goto("/#premium");
  }

  async function handleManageSubscription() {
    if (isLoading) return;

    hapticService?.trigger("selection");
    isLoading = true;

    try {
      const portalUrl = await createPortalSession();
      window.location.href = portalUrl;
    } catch (error) {
      console.error("Failed to open subscription portal:", error);
      hapticService?.trigger("error");
      isLoading = false;
    }
  }
</script>

<div class="subscription-card-content">
  {#if isSubscribed}
    <!-- Subscribed State -->
    <div class="subscribed-status">
      <div class="status-header">
        <div class="premium-badge">
          <i class="fas fa-star" aria-hidden="true"></i>
        </div>
        <div class="premium-info">
          <span class="premium-label">Flow Arts Composer Premium</span>
          <span class="premium-status">Active</span>
        </div>
        <div class="active-badge">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        </div>
      </div>

      <div class="billing-info">
        {#if subscriptionInfo?.cancelAtPeriodEnd}
          <p class="cancel-notice">
            <i class="fas fa-info-circle" aria-hidden="true"></i>
            Cancels on {formattedBillingDate}
          </p>
        {:else}
          <p>Next billing: {formattedBillingDate}</p>
        {/if}
      </div>

      <button
        class="manage-btn"
        onclick={handleManageSubscription}
        disabled={isLoading}
      >
        {#if isLoading}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-cog" aria-hidden="true"></i>
        {/if}
        <span>Manage Subscription</span>
      </button>
    </div>
  {:else}
    <!-- Not Subscribed - Show Learn More Button -->
    <button class="subscribe-btn" onclick={handleLearnMore}>
      <div class="subscribe-content">
        <i class="fas fa-crown" aria-hidden="true"></i>
        <span class="subscribe-text">Go Premium</span>
        <span class="subscribe-price">$10/mo</span>
      </div>
    </button>
  {/if}
</div>

<style>
  .subscription-card-content {
    display: flex;
    flex-direction: column;
  }

  /* Subscribe Button */
  .subscribe-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px 20px;
    min-height: var(--min-touch-target);
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      var(--theme-accent-strong) 100%
    );
    border: none;
    border-radius: 12px;
    color: white;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .subscribe-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
  }

  .subscribe-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .subscribe-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .subscribe-content {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .subscribe-content i {
    font-size: var(--font-size-base);
  }

  .subscribe-text {
    flex: 1;
  }

  .subscribe-price {
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-size: var(--font-size-compact);
  }

  /* Subscribed State */
  .subscribed-status {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .premium-badge {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      var(--theme-accent-strong) 100%
    );
    border-radius: 10px;
    color: white;
    font-size: var(--font-size-base);
    flex-shrink: 0;
  }

  .premium-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .premium-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .premium-status {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .active-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--semantic-success-dim, rgba(34, 197, 94, 0.15));
    border-radius: 50%;
    color: var(--semantic-success, #4ade80);
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  .billing-info {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .billing-info p {
    margin: 0;
  }

  .cancel-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--semantic-warning);
  }

  .manage-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .manage-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent);
  }

  .manage-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
