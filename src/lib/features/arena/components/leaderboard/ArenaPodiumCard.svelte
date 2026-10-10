<!--
  ArenaPodiumCard.svelte - Top 3 podium card

  Gold/silver/bronze treatment for ranks 1-3.
  #1 gets a subtle glow effect.
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

  const MEDALS: Record<number, { emoji: string; color: string }> = {
    1: { emoji: "\u{1F947}", color: "#fbbf24" },
    2: { emoji: "\u{1F948}", color: "#94a3b8" },
    3: { emoji: "\u{1F949}", color: "#d97706" },
  };

  const medal = $derived(MEDALS[entry.rank]);
  const isFirst = $derived(entry.rank === 1);
  const winRate = $derived(
    entry.rating.totalMatchups > 0
      ? Math.round((entry.rating.wins / entry.rating.totalMatchups) * 100)
      : 0
  );
</script>

<button
  class="podium-card"
  class:first={isFirst}
  style="--medal-color: {medal?.color ?? '#fff'}"
  onclick={onselect}
  type="button"
  aria-label={t('arena_leaderboard_rank_detail', { rank: entry.rank, word: entry.entry.word, rating: Math.round(entry.rating.displayRating) })}
>
  <div class="medal-row">
    <span class="medal" aria-hidden="true">{medal?.emoji ?? ""}</span>
    <span class="rank">#{entry.rank}</span>
  </div>

  <span class="word">{entry.entry.word}</span>

  {#if entry.entry.ownerDisplayName}
    <span class="author">{t('arena_by_creator', { name: entry.entry.ownerDisplayName })}</span>
  {/if}

  <ArenaRatingBadge
    rating={entry.rating.displayRating}
    phi={entry.rating.phi}
    size={isFirst ? 56 : 48}
  />

  <span class="win-rate">{t('arena_leaderboard_win_rate', { rate: winRate })}</span>
</button>

<style>
  .podium-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition: border-color 0.2s ease;
    flex: 1;
    min-width: 0;
  }

  .podium-card:hover {
    border-color: var(--medal-color, var(--theme-stroke-strong));
  }

  .podium-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .podium-card.first {
    box-shadow: 0 0 20px color-mix(in srgb, var(--medal-color, #fbbf24) 15%, transparent);
  }

  .medal-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .medal {
    font-size: 20px;
  }

  .rank {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--medal-color, var(--theme-text-dim));
  }

  .word {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    letter-spacing: 1px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .author {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .win-rate {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
  }
</style>
