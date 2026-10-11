<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import type { TeachingPortfolio } from "../../domain/models/teaching-portfolio";

  const { state: festivalState } = getFestivalContext();

  let newVideo = $state("");
  let failedThumbnails = $state<Set<string>>(new Set());

  function addVideo() {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio || !newVideo.trim()) return;
    const updated: TeachingPortfolio = {
      ...portfolio,
      performanceVideos: [...portfolio.performanceVideos, newVideo.trim()],
    };
    festivalState.savePortfolio(uid, updated);
    newVideo = "";
  }

  function removeVideo(index: number) {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;
    const videos = portfolio.performanceVideos.filter((_, i) => i !== index);
    festivalState.savePortfolio(uid, { ...portfolio, performanceVideos: videos });
  }

  function extractYouTubeId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|(?:v|embed|shorts)[=\/])([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? null;
  }
</script>

<section class="section-card">
  <div class="section-header">
    <h3 class="section-title">Performance Videos</h3>
  </div>

  {#if festivalState.portfolio!.performanceVideos.length > 0}
    <div class="video-grid">
      {#each festivalState.portfolio!.performanceVideos as video, i (i)}
        {@const videoId = extractYouTubeId(video)}
        <div class="video-card">
          {#if videoId && !failedThumbnails.has(videoId)}
            <img
              class="video-thumbnail"
              src="https://img.youtube.com/vi/{videoId}/mqdefault.jpg"
              alt="Video thumbnail"
              onerror={() => {
                failedThumbnails = new Set([...failedThumbnails, videoId]);
              }}
            />
          {:else}
            <div class="video-thumbnail-placeholder">
              <i class="fas fa-video" aria-hidden="true"></i>
            </div>
          {/if}
          <div class="video-overlay">
            <button
              class="video-remove-btn"
              onclick={() => removeVideo(i)}
              aria-label="Remove video"
              tabindex="0"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
          <div class="video-url-label" title={video}>{video}</div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="video-add-row">
    <input
      class="add-input"
      type="url"
      bind:value={newVideo}
      placeholder="Paste YouTube URL..."
      onkeydown={(e) => e.key === "Enter" && addVideo()}
    />
    <button class="add-inline-btn" onclick={addVideo} disabled={!newVideo.trim()}>
      Add
    </button>
  </div>
</section>

<style>
  .section-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 14px;
    grid-column: 1 / -1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }


  .video-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }

  .video-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
    position: relative;
  }

  .video-thumbnail {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
  }

  .video-thumbnail-placeholder {
    width: 100%;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.3));
    font-size: 24px;
  }

  .video-overlay {
    position: absolute;
    inset: 0;
    bottom: auto;
    aspect-ratio: 16 / 9;
    background: transparent;
    pointer-events: none;
  }

  .video-remove-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    opacity: 0;
    pointer-events: auto;
    transition: opacity 0.15s, background 0.15s;
  }

  .video-card:hover .video-remove-btn,
  .video-card:focus-within .video-remove-btn {
    opacity: 1;
  }

  .video-remove-btn:hover {
    background: var(--semantic-error, #ef4444);
  }

  .video-url-label {
    padding: 8px 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-add-row {
    display: flex;
    gap: 8px;
  }

  .add-input {
    flex: 1;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 5px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    padding: 7px 10px;
  }

  .add-input:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
  }

  .add-inline-btn {
    padding: 7px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 5px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
  }

  .add-inline-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .add-inline-btn:not(:disabled):hover {
    color: var(--theme-text, #ffffff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  @media (max-width: 768px) {
    .video-remove-btn {
      opacity: 1;
      min-width: 44px;
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .video-remove-btn {
      transition: none;
    }
  }
</style>
