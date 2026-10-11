<!--
  ArenaSequenceDetail.svelte - Stats tab / Sequence detail view

  For now, shows overall arena stats and personal voting stats.
  Future: individual sequence detail when tapped from leaderboard.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ArenaPersonalStats from "../leaderboard/ArenaPersonalStats.svelte";
  import ArenaWinLossChart from "./ArenaWinLossChart.svelte";
  import type { ArenaUserStats } from "../../domain/models/arena-models";
  import type { StabilityReport } from "../../services/types";
  import { getArenaOrchestrator } from "../../get-arena-orchestrator";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const orchestrator = getArenaOrchestrator();

  let userStats = $state<ArenaUserStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      userStats = await orchestrator.loadUserStats();
    } catch (err) {
      error = t('arena_stats_sign_in_required');
    } finally {
      loading = false;
    }
  });
</script>

<div class="detail-view">
  {#if loading}
    <div class="detail-loading" role="status" aria-live="polite" aria-busy="true">
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <p>{t('arena_stats_loading')}</p>
    </div>
  {:else if error}
    <div class="detail-message" role="status">
      <i class="fas fa-lock" aria-hidden="true"></i>
      <p>{error}</p>
    </div>
  {:else if userStats}
    <h2 class="section-title">{t('arena_stats_title')}</h2>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{userStats.totalVotes}</span>
        <span class="stat-label">{t('arena_stats_total_votes')}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{userStats.longestStreak}</span>
        <span class="stat-label">{t('arena_stats_longest_streak')}</span>
      </div>
    </div>

    {#if userStats.firstVoteDate}
      <div class="joined-info">
        {t('arena_stats_voting_since', { date: userStats.firstVoteDate.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        }) })}
      </div>
    {/if}
  {:else}
    <div class="detail-message" role="status">
      <i class="fas fa-trophy" aria-hidden="true"></i>
      <p>{t('arena_stats_empty')}</p>
    </div>
  {/if}
</div>

<style>
  .detail-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px 16px;
    gap: 16px;
    overflow-y: auto;
  }

  .section-title {
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .joined-info {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-align: center;
  }

  .detail-loading,
  .detail-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  .detail-loading i,
  .detail-message i {
    font-size: 32px;
  }

  .detail-loading p,
  .detail-message p {
    margin: 0;
  }
</style>
