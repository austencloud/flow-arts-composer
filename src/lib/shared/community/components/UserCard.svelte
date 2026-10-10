<script lang="ts">
  /**
   * UserCard - Beautiful user card with avatar-based dynamic colors
   *
   * Features avatar color extraction, role badge (admin only), follow button, and stats.
   */

  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import { ROLE_DISPLAY } from "#lib/shared/auth/domain/models/user-role.js";
  import FollowButton from "./FollowButton.svelte";

  interface Props {
    user: UserProfile;
    accentColor?: string;
    showRoleBadge?: boolean;
    showFollowButton?: boolean;
    isFollowing?: boolean;
    isFollowLoading?: boolean;
    onclick?: () => void;
    onAvatarLoad?: (img: HTMLImageElement) => void;
    onAvatarError?: (img: HTMLImageElement) => void;
    onFollowToggle?: () => void;
  }

  let {
    user,
    accentColor = "var(--theme-accent-strong)",
    showRoleBadge = false,
    showFollowButton = false,
    isFollowing = false,
    isFollowLoading = false,
    onclick,
    onAvatarLoad,
    onAvatarError,
    onFollowToggle,
  }: Props = $props();

  function getRoleColor(role: string): string {
    return ROLE_DISPLAY[role as keyof typeof ROLE_DISPLAY]?.color || "#666";
  }

  function getRoleIcon(role: string): string {
    return ROLE_DISPLAY[role as keyof typeof ROLE_DISPLAY]?.icon || "fa-user";
  }
</script>

<div
  class="user-card"
  style="--card-accent: {accentColor}"
  {onclick}
  role="button"
  tabindex="0"
  aria-label="View profile of {user.displayName}"
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onclick?.();
    }
  }}
>
  <!-- Avatar with color ring -->
  <div class="user-avatar">
    {#if user.avatar}
      <img
        src={user.avatar}
        alt={user.displayName}
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        onload={(e) => onAvatarLoad?.(e.currentTarget as HTMLImageElement)}
        onerror={(e) => onAvatarError?.(e.currentTarget as HTMLImageElement)}
      />
      <div class="avatar-placeholder" style="display: none;" aria-hidden="true">
        <i class="fas fa-user" aria-hidden="true"></i>
      </div>
    {:else}
      <div class="avatar-placeholder" aria-hidden="true">
        <i class="fas fa-user" aria-hidden="true"></i>
      </div>
    {/if}

    <!-- Role badge (admin view) -->
    {#if showRoleBadge && user.role && user.role !== "user"}
      <span
        class="role-badge"
        title={ROLE_DISPLAY[user.role]?.label}
        style="background: {getRoleColor(user.role)}"
      >
        <i class="fas {getRoleIcon(user.role)}" aria-hidden="true"></i>
      </span>
    {/if}
  </div>

  <!-- User info -->
  <div class="user-info">
    <h3 class="display-name">{user.displayName}</h3>
    <p class="username">@{user.username}</p>

    <!-- Stats -->
    <div class="user-stats">
      <div class="stat">
        <i class="fas fa-list" aria-hidden="true"></i>
        <span>{user.sequenceCount ?? 0}</span>
      </div>
      <div class="stat">
        <i class="fas fa-folder" aria-hidden="true"></i>
        <span>{user.collectionCount ?? 0}</span>
      </div>
      <div class="stat">
        <i class="fas fa-users" aria-hidden="true"></i>
        <span>{user.followerCount ?? 0}</span>
      </div>
    </div>
  </div>

  <!-- Follow button -->
  {#if showFollowButton}
    <div class="user-actions">
      <FollowButton
        targetUserId={user.id}
        displayName={user.displayName}
        following={isFollowing}
        loading={isFollowLoading}
        accent={accentColor}
        onToggle={() => onFollowToggle?.()}
      />
    </div>
  {/if}
</div>

<style>
  .user-card {
    --card-accent: #8b5cf6;
    --card-accent-light: color-mix(in srgb, var(--card-accent) 80%, #fff);
    --card-accent-glow: color-mix(in srgb, var(--card-accent) 25%, transparent);

    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-accent) 10%, rgba(255, 255, 255, 0.03)) 0%,
      color-mix(in srgb, var(--card-accent) 5%, rgba(255, 255, 255, 0.02)) 100%
    );
    border: 1px solid color-mix(in srgb, var(--card-accent) 18%, transparent);
    border-radius: 14px;
    transition:
      background 0.3s ease,
      border-color 0.3s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
    cursor: pointer;
  }

  .user-card:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-accent) 16%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--card-accent) 10%, rgba(255, 255, 255, 0.03)) 100%
    );
    border-color: color-mix(in srgb, var(--card-accent) 40%, transparent);
    transform: translateY(-2px);
    box-shadow:
      0 8px 24px var(--card-accent-glow),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .user-card:focus {
    outline: 2px solid var(--card-accent);
    outline-offset: 2px;
  }

  /* Avatar with color ring */
  .user-avatar {
    position: relative;
    width: 56px;
    height: 56px;
    margin: 0 auto;
    flex-shrink: 0;
    padding: 2px;
    background: linear-gradient(
      135deg,
      var(--card-accent) 0%,
      var(--card-accent-light) 100%
    );
    border-radius: 50%;
    transition: background var(--duration-emphasis) ease;
  }

  .user-avatar img,
  .avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: var(--theme-panel-bg, #1a1a2e);
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-accent) 20%, var(--theme-panel-bg, #1a1a2e)) 0%,
      var(--theme-panel-bg, #1a1a2e) 100%
    );
  }

  .avatar-placeholder i {
    font-size: var(--font-size-xl);
    color: var(--card-accent-light);
    transition: color var(--duration-emphasis) ease;
  }

  /* Role badge */
  .role-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    color: #000; /* contrast text on colored badge — no token for this */
    border: 2px solid var(--theme-panel-bg, #1a1a2e);
    z-index: 1;
  }

  /* User info */
  .user-info {
    text-align: center;
    min-width: 0;
  }

  .display-name {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .username {
    margin: 2px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Stats */
  .user-stats {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 6px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact);
    color: rgba(255, 255, 255, 0.65);
  }

  .stat i {
    font-size: var(--font-size-compact);
    color: var(--card-accent);
    opacity: 0.75;
    transition:
      opacity 0.2s ease,
      color 0.3s ease;
  }

  .user-card:hover .stat i {
    opacity: 1;
  }

  /* Follow button */
  .user-actions {
    display: flex;
    margin-top: 4px;
  }
</style>
