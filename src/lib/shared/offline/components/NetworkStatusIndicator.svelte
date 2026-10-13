<!-- NetworkStatusIndicator - Shows only states the user can act on -->
<!--
  States:
  - Hidden: Online, plus any routine syncing/pending work (nothing to do about it)
  - Offline: Cloud-slash amber (no network)
  - Error: Cloud with X (sync failed)
-->
<script lang="ts">
  import { networkStatusState } from "../state/network-status-state.svelte";
  import { syncStatusState } from "../state/sync-status-state.svelte";

  interface Props {
    variant?: "desktop" | "mobile";
  }

  let { variant = "desktop" }: Props = $props();

  // Determine the display state (combines network + sync)
  type DisplayState = "hidden" | "offline" | "error";

  const displayState = $derived.by((): DisplayState => {
    if (!networkStatusState.isOnline) return "offline";
    if (syncStatusState.state === "error") return "error";
    // Routine syncing/pending is background work the user can't act on - stay quiet.
    return "hidden";
  });

  // Icon classes based on state
  const iconClass = $derived.by(() => {
    switch (displayState) {
      case "offline":
        return "fa-cloud-slash";
      case "error":
        return "fa-cloud-xmark";
      default:
        return "fa-cloud";
    }
  });

  // Status text for desktop variant (includes pending count when syncing)
  const statusText = $derived.by(() => {
    const count = syncStatusState.pendingCount;
    switch (displayState) {
      case "offline":
        return count > 0 ? `Offline (${count})` : "Offline";
      case "error":
        return "Sync Error";
      default:
        return "";
    }
  });

  // Aria label for accessibility
  const ariaLabel = $derived.by(() => {
    switch (displayState) {
      case "offline":
        return "Currently offline. Changes will sync when reconnected.";
      case "error":
        return `Sync error: ${syncStatusState.errorMessage || "Unknown error"}. Will retry.`;
      default:
        return "Connected and synced.";
    }
  });

  const shouldShow = $derived(displayState !== "hidden");
</script>

{#if shouldShow}
  <div
    class="network-status"
    class:offline={displayState === "offline"}
    class:error={displayState === "error"}
    class:mobile={variant === "mobile"}
    class:desktop={variant === "desktop"}
    role="status"
    aria-live="polite"
    aria-label={ariaLabel}
  >
    <i class="fas {iconClass}" aria-hidden="true"></i>
    {#if variant === "desktop"}
      <span class="status-text">{statusText}</span>
    {/if}
  </div>
{/if}

<style>
  .network-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  /* Offline state - amber */
  .network-status.offline {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 15%,
      var(--theme-card-bg, rgba(18, 18, 28, 0.98))
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 40%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
    color: var(--semantic-warning, #f59e0b);
  }

  .network-status.offline i {
    animation: pulse-subtle 2s ease-in-out infinite;
  }

  /* Error state - red */
  .network-status.error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      var(--theme-card-bg, rgba(18, 18, 28, 0.98))
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
    color: var(--semantic-error, #ef4444);
  }

  .network-status.error i {
    animation: shake calc(var(--duration-dramatic) + var(--duration-fast))
      var(--ease-standard);
  }

  /* Desktop variant - fixed overlay in bottom-left corner */
  /* Positioned outside layout flow to avoid shifting sidebar content */
  .network-status.desktop {
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 200;
    box-shadow: var(--theme-shadow, 0 4px 12px rgba(0, 0, 0, 0.3));
  }

  /* Mobile variant - smaller, icon-only */
  .network-status.mobile {
    padding: 4px 8px;
    border-radius: 6px;
    min-width: 32px;
    min-height: 32px;
    justify-content: center;
  }

  .status-text {
    font-weight: 500;
    white-space: nowrap;
  }

  /* Animations */
  @keyframes pulse-subtle {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-2px);
    }
    75% {
      transform: translateX(2px);
    }
  }

  /* Accessibility - reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .network-status,
    .network-status i {
      transition: none;
      animation: none;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .network-status.offline {
      background: hsl(38 92% 30%);
      border-color: hsl(38 92% 50%);
      color: white;
    }

    .network-status.error {
      background: hsl(0 84% 30%);
      border-color: hsl(0 84% 50%);
      color: white;
    }
  }
</style>
