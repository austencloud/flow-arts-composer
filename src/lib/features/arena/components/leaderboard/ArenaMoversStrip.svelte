<!--
  ArenaMoversStrip.svelte - Horizontal scroll of biggest rank changes

  Shows entries with the largest rank movements (up or down)
  since the previous daily snapshot.
-->
<script lang="ts">
  import type { ArenaLeaderboardEntry } from "../../domain/models/arena-models";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let { entries }: { entries: ArenaLeaderboardEntry[] } = $props();

  // Filter to entries with rank changes, sort by absolute change
  const movers = $derived(
    entries
      .filter((e) => e.rankChange !== 0)
      .sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange))
      .slice(0, 10)
  );
</script>

{#if movers.length > 0}
  <div class="movers-section">
    <h3 class="movers-title">{t('arena_leaderboard_biggest_movers')}</h3>
    <div class="movers-strip themed-scrollbar" role="list" aria-label={t('arena_leaderboard_biggest_rank_changes')}>
      {#each movers as mover (mover.entry.id)}
        <div
          class="mover-chip"
          class:up={mover.rankChange > 0}
          class:down={mover.rankChange < 0}
          role="listitem"
        >
          <i
            class="fas {mover.rankChange > 0 ? 'fa-caret-up' : 'fa-caret-down'}"
            aria-hidden="true"
          ></i>
          <span class="change-amount">{Math.abs(mover.rankChange)}</span>
          <span class="mover-word">{mover.entry.word}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .movers-section {
    padding: 0 4px;
  }

  .movers-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 8px 0;
  }

  .movers-strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
  }

  .mover-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 20px;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  .mover-chip.up {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 12%, transparent);
    color: var(--semantic-success, #22c55e);
  }

  .mover-chip.down {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 12%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .change-amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .mover-word {
    font-weight: 500;
    color: var(--theme-text, #fff);
  }
</style>
