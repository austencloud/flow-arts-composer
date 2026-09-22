<script lang="ts">

import { getSequenceMatcher } from "$lib/features/landing-preview/get-sequence-matcher";
import * as videoCuratorLoader from "$lib/features/landing-preview/services/video-curator-loader";
import * as videoCuratorPersister from "$lib/features/landing-preview/services/video-curator-persister";
  /**
   * VideoCurator
   *
   * Admin UI for browsing, tagging, and selecting Instagram showcase videos.
   * Uses the unified VideoEditorOverlay for all editing modes.
   */
  import { onMount } from "svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { getVideoCache } from "$lib/shared/video";
  import VideoEditorOverlay from "./video-editor/VideoEditorOverlay.svelte";
  import VideoEditModal from "./VideoEditModal.svelte";
  import VideoFilterBar from "./VideoFilterBar.svelte";
  import VideoCropEditor from "./VideoCropEditor.svelte";
  import VideoSnipEditor from "./VideoSnipEditor.svelte";
  import CroppedVideoPlayer from "./CroppedVideoPlayer.svelte";
  import { createVideoEditorController } from "../state/video-editor-controller.svelte";
  import type { ShowcaseVideo, VideoCategory, UserProfile } from "../types";

  // Services from DI container
  const loader = videoCuratorLoader;
  const persister = videoCuratorPersister;
  const sequenceMatcher = getSequenceMatcher();

  // Video cache for instant playback
  const videoCache = getVideoCache();

  let videos = $state<ShowcaseVideo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let categories = $state<VideoCategory[]>([]);
  let quickPerformers = $state<UserProfile[]>([]);
  let cacheStats = $state({ count: 0, totalSize: 0 });

  let filterCategory = $state<string>("all");
  let filterPerformer = $state<string>("all");
  let filterHasWord = $state<string>("all");
  let filterFeatured = $state<boolean | null>(null);
  let searchQuery = $state("");
  let showAddCategory = $state(false);
  let newCategoryLabel = $state("");
  let newCategoryColor = $state("#6366f1");

  let editingVideo = $state<ShowcaseVideo | null>(null);
  let editTitle = $state("");
  let editCategory = $state("");
  let editTags = $state("");
  let saving = $state(false);

  let editorController = $state<ReturnType<typeof createVideoEditorController> | null>(null);

  // Initialize controller when data is loaded
  $effect(() => {
    if (videos.length > 0 && categories.length >= 0 && quickPerformers.length >= 0 && !editorController) {
      editorController = createVideoEditorController({
        videos,
        categories,
        quickPerformers,
        persister,
        sequenceMatcher,
        videoCache,
        onVideosUpdate: (updatedVideos) => {
          videos = updatedVideos;
        },
      });
    }
  });

  // Sync external state changes to controller
  $effect(() => {
    if (editorController) {
      editorController.syncVideos(videos);
    }
  });

  $effect(() => {
    if (editorController) {
      editorController.syncCategories(categories);
    }
  });

  $effect(() => {
    if (editorController) {
      editorController.syncQuickPerformers(quickPerformers);
    }
  });

  const uncuratedVideos = $derived.by(() =>
    videos.filter((v) => !v.excluded && (!v.category || v.performers.length === 0))
  );

  const unlinkableVideos = $derived.by(() =>
    videos.filter((v) => v.title && v.title.length > 0 && v.linkedSequences.length === 0)
  );

  const unnamedVideos = $derived.by(() =>
    videos.filter((v) => !v.title || v.title.length === 0)
  );

  const filteredVideos = $derived.by(() => {
    let result = videos;
    if (filterCategory !== "all") {
      result = result.filter((v) => v.category === filterCategory);
    }
    if (filterFeatured !== null) {
      result = result.filter((v) => v.featured === filterFeatured);
    }
    if (filterPerformer !== "all") {
      result = result.filter((v) => v.performers.some((p) => p.id === filterPerformer));
    }
    if (filterHasWord === "yes") {
      result = result.filter((v) => v.title && v.title.length > 0);
    } else if (filterHasWord === "no") {
      result = result.filter((v) => !v.title);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.shortcode.toLowerCase().includes(query) ||
          v.title?.toLowerCase().includes(query) ||
          v.linkedSequences.some((s) => stripWordNotation(s.word).toLowerCase().includes(query)) ||
          v.performers.some((p) => p.displayName.toLowerCase().includes(query)) ||
          v.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    return result;
  });

  const performers = $derived.by(() => {
    const map = new Map<string, string>();
    for (const v of videos) {
      for (const p of v.performers) {
        map.set(p.id, p.displayName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  const stats = $derived({
    total: videos.length,
    featured: videos.filter((v) => v.featured).length,
    categorized: videos.filter((v) => v.category).length,
    uncategorized: videos.filter((v) => !v.category).length,
    withWord: videos.filter((v) => v.title && v.title.length > 0).length,
  });

  const linkingProgress = $derived({
    linked: videos.filter((v) => v.linkedSequences.length > 0).length,
  });

  async function loadVideos() {
    loading = true;
    error = null;
    try {
      videos = await loader.loadVideos();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load videos";
    } finally {
      loading = false;
    }
  }

  // === MODE TRANSITIONS (via controller) ===
  function enterCurationMode() {
    if (editorController) {
      editorController.openCurate();
    }
  }

  function enterLinkingMode() {
    if (editorController) {
      editorController.openLink();
    }
  }

  function enterRenameMode() {
    editorController?.openRename();
  }

  function selectVideo(video: ShowcaseVideo) {
    if (editorController) {
      editorController.openBrowse(video);
    }
  }

  async function addCategory() {
    if (!newCategoryLabel.trim()) return;
    const id = newCategoryLabel.toLowerCase().replace(/\s+/g, "-");
    const newCategory: VideoCategory = {
      id,
      label: newCategoryLabel.trim(),
      color: newCategoryColor,
    };
    categories = [...categories, newCategory];
    await persister.saveCategories(categories);
    newCategoryLabel = "";
    newCategoryColor = "#6366f1";
    showAddCategory = false;
  }

  // === VIDEO EDITING (grid actions) ===
  function startEdit(video: ShowcaseVideo) {
    editingVideo = video;
    editTitle = video.title || "";
    editCategory = video.category || "";
    editTags = video.tags.join(", ");
  }

  function cancelEdit() {
    editingVideo = null;
  }

  async function saveEdit() {
    if (!editingVideo) return;
    saving = true;
    try {
      const updates = {
        title: editTitle.trim() || null,
        category: editCategory || null,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      await persister.updateVideo(editingVideo.shortcode, updates);
      updateLocalVideo(editingVideo.shortcode, updates);
      editingVideo = null;
    } catch (e) {
      console.error("Failed to save:", e);
      toast.error(
        `Failed to save changes. ${e instanceof Error ? e.message : "Please try again."}`
      );
    } finally {
      saving = false;
    }
  }

  async function toggleFeatured(video: ShowcaseVideo) {
    try {
      const newValue = !video.featured;
      await persister.toggleFeatured(video.shortcode, newValue);
      updateLocalVideo(video.shortcode, { featured: newValue });
    } catch (e) {
      console.error("Failed to toggle featured:", e);
      toast.error(
        `Failed to update featured status. ${e instanceof Error ? e.message : "Please try again."}`
      );
    }
  }

  // === UTILITY ===
  function updateLocalVideo(shortcode: string, updates: Partial<ShowcaseVideo>) {
    const index = videos.findIndex((v) => v.shortcode === shortcode);
    if (index !== -1) {
      videos[index] = { ...videos[index], ...updates } as ShowcaseVideo;
      videos = [...videos];
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(date: Date | null): string {
    if (!date) return "Unknown";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function clearFilters() {
    filterCategory = "all";
    filterPerformer = "all";
    filterHasWord = "all";
    filterFeatured = null;
    searchQuery = "";
  }

  // === LIFECYCLE ===
  onMount(async () => {
    const [loadedCategories, loadedPerformers] = await Promise.all([
      loader.loadCategories(),
      loader.loadQuickPerformers(),
    ]);
    categories = loadedCategories;
    quickPerformers = loadedPerformers;
    await loadVideos();
    const cacheInfo = await videoCache.getStats();
    cacheStats = { count: cacheInfo.count, totalSize: cacheInfo.totalSize };
    if (videos.length > 0) {
      const preloadUrls = videos.slice(0, 12).map((v) => v.videoUrl);
      videoCache.preload(preloadUrls);
    }
  });

  $effect(() => {
    if (filteredVideos.length > 0) {
      const preloadUrls = filteredVideos.slice(0, 8).map((v) => v.videoUrl);
      videoCache.preload(preloadUrls);
    }
  });
</script>

<div class="video-curator">
  <!-- Header with stats -->
  <header class="curator-header">
    <div class="header-content">
      <h1>Video Curator</h1>
      <p>Review the catalog, tag performers, and link videos to TKA sequences</p>
    </div>
    <div class="stats-bar">
      <div class="stat">
        <span class="stat-value">{stats.total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat featured">
        <span class="stat-value">{stats.featured}</span>
        <span class="stat-label">Featured</span>
      </div>
      <div class="stat">
        <span class="stat-value">{stats.categorized}</span>
        <span class="stat-label">Categorized</span>
      </div>
      <div class="stat uncategorized">
        <span class="stat-value">{stats.uncategorized}</span>
        <span class="stat-label">Uncategorized</span>
      </div>
      <div class="stat with-word">
        <span class="stat-value">{stats.withWord}</span>
        <span class="stat-label">Has TKA Word</span>
      </div>
      <div class="stat linked">
        <span class="stat-value">{linkingProgress.linked}</span>
        <span class="stat-label">Linked</span>
      </div>
      {#if cacheStats.count > 0}
        <div class="stat cached">
          <span class="stat-value">{cacheStats.count}</span>
          <span class="stat-label">Cached ({formatFileSize(cacheStats.totalSize)})</span>
        </div>
      {/if}
    </div>
  </header>

  <!-- Filter bar -->
  <VideoFilterBar
    {searchQuery}
    {filterCategory}
    {filterPerformer}
    {filterHasWord}
    {filterFeatured}
    {categories}
    {performers}
    {loading}
    uncuratedCount={uncuratedVideos.length}
    unlinkableCount={unlinkableVideos.length}
    unnamedCount={unnamedVideos.length}
    filteredCount={filteredVideos.length}
    totalCount={videos.length}
    {showAddCategory}
    {newCategoryLabel}
    {newCategoryColor}
    onSearchChange={(q) => (searchQuery = q)}
    onCategoryChange={(c) => (filterCategory = c)}
    onPerformerChange={(p) => (filterPerformer = p)}
    onHasWordChange={(v) => (filterHasWord = v)}
    onFeaturedChange={(v) => (filterFeatured = v)}
    onRefresh={loadVideos}
    onEnterCurationMode={enterCurationMode}
    onEnterLinkingMode={enterLinkingMode}
    onEnterRenameMode={enterRenameMode}
    onToggleAddCategory={(show) => (showAddCategory = show)}
    onAddCategory={addCategory}
    onUpdateCategoryLabel={(label) => (newCategoryLabel = label)}
    onUpdateCategoryColor={(color) => (newCategoryColor = color)}
    onClearFilters={clearFilters}
  />

  <!-- Video grid -->
  {#if loading}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <span>Loading videos...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>{error}</span>
      <button onclick={loadVideos}>Retry</button>
    </div>
  {:else if filteredVideos.length === 0}
    <div class="empty-state">
      <i class="fas fa-film" aria-hidden="true"></i>
      <span>No videos found</span>
      {#if videos.length === 0}
        <p>Upload videos using the batch upload script first.</p>
      {/if}
    </div>
  {:else}
    <div class="video-grid">
      {#each filteredVideos as video (video.shortcode)}
        <div
          class="video-card"
          class:featured={video.featured}
          onclick={() => selectVideo(video)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            // role="button" owes Space as well as Enter, and Space would
            // otherwise scroll the grid out from under the card.
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectVideo(video);
            }
          }}
        >
          <div class="video-thumbnail">
            <CroppedVideoPlayer
              src={video.videoUrl}
              crop={video.crop}
              muted
              class="thumbnail-video"
            />
            {#if video.featured}
              <div class="featured-badge">
                <i class="fas fa-star" aria-hidden="true"></i>
              </div>
            {/if}
            {#if video.category}
              {@const cat = categories.find((c) => c.id === video.category)}
              {#if cat}
                <div class="category-badge" style:background={cat.color}>
                  {cat.label}
                </div>
              {/if}
            {/if}
            {#if video.performers.length > 0}
              <div class="performer-badge">
                <i class="fas fa-user" aria-hidden="true"></i>
                {video.performers.length === 1
                  ? video.performers[0]?.displayName
                  : `${video.performers.length} performers`}
              </div>
            {/if}
          </div>
          <div class="video-info">
            <span class="video-title">{video.title || video.shortcode}</span>
            <span class="video-meta">
              {formatDate(video.instagramDate)} · {formatFileSize(video.fileSize)}
            </span>
          </div>
          <div class="quick-actions">
            <button
              class="action-btn"
              class:active={video.featured}
              onclick={(e) => {
                e.stopPropagation();
                toggleFeatured(video);
              }}
              title={video.featured ? "Remove from featured" : "Add to featured"}
            >
              <i class="fas fa-star" aria-hidden="true"></i>
            </button>
            <button
              class="action-btn"
              onclick={(e) => {
                e.stopPropagation();
                startEdit(video);
              }}
              title="Edit"
            >
              <i class="fas fa-edit" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Edit modal -->
{#if editingVideo}
  <VideoEditModal
    video={editingVideo}
    {categories}
    {editTitle}
    {editCategory}
    {editTags}
    {saving}
    onSave={saveEdit}
    onCancel={cancelEdit}
    onUpdateTitle={(t) => (editTitle = t)}
    onUpdateCategory={(c) => (editCategory = c)}
    onUpdateTags={(t) => (editTags = t)}
  />
{/if}

<!-- Unified Video Editor Overlay -->
{#if editorController}
  <VideoEditorOverlay
    controller={editorController}
    {formatDate}
  />

  <!-- Crop editor overlay -->
  {#if editorController.cropModeActive && editorController.currentVideo && editorController.videoUrl}
    <VideoCropEditor
      videoUrl={editorController.videoUrl}
      initialCrop={editorController.currentVideo.crop}
      onApply={editorController.applyCrop}
      onCancel={editorController.closeCropMode}
    />
  {/if}

  <!-- Snip editor overlay -->
  {#if editorController.snipModeActive && editorController.currentVideo && editorController.videoUrl}
    <VideoSnipEditor
      videoUrl={editorController.videoUrl}
      initialSnip={editorController.currentVideo.snip}
      onApply={editorController.applySnip}
      onCancel={editorController.closeSnipMode}
    />
  {/if}
{/if}

<style>
  .video-curator {
    box-sizing: border-box;
    width: 100%;
    padding: clamp(1rem, 1.5vw, 2rem);
    container-type: inline-size;
  }

  .curator-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .header-content h1 {
    font-size: 1.75rem;
    margin: 0 0 4px 0;
  }

  .header-content p {
    color: var(--theme-text-dim);
    margin: 0;
  }

  .stats-bar {
    display: grid;
    /* Tracks follow the children: the cache stat only appears once something
       is cached, and a fixed 7 left an empty column the rest of the time. */
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .stat {
    text-align: center;
    padding: 8px 16px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .stat-label {
    font-size: 12px;
    color: var(--theme-text-dim);
  }

  .stat.featured .stat-value {
    color: #f59e0b;
  }

  .stat.uncategorized .stat-value {
    color: var(--semantic-error, #ef4444);
  }

  .stat.cached .stat-value {
    color: var(--semantic-success, #10b981);
  }

  .stat.with-word .stat-value {
    color: #06b6d4;
  }

  /* Video grid */
  .video-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .video-card {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .video-card:hover {
    border-color: var(--theme-accent);
    transform: translateY(-2px);
  }

  .video-card.featured {
    border-color: #f59e0b;
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
  }

  .video-thumbnail {
    position: relative;
    aspect-ratio: 9 / 16;
    background: #000;
  }

  /* Video element styles removed - uses CroppedVideoPlayer component */

  .featured-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #f59e0b;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  .category-badge {
    position: absolute;
    bottom: 8px;
    left: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: white;
  }

  .performer-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: white;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .performer-badge i {
    font-size: 10px;
  }

  .video-info {
    padding: 12px;
  }

  .video-title {
    display: block;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-meta {
    display: block;
    font-size: 11px;
    color: var(--theme-text-dim);
    margin-top: 4px;
  }

  .quick-actions {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .video-card:hover .quick-actions {
    opacity: 1;
  }

  .action-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .action-btn.active {
    background: #f59e0b;
  }

  /* Loading/Error/Empty states */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 64px;
    color: var(--theme-text-dim);
  }

  .error-state i,
  .empty-state i {
    font-size: 48px;
    opacity: 0.5;
  }

  @container (min-width: 40rem) {
    .video-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (min-width: 60rem) {
    .video-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 75rem) {
    .video-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 1rem;
    }
  }

  @container (min-width: 105rem) {
    .video-grid {
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 1.25rem;
    }
  }

  @container (min-width: 162.5rem) {
    .video-grid {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 1.5rem;
    }
  }

  @container (max-width: 45rem) {
    .video-curator {
      padding: 1rem;
    }

    .stats-bar {
      grid-auto-flow: row;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .stat {
      padding: 0.375rem 0.5rem;
    }
  }
</style>
