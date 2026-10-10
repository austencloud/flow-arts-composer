<!--
  UserVideoLibrary.svelte

  Displays the current user's video library with tabs for:
  - All videos
  - My videos (created by user)
  - Collaborations (videos user was invited to)

  Also shows pending invites badge.
-->
<script lang="ts">
  import { getUserVideoLibrary } from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";
  import type { UserVideoLibrary } from "../services/types";
  import type { CollaborativeVideo } from "../domain/collaborative-video";
  import { onMount } from "svelte";
  import CollaborativeVideoCard from "./CollaborativeVideoCard.svelte";
  import PendingInviteCard from "./PendingInviteCard.svelte";

  const {
    onVideoClick,
  }: {
    onVideoClick?: (video: CollaborativeVideo) => void;
  } = $props();

  type Tab = "all" | "created" | "collaborations" | "invites";

  let library = $state<UserVideoLibrary | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let currentTab = $state<Tab>("all");

  onMount(() => {
    loadLibrary();
  });

  async function loadLibrary() {
    loading = true;
    error = null;

    try {
      library = await getUserVideoLibrary();
    } catch (e) {
      console.error("Failed to load video library:", e);
      error = e instanceof Error ? e.message : "Failed to load videos";
    } finally {
      loading = false;
    }
  }

  // Derived counts
  const allCount = $derived(
    (library?.created?.length ?? 0) + (library?.collaborations?.length ?? 0)
  );
  const createdCount = $derived(library?.created?.length ?? 0);
  const collabCount = $derived(library?.collaborations?.length ?? 0);
  const pendingCount = $derived(library?.pendingInvites?.length ?? 0);

  // Filtered videos based on tab
  const displayedVideos = $derived(() => {
    if (!library) return [];
    switch (currentTab) {
      case "created":
        return library.created;
      case "collaborations":
        return library.collaborations;
      case "all":
      default:
        return [...library.created, ...library.collaborations].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    }
  });

  function handleInviteResponse() {
    loadLibrary();
  }

  const tabs: { id: Tab; label: string; count: number }[] = $derived([
    { id: "all", label: "All", count: allCount },
    { id: "created", label: "My Videos", count: createdCount },
    { id: "collaborations", label: "Collaborations", count: collabCount },
    { id: "invites", label: "Invites", count: pendingCount },
  ]);
</script>

<div class="video-library">
  <!-- Tabs -->
  <div class="tabs-container">
    <div class="tabs">
      {#each tabs as tab}
        <button
          class="tab"
          class:active={currentTab === tab.id}
          class:has-badge={tab.id === "invites" && tab.count > 0}
          onclick={() => (currentTab = tab.id)}
        >
          {tab.label}
          {#if tab.count > 0}
            <span class="count" class:pending={tab.id === "invites"}
              >{tab.count}</span
            >
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    {#if loading}
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>Loading your videos...</span>
      </div>
    {:else if error}
      <div class="error-state">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
        <button class="retry-btn" onclick={loadLibrary}>
          <i class="fas fa-redo" aria-hidden="true"></i>
          Retry
        </button>
      </div>
    {:else if currentTab === "invites"}
      <!-- Pending Invites -->
      {#if pendingCount === 0}
        <div class="empty-state">
          <i class="fas fa-inbox" aria-hidden="true"></i>
          <span>No pending invites</span>
        </div>
      {:else}
        <div class="invites-list">
          {#each library?.pendingInvites ?? [] as video (video.id)}
            <PendingInviteCard
              {video}
              onAccepted={handleInviteResponse}
              onDeclined={handleInviteResponse}
            />
          {/each}
        </div>
      {/if}
    {:else if displayedVideos().length === 0}
      <div class="empty-state">
        <i class="fas fa-video-slash" aria-hidden="true"></i>
        <span>
          {#if currentTab === "created"}
            You haven't created any videos yet
          {:else if currentTab === "collaborations"}
            No collaborations yet
          {:else}
            No videos yet
          {/if}
        </span>
      </div>
    {:else}
      <div class="videos-grid">
        {#each displayedVideos() as video (video.id)}
          <CollaborativeVideoCard
            {video}
            onclick={() => onVideoClick?.(video)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .video-library {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Tabs */
  .tabs-container {
    padding: 0 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--semantic-info);
  }

  .tab .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .tab .count.pending {
    background: linear-gradient(
      135deg,
      var(--semantic-info) 0%,
      var(--theme-accent-strong) 100%
    );
    color: white;
  }

  .tab.has-badge .count.pending {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  /* Content */
  .content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 4rem 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .loading-state i,
  .error-state i,
  .empty-state i {
    font-size: 2.5rem;
    opacity: 0.4;
  }

  .error-state {
    color: var(--semantic-error);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  /* Videos Grid */
  .videos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  /* Invites List */
  .invites-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  @media (max-width: 640px) {
    .tabs-container {
      padding: 0 0.5rem;
    }

    .tab {
      padding: 0.75rem 0.75rem;
      font-size: 0.85rem;
    }

    .content {
      padding: 0.75rem;
    }

    .videos-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .pending {
      animation: none;
    }
  }
</style>
