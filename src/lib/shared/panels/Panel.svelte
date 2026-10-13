<!--
  Panel - Content container primitive

  A panel that can hold any content. Has an optional header
  with title and can be collapsed.

  Props:
  - title: Optional header title
  - collapsible: Whether panel can be collapsed
  - collapsed: Current collapsed state (bindable)
  - minSize: Minimum size in pixels (respects direction from parent)
  - maxSize: Maximum size in pixels

  The Panel knows nothing about its siblings or position.
  It's just a container with presentation logic.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Panel title shown in header */
    title?: string;
    /** Whether panel can be collapsed */
    collapsible?: boolean;
    /** Current collapsed state */
    collapsed?: boolean;
    /** Minimum size in pixels */
    minSize?: number;
    /** Maximum size in pixels (0 = no max) */
    maxSize?: number;
    /** Content slot */
    children: Snippet;
    /** Optional header actions slot */
    headerActions?: Snippet;
    /** Called when collapse state changes */
    onCollapseChange?: (collapsed: boolean) => void;
  }

  let {
    title,
    collapsible = false,
    collapsed = $bindable(false),
    minSize = 100,
    maxSize = 0,
    children,
    headerActions,
    onCollapseChange,
  }: Props = $props();

  const showHeader = $derived(!!title || collapsible || !!headerActions);

  function toggleCollapse() {
    if (!collapsible) return;
    collapsed = !collapsed;
    onCollapseChange?.(collapsed);
  }
</script>

<div
  class="panel"
  class:collapsed
  class:has-header={showHeader}
  data-min-size={minSize}
  data-max-size={maxSize}
>
  {#if showHeader}
    <div class="panel-header">
      {#if collapsible}
        <button
          class="collapse-toggle"
          onclick={toggleCollapse}
          aria-expanded={!collapsed}
          aria-controls="panel-content"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          <i
            class="fa-solid fa-chevron-{collapsed ? 'right' : 'down'}"
            aria-hidden="true"
          ></i>
        </button>
      {/if}

      {#if title}
        <span class="panel-title">{title}</span>
      {/if}

      {#if headerActions}
        <div class="header-actions">
          {@render headerActions()}
        </div>
      {/if}
    </div>
  {/if}

  <div id="panel-content" class="panel-content" class:hidden={collapsed}>
    {@render children()}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--panel-bg, #121218);
    border: 1px solid var(--panel-border, var(--theme-stroke));
    border-radius: var(--panel-radius, 6px);
  }

  .panel-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--panel-header-bg, rgba(255, 255, 255, 0.03));
    border-bottom: 1px solid var(--panel-border, rgba(255, 255, 255, 0.08));
    min-height: 32px;
  }

  .collapse-toggle {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .collapse-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--theme-text, var(--theme-text));
  }

  .panel-title {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .panel-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .panel-content.hidden {
    display: none;
  }

  /* Collapsed state */
  .panel.collapsed {
    flex: 0 0 auto !important;
  }

  .panel.collapsed .panel-content {
    display: none;
  }
</style>
