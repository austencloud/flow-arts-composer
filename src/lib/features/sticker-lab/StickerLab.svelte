<script lang="ts">
  import { onMount } from "svelte";
  import { createStickerLabState } from "./state/sticker-lab-state.svelte";
  import { setStickerLabContext } from "./context/sticker-lab-context";
  import StickerList from "./components/StickerList.svelte";
  import StickerSheetPreview from "./components/StickerSheetPreview.svelte";
  import StickerExportPanel from "./components/StickerExportPanel.svelte";
  import ShapeBrowser from "./components/ShapeBrowser.svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import { getStickerSheetRepository } from "./get-sticker-sheet-repository";
  import { getStickerPrimitiveMigrator } from "./get-sticker-primitive-migrator";

  const labState = createStickerLabState(
    getStickerSheetRepository(),
    getStickerPrimitiveMigrator()
  );
  setStickerLabContext(labState);

  onMount(() => {
    void labState.migrateLegacyPrimitiveIdentities();
  });

  type ViewMode = "shapes" | "sheet";
  let viewMode: ViewMode = $state<ViewMode>("shapes");
  let exportDrawerOpen = $state(false);
</script>

<div class="sticker-lab">
  <section
    class="col col-main"
    aria-label={viewMode === "shapes" ? "Shape browser" : "Sheet preview"}
  >
    <header>
      <div class="view-toggle">
        <button
          class:active={viewMode === "shapes"}
          aria-pressed={viewMode === "shapes"}
          onclick={() => (viewMode = "shapes")}
        >
          <i class="fas fa-shapes" aria-hidden="true"></i> Shapes
        </button>
        <button
          class:active={viewMode === "sheet"}
          aria-pressed={viewMode === "sheet"}
          onclick={() => (viewMode = "sheet")}
        >
          <i class="fas fa-file-image" aria-hidden="true"></i> Sheet
        </button>
      </div>
    </header>
    {#if viewMode === "shapes"}
      <ShapeBrowser />
    {:else}
      <StickerSheetPreview />
    {/if}
  </section>

  <section class="col col-list" aria-label="Sticker list">
    <header><h2>Stickers</h2></header>
    <StickerList
      onExportClick={() => (exportDrawerOpen = true)}
      onBrowseClick={() => (viewMode = "shapes")}
    />
  </section>
</div>

<Drawer
  bind:isOpen={exportDrawerOpen}
  placement="right"
  respectLayoutMode={true}
  ariaLabel="Export sticker sheet"
  closeOnBackdrop={true}
  showHandle={true}
  class="sticker-export-drawer"
  trapFocus={false}
  preventScroll={false}
>
  <div class="export-drawer-content">
    <header class="export-header">
      <h3>Export</h3>
      <button
        class="close-btn"
        aria-label="Close export panel"
        onclick={() => (exportDrawerOpen = false)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>
    <StickerExportPanel />
  </div>
</Drawer>

<style>
  .sticker-lab {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(18rem, 22vw, 26rem);
    gap: var(--spacing-md);
    height: 100%;
    padding: var(--spacing-md);
    box-sizing: border-box;
  }

  @media (max-width: 56rem) and (min-height: 45rem), (max-width: 40rem) {
    .sticker-lab {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .col-list {
      max-height: 16rem;
    }
  }

  @media (max-width: 40rem) {
    .sticker-lab {
      grid-template-rows: minmax(40rem, auto) auto;
      align-content: start;
      overflow-y: auto;
    }

    .col-main {
      min-height: 40rem;
    }
  }

  .col {
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-2026-sm);
    padding: var(--spacing-md);
    overflow: hidden;
  }

  .col header {
    flex-shrink: 0;
    margin-bottom: var(--spacing-sm);
  }

  .col h2 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .col-main {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* View toggle */
  .view-toggle {
    display: flex;
    width: fit-content;
    gap: 1px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 3px;
  }

  .view-toggle button {
    flex: 0 0 auto;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all 0.2s;
  }

  .view-toggle button.active {
    background: rgba(168, 85, 246, 0.2);
    color: var(--theme-text, white);
    box-shadow: 0 1px 4px rgba(168, 85, 246, 0.15);
  }

  @media (max-width: 40rem) {
    .view-toggle {
      width: 100%;
    }

    .view-toggle button {
      flex: 1;
    }
  }

  :global(.drawer-content.sticker-export-drawer[data-placement="right"]) {
    width: clamp(280px, 25vw, 360px);
  }

  .export-drawer-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--spacing-md);
  }

  .export-header {
    display: flex;
    align-items: center;
    padding-bottom: var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    margin-bottom: var(--spacing-md);
  }

  .export-header h3 {
    margin: 0;
    flex: 1;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: none;
    border-radius: var(--radius-2026-sm);
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: color var(--duration-fast);
  }
  .close-btn:hover {
    color: var(--theme-text, white);
  }
</style>
