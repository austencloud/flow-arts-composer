<!--
  ArenaLeaderboardRow.svelte - Single leaderboard row for rank 4+

  Shows rank, mover arrow, word, author, rating badge, win%.
-->
<script lang="ts">
  import type { ArenaLeaderboardEntry } from "../../domain/models/arena-models";
  import ArenaRatingBadge from "./ArenaRatingBadge.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    entry,
    onselect,
  }: {
    entry: ArenaLeaderboardEntry;
    onselect: () => void;
  } = $props();

  const winRate = $derived(
    entry.rating.totalMatchups > 0
      ? Math.round((entry.rating.wins / entry.rating.totalMatchups) * 100)
      : 0
  );

  const moverClass = $derived(
    entry.rankChange > 0 ? "mover-up" : entry.rankChange < 0 ? "mover-down" : "mover-flat"
  );

  const moverIcon = $derived(
    entry.rankChange > 0 ? "fa-caret-up" : entry.rankChange < 0 ? "fa-caret-down" : ""
  );
</script>

<button
  class="leaderboard-row"
  onclick={onselect}
  type="button"
  aria-label={t('arena_leaderboard_rank_detail', { rank: entry.rank, word: entry.entry.word, rating: Math.round(entry.rating.displayRating) })}
>
  <span class="rank">{entry.rank}</span>

  <span class="mover {moverClass}" aria-hidden="true">
    {#if moverIcon}
      <i class="fas {moverIcon}"></i>
      <span class="mover-value">{Math.abs(entry.rankChange)}</span>
    {/if}
  </span>

  <div class="entry-info">
    <span class="word">{entry.entry.word}</span>
    {#if entry.entry.ownerDisplayName}
      <span class="author">{t('arena_by_creator', { name: entry.entry.ownerDisplayName })}</span>
    {/if}
  </div>

  <ArenaRatingBadge
    rating={entry.rating.displayRating}
    phi={entry.rating.phi}
    size={36}
  />

  <span class="win-rate">{winRate}%</span>
</button>

<style>
  .leaderboard-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.15s ease;
    min-height: var(--min-touch-target);
  }

  .leaderboard-row:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .leaderboard-row:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .rank {
    width: 28px;
    text-align: right;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .mover {
    width: 32px;
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  .mover-up {
    color: var(--semantic-success, #22c55e);
  }

  .mover-down {
    color: var(--semantic-error, #ef4444);
  }

  .mover-flat {
    color: transparent;
  }

  .mover-value {
    font-variant-numeric: tabular-nums;
  }

  .entry-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .word {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .win-rate {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    width: 36px;
    text-align: right;
  }
</style>
