<script lang="ts">
  /**
   * FeatureFlagManagement
   * Main entry point for the 2026-level feature flag management UI
   *
   * Features:
   * - Permission Matrix for global settings (Features x Roles)
   * - User Override Editor with 3-state toggles
   * - Live effective permissions preview
   * - Quick presets for common permission bundles
   * - Impact summary before saving changes
   */

  import { featureFlagService, featureFlagState } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import FeatureFlagHeader from "./feature-flags/FeatureFlagHeader.svelte";
  import PermissionMatrix from "./feature-flags/global-settings/PermissionMatrix.svelte";
  import UserOverrides from "./feature-flags/user-overrides/UserOverrides.svelte";
  import { computeStats } from "./feature-flags/shared/feature-utils";

  let viewMode = $state<"global" | "users">("global");
  let errorMessage = $state<string | null>(null);

  // Compute stats from feature configs - track flagsVersion for cross-component reactivity
  const stats = $derived.by(() => {
    const _version = featureFlagState.flagsVersion;
    return computeStats(featureFlagService.featureConfigs);
  });

  function handleViewModeChange(mode: "global" | "users") {
    viewMode = mode;
    errorMessage = null;
  }

  function handleError(message: string) {
    errorMessage = message;
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (errorMessage === message) {
        errorMessage = null;
      }
    }, 5000);
  }
</script>

<div class="feature-flag-management">
  <FeatureFlagHeader
    {viewMode}
    {stats}
    onViewModeChange={handleViewModeChange}
  />

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>{errorMessage}</span>
      <button
        type="button"
        onclick={() => (errorMessage = null)}
        aria-label="Dismiss error"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  <div class="content-area">
    {#if viewMode === "global"}
      <PermissionMatrix onError={handleError} />
    {:else}
      <UserOverrides onError={handleError} />
    {/if}
  </div>
</div>

<style>
  .feature-flag-management {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
    color: var(--theme-text, #ffffff);
    overflow: hidden;
    container-type: inline-size;
    container-name: feature-flags;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    font-size: var(--font-size-sm, 14px);
    animation: slideDown var(--duration-normal) ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .error-banner i:first-child {
    color: #f87171;
    font-size: 16px;
  }

  .error-banner span {
    flex: 1;
  }

  .error-banner button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    transition: all var(--duration-fast) ease;
  }

  .error-banner button:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }

  .content-area {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .error-banner {
      animation: none;
    }
  }
</style>
