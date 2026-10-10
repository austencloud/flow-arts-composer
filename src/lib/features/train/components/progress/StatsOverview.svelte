<!--
  StatsOverview.svelte - Stats Cards Grid

  Displays key training statistics in a responsive grid.
-->
<script lang="ts">
  import type { StatsOverview as StatsOverviewData } from "../../services/performance-history-tracker";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    stats: StatsOverviewData;
  }

  let { stats }: Props = $props();

  function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
</script>

<div class="stats-grid">
  <div
    class="stat-card"
    style="--gradient: linear-gradient(135deg, var(--semantic-info, var(--semantic-info)) 0%, color-mix(in srgb, var(--semantic-info, var(--semantic-info)) 80%, white) 100%)"
  >
    <i class="fas fa-calendar-check" aria-hidden="true"></i>
    <div class="stat-content">
      <div class="stat-value">{stats.totalSessions}</div>
      <div class="stat-label">{t("train_total_sessions")}</div>
    </div>
  </div>

  <div
    class="stat-card"
    style="--gradient: linear-gradient(135deg, var(--theme-accent-strong) 0%, color-mix(in srgb, var(--theme-accent-strong, var(--theme-accent-strong)) 80%, white) 100%)"
  >
    <i class="fas fa-clock" aria-hidden="true"></i>
    <div class="stat-content">
      <div class="stat-value">{formatDuration(stats.totalPracticeTime)}</div>
      <div class="stat-label">{t("train_practice_time")}</div>
    </div>
  </div>

  <div
    class="stat-card"
    style="--gradient: linear-gradient(135deg, var(--semantic-success, var(--semantic-success)) 0%, color-mix(in srgb, var(--semantic-success, var(--semantic-success)) 70%, #000) 100%)"
  >
    <i class="fas fa-bullseye" aria-hidden="true"></i>
    <div class="stat-content">
      <div class="stat-value">{stats.averageAccuracy.toFixed(1)}%</div>
      <div class="stat-label">{t("train_avg_accuracy")}</div>
    </div>
  </div>

  <div
    class="stat-card"
    style="--gradient: linear-gradient(135deg, var(--semantic-warning, var(--semantic-warning)) 0%, color-mix(in srgb, var(--semantic-warning, var(--semantic-warning)) 70%, #000) 100%)"
  >
    <i class="fas fa-fire" aria-hidden="true"></i>
    <div class="stat-content">
      <div class="stat-value">{stats.maxCombo}</div>
      <div class="stat-label">{t("train_highest_combo")}</div>
    </div>
  </div>
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--gradient);
    border-radius: 1rem;
    transition: transform var(--duration-normal);
  }

  .stat-card:hover {
    transform: translateY(-2px);
  }

  .stat-card i {
    font-size: 2rem;
    opacity: 0.9;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-label {
    font-size: 0.875rem;
    opacity: 0.9;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-card {
      flex-direction: column;
      text-align: center;
      padding: 1rem;
    }

    .stat-value {
      font-size: 1.5rem;
    }
  }
</style>
