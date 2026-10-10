<!--
  VideosPanel.svelte

  Full-panel overlay for browsing and managing videos for a sequence, inside
  the Create module's sequence drawer.

  A separate presentation from the viewer's SequenceVideos - different host,
  different layout, its own upload sheet - but not a separate list. Both read
  the shared per-sequence store, so a video added in either place shows up in
  the other. See docs/architecture/canonical-capabilities.md.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getSequenceVideosStore } from "#lib/shared/video-collaboration/state/sequence-videos-store.svelte.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { CollaborativeVideo } from "../domain/collaborative-video";
  import { onMount } from "svelte";
  import CollaboratorAvatars from "./CollaboratorAvatars.svelte";
  import VideoUploadSheet from "./VideoUploadSheet.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  const {
    sequence,
    onClose,
    onInviteCollaborators,
  }: {
    sequence: SequenceData;
    onClose: () => void;
    onInviteCollaborators?: (video: CollaborativeVideo) => void;
  } = $props();

  const hapticService = getHapticFeedback();
  const store = $derived(getSequenceVideosStore(sequence.id));
  let showUploadSheet = $state(false);
  let selectedVideo = $state<CollaborativeVideo | null>(null);

  const videos = $derived(store.videos);
  const loading = $derived(store.loading);
  const error = $derived(store.error || null);

  onMount(() => {
    void store.load();
  });

  function handleVideoClick(video: CollaborativeVideo) {
    hapticService?.trigger("selection");
    selectedVideo = video;
  }

  function handleUploadClick() {
    hapticService?.trigger("selection");
    showUploadSheet = true;
  }

  function handleBack() {
    hapticService?.trigger("selection");
    onClose();
  }

  function handleVideoUploaded() {
    // The sheet saves the record itself, so re-read rather than insert.
    void store.reload();
  }

  function closeVideoPlayer() {
    selectedVideo = null;
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const hasVideos = $derived(videos.length > 0);
  const canInvite = $derived(
    selectedVideo && onInviteCollaborators !== undefined
  );
</script>

<div class="videos-panel">
  <!-- Header -->
  <header class="panel-header">
    <button class="back-button" onclick={handleBack} aria-label="Back to details">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
    <h2>Performance Videos</h2>
    <button class="record-button" onclick={handleUploadClick}>
      <i class="fas fa-video" aria-hidden="true"></i>
      <span>Record</span>
    </button>
  </header>

  <!-- Content -->
  <div class="panel-content">
    {#if loading}
      <div class="state-message">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Loading videos...</span>
      </div>
    {:else if error}
      <div class="state-message error">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {:else if !hasVideos}
      <div class="empty-state">
        <div class="empty-icon">
          <i class="fas fa-video" aria-hidden="true"></i>
        </div>
        <h3>No videos yet</h3>
        <p>Be the first to record a performance of this sequence!</p>
        <button class="primary-button" onclick={handleUploadClick}>
          <i class="fas fa-video" aria-hidden="true"></i>
          <span>Record Your Performance</span>
        </button>
      </div>
    {:else}
      <div class="videos-grid">
        {#each videos as video (video.id)}
          <button class="video-card" onclick={() => handleVideoClick(video)}>
            <div class="video-thumbnail">
              {#if video.thumbnailUrl}
                <img src={video.thumbnailUrl} alt="" />
              {:else}
                <div class="thumbnail-placeholder">
                  <i class="fas fa-play" aria-hidden="true"></i>
                </div>
              {/if}
              <span class="duration">{formatDuration(video.duration)}</span>
              <div class="play-overlay">
                <i class="fas fa-play" aria-hidden="true"></i>
              </div>
            </div>
            <div class="video-meta">
              <div class="video-collaborators">
                <CollaboratorAvatars
                  collaborators={video.collaborators}
                  size="md"
                  maxVisible={3}
                />
                {#if video.collaborators.length > 1}
                  <span class="collab-badge">Collab</span>
                {/if}
              </div>
              {#if video.description}
                <p class="video-description">{video.description}</p>
              {/if}
              <span class="video-date">{formatDate(video.createdAt)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Video Upload Sheet -->
<VideoUploadSheet
  show={showUploadSheet}
  {sequence}
  onClose={() => (showUploadSheet = false)}
  onUploaded={handleVideoUploaded}
/>

<!-- Video Player Modal -->
{#if selectedVideo}
  <div class="video-player-overlay" role="dialog" aria-label="Video player">
    <button
      class="video-player-backdrop"
      onclick={closeVideoPlayer}
      aria-label="Close video player"
    ></button>
    <div class="video-player-container">
      <header class="video-player-header">
        <div class="video-player-title">
          <i class="fas fa-video" aria-hidden="true"></i>
          <span>Performance Video</span>
        </div>
        <div class="video-player-actions">
          {#if canInvite}
            <button
              class="video-player-invite"
              onclick={() => {
                onInviteCollaborators?.(selectedVideo!);
                closeVideoPlayer();
              }}
            >
              <i class="fas fa-user-plus" aria-hidden="true"></i>
              Invite
            </button>
          {/if}
          <button
            class="video-player-close"
            onclick={closeVideoPlayer}
            aria-label="Close video"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      </header>
      <div class="video-player-content">
        <video
          src={selectedVideo.videoUrl}
          controls
          autoplay
          muted
          playsinline
          class="video-player-video"
        >
          <track kind="captions" />
        </video>
      </div>
      {#if selectedVideo.description}
        <div class="video-player-description">
          {selectedVideo.description}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .videos-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    z-index: 10;
    animation: slideIn var(--duration-normal) ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .panel-header h2 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .back-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .back-button svg {
    width: 20px;
    height: 20px;
  }

  .back-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .record-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    border: none;
    border-radius: 22px;
    color: white;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .record-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 200px;
    color: var(--theme-text-dim);
  }

  .state-message.error {
    color: var(--semantic-error);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 24px;
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.15) 0%,
      rgba(139, 92, 246, 0.15) 100%
    );
    border-radius: 50%;
    font-size: 2rem;
    color: var(--semantic-info);
  }

  .empty-state h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.95rem;
    color: var(--theme-text-dim);
    max-width: 280px;
  }

  .primary-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 24px;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    border: none;
    border-radius: 28px;
    color: white;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .primary-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  .videos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }

  .video-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .video-card:hover {
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .video-card:hover .play-overlay {
    opacity: 1;
  }

  .video-thumbnail {
    position: relative;
    aspect-ratio: 16 / 9;
    background: rgba(0, 0, 0, 0.3);
  }

  .video-thumbnail img {
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
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.2) 0%,
      rgba(139, 92, 246, 0.2) 100%
    );
    color: white;
    font-size: 1.5rem;
  }

  .duration {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
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
  }

  .video-meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .video-collaborators {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .collab-badge {
    padding: 2px 8px;
    background: linear-gradient(
      135deg,
      rgba(139, 92, 246, 0.2) 0%,
      rgba(59, 130, 246, 0.2) 100%
    );
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--theme-accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .video-description {
    margin: 0;
    font-size: 0.85rem;
    color: var(--theme-text-dim);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .video-date {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    opacity: 0.7;
  }

  /* Video Player Modal */
  .video-player-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .video-player-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    border: none;
    cursor: pointer;
  }

  .video-player-container {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    overflow: hidden;
    animation: modalIn var(--duration-normal) ease-out;
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .video-player-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .video-player-title {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .video-player-title i {
    color: var(--semantic-info);
  }

  .video-player-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .video-player-invite {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .video-player-invite:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .video-player-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg);
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .video-player-close:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .video-player-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: black;
  }

  .video-player-video {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
  }

  .video-player-description {
    padding: 1rem 1.25rem;
    font-size: 0.9rem;
    color: var(--theme-text-dim);
    border-top: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
  }

  /* Mobile adjustments */
  @media (max-width: 600px) {
    .videos-grid {
      grid-template-columns: 1fr;
    }

    .record-button span {
      display: none;
    }

    .record-button {
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 50%;
      justify-content: center;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .videos-panel {
      animation: none;
    }
    .video-player-container {
      animation: none;
    }
  }
</style>
