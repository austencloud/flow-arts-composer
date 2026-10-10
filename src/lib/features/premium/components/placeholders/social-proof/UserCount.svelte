<!-- UserCount - Display active user count for social proof -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    totalUsers?: number;
    premiumUsers?: number;
    showGrowth?: boolean;
  }

  let {
    totalUsers = 0,
    premiumUsers = 0,
    showGrowth = false,
  }: Props = $props();

  function formatCount(count: number): string {
    if (count >= 1000) {
      return `${Math.floor(count / 1000)},${(count % 1000).toString().padStart(3, "0")}+`;
    }
    return `${count}+`;
  }
</script>

<div class="user-count">
  <div class="count-badge">
    <i class="fas fa-users" aria-hidden="true"></i>
    <span class="count">{formatCount(totalUsers)}</span>
  </div>
  <p class="tagline">{t('premium_user_count_tagline')}</p>
  {#if showGrowth && premiumUsers > 0}
    <p class="growth">{t('premium_user_count_premium_members', { count: formatCount(premiumUsers) })}</p>
  {/if}
</div>

<style>
  .user-count {
    text-align: center;
    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    margin: var(--spacing-md, 16px) 0;
  }

  .count-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-bottom: var(--spacing-sm, 8px);
  }

  .count-badge i {
    font-size: var(--font-size-xl);
    color: var(--theme-accent, var(--theme-accent));
  }

  .count {
    font-size: clamp(24px, 5vw, 32px);
    font-weight: 700;
    color: var(--theme-text);
  }

  .tagline {
    font-size: var(--font-size-min);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: 0;
  }

  .growth {
    font-size: var(--font-size-compact);
    color: var(--theme-accent, var(--theme-accent));
    margin: var(--spacing-xs, 4px) 0 0;
    font-weight: 600;
  }
</style>
