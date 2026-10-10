<!--
  PendingInvitesList.svelte

  List of pending collaboration invites for the current user.
  Shows all videos where user has been invited but hasn't responded.
-->
<script lang="ts">
  import { getPendingInvites } from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";
  import type { CollaborativeVideo } from "../domain/collaborative-video";
  import { onMount } from "svelte";
  import PendingInviteCard from "./PendingInviteCard.svelte";

  const {
    onInviteHandled,
  }: {
    onInviteHandled?: () => void;
  } = $props();

  let pendingVideos = $state<CollaborativeVideo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => {
    loadPendingInvites();
  });

  async function loadPendingInvites() {
    loading = true;
    error = null;

    try {
      pendingVideos = await getPendingInvites();
    } catch (e) {
      console.error("Failed to load pending invites:", e);
      error = e instanceof Error ? e.message : "Failed to load invites";
    } finally {
      loading = false;
    }
  }

  function handleInviteResponse(videoId: string) {
    // Remove from list
    pendingVideos = pendingVideos.filter((v) => v.id !== videoId);
    onInviteHandled?.();
  }
</script>

<div class="pending-invites">
  {#if loading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Loading invites...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{error}</span>
      <button class="retry-button" onclick={loadPendingInvites}>
        <i class="fas fa-redo" aria-hidden="true"></i>
        Retry
      </button>
    </div>
  {:else if pendingVideos.length === 0}
    <div class="empty-state">
      <i class="fas fa-inbox" aria-hidden="true"></i>
      <span>No pending invites</span>
    </div>
  {:else}
    <div class="invites-list">
      {#each pendingVideos as video (video.id)}
        <PendingInviteCard
          {video}
          onAccepted={() => handleInviteResponse(video.id)}
          onDeclined={() => handleInviteResponse(video.id)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .pending-invites {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .loading-state i,
  .error-state i,
  .empty-state i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .error-state {
    color: var(--semantic-error);
  }

  .retry-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  .invites-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
