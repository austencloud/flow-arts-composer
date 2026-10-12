<script lang="ts">
  /**
   * CurateMetadataPanel
   *
   * Right panel for curate mode - category, performers, navigation, and actions.
   */
  import CategoryField from "../fields/CategoryField.svelte";
  import PerformerField from "../fields/PerformerField.svelte";
  import type { VideoEditorController } from "../../../state/video-editor-controller.svelte";
  import type { ShowcaseVideo } from "../../../types";

  interface Props {
    video: ShowcaseVideo;
    controller: VideoEditorController;
    formatDate: (date: Date | null) => string;
  }

  let { video, controller, formatDate }: Props = $props();

  const hasCategory = $derived(!!video.category);
  const hasPerformers = $derived(video.performers.length > 0);
  const isComplete = $derived(hasCategory && hasPerformers);
  const uncuratedCount = $derived(controller.uncuratedVideos.length);
  const currentIndex = $derived(controller.currentIndex);
  const progressPercent = $derived(
    Math.round(
      (controller.curationProgress.done / controller.stats.total) * 100
    )
  );
  const isLastVideo = $derived(currentIndex >= uncuratedCount - 1);
  const canFinish = $derived(isComplete && isLastVideo);
</script>

<div class="metadata-panel">
  <!-- Video info -->
  <div class="video-info">
    <span class="video-title">{video.title || video.shortcode}</span>
    <span class="video-date">{formatDate(video.instagramDate)}</span>
  </div>

  <!-- Navigation -->
  <div class="nav-strip">
    <button
      class="nav-btn"
      onclick={controller.goPrev}
      disabled={currentIndex === 0}
      aria-label="Previous"
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <span class="nav-position">{currentIndex + 1} of {uncuratedCount}</span>
    <button
      class="nav-btn"
      onclick={controller.goNext}
      disabled={currentIndex >= uncuratedCount - 1}
      aria-label="Next"
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Category -->
  <CategoryField
    categories={controller.categories}
    selectedCategory={video.category}
    showAddForm={controller.showAddCategory}
    newLabel={controller.newCategoryLabel}
    newColor={controller.newCategoryColor}
    disabled={controller.saving}
    onSelect={controller.setCategory}
    onToggleAddForm={controller.toggleAddCategoryForm}
    onAdd={controller.addCategory}
    onUpdateLabel={controller.updateCategoryLabel}
    onUpdateColor={controller.updateCategoryColor}
  />

  <!-- Performers -->
  <PerformerField
    quickPerformers={controller.quickPerformers}
    performerKeys={controller.performerKeys}
    showAddForm={controller.showAddPerformer}
    disabled={controller.saving}
    isSelected={controller.isPerformerSelected}
    {hasPerformers}
    onToggle={controller.togglePerformer}
    onAdd={controller.addQuickPerformer}
    onRemove={controller.removeQuickPerformer}
    onToggleAddForm={controller.toggleAddPerformerForm}
  />

  <!-- Actions -->
  <div class="actions">
    <button
      class="action-btn secondary"
      onclick={controller.skip}
      disabled={controller.saving}
    >
      Skip
    </button>
    {#if canFinish}
      <button class="action-btn primary complete" onclick={controller.close}>
        Done
        <i class="fas fa-check" aria-hidden="true"></i>
      </button>
    {:else}
      <button
        class="action-btn primary"
        class:complete={isComplete}
        onclick={controller.goNext}
        disabled={isLastVideo}
      >
        Next
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Progress bar -->
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progressPercent}%"></div>
  </div>
</div>

<style>
  .metadata-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
  }

  .video-info {
    text-align: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .video-title {
    display: block;
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: -0.3px;
  }

  .video-date {
    display: block;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    margin-top: 4px;
  }

  .nav-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal),
      width var(--duration-normal),
      height var(--duration-normal);
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .nav-position {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 16px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .action-btn.secondary {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.7));
  }

  .action-btn.primary {
    flex: 1;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    color: var(--theme-accent-light, #a5b4fc);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 30%,
      transparent
    );
  }

  .action-btn.primary.complete {
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1) 0%,
      #8b5cf6 100%
    );
    color: white;
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .progress-bar {
    height: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--semantic-success, #10b981),
      #06b6d4
    );
    transition: width var(--duration-dramatic) var(--ease-standard);
  }
</style>
