<script lang="ts">
  import type { ComposerCatalog, CatalogCategory } from "./types";
  import type { ObjectDefinition } from "../procedural-engine/objects/object-catalog";

  interface Props {
    catalog: ComposerCatalog;
    sceneName: string;
    placedCount: number;
    activeItemKey: string | null;
    onSelectItem: (def: ObjectDefinition) => void;
    onDeselectItem: () => void;
    onClose: () => void;
  }

  const {
    catalog,
    sceneName,
    placedCount,
    activeItemKey,
    onSelectItem,
    onDeselectItem,
    onClose,
  }: Props = $props();

  let collapsedCategories = $state<Set<string>>(new Set());

  function toggleCategory(id: string) {
    const next = new Set(collapsedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedCategories = next;
  }

  function handleClick(def: ObjectDefinition) {
    if (activeItemKey === def.key) {
      onDeselectItem();
    } else {
      onSelectItem(def);
    }
  }

  const allItems = $derived(catalog.allItems());

  function handleKeyDown(event: KeyboardEvent): void {
    const num = parseInt(event.key);
    if (num >= 1 && num <= 9) {
      const idx = num - 1;
      if (idx < allItems.length) {
        const def = allItems[idx];
        if (!def) return;
        handleClick(def);
      }
    }
  }

  const fallbackIcons: Record<string, string> = {
    cone: "🌲",
    sphere: "🪨",
    cylinder: "🪵",
    box: "📦",
    flag: "🚩",
  };

  function iconForDef(def: ObjectDefinition): string {
    return fallbackIcons[def.fallbackGeometry] ?? "📦";
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="composer-picker">
  <div class="picker-header">
    <span class="header-label">{sceneName}: Compose</span>
    <button class="exit-btn" onclick={onClose} aria-label="Exit compose mode">
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </div>

  <div class="scene-indicator">
    <i class="fas fa-cubes" aria-hidden="true"></i>
    <span>{placedCount} objects</span>
  </div>

  {#each catalog.categories as category (category.id)}
    <button
      class="picker-category"
      onclick={() => toggleCategory(category.id)}
      aria-expanded={!collapsedCategories.has(category.id)}
    >
      <i class="fas {category.icon}" aria-hidden="true"></i>
      {category.label}
      <span class="cat-count">{category.items.length}</span>
      <i
        class="fas fa-chevron-{collapsedCategories.has(category.id)
          ? 'right'
          : 'down'} chevron"
        aria-hidden="true"
      ></i>
    </button>

    {#if !collapsedCategories.has(category.id)}
      <div class="picker-grid">
        {#each category.items as def, index (def.key)}
          {@const globalIdx = allItems.indexOf(def)}
          <button
            class="picker-item"
            class:selected={activeItemKey === def.key}
            onclick={() => handleClick(def)}
            title={def.name}
          >
            {#if globalIdx < 9}
              <span class="key-hint">{globalIdx + 1}</span>
            {/if}
            <span class="item-icon">{iconForDef(def)}</span>
            <span class="item-label">{def.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/each}

  <div class="picker-hint">
    <p>Click to select, click again to cancel</p>
    <p><kbd>1-9</kbd> quick-select &bull; <kbd>ESC</kbd> cancel</p>
    <p><kbd>Del</kbd> remove selected &bull; <kbd>Ctrl+Z</kbd> undo</p>
  </div>
</div>

<style>
  .composer-picker {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  .picker-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .header-label {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exit-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .exit-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }

  .scene-indicator {
    padding: 8px 12px;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.5);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .picker-category {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    background: transparent;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    text-align: left;
  }

  .picker-category:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .cat-count {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.3);
    font-weight: 500;
  }

  .chevron {
    font-size: 8px;
    color: rgba(255, 255, 255, 0.3);
    margin-left: 4px;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 0 10px 10px;
    flex-shrink: 0;
  }

  .picker-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 10px 6px 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    cursor: pointer;
    color: var(--theme-text, #ffffff);
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
    text-align: center;
    min-width: 0;
  }

  .picker-item:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.07));
  }

  .picker-item.selected {
    border-color: var(--theme-accent, #7c6af0);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c6af0) 18%,
      transparent
    );
  }

  .item-icon {
    font-size: 20px;
    line-height: 1;
  }

  .item-label {
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    width: 100%;
    word-break: break-word;
  }

  .key-hint {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1;
    color: rgba(255, 255, 255, 0.3);
    font-weight: 600;
  }

  .picker-hint {
    margin-top: auto;
    padding: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .picker-hint p {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    margin: 0 0 5px;
    line-height: 1.4;
  }

  .picker-hint p:last-child {
    margin-bottom: 0;
  }

  kbd {
    display: inline-block;
    padding: 1px 5px;
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 3px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
  }
</style>
