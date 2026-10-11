<script lang="ts">
  /**
   * ConnectionMutualStatus - Display follow relationship status
   *
   * Shows mutual follow badge and timestamps for the relationship.
   */

  import type { MutualFollowInfo } from "#lib/shared/community/services/types.js";

  interface Props {
    mutualFollow: MutualFollowInfo;
    theirName?: string;
  }

  let { mutualFollow, theirName = "them" }: Props = $props();

  function formatDate(date?: Date): string {
    if (!date) return "";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatRelativeTime(date?: Date): string {
    if (!date) return "";

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} month${months > 1 ? "s" : ""} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }
</script>

<div class="mutual-status">
  {#if mutualFollow.isMutual}
    <!-- Mutual follow -->
    <div class="status-badge mutual">
      <i class="fas fa-handshake" aria-hidden="true"></i>
      <span class="badge-text">Mutual</span>
    </div>
    <div class="status-details">
      <p class="status-line">
        You follow each other
        {#if mutualFollow.mutualSince}
          <span class="timestamp" title={formatDate(mutualFollow.mutualSince)}>
            since {formatRelativeTime(mutualFollow.mutualSince)}
          </span>
        {/if}
      </p>
    </div>
  {:else if mutualFollow.iFollowThem && !mutualFollow.theyFollowMe}
    <!-- I follow them only -->
    <div class="status-badge following">
      <i class="fas fa-user-plus" aria-hidden="true"></i>
      <span class="badge-text">Following</span>
    </div>
    <div class="status-details">
      <p class="status-line">
        You follow {theirName}
        {#if mutualFollow.iFollowedAt}
          <span class="timestamp" title={formatDate(mutualFollow.iFollowedAt)}>
            since {formatRelativeTime(mutualFollow.iFollowedAt)}
          </span>
        {/if}
      </p>
      <p class="status-hint">They don't follow you back yet</p>
    </div>
  {:else if mutualFollow.theyFollowMe && !mutualFollow.iFollowThem}
    <!-- They follow me only -->
    <div class="status-badge follower">
      <i class="fas fa-user-check" aria-hidden="true"></i>
      <span class="badge-text">Follows You</span>
    </div>
    <div class="status-details">
      <p class="status-line">
        {theirName} follows you
        {#if mutualFollow.theyFollowedAt}
          <span class="timestamp" title={formatDate(mutualFollow.theyFollowedAt)}>
            since {formatRelativeTime(mutualFollow.theyFollowedAt)}
          </span>
        {/if}
      </p>
      <p class="status-hint">Follow back to connect</p>
    </div>
  {:else}
    <!-- No relationship -->
    <div class="status-badge none">
      <i class="fas fa-user" aria-hidden="true"></i>
      <span class="badge-text">Not Connected</span>
    </div>
    <div class="status-details">
      <p class="status-hint">Follow them to start a connection</p>
    </div>
  {/if}
</div>

<style>
  .mutual-status {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    width: fit-content;
  }

  .status-badge.mutual {
    background: color-mix(in srgb, var(--semantic-success) 15%, transparent);
    color: var(--semantic-success);
  }

  .status-badge.following {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-accent);
  }

  .status-badge.follower {
    background: color-mix(in srgb, var(--semantic-info) 15%, transparent);
    color: var(--semantic-info);
  }

  .status-badge.none {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim);
  }

  .badge-text {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status-line {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text);
  }

  .timestamp {
    color: var(--theme-text-dim);
    font-weight: 400;
  }

  .status-hint {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    opacity: 0.8;
  }
</style>
