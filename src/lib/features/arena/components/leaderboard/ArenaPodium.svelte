<!--
  ArenaPodium.svelte - Top 3 entries displayed as podium cards

  Horizontal layout: #2 | #1 (center, larger) | #3
-->
<script lang="ts">
  import type { ArenaLeaderboardEntry } from "../../domain/models/arena-models";
  import ArenaPodiumCard from "./ArenaPodiumCard.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    entries,
    onselect,
  }: {
    entries: ArenaLeaderboardEntry[];
    onselect: (entryId: string) => void;
  } = $props();

  // Reorder: show #2, #1, #3 so #1 is in the center
  const podiumOrder = $derived((): ArenaLeaderboardEntry[] => {
    if (entries.length < 3) return entries;
    return [entries[1]!, entries[0]!, entries[2]!];
  });
</script>

{#if entries.length > 0}
  <div class="podium" role="list" aria-label={t('arena_leaderboard_top_3')}>
    {#each podiumOrder() as entry (entry.entry.id)}
      <div role="listitem">
        <ArenaPodiumCard {entry} onselect={() => onselect(entry.entry.id)} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .podium {
    display: flex;
    gap: 8px;
    padding: 0 4px;
  }

  .podium > [role="listitem"] {
    flex: 1;
    min-width: 0;
  }

  /* Center card (#1) is slightly taller */
  .podium > [role="listitem"]:nth-child(2) {
    transform: translateY(-4px);
  }

  @media (max-width: 480px) {
    .podium {
      gap: 4px;
    }
  }
</style>
