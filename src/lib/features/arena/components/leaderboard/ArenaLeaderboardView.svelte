<!--
  ArenaLeaderboardView.svelte - Ranked sequences by community vote

  Podium (top 3) + scrollable ranked list + movers strip + personal stats.
  Leaderboard is public (no auth required to view).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ArenaPodium from "./ArenaPodium.svelte";
  import ArenaLeaderboardRow from "./ArenaLeaderboardRow.svelte";
  import ArenaMoversStrip from "./ArenaMoversStrip.svelte";
  import ArenaPersonalStats from "./ArenaPersonalStats.svelte";
  import type {
    ArenaLeaderboardEntry,
    ArenaUserStats,
  } from "../../domain/models/arena-models";
  import { getArenaOrchestrator } from "../../get-arena-orchestrator";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const orchestrator = getArenaOrchestrator();

  let leaderboard = $state<ArenaLeaderboardEntry[]>([]);
  let userStats = $state<ArenaUserStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Entries split for display
  const podiumEntries = $derived(leaderboard.slice(0, 3));
  const rankedEntries = $derived(leaderboard.slice(3));

  onMount(async () => {
    try {
      leaderboard = await orchestrator.loadLeaderboard(50);

      // Try loading user stats (requires auth)
      try {
        userStats = await orchestrator.loadUserStats();
      } catch {
        // Not signed in, skip personal stats
      }
    } catch (err) {
      console.error("[Arena] Failed to load leaderboard:", err);
      error = t('arena_leaderboard_error');
    } finally {
      loading = false;
    }
  });

  function handleSelect(_entryId: string) {
    // Future: navigate to detail view
  }
</script>

<div class="leaderboard-view">
  {#if loading}
    <div class="leaderboard-loading" role="status" aria-live="polite" aria-busy="true">
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <p>{t('arena_leaderboard_loading')}</p>
    </div>
  {:else if error}
    <div class="leaderboard-error" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>{error}</p>
    </div>
  {:else if leaderboard.length === 0}
    <div class="leaderboard-empty" role="status">
      <i class="fas fa-trophy" aria-hidden="true"></i>
      <p>{t('arena_leaderboard_empty')}</p>
    </div>
  {:else}
    <ArenaPodium entries={podiumEntries} onselect={handleSelect} />

    {#if rankedEntries.length > 0}
      <div class="ranked-list themed-scrollbar" role="list" aria-label={t('arena_leaderboard_ranked_sequences')}>
        {#each rankedEntries as entry (entry.entry.id)}
          <ArenaLeaderboardRow {entry} onselect={() => handleSelect(entry.entry.id)} />
        {/each}
      </div>
    {/if}

    <ArenaMoversStrip entries={leaderboard} />

    <ArenaPersonalStats stats={userStats} />
  {/if}
</div>

<style>
  .leaderboard-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
    gap: 16px;
    overflow-y: auto;
  }

  .ranked-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
  }

  .leaderboard-loading,
  .leaderboard-error,
  .leaderboard-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  .leaderboard-error {
    color: var(--semantic-error, #ef4444);
  }

  .leaderboard-loading i,
  .leaderboard-error i,
  .leaderboard-empty i {
    font-size: 32px;
  }

  .leaderboard-loading p,
  .leaderboard-error p,
  .leaderboard-empty p {
    margin: 0;
  }
</style>
