<!-- TrustBadges - Display trust indicators and credentials -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Badge {
    id: string;
    type: "festival" | "security" | "community";
    name: string;
    icon?: string;
    logoUrl?: string;
    link?: string;
  }

  interface Props {
    badges?: Badge[];
  }

  let { badges = [] }: Props = $props();

  const defaultBadges: Badge[] = $derived([
    {
      id: "stripe",
      type: "security" as const,
      name: t('premium_badge_stripe'),
      icon: "fa-lock",
    },
    {
      id: "ssl",
      type: "security" as const,
      name: t('premium_badge_ssl'),
      icon: "fa-shield-alt",
    },
  ]);

  const displayBadges = $derived(badges.length > 0 ? badges : defaultBadges);
</script>

<div class="trust-badges">
  <div class="badges-grid">
    {#each displayBadges as badge (badge.id)}
      {#if badge.link}
        <a
          href={badge.link}
          target="_blank"
          rel="noopener noreferrer"
          class="trust-badge"
        >
          {#if badge.logoUrl}
            <img src={badge.logoUrl} alt={badge.name} />
          {:else if badge.icon}
            <i class="fas {badge.icon}" aria-hidden="true"></i>
          {/if}
          <span>{badge.name}</span>
        </a>
      {:else}
        <div class="trust-badge">
          {#if badge.logoUrl}
            <img src={badge.logoUrl} alt={badge.name} />
          {:else if badge.icon}
            <i class="fas {badge.icon}" aria-hidden="true"></i>
          {/if}
          <span>{badge.name}</span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .trust-badges {
    padding: var(--spacing-md, 16px) 0;
  }

  .badges-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md, 16px);
    justify-content: center;
    align-items: center;
  }

  .trust-badge {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-decoration: none;
    transition: all var(--transition-fast, var(--duration-fast) ease);
  }

  a.trust-badge:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
    border-color: var(--theme-accent, var(--theme-accent));
  }

  .trust-badge i {
    font-size: var(--font-size-min);
    color: var(--theme-accent, var(--theme-accent));
  }

  .trust-badge img {
    height: 20px;
    width: auto;
  }
</style>
