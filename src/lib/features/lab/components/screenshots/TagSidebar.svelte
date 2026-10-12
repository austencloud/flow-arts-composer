<!--
  TagSidebar - Collapsible right-side panel for tag-based filtering.
  Wraps the shared TagTreeView with gallery-specific state management.
  Desktop: inline sidebar (280px). Mobile: fixed overlay with backdrop.
-->
<script lang="ts">
  import type { MediaTag, MediaItem } from "@austencloud/media-tagging-types";
  import { TagTreeView } from "@austencloud/media-tagging-ui";

  interface Props {
    open: boolean;
    tags: MediaTag[];
    mediaItems: MediaItem[];
    filteredMediaItems: MediaItem[];
    activeTagIds: Set<string>;
    excludeTagIds: Set<string>;
    tagMode: "and" | "or";
    untaggedOnly: boolean;
    onToggle: () => void;
    onToggleTag: (tagId: string) => void;
    onExcludeTag: (tagId: string) => void;
    onSetTagMode: (mode: "and" | "or") => void;
    onSetUntaggedOnly: (value: boolean) => void;
    onClearTags: () => void;
    onCreateTag: () => void;
  }

  let {
    open,
    tags,
    mediaItems,
    filteredMediaItems,
    activeTagIds,
    excludeTagIds,
    tagMode,
    untaggedOnly,
    onToggle,
    onToggleTag,
    onExcludeTag,
    onSetTagMode,
    onSetUntaggedOnly,
    onClearTags,
    onCreateTag,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      onToggle();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Mobile backdrop -->
{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sidebar-backdrop"
    onclick={onToggle}
    onkeydown={(e) => e.key === "Escape" && onToggle()}
  ></div>
{/if}

<aside class="tag-sidebar" class:open aria-label="Tag filters">
  <div class="sidebar-header">
    <h3 class="sidebar-title">Tags</h3>
    <button
      class="sidebar-close"
      onclick={onToggle}
      title="Close tag sidebar"
      aria-label="Close tag sidebar"
    >
      <i class="fas fa-times"></i>
    </button>
  </div>

  <div class="sidebar-body">
    {#if tags.length === 0}
      <div class="empty-state">
        <i class="fas fa-tags empty-icon"></i>
        <p>No tags yet</p>
        <button class="create-first-btn" onclick={onCreateTag}>
          Create your first tag
        </button>
      </div>
    {:else}
      <TagTreeView
        {tags}
        items={mediaItems}
        filteredItems={filteredMediaItems}
        {activeTagIds}
        {excludeTagIds}
        {tagMode}
        {untaggedOnly}
        {onToggleTag}
        {onExcludeTag}
        {onSetTagMode}
        {onSetUntaggedOnly}
        {onClearTags}
      />
    {/if}
  </div>

  <div class="sidebar-footer">
    <button class="footer-btn create-btn" onclick={onCreateTag}>
      <i class="fas fa-plus"></i>
      New Tag
    </button>
  </div>
</aside>

<style>
  /* Mobile backdrop */
  .sidebar-backdrop {
    display: none;
  }

  @media (max-width: 768px) {
    .sidebar-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 90;
      animation: fadeIn var(--duration-normal) var(--ease-standard-out);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Sidebar */
  .tag-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
    min-width: 0;
  }

  @media (max-width: 768px) {
    .tag-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 300px;
      max-width: 85vw;
      z-index: 91;
      transform: translateX(100%);
      transition: transform var(--duration-emphasis)
        var(--ease-out, var(--ease-standard-out));
      border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .tag-sidebar.open {
      transform: translateX(0);
    }
  }

  /* Header */
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .sidebar-title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .sidebar-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, ease-out),
      border-color var(--duration-fast) var(--ease-out, ease-out),
      color var(--duration-fast) var(--ease-out, ease-out),
      opacity var(--duration-fast) var(--ease-out, ease-out),
      transform var(--duration-fast) var(--ease-out, ease-out),
      box-shadow var(--duration-fast) var(--ease-out, ease-out),
      width var(--duration-fast) var(--ease-out, ease-out),
      height var(--duration-fast) var(--ease-out, ease-out);
    font-size: 14px;
  }

  .sidebar-close:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--theme-text, #fff);
  }

  .sidebar-close:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  /* Body */
  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      var(--scrollbar-track, transparent);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 28px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .create-first-btn {
    padding: 8px 16px;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 15%,
      transparent
    );
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, ease-out),
      border-color var(--duration-fast) var(--ease-out, ease-out),
      color var(--duration-fast) var(--ease-out, ease-out),
      opacity var(--duration-fast) var(--ease-out, ease-out),
      transform var(--duration-fast) var(--ease-out, ease-out),
      box-shadow var(--duration-fast) var(--ease-out, ease-out);
  }

  .create-first-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 25%,
      transparent
    );
  }

  .create-first-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  /* Footer */
  .sidebar-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .footer-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    justify-content: center;
    padding: 8px 12px;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, ease-out),
      border-color var(--duration-fast) var(--ease-out, ease-out),
      color var(--duration-fast) var(--ease-out, ease-out),
      opacity var(--duration-fast) var(--ease-out, ease-out),
      transform var(--duration-fast) var(--ease-out, ease-out),
      box-shadow var(--duration-fast) var(--ease-out, ease-out);
  }

  .footer-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .footer-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .create-btn i {
    font-size: 10px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tag-sidebar {
      transition: none;
    }
    .sidebar-backdrop {
      animation: none;
    }
    .sidebar-close,
    .footer-btn,
    .create-first-btn {
      transition: none;
    }
  }
</style>
