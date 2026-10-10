<!--
  CollaborativeVideoCard.svelte

  Card component for displaying a collaborative video in lists/grids.
  Shows thumbnail, sequence info, and collaborator avatars.
-->
<script lang="ts">
  import {
    getCreatorDisplayName,
    type CollaborativeVideo,
  } from "../domain/collaborative-video";
  import CollaboratorAvatars from "./CollaboratorAvatars.svelte";

  const {
    video,
    showSequenceName = true,
    onclick,
  }: {
    video: CollaborativeVideo;
    showSequenceName?: boolean;
    onclick?: () => void;
  } = $props();

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  const creator = $derived(
    video.collaborators.find((c) => c.role === "creator")
  );
  const isCollab = $derived(video.collaborators.length > 1);
</script>

<button class="video-card" {onclick} type="button">
  <!-- Thumbnail -->
  <div class="thumbnail">
    {#if video.thumbnailUrl}
      <img src={video.thumbnailUrl} alt="" />
    {:else}
      <div class="thumbnail-placeholder">
        <i class="fas fa-video" aria-hidden="true"></i>
      </div>
    {/if}

    <!-- Duration Badge -->
    <span class="duration-badge">
      {formatDuration(video.duration)}
    </span>

    <!-- Collab Badge -->
    {#if isCollab}
      <span class="collab-badge">
        <i class="fas fa-users" aria-hidden="true"></i>
        Collab
      </span>
    {/if}

    <!-- Play Overlay -->
    <div class="play-overlay">
      <i class="fas fa-play" aria-hidden="true"></i>
    </div>
  </div>

  <!-- Info -->
  <div class="info">
    <div class="info-top">
      {#if showSequenceName && video.sequenceName}
        <span class="sequence-name">{video.sequenceName}</span>
      {/if}
      <span class="date">{formatDate(video.createdAt)}</span>
    </div>

    <div class="info-bottom">
      <CollaboratorAvatars
        collaborators={video.collaborators}
        size="sm"
        maxVisible={3}
      />
      <span class="creator-name">
        {getCreatorDisplayName(video) ?? "Unknown"}
        {#if isCollab}
          <span class="collab-count">+{video.collaborators.length - 1}</span>
        {/if}
      </span>
    </div>
  </div>

  <!-- Visibility Indicator -->
  {#if video.visibility !== "public"}
    <span class="visibility-badge" title={video.visibility}>
      {#if video.visibility === "private"}
        <i class="fas fa-lock" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-user-friends" aria-hidden="true"></i>
      {/if}
    </span>
  {/if}
</button>

<style>
  .video-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
    padding: 0;
  }

  .video-card:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--theme-stroke);
    transform: translateY(-2px);
  }

  .video-card:hover .play-overlay {
    opacity: 1;
  }

  /* Thumbnail */
  .thumbnail {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 2rem;
  }

  .duration-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.75);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
  }

  .collab-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(
      135deg,
      var(--semantic-info) 0%,
      var(--theme-accent-strong) 100%
    );
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .play-overlay i {
    font-size: 2rem;
    color: white;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  /* Info */
  .info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .info-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sequence-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .date {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .info-bottom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .creator-name {
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .collab-count {
    color: var(--semantic-info);
    font-weight: 600;
  }

  /* Visibility Badge */
  .visibility-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.7rem;
  }
</style>
