<script lang="ts">
  /**
   * OverrideUserCard
   * Wraps UserCard with override count badge for feature flag management
   */

  import UserCard from "#lib/shared/community/components/UserCard.svelte";
  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import type { UserFeatureOverrides } from "#lib/shared/auth/domain/models/feature-flag.js";
  import {
    getCachedOrFallbackColor,
    extractDominantColor,
  } from "#lib/shared/foundation/utils/color-extractor.js";

  interface Props {
    user: UserProfile & { featureOverrides?: UserFeatureOverrides };
    onclick: () => void;
  }

  let { user, onclick }: Props = $props();

  // Dynamic color from avatar - syncs from user props, but can be overridden by avatar load/error
  let accentColor = $state("");
  $effect(() => {
    accentColor = getCachedOrFallbackColor(user.avatar, user.displayName);
  });

  const overrideCounts = $derived(() => {
    const grants = user.featureOverrides?.enabledFeatures?.length ?? 0;
    const denies = user.featureOverrides?.disabledFeatures?.length ?? 0;
    return { grants, denies, total: grants + denies };
  });

  function handleAvatarLoad(img: HTMLImageElement) {
    extractDominantColor(img.src, user.displayName).then((color) => {
      accentColor = color;
    });
  }

  function handleAvatarError() {
    accentColor = getCachedOrFallbackColor(undefined, user.displayName);
  }
</script>

<div class="override-user-card">
  <UserCard
    {user}
    {accentColor}
    showRoleBadge={true}
    {onclick}
    onAvatarLoad={handleAvatarLoad}
    onAvatarError={handleAvatarError}
  />

  <!-- Override badge overlay -->
  {#if overrideCounts().total > 0}
    <div class="override-badge" class:has-denies={overrideCounts().denies > 0}>
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span>{overrideCounts().total}</span>
      {#if overrideCounts().grants > 0 && overrideCounts().denies > 0}
        <span class="badge-detail">
          <span class="grants">+{overrideCounts().grants}</span>
          <span class="denies">-{overrideCounts().denies}</span>
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .override-user-card {
    position: relative;
  }

  .override-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--theme-accent, #6366f1);
    border-radius: 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: white;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
    z-index: 2;
  }

  .override-badge.has-denies {
    background: linear-gradient(135deg, #6366f1 0%, #f59e0b 100%);
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  }

  .override-badge i {
    font-size: 10px;
  }

  .badge-detail {
    display: flex;
    gap: 2px;
    margin-left: 2px;
    font-size: var(--font-size-compact, 12px);
    opacity: 0.9;
  }

  .grants {
    color: #bbf7d0;
  }

  .denies {
    color: #fecaca;
  }
</style>
