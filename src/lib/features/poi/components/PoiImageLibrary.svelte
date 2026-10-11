<!--
  PoiImageLibrary.svelte - grid of every image the user has uploaded
  in the POV Pattern Lab, scoped to their account. Click a tile to
  load it as the active pattern; drag a tile onto the pattern
  timeline to drop it as a clip at the target beat range.

  When no user is signed in the grid is replaced with a single hint
  explaining how to get a library - uploads still work in-memory,
  they just don't persist to the cloud.
-->
<script lang="ts">
  import { getPoiContext } from "../context/poi-context";
  import type { PoiImageLibraryEntry } from "#lib/shared/poi/domain/poi-image-library-entry.js";

  const poi = getPoiContext();

  async function handleClick(entry: PoiImageLibraryEntry): Promise<void> {
    try {
      await poi.loadFromLibrary(entry);
    } catch (error) {
      console.warn("[PoiImageLibrary] load failed:", error);
    }
  }

  function handleTileKeydown(
    e: KeyboardEvent,
    entry: PoiImageLibraryEntry,
  ): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void handleClick(entry);
    }
  }

  function handleDragStart(
    e: DragEvent,
    entry: PoiImageLibraryEntry,
  ): void {
    if (!e.dataTransfer) return;
    // Custom MIME type so PatternTimeline can distinguish a library
    // drag from a fresh file drop and skip the decode step.
    e.dataTransfer.setData(
      "application/x-tka-poi-library-id",
      entry.id,
    );
    e.dataTransfer.effectAllowed = "copy";
  }

  async function handleDelete(
    e: MouseEvent,
    entry: PoiImageLibraryEntry,
  ): Promise<void> {
    e.stopPropagation();
    const ok = confirm(`Delete "${entry.name}" from your library?`);
    if (!ok) return;
    try {
      await poi.deleteLibraryEntry(entry.id);
    } catch (error) {
      console.warn("[PoiImageLibrary] delete failed:", error);
    }
  }
</script>

<div class="library-section">
  <h4 class="section-title">My Images</h4>

  {#if !poi.isAuthenticated}
    <p class="empty-hint">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      Sign in to save uploaded images to a library you can reuse later.
    </p>
  {:else if poi.libraryEntries.length === 0}
    <p class="empty-hint">
      Images you upload will appear here.
    </p>
  {:else}
    <div class="library-grid">
      {#each poi.libraryEntries as entry (entry.id)}
        <!--
          Tile has to be a div, not a button, because we nest a real
          delete <button> inside it - nesting buttons is invalid HTML
          and the browser silently hoists the inner one. role="button"
          + keyboard handling preserves accessibility.
        -->
        <div
          class="library-tile"
          draggable="true"
          role="button"
          tabindex="0"
          onclick={() => handleClick(entry)}
          onkeydown={(e) => handleTileKeydown(e, entry)}
          ondragstart={(e) => handleDragStart(e, entry)}
          title={entry.name}
        >
          <img
            src={entry.storageUrl}
            alt={entry.name}
            class="tile-thumb"
            loading="lazy"
            draggable="false"
          />
          <span class="tile-label">{entry.name}</span>
          <button
            type="button"
            class="tile-delete"
            onclick={(e) => handleDelete(e, entry)}
            aria-label="Delete {entry.name}"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .library-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0 0 0.25rem;
  }

  .empty-hint {
    margin: 0;
    padding: 0.5rem 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 0.5rem;
  }

  .library-tile {
    position: relative;
    aspect-ratio: 1;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.12));
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    padding: 0;
    overflow: hidden;
    cursor: grab;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    transition: border-color 0.15s, transform 0.15s;
  }

  .library-tile:hover {
    border-color: var(--theme-accent, #3b82f6);
    transform: translateY(-1px);
  }

  .library-tile:active {
    cursor: grabbing;
  }

  .tile-thumb {
    flex: 1;
    width: 100%;
    min-height: 0;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }

  .tile-label {
    display: block;
    padding: 2px 4px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.2;
    color: var(--theme-text-primary, #e2e8f0);
    background: rgba(0, 0, 0, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tile-delete {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.65);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
  }

  .library-tile:hover .tile-delete,
  .library-tile:focus-within .tile-delete {
    opacity: 1;
  }

  .tile-delete:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 85%, transparent);
    color: #fff;
  }
</style>
