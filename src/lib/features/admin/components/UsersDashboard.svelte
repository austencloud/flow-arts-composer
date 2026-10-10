<script lang="ts">
  /**
   * UsersDashboard
   *
   * User management view for admin users.
   * Two sections: Weekly Engagement + Active Users
   *
   * Uses SystemStateManager cached data - no wasteful Firebase queries.
   */
  import WeeklyEngagement from "./analytics/WeeklyEngagement.svelte";
  import ActiveUsersPanel from "./ActiveUsersPanel.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<main class="users-dashboard" aria-label={t("admin_users_overview")}>
  <header class="dashboard-header">
    <h2>{t("admin_users_overview")}</h2>
  </header>

  <WeeklyEngagement />

  <section class="active-users-section" aria-label={t("admin_active_users")}>
    <ActiveUsersPanel />
  </section>
</main>

<style>
  .users-dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
    color: var(--theme-text);
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dashboard-header h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--theme-text);
  }

  .active-users-section {
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    min-height: 400px;
    overflow: hidden;
  }

  /* Themed scrollbar */
  .users-dashboard :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }

  .users-dashboard :global(::-webkit-scrollbar-track) {
    background: var(--scrollbar-track);
  }

  .users-dashboard :global(::-webkit-scrollbar-thumb) {
    background: var(--scrollbar-accent);
    border-radius: 3px;
  }

  .users-dashboard :global(::-webkit-scrollbar-thumb:hover) {
    background: var(--scrollbar-accent-hover);
  }

  @media (max-width: 768px) {
    .users-dashboard {
      padding: 16px;
      gap: 16px;
    }

    .dashboard-header h2 {
      font-size: var(--font-size-xl);
    }
  }
</style>
