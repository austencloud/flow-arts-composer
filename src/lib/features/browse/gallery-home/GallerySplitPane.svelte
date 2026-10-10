<!--
  GallerySplitPane owns the wide-screen filter/results composition.

  GalleryDrill decides when this composition is active and supplies the
  current editor. This component owns the pane's persisted width, collapse
  state, resize interaction, and the layout that presents those capabilities.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ResizeHandle from "#lib/shared/panels/ResizeHandle.svelte";
  import { startMorph } from "#lib/shared/transitions/results-morph.js";
  import GalleryPaneLeft from "./GalleryPaneLeft.svelte";
  import type {
    CategoryEntry,
    GalleryCatalog,
    Section,
  } from "./gallery-drill-catalog.svelte";

  interface Props {
    catalog: GalleryCatalog;
    section: Section;
    ruleCounts?: Readonly<Record<string, number>>;
    idle: boolean;
    onSelectCategory: (entry: CategoryEntry) => void;
    editor: Snippet;
    resultsHeader?: Snippet;
    resultsPane?: Snippet;
    paneWidth?: number;
  }

  let {
    catalog,
    section,
    ruleCounts,
    idle,
    onSelectCategory,
    editor,
    resultsHeader,
    resultsPane,
    paneWidth = $bindable(0),
  }: Props = $props();

  const FILTER_PANE_MIN = 352;
  const FILTER_PANE_MAX = 736;
  const FILTER_PANE_DEFAULT = 440;
  const FILTER_PANE_WIDTH_KEY = "tka-filter-pane-width";
  const FILTER_PANE_COLLAPSED_KEY = "tka-filter-pane-collapsed";

  function clampPaneWidth(width: number): number {
    return Math.min(FILTER_PANE_MAX, Math.max(FILTER_PANE_MIN, width));
  }

  function restorePaneWidth(): number {
    try {
      const stored = Number(localStorage.getItem(FILTER_PANE_WIDTH_KEY));
      return Number.isFinite(stored) && stored > 0
        ? clampPaneWidth(stored)
        : FILTER_PANE_DEFAULT;
    } catch {
      // Private browsing and locked-down embeds can deny storage. The default
      // width keeps the filters usable without persistence.
      return FILTER_PANE_DEFAULT;
    }
  }

  function restorePaneCollapsed(): boolean {
    try {
      return localStorage.getItem(FILTER_PANE_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  let filterPaneWidth = $state(restorePaneWidth());
  let filterPaneCollapsed = $state(restorePaneCollapsed());
  let dragStartPaneWidth = $state(FILTER_PANE_DEFAULT);
  let paneResizing = $state(false);

  function persistPaneWidth(): void {
    try {
      localStorage.setItem(FILTER_PANE_WIDTH_KEY, String(filterPaneWidth));
    } catch {
      // Resizing remains available when persistence is denied.
    }
  }

  function setPaneCollapsed(collapsed: boolean): void {
    if (collapsed === filterPaneCollapsed) return;

    const apply = () => {
      filterPaneCollapsed = collapsed;
      try {
        if (collapsed) localStorage.setItem(FILTER_PANE_COLLAPSED_KEY, "1");
        else localStorage.removeItem(FILTER_PANE_COLLAPSED_KEY);
      } catch {
        // Collapsing remains available when persistence is denied.
      }
    };

    if (typeof document === "undefined") {
      apply();
      return;
    }

    const root = document.documentElement;
    root.classList.add("gallery-pane-motion");
    const transition = startMorph(apply);
    if (!transition) {
      root.classList.remove("gallery-pane-motion");
      return;
    }
    void transition.finished
      .catch(() => {})
      .finally(() => {
        root.classList.remove("gallery-pane-motion");
      });
  }

  function handleResizeStart(): void {
    dragStartPaneWidth = filterPaneWidth;
    paneResizing = true;
  }

  function handleResize(delta: number): void {
    filterPaneWidth = clampPaneWidth(dragStartPaneWidth + delta);
  }

  function handleResizeEnd(): void {
    paneResizing = false;
    persistPaneWidth();
  }

  function handleResizeKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    filterPaneWidth = clampPaneWidth(filterPaneWidth + direction * 16);
    persistPaneWidth();
  }
</script>

<div
  class="gallery-split-pane"
  class:filter-pane-collapsed={filterPaneCollapsed}
  class:pane-resizing={paneResizing}
  style:--filter-pane-w={`${filterPaneWidth}px`}
>
  <div class="pane-left-shell" aria-hidden={filterPaneCollapsed}>
    <GalleryPaneLeft
      {catalog}
      {section}
      {ruleCounts}
      {idle}
      {onSelectCategory}
      bind:width={paneWidth}
    >
      {#snippet editor()}
        {@render editor()}
      {/snippet}
    </GalleryPaneLeft>
  </div>
  <div class="pane-resize-track">
    <ResizeHandle
      direction="horizontal"
      disabled={filterPaneCollapsed}
      onDragStart={handleResizeStart}
      onDrag={handleResize}
      onDragEnd={handleResizeEnd}
      onKeydown={handleResizeKeydown}
    />
  </div>
  <div class="pane-right">
    <div class="pane-results-header">
      <!-- One control, one place, both directions. It used to be two: a
           chevron floated over the filter column's top-right corner to
           collapse, and this button to reopen. That corner is where the
           catalog's first-row tile carries its "how many are selected" badge,
           so the collapse chevron sat directly on top of it (Austen,
           2026-08-17). A pane-level control has no business overlaying a tile
           in the first place — moving it here puts it in flow, next to the
           results it reveals, and it no longer teleports between states. -->
      <PanelButton
        ariaLabel={filterPaneCollapsed ? "Show filters" : "Hide filters"}
        ariaExpanded={!filterPaneCollapsed}
        onclick={() => setPaneCollapsed(!filterPaneCollapsed)}
      >
        <i
          class="fas {filterPaneCollapsed
            ? 'fa-chevron-right'
            : 'fa-chevron-left'} pane-toggle-chevron"
          aria-hidden="true"
        ></i>
        Filters
      </PanelButton>
      {@render resultsHeader?.()}
    </div>
    <div class="pane-results-body">{@render resultsPane?.()}</div>
  </div>
</div>

<style>
  .gallery-split-pane {
    display: grid;
    grid-template-columns: minmax(0, var(--filter-pane-w)) auto minmax(0, 1fr);
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 0;
  }
  .gallery-split-pane.filter-pane-collapsed {
    grid-template-columns: minmax(0, 0fr) 0 minmax(0, 1fr);
  }
  .pane-left-shell {
    position: relative;
    min-width: 0;
    min-height: 0;
    opacity: 1;
    transform: translateX(0);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-spring);
  }
  :global(html.gallery-pane-motion) .pane-left-shell {
    view-transition-name: gallery-filter-pane;
  }
  :global(html.gallery-pane-motion) .pane-right {
    view-transition-name: gallery-results-pane;
  }
  .pane-left-shell > :global(.pane-left) {
    height: 100%;
  }
  .filter-pane-collapsed .pane-left-shell {
    visibility: hidden;
    pointer-events: none;
    opacity: 0;
    transform: translateX(-0.75rem);
  }
  /* The chevron flips direction with the pane, so it is the one glyph in this
     header whose width could change under it. A fixed box keeps the button —
     and the match count beside it — from stepping sideways on every toggle. */
  .pane-results-header :global(.pane-toggle-chevron) {
    display: inline-block;
    width: 0.75em;
    text-align: center;
  }
  .pane-resize-track {
    min-width: 0;
    min-height: 0;
    overflow: visible;
  }
  .filter-pane-collapsed .pane-resize-track {
    visibility: hidden;
  }
  .pane-right {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 1.1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 72%,
      transparent
    );
  }
  .pane-results-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    flex: 0 0 auto;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .pane-results-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }

  :global(html.gallery-pane-motion::view-transition-group(gallery-filter-pane)),
  :global(
    html.gallery-pane-motion::view-transition-group(gallery-results-pane)
  ) {
    animation-duration: var(--duration-dramatic);
    animation-timing-function: var(--ease-spring);
  }
  :global(html.gallery-pane-motion::view-transition-old(gallery-filter-pane)),
  :global(html.gallery-pane-motion::view-transition-new(gallery-filter-pane)) {
    animation-duration: var(--duration-emphasis);
    animation-timing-function: var(--ease-in-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-split-pane,
    .pane-left-shell {
      transition: none;
    }

    :global(
      html.gallery-pane-motion::view-transition-group(gallery-filter-pane)
    ),
    :global(html.gallery-pane-motion::view-transition-old(gallery-filter-pane)),
    :global(html.gallery-pane-motion::view-transition-new(gallery-filter-pane)),
    :global(
      html.gallery-pane-motion::view-transition-group(gallery-results-pane)
    ),
    :global(
      html.gallery-pane-motion::view-transition-old(gallery-results-pane)
    ),
    :global(
      html.gallery-pane-motion::view-transition-new(gallery-results-pane)
    ) {
      animation: none;
    }
  }
</style>
