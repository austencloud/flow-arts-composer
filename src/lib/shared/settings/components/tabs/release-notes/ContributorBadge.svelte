<!-- ContributorBadge - Inline avatar + name for a contributor -->
<script lang="ts">
  import type { Contributor } from "#lib/shared/versioning/domain/models/contributor-models.js";

  let {
    contributor,
    size = "sm",
  }: {
    contributor: Contributor;
    size?: "sm" | "md";
  } = $props();

  let imgError = $state(false);

  const initials = $derived(
    contributor.displayName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  );
</script>

<span class="contributor-badge" class:md={size === "md"}>
  {#if contributor.avatarUrl && !imgError}
    <img
      src={contributor.avatarUrl}
      alt={contributor.displayName}
      class="avatar"
      onerror={() => (imgError = true)}
    />
  {:else}
    <span class="avatar fallback">{initials}</span>
  {/if}
  <span class="name">{contributor.displayName}</span>
</span>

<style>
  .contributor-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 2px 2px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    white-space: nowrap;
  }

  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .avatar.fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1;
  }

  .name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
  }

  .md .avatar {
    width: 28px;
    height: 28px;
  }

  .md .avatar.fallback {
    font-size: 12px;
  }

  .md .name {
    font-size: var(--font-size-sm, 14px);
  }

  .md {
    padding: 3px 10px 3px 3px;
    gap: 8px;
  }
</style>
