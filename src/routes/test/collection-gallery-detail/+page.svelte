<!--
  /test/collection-gallery-detail — eyes-on harness for the shared
  CollectionGalleryDetail shell. Desktop: gallery ↔ detail crossfade in place.
  Mobile (emulate ≤ side-by-side breakpoint): gallery stays, detail is a
  swipe-dismissable bottom-sheet Drawer.
-->
<script lang="ts">
  import CollectionGalleryDetail from "#lib/shared/modules/CollectionGalleryDetail.svelte";

  const items = Array.from({ length: 8 }, (_, i) => ({ id: i, name: `Item ${i + 1}` }));
  let selectedId = $state<number | null>(null);
  const open = $derived(selectedId !== null);

  function openItem(id: number) {
    selectedId = id;
  }
  function close() {
    selectedId = null;
  }
</script>

<div class="host">
  <CollectionGalleryDetail
    {open}
    onClose={close}
    ariaLabel={selectedId !== null ? `Item ${selectedId + 1}` : "Detail"}
    gallery={galleryView}
    detail={detailView}
  />

  {#snippet galleryView()}
    <div class="gallery">
      <h2>Gallery</h2>
      <div class="grid">
        {#each items as it (it.id)}
          <button type="button" class="card" onclick={() => openItem(it.id)}>
            {it.name}
          </button>
        {/each}
      </div>
    </div>
  {/snippet}

  {#snippet detailView({ inDrawer }: { inDrawer: boolean })}
    <div class="detail">
      {#if !inDrawer}
        <button type="button" class="back" onclick={close}>← Gallery</button>
      {/if}
      <h2>Detail — Item {selectedId !== null ? selectedId + 1 : "?"}</h2>
      <p>inDrawer = {String(inDrawer)}</p>
      <p class="hint">
        {inDrawer
          ? "Mobile: swipe this sheet down, tap the backdrop, or drag the handle to dismiss."
          : "Desktop: use the back button to return to the gallery."}
      </p>
    </div>
  {/snippet}
</div>

<style>
  .host {
    position: relative;
    height: 100vh;
    background: radial-gradient(120% 100% at 50% 0%, #1a1d3d 0%, #0b0d1c 60%, #06070f 100%);
    color: #e8edf6;
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }
  .gallery {
    padding: 24px;
    height: 100%;
    box-sizing: border-box;
  }
  .gallery h2 {
    margin: 0 0 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .card {
    min-height: 88px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .card:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .detail {
    padding: 32px 24px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  .back {
    align-self: flex-start;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    cursor: pointer;
    font-weight: 600;
  }
  .hint {
    color: #9aa6b8;
    max-width: 40ch;
  }
</style>
