<script lang="ts">
  /**
   * Admin Dashboard
   *
   * Main admin interface for managing TKA system
   */

  import UsersDashboard from "./UsersDashboard.svelte";
  import FeatureFlagManagement from "./FeatureFlagManagement.svelte";
  import AnnouncementManagement from "./AnnouncementManagement.svelte";
  import ShameQueuePanel from "./ShameQueuePanel.svelte";
  import ArtifactPublicationQueuePanel from "./ArtifactPublicationQueuePanel.svelte";
  import ModerationModule from "#lib/features/moderation/ModerationModule.svelte";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

  // Lazy load PostHog Analytics Dashboard
  let PostHogDashboard: typeof import("./analytics/PostHogDashboard.svelte").default | null =
    $state(null);
  let postHogError = $state(false);

  let SeoCommandCenter: typeof import("./seo/SeoCommandCenter.svelte").default | null =
    $state(null);
  let seoError = $state(false);

  // Lazy load Pulse Dashboard (live visitor activity)
  let PulseDashboard: typeof import("./pulse/PulseDashboard.svelte").default | null =
    $state(null);
  let pulseError = $state(false);

  function loadPostHog() {
    postHogError = false;
    import("./analytics/PostHogDashboard.svelte")
      .then((mod) => {
        PostHogDashboard = mod.default;
      })
      .catch((err) => {
        console.error("Failed to load PostHog Dashboard:", err);
        postHogError = true;
      });
  }

  function loadSeo() {
    seoError = false;
    import("./seo/SeoCommandCenter.svelte")
      .then((mod) => {
        SeoCommandCenter = mod.default;
      })
      .catch((err) => {
        console.error("Failed to load SEO Command Center:", err);
        seoError = true;
      });
  }

  function loadPulse() {
    pulseError = false;
    import("./pulse/PulseDashboard.svelte")
      .then((mod) => {
        PulseDashboard = mod.default;
      })
      .catch((err) => {
        console.error("Failed to load Pulse Dashboard:", err);
        pulseError = true;
      });
  }

  $effect(() => {
    if (activeSection === "analytics" && !PostHogDashboard && !postHogError) {
      loadPostHog();
    }

    if (activeSection === "seo" && !SeoCommandCenter && !seoError) {
      loadSeo();
    }

    if ((!activeSection || activeSection === "pulse") && !PulseDashboard && !pulseError) {
      loadPulse();
    }
  });

  // State
  let isLoading = $state(false);

  // Get current section from navigation coordinator
  const activeSection = $derived(navigationState.currentSection);
</script>

<div class="admin-dashboard">
  {#if isLoading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>Loading admin tools...</p>
    </div>
  {:else}
    <!-- Content Area -->
    <main class="admin-content themed-scrollbar">
      {#if !activeSection || activeSection === "pulse"}
        <div id="pulse-panel" role="tabpanel" aria-labelledby="pulse-tab">
          {#if PulseDashboard}
            <PulseDashboard />
          {:else if pulseError}
            <div class="error-state" role="alert">
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <p>Failed to load Pulse.</p>
              <button class="retry-button" onclick={loadPulse}>
                <i class="fas fa-rotate-right" aria-hidden="true"></i>
                Retry
              </button>
            </div>
          {:else}
            <div class="loading-state">
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <p>Loading Pulse...</p>
            </div>
          {/if}
        </div>
      {:else if activeSection === "users"}
        <div
          id="users-panel"
          role="tabpanel"
          aria-labelledby="users-tab"
        >
          <UsersDashboard />
        </div>
      {:else if activeSection === "flags"}
        <div id="flags-panel" role="tabpanel" aria-labelledby="flags-tab">
          <FeatureFlagManagement />
        </div>
      {:else if activeSection === "announcements"}
        <div
          id="announcements-panel"
          role="tabpanel"
          aria-labelledby="announcements-tab"
        >
          <AnnouncementManagement />
        </div>
      {:else if activeSection === "hall-of-shame"}
        <div
          id="hall-of-shame-panel"
          role="tabpanel"
          aria-labelledby="hall-of-shame-tab"
        >
          <ShameQueuePanel />
        </div>
      {:else if activeSection === "moderation"}
        <div
          id="moderation-panel"
          role="tabpanel"
          aria-labelledby="moderation-tab"
        >
          <ModerationModule />
        </div>
      {:else if activeSection === "publications"}
        <div
          id="publications-panel"
          role="tabpanel"
          aria-labelledby="publications-tab"
        >
          <ArtifactPublicationQueuePanel />
        </div>
      {:else if activeSection === "analytics"}
        <div
          id="analytics-panel"
          role="tabpanel"
          aria-labelledby="analytics-tab"
        >
          {#if PostHogDashboard}
            <PostHogDashboard />
          {:else if postHogError}
            <div class="error-state" role="alert">
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <p>Failed to load Analytics.</p>
              <button class="retry-button" onclick={loadPostHog}>
                <i class="fas fa-rotate-right" aria-hidden="true"></i>
                Retry
              </button>
            </div>
          {:else}
            <div class="loading-state">
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <p>Loading Analytics...</p>
            </div>
          {/if}
        </div>
      {:else if activeSection === "seo"}
        <div id="seo-panel" role="tabpanel" aria-labelledby="seo-tab">
          {#if SeoCommandCenter}
            <SeoCommandCenter />
          {:else if seoError}
            <div class="error-state" role="alert">
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <p>Failed to load SEO Command Center.</p>
              <button class="retry-button" onclick={loadSeo}>
                <i class="fas fa-rotate-right" aria-hidden="true"></i>
                Retry
              </button>
            </div>
          {:else}
            <div class="loading-state">
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <p>Loading SEO evidence...</p>
            </div>
          {/if}
        </div>
      {/if}
    </main>
  {/if}
</div>

<style>
  .admin-dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
    color: var(--text-color, #ffffff);
    overflow: hidden;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    font-size: 1.2rem;
    opacity: 0.7;
  }

  .loading-state i {
    font-size: 3rem;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    text-align: center;
    color: var(--theme-text, #ffffff);
  }

  .error-state i {
    font-size: 3rem;
    color: var(--semantic-error, #ef4444);
  }

  .error-state p {
    margin: 0;
    font-size: 1.1rem;
    opacity: 0.85;
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-base, 1rem);
    cursor: pointer;
    transition: background var(--duration-fast, 0.15s) ease;
  }

  .retry-button:hover {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 10%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .retry-button {
      transition: none;
    }
  }

  /* Content Area */
  .admin-content {
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    overflow-y: auto;
  }

  /* Tab panels need to fill available height */
  .admin-content > [role="tabpanel"] {
    min-height: min-content;
  }

  /* The SEO command center owns its responsive grid and uses wide screens. */
  .admin-content:has(#seo-panel) {
    max-width: none;
    overflow: hidden;
  }

  /* Moderation dashboard is a full-height master/detail layout */
  #moderation-panel {
    height: 100%;
  }

  /* Pulse manages its own internal scroll */
  #pulse-panel {
    height: 100%;
  }

  #seo-panel {
    height: 100%;
  }
</style>
