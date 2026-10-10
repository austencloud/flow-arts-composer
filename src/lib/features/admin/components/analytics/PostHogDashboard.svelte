<script lang="ts">
  /**
   * PostHog Analytics Dashboard
   *
   * Admin dashboard showing PostHog analytics with:
   * - Quick summary cards (from cached user data)
   * - User segment breakdown
   * - Links to full PostHog dashboards (retention, insights, replay, etc.)
   *
   * This is a hybrid approach: simple metrics are calculated locally,
   * complex visualizations link to PostHog's native UI.
   */

  import { onMount } from "svelte";
  import { getPostHogAnalyticsProvider } from "#lib/features/admin/get-post-hog-analytics-provider.js";
  import { getSystemStateManager } from "#lib/features/admin/get-system-state-manager.js";
  import type { CachedUserMetadata } from "../../services/types";
  import type { SystemStateManager } from "../../services/system-state-manager";
  import type { PostHogAnalyticsProvider } from "../../services/post-hog-analytics-provider";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  // PostHog project ID for dashboard links
  const POSTHOG_PROJECT_ID = "299320";
  const POSTHOG_BASE_URL = `https://us.posthog.com/project/${POSTHOG_PROJECT_ID}`;

  // State
  let isLoading = $state(true);
  let loadError = $state(false);
  let postHogAvailable = $state(false);
  let cacheAge = $state<string>("");

  // Metrics from cached user data
  let totalUsers = $state(0);
  let activeUsers7d = $state(0);
  let newUsers7d = $state(0);
  let activeUsers30d = $state(0);

  // User segments (calculated from behavior)
  let segments = $state({
    creators: 0,
    browsers: 0,
    learners: 0,
    inactive: 0,
  });

  // Date boundaries
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Dashboard links
  const dashboardLinks = [
    {
      id: "insights",
      label: "Product Insights",
      description: "Event trends, funnels, and user flows",
      icon: "fa-chart-line",
      url: `${POSTHOG_BASE_URL}/insights`,
      color: "#3b82f6",
    },
    {
      id: "retention",
      label: "Retention",
      description: "User retention cohort analysis",
      icon: "fa-users-line",
      url: `${POSTHOG_BASE_URL}/retention`,
      color: "#22c55e",
    },
    {
      id: "replay",
      label: "Session Replay",
      description: "Watch recorded user sessions",
      icon: "fa-video",
      url: `${POSTHOG_BASE_URL}/replay/recent`,
      color: "#8b5cf6",
    },
    {
      id: "persons",
      label: "Persons",
      description: "Individual user profiles and history",
      icon: "fa-user-circle",
      url: `${POSTHOG_BASE_URL}/persons`,
      color: "#f59e0b",
    },
    {
      id: "events",
      label: "Events",
      description: "Raw event stream and activity log",
      icon: "fa-stream",
      url: `${POSTHOG_BASE_URL}/events`,
      color: "#06b6d4",
    },
    {
      id: "feature-flags",
      label: "Feature Flags",
      description: "Manage feature rollouts",
      icon: "fa-flag",
      url: `${POSTHOG_BASE_URL}/feature_flags`,
      color: "#ec4899",
    },
  ];

  async function loadAnalytics() {
    isLoading = true;
    loadError = false;
    try {
      // Check PostHog availability
      const analyticsProvider = getPostHogAnalyticsProvider();
      postHogAvailable = analyticsProvider.isAvailable();

      // Load user data from cached system state
      const systemStateService = getSystemStateManager();
      const state = await systemStateService.getSystemState();
      const users: CachedUserMetadata[] = state.users;

      // Calculate basic metrics
      totalUsers = users.length;
      newUsers7d = users.filter(
        (u: CachedUserMetadata) => u.createdAt && u.createdAt >= weekAgo
      ).length;
      activeUsers7d = users.filter(
        (u: CachedUserMetadata) =>
          u.lastActivityDate && u.lastActivityDate >= weekAgo
      ).length;
      activeUsers30d = users.filter(
        (u: CachedUserMetadata) =>
          u.lastActivityDate && u.lastActivityDate >= monthAgo
      ).length;

      // Calculate user segments
      // Note: These are approximations based on available cached data
      // Full segment analysis would require PostHog API queries
      const activeRecently = users.filter(
        (u: CachedUserMetadata) =>
          u.lastActivityDate && u.lastActivityDate >= monthAgo
      );

      // Rough segment estimates:
      // Creators: users with sequences (we'd need sequence data for real count)
      // For now, estimate based on activity patterns
      const potentialCreators = activeRecently.filter(
        (u: CachedUserMetadata) => u.role === "creator" || u.role === "admin"
      );
      const potentialLearners = activeRecently.filter(
        (u: CachedUserMetadata) =>
          u.lastActivityDate &&
          u.createdAt &&
          u.lastActivityDate.getTime() - u.createdAt.getTime() <
            14 * 24 * 60 * 60 * 1000
      );
      const inactiveUsers = users.filter(
        (u: CachedUserMetadata) =>
          !u.lastActivityDate || u.lastActivityDate < monthAgo
      );

      segments = {
        creators: potentialCreators.length,
        browsers: activeRecently.length - potentialCreators.length,
        learners: potentialLearners.length,
        inactive: inactiveUsers.length,
      };

      // Show cache age
      const ageMs = Date.now() - state.loadedAt;
      if (ageMs < 60000) {
        cacheAge = "just now";
      } else {
        cacheAge = `${Math.round(ageMs / 60000)}m ago`;
      }
    } catch (error) {
      console.error("Failed to load analytics data:", error);
      loadError = true;
      toast.error("Failed to load analytics data.");
    } finally {
      isLoading = false;
    }
  }

  onMount(loadAnalytics);

  function formatNumber(num: number): string {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }
</script>

<div class="posthog-dashboard">
  <header class="dashboard-header">
    <div class="header-content">
      <h2>
        <i class="fas fa-chart-pie" aria-hidden="true"></i>
        PostHog Analytics
      </h2>
      <span class="beta-badge">PostHog</span>
    </div>
    {#if cacheAge}
      <span class="cache-indicator" title="Data from SystemState cache">
        <i class="fas fa-database" aria-hidden="true"></i>
        {cacheAge}
      </span>
    {/if}
  </header>

  {#if isLoading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>Loading analytics...</p>
    </div>
  {:else if loadError}
    <div class="error-state" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <p>Couldn't load analytics data.</p>
      <button class="retry-button" onclick={loadAnalytics}>
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        Retry
      </button>
    </div>
  {:else}
    <!-- Quick Stats -->
    <section class="section" aria-labelledby="quick-stats-title">
      <h3 id="quick-stats-title" class="section-title">
        <i class="fas fa-bolt" aria-hidden="true"></i>
        Quick Stats
      </h3>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">{formatNumber(totalUsers)}</div>
          <div class="metric-label">Total Users</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{formatNumber(activeUsers7d)}</div>
          <div class="metric-label">Active (7d)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{formatNumber(activeUsers30d)}</div>
          <div class="metric-label">Active (30d)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{formatNumber(newUsers7d)}</div>
          <div class="metric-label">New (7d)</div>
        </div>
      </div>
    </section>

    <!-- User Segments -->
    <section class="section" aria-labelledby="segments-title">
      <h3 id="segments-title" class="section-title">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        User Segments
        <span class="section-subtitle">(estimated from cached data)</span>
      </h3>
      <div class="segments-grid">
        <div class="segment-card creators">
          <div class="segment-icon">
            <i class="fas fa-hammer" aria-hidden="true"></i>
          </div>
          <div class="segment-content">
            <div class="segment-value">{segments.creators}</div>
            <div class="segment-label">Creators</div>
            <div class="segment-desc">Admin/creator roles</div>
          </div>
        </div>

        <div class="segment-card browsers">
          <div class="segment-icon">
            <i class="fas fa-eye" aria-hidden="true"></i>
          </div>
          <div class="segment-content">
            <div class="segment-value">{segments.browsers}</div>
            <div class="segment-label">Browsers</div>
            <div class="segment-desc">Active non-creators</div>
          </div>
        </div>

        <div class="segment-card learners">
          <div class="segment-icon">
            <i class="fas fa-graduation-cap" aria-hidden="true"></i>
          </div>
          <div class="segment-content">
            <div class="segment-value">{segments.learners}</div>
            <div class="segment-label">New Learners</div>
            <div class="segment-desc">Joined in last 2 weeks</div>
          </div>
        </div>

        <div class="segment-card inactive">
          <div class="segment-icon">
            <i class="fas fa-moon" aria-hidden="true"></i>
          </div>
          <div class="segment-content">
            <div class="segment-value">{segments.inactive}</div>
            <div class="segment-label">Inactive</div>
            <div class="segment-desc">No activity in 30d</div>
          </div>
        </div>
      </div>
    </section>

    <!-- PostHog Dashboard Links -->
    <section class="section" aria-labelledby="dashboards-title">
      <h3 id="dashboards-title" class="section-title">
        <i class="fas fa-external-link-alt" aria-hidden="true"></i>
        PostHog Dashboards
      </h3>
      <p class="section-desc">
        Click to open detailed analytics in PostHog's full-featured dashboard.
      </p>
      <div class="links-grid">
        {#each dashboardLinks as link}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="dashboard-link"
            style="--link-color: {link.color}"
          >
            <div class="link-icon">
              <i class="fas {link.icon}" aria-hidden="true"></i>
            </div>
            <div class="link-content">
              <div class="link-label">{link.label}</div>
              <div class="link-desc">{link.description}</div>
            </div>
            <i class="fas fa-arrow-right link-arrow" aria-hidden="true"></i>
          </a>
        {/each}
      </div>
    </section>

    <!-- PostHog Status -->
    <section class="section status-section">
      <div class="status-indicator" class:available={postHogAvailable}>
        <i
          class="fas {postHogAvailable ? 'fa-check-circle' : 'fa-exclamation-circle'}"
          aria-hidden="true"
        ></i>
        <span>
          PostHog {postHogAvailable ? "Connected" : "Not Available"}
        </span>
      </div>
      <p class="status-note">
        {#if postHogAvailable}
          Analytics events are being captured and sent to PostHog.
        {:else}
          PostHog is not initialized. Check environment configuration.
        {/if}
      </p>
    </section>
  {/if}
</div>

<style>
  .posthog-dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .dashboard-header h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dashboard-header h2 i {
    color: #f97316;
  }

  .beta-badge {
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cache-indicator {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 16px;
    color: var(--theme-text-dim);
  }

  .loading-state i {
    font-size: 2.5rem;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 16px;
    text-align: center;
    color: var(--theme-text);
  }

  .error-state i {
    font-size: 2.5rem;
    color: var(--semantic-error, #ef4444);
  }

  .error-state p {
    margin: 0;
    color: var(--theme-text-dim);
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
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

  @media (prefers-reduced-motion: reduce) {
    .retry-button {
      transition: none;
    }
  }

  /* Sections */
  .section {
    background: var(--theme-card-bg);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--theme-stroke);
  }

  .section-title {
    margin: 0 0 16px 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title i {
    color: var(--theme-text-dim);
  }

  .section-subtitle {
    font-size: var(--font-size-compact);
    font-weight: 400;
    color: var(--theme-text-dim);
  }

  .section-desc {
    margin: 0 0 16px 0;
    font-size: var(--font-size-min);
    color: var(--theme-text-dim);
  }

  /* Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
    color: var(--theme-text);
    line-height: 1;
    margin-bottom: 6px;
  }

  .metric-label {
    font-size: var(--font-size-min);
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  /* Segments Grid */
  .segments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .segment-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--theme-panel-bg);
    border-radius: 10px;
    padding: 16px;
    border-left: 4px solid var(--segment-color, var(--theme-accent));
  }

  .segment-card.creators {
    --segment-color: #3b82f6;
  }
  .segment-card.browsers {
    --segment-color: #22c55e;
  }
  .segment-card.learners {
    --segment-color: #f59e0b;
  }
  .segment-card.inactive {
    --segment-color: #64748b;
  }

  .segment-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--segment-color) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .segment-icon i {
    font-size: 1.1rem;
    color: var(--segment-color);
  }

  .segment-content {
    flex: 1;
    min-width: 0;
  }

  .segment-value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--theme-text);
    line-height: 1;
  }

  .segment-label {
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text);
    margin-top: 4px;
  }

  .segment-desc {
    font-size: var(--font-size-xs);
    color: var(--theme-text-dim);
    margin-top: 2px;
  }

  /* Dashboard Links */
  .links-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
  }

  .dashboard-link {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    background: var(--theme-panel-bg);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .dashboard-link:hover {
    border-color: var(--link-color, var(--theme-accent));
    background: color-mix(in srgb, var(--link-color) 8%, var(--theme-panel-bg));
  }

  .link-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--link-color) 15%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .link-icon i {
    font-size: 1.2rem;
    color: var(--link-color);
  }

  .link-content {
    flex: 1;
    min-width: 0;
  }

  .link-label {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .link-desc {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    margin-top: 2px;
  }

  .link-arrow {
    color: var(--theme-text-dim);
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .dashboard-link:hover .link-arrow {
    opacity: 1;
    transform: translateX(4px);
  }

  /* Status Section */
  .status-section {
    background: transparent;
    border: 1px dashed var(--theme-stroke);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .status-indicator.available {
    color: #22c55e;
  }

  .status-indicator i {
    font-size: 1.1rem;
  }

  .status-note {
    margin: 8px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .posthog-dashboard {
      padding: 16px;
      gap: 16px;
    }

    .dashboard-header h2 {
      font-size: var(--font-size-xl);
    }

    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .segments-grid {
      grid-template-columns: 1fr;
    }

    .links-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 400px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
