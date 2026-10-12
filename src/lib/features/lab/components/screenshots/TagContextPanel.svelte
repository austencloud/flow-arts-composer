<!--
  TagContextPanel - Right-click / long-press popup for tagging individual screenshots.

  Shows a list of all tags with toggle-on/off per screenshot, plus a "New tag" action.
-->
<script lang="ts">
  import type { GalleryItem } from "../../services/types";
  import type { MediaTag } from "@austencloud/media-tagging-types";
  import { TAG_COLORS } from "@austencloud/media-tagging-types";

  interface Props {
    target: GalleryItem;
    allTags: MediaTag[];
    position: { x: number; y: number };
    onToggleTag: (tagId: string) => void;
    onCreateTag: () => void;
    onClose: () => void;
  }

  const {
    target,
    allTags,
    position,
    onToggleTag,
    onCreateTag,
    onClose,
  }: Props = $props();

  function getTagHex(color: string): string {
    return TAG_COLORS.find((c) => c.value === color)?.hex ?? "#6b7280";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  // Svelte action: focus the panel on mount so the Escape handler is live and
  // keyboard users land inside the popup.
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }
</script>

<!-- Backdrop: click-to-close is a deliberate dismiss affordance; the keyboard
     path (Escape) lives on the focused panel below. -->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="tag-panel-backdrop" role="presentation" onclick={onClose}>
  <div
    class="tag-context-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Tag screenshot"
    tabindex="-1"
    use:focusOnMount
    style="left: {position.x}px; top: {position.y}px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
    <div class="tag-panel-header">
      <span class="tag-panel-title">Tag screenshot</span>
      <button class="tag-panel-close" aria-label="Close" onclick={onClose}
        >&times;</button
      >
    </div>
    <div class="tag-panel-tags">
      {#if allTags.length === 0}
        <p class="tag-panel-empty">No tags yet. Create one below.</p>
      {:else}
        {#each allTags as tag (tag.id)}
          {@const isApplied = target.tagIds.includes(tag.id)}
          <button
            class="tag-panel-item"
            class:applied={isApplied}
            onclick={() => onToggleTag(tag.id)}
          >
            <span
              class="tag-panel-chip"
              style="--tag-hex: {getTagHex(tag.color)}"
            >
              {isApplied ? `\u2713 ${tag.name}` : tag.name}
            </span>
          </button>
        {/each}
      {/if}
    </div>
    <button
      class="tag-panel-create"
      onclick={() => {
        onCreateTag();
        onClose();
      }}
    >
      + New tag
    </button>
  </div>
</div>

<style>
  .tag-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .tag-context-panel {
    position: fixed;
    width: 240px;
    max-height: 320px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 101;
  }

  .tag-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .tag-panel-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .tag-panel-close {
    background: transparent;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .tag-panel-tags {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: flex-start;
  }

  .tag-panel-empty {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-align: center;
    width: 100%;
    padding: 16px 0;
  }

  .tag-panel-item {
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .tag-panel-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--tag-hex) 20%, transparent);
    color: var(--tag-hex);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    transition: background var(--duration-fast)
      var(--ease-out, var(--ease-standard-out));
  }

  .tag-panel-chip:hover {
    background: color-mix(in srgb, var(--tag-hex) 30%, transparent);
  }

  .tag-panel-create {
    padding: 8px 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: transparent;
    border-left: none;
    border-right: none;
    border-bottom: none;
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .tag-panel-create:hover {
    background: rgba(59, 130, 246, 0.08);
  }

  @media (prefers-reduced-motion: reduce) {
    .tag-panel-chip {
      transition: none;
    }
  }
</style>
