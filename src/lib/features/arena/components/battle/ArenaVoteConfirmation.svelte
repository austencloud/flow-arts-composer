<!--
  ArenaVoteConfirmation.svelte - Vote result announcement

  Accessible announcement for screen readers when a vote is recorded.
  Visual feedback is handled by the panels themselves.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let { winner = "" }: { winner: string } = $props();
</script>

{#if winner}
  <div class="sr-only" role="status" aria-live="assertive" aria-atomic="true">
    {t('arena_battle_voted_for', { word: winner })}
  </div>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
