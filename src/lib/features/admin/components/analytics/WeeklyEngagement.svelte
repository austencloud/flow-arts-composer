<script lang="ts">
  /**
   * WeeklyEngagement.svelte
   *
   * Shows key user metrics from cached SystemState data.
   * No additional Firebase queries - uses the 2-min cached user data.
   *
   * Accessibility: WCAG AAA compliant
   */
  import { onMount } from "svelte";
  import { getSystemStateManager } from "#lib/features/admin/get-system-state-manager.js";
  import type {
    AdminUserAccountSummary,
    CachedUserMetadata,
  } from "../../services/types";
  import type { SystemStateManager } from "../../services/system-state-manager";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  let isLoading = $state(true);
  let loadError = $state(false);
  let users = $state<CachedUserMetadata[]>([]);
  let accountSummary = $state<AdminUserAccountSummary | null>(null);
  let cacheAge = $state<string>("");

  // Calculate date boundary
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Metrics derived from user data
  const metrics = $derived(() => {
    // Real accounts only — exclude un-upgraded anonymous guest sessions.
    const realUsers = users.filter((u) => !u.isAnonymous);
    const totalUsers = accountSummary?.registeredAccounts ?? realUsers.length;

    // New users this week
    const newThisWeek = realUsers.filter(
      (u) => u.createdAt && u.createdAt >= weekAgo
    ).length;

    // Active users this week
    const activeThisWeek = realUsers.filter(
      (u) => u.lastActivityDate && u.lastActivityDate >= weekAgo
    ).length;

    return {
      totalUsers,
      newThisWeek,
      activeThisWeek,
      registeredProfiles:
        accountSummary?.registeredProfiles ?? realUsers.length,
      missingProfiles: accountSummary?.missingRegisteredProfiles ?? null,
    };
  });

  async function loadStats() {
    isLoading = true;
    loadError = false;
    try {
      const systemStateService = getSystemStateManager();
      const state = await systemStateService.getSystemState();
      users = state.users;
      accountSummary = state.accountSummary;

      // Show cache age
      const ageMs = Date.now() - state.loadedAt;
      if (ageMs < 60000) {
        cacheAge = "just now";
      } else {
        cacheAge = `${Math.round(ageMs / 60000)}m ago`;
      }
    } catch (error) {
      console.error("Failed to load system state:", error);
      loadError = true;
      toast.error("Failed to load quick stats.");
    } finally {
      isLoading = false;
    }
  }

  onMount(loadStats);
</script>

<section class="section" aria-labelledby="stats-title">
  <header class="section-header">
    <h3 id="stats-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      Quick Stats
    </h3>
    {#if cacheAge}
      <span class="cache-indicator" title="Data cached from SystemState">
        <i class="fas fa-database" aria-hidden="true"></i>
        <span class="sr-only">{t("admin_data_loaded")}</span>
        {cacheAge}
      </span>
    {/if}
  </header>

  <div aria-live="polite" aria-busy={isLoading}>
    {#if isLoading}
      <div class="metrics-grid" role="status">
        <span class="sr-only">{t("loading_stats")}</span>
        {#each Array(3) as _}
          <div class="metric-card skeleton" aria-hidden="true">
            <div class="skeleton-value"></div>
            <div class="skeleton-label"></div>
          </div>
        {/each}
      </div>
    {:else if loadError}
      <div class="error-state" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <p>Couldn't load stats.</p>
        <button class="retry-button" onclick={loadStats}>
          <i class="fas fa-rotate-right" aria-hidden="true"></i>
          Retry
        </button>
      </div>
    {:else}
      <div class="metrics-grid" role="list" aria-label="User statistics">
        <div class="metric-card" role="listitem">
          <div class="metric-value" aria-hidden="true">
            {metrics().totalUsers}
          </div>
          <div class="metric-label">{t("admin_total_users")}</div>
          <div class="metric-detail">
            {metrics().registeredProfiles} profiles
            {#if metrics().missingProfiles === null}
              · Auth count unavailable
            {:else}
              · {metrics().missingProfiles} missing
            {/if}
          </div>
          <span class="sr-only">
            {metrics().totalUsers} total registered users.
            {metrics().registeredProfiles} profiles.
            {#if metrics().missingProfiles === null}
              The Firebase Auth count is unavailable.
            {:else}
              {metrics().missingProfiles} registered users are missing profiles.
            {/if}
          </span>
        </div>

        <div class="metric-card" role="listitem">
          <div class="metric-value" aria-hidden="true">
            {metrics().activeThisWeek}
          </div>
          <div class="metric-label">{t("admin_active_this_week")}</div>
          <span class="sr-only">
            {metrics().activeThisWeek} users active this week
          </span>
        </div>

        <div class="metric-card" role="listitem">
          <div class="metric-value" aria-hidden="true">
            {metrics().newThisWeek}
          </div>
          <div class="metric-label">{t("admin_new_this_week")}</div>
          <span class="sr-only">
            {metrics().newThisWeek} new users this week
          </span>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .section {
    background: var(--theme-card-bg);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--theme-stroke);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-header h3 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text);
  }

  .section-header h3 i {
    color: var(--theme-text-dim);
  }

  .cache-indicator {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .metric-card {
    background: var(--theme-panel-bg);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }

  .metric-value {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--theme-text, white);
    line-height: 1;
    margin-bottom: 6px;
  }

  .metric-label {
    font-size: var(--font-size-min);
    font-weight: 500;
    color: var(--theme-text);
  }

  .metric-detail {
    margin-top: 4px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 16px;
    text-align: center;
    color: var(--theme-text);
  }

  .error-state i {
    font-size: var(--font-size-2xl, 1.5rem);
    color: var(--semantic-error, #ef4444);
  }

  .error-state p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background var(--duration-fast, 0.15s) ease;
  }

  .retry-button:hover {
    background: var(--theme-card-bg);
  }

  /* Skeleton loading */
  .metric-card.skeleton {
    background: var(--theme-panel-bg);
  }

  .skeleton-value {
    width: 48px;
    height: 28px;
    background: var(--theme-stroke);
    border-radius: 4px;
    margin: 0 auto 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-label {
    width: 80px;
    height: 14px;
    background: var(--theme-stroke);
    border-radius: 3px;
    margin: 0 auto;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @media (max-width: 500px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-value,
    .skeleton-label {
      animation: none;
    }

    .retry-button {
      transition: none;
    }
  }
</style>
