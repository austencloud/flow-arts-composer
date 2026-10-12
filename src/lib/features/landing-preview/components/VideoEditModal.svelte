<script lang="ts">
  /**
   * VideoEditModal
   *
   * Modal for editing video title, category, and tags.
   */
  import type { ShowcaseVideo, VideoCategory } from "../types";

  interface Props {
    video: ShowcaseVideo;
    categories: VideoCategory[];
    editTitle: string;
    editCategory: string;
    editTags: string;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
    onUpdateTitle: (title: string) => void;
    onUpdateCategory: (category: string) => void;
    onUpdateTags: (tags: string) => void;
  }

  let {
    video,
    categories,
    editTitle,
    editCategory,
    editTags,
    saving,
    onSave,
    onCancel,
    onUpdateTitle,
    onUpdateCategory,
    onUpdateTags,
  }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="edit-modal"
  onclick={onCancel}
  onkeydown={(e) => {
    if (e.key === "Escape") onCancel();
  }}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    class="edit-content"
    onclick={(e) => e.stopPropagation()}
    role="document"
  >
    <h2>Edit Video</h2>

    <div class="form-group">
      <label for="edit-title">Title</label>
      <input
        id="edit-title"
        type="text"
        value={editTitle}
        oninput={(e) => onUpdateTitle((e.target as HTMLInputElement).value)}
        placeholder="Enter a title..."
      />
    </div>

    <div class="form-group">
      <label for="edit-category">Category</label>
      <select
        id="edit-category"
        value={editCategory}
        onchange={(e) =>
          onUpdateCategory((e.target as HTMLSelectElement).value)}
      >
        <option value="">None</option>
        {#each categories as cat}
          <option value={cat.id}>{cat.label}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label for="edit-tags">Tags (comma-separated)</label>
      <input
        id="edit-tags"
        type="text"
        value={editTags}
        oninput={(e) => onUpdateTags((e.target as HTMLInputElement).value)}
        placeholder="tag1, tag2, tag3"
      />
    </div>

    <div class="form-actions">
      <button class="cancel-btn" onclick={onCancel} disabled={saving}
        >Cancel</button
      >
      <button class="save-btn" onclick={onSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  </div>
</div>

<style>
  .edit-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .edit-content {
    background: var(--theme-panel-bg);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
  }

  .edit-content h2 {
    margin: 0 0 20px 0;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 13px;
    color: var(--theme-text-dim);
    margin-bottom: 6px;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 14px;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
    padding: 12px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
  }

  .cancel-btn {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .save-btn {
    background: var(--theme-accent);
    color: white;
  }

  .save-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
